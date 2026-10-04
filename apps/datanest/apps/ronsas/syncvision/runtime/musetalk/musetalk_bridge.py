from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import queue
import re
import shutil
import signal
import subprocess
import tempfile
import sys
import threading
import time
import traceback
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from email.parser import BytesParser
from email.policy import default as email_policy
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, BinaryIO
from urllib.parse import urlparse

BRIDGE_SCHEMA = "datanest.ronsas.musetalk-bridge.v1"
BRIDGE_SERVICE = "resonance-musetalk-bridge"
BRIDGE_VERSION = "R5B-1.0.0"
EXPECTED_ENGINE_REVISION = "0a89dec45a0192b824e3cf4daf96c239440c5ed8"
MAX_REQUEST_BYTES = 1024 * 1024 * 1024
MAX_MEDIA_BYTES = 512 * 1024 * 1024
MAX_HEADER_BYTES = 64 * 1024
MAX_UNKNOWN_PART_BYTES = 1024 * 1024
MAX_METADATA_BYTES = 64 * 1024
CHUNK_BYTES = 1024 * 1024
STREAM_CHUNK_BYTES = 64 * 1024
ALLOWED_ORIGINS = {
    "http://127.0.0.1:3301",
    "http://localhost:3301",
}
TERMINAL_STATUSES = {"succeeded", "failed", "canceled"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def atomic_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(temp, path)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def safe_tail(path: Path, max_chars: int = 6000) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
        return text[-max_chars:]
    except Exception:
        return ""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(CHUNK_BYTES)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def media_suffix(part: "MultipartPart", kind: str) -> str:
    allowed = {
        "video": {".mp4", ".webm", ".mov", ".mkv", ".avi"},
        "audio": {".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac"},
    }[kind]
    filename_suffix = Path(part.filename or "").suffix.lower()
    if filename_suffix in allowed:
        return filename_suffix
    guessed = mimetypes.guess_extension(part.content_type or "") or ""
    if guessed.lower() in allowed:
        return guessed.lower()
    return ".mp4" if kind == "video" else ".wav"


@dataclass(frozen=True)
class MultipartPart:
    name: str
    path: Path
    size: int
    filename: str | None
    content_type: str | None


class LimitedBufferedReader:
    """Length-bounded buffered reader with enough pushback for multipart parsing."""

    def __init__(self, source: BinaryIO, length: int) -> None:
        self.source = source
        self.remaining = length
        self.buffer = bytearray()

    def _fill(self, minimum: int = 1) -> bool:
        while len(self.buffer) < minimum and self.remaining > 0:
            block = self.source.read(min(CHUNK_BYTES, self.remaining))
            if not block:
                raise ValueError("Request body ended before declared Content-Length")
            self.buffer.extend(block)
            self.remaining -= len(block)
        return len(self.buffer) >= minimum

    def readline(self, maximum: int) -> bytes:
        while True:
            index = self.buffer.find(b"\n")
            if index >= 0:
                size = index + 1
                if size > maximum:
                    raise ValueError("Multipart header line is too large")
                data = bytes(self.buffer[:size])
                del self.buffer[:size]
                return data
            if len(self.buffer) >= maximum:
                raise ValueError("Multipart header line is too large")
            if self.remaining <= 0:
                data = bytes(self.buffer)
                self.buffer.clear()
                return data
            self._fill(len(self.buffer) + 1)

    def take(self, count: int) -> bytes:
        if count < 0:
            raise ValueError("Invalid multipart read size")
        if not self._fill(count):
            raise ValueError("Multipart body ended unexpectedly")
        data = bytes(self.buffer[:count])
        del self.buffer[:count]
        return data

    def copy_until(self, delimiter: bytes, target: Path, maximum: int) -> tuple[int, bool]:
        target.parent.mkdir(parents=True, exist_ok=True)
        total = 0
        keep = max(1, len(delimiter) - 1)
        with target.open("wb") as output:
            while True:
                index = self.buffer.find(delimiter)
                if index >= 0:
                    if index:
                        total += index
                        if total > maximum:
                            raise ValueError(f"Multipart part exceeds {maximum} bytes")
                        output.write(self.buffer[:index])
                    del self.buffer[: index + len(delimiter)]
                    break
                if self.remaining <= 0:
                    raise ValueError("Multipart boundary was not found")
                if len(self.buffer) > keep:
                    flush = len(self.buffer) - keep
                    total += flush
                    if total > maximum:
                        raise ValueError(f"Multipart part exceeds {maximum} bytes")
                    output.write(self.buffer[:flush])
                    del self.buffer[:flush]
                self._fill(len(self.buffer) + 1)

        suffix = self.take(2)
        if suffix == b"--":
            # RFC 2046 permits an optional trailing CRLF after the closing boundary.
            if self._fill(2) and bytes(self.buffer[:2]) == b"\r\n":
                del self.buffer[:2]
            return total, True
        if suffix != b"\r\n":
            raise ValueError("Malformed multipart boundary suffix")
        return total, False


def parse_multipart_upload(source: BinaryIO, length: int, content_type: str, temp_dir: Path) -> dict[str, MultipartPart]:
    header_probe = BytesParser(policy=email_policy).parsebytes(
        ("Content-Type: " + content_type + "\r\n\r\n").encode("latin-1", errors="strict")
    )
    boundary_text = header_probe.get_param("boundary", header="content-type")
    if not boundary_text or not isinstance(boundary_text, str):
        raise ValueError("Multipart boundary is missing")
    boundary = boundary_text.encode("ascii", errors="strict")
    if len(boundary) < 8 or len(boundary) > 200 or any(byte < 33 or byte > 126 for byte in boundary):
        raise ValueError("Multipart boundary is invalid")

    reader = LimitedBufferedReader(source, length)
    first = reader.readline(MAX_HEADER_BYTES)
    expected = b"--" + boundary + b"\r\n"
    if first != expected:
        raise ValueError("Multipart body does not begin with the declared boundary")

    parts: dict[str, MultipartPart] = {}
    final = False
    index = 0
    delimiter = b"\r\n--" + boundary
    while not final:
        header_lines: list[bytes] = []
        header_total = 0
        while True:
            line = reader.readline(MAX_HEADER_BYTES)
            if line in {b"\r\n", b"\n"}:
                break
            if not line:
                raise ValueError("Multipart headers ended unexpectedly")
            header_total += len(line)
            if header_total > MAX_HEADER_BYTES:
                raise ValueError("Multipart headers are too large")
            header_lines.append(line)
        message = BytesParser(policy=email_policy).parsebytes(b"".join(header_lines) + b"\r\n")
        disposition = message.get("Content-Disposition", "")
        if not disposition or message.get_content_disposition() != "form-data":
            raise ValueError("Multipart part is missing form-data disposition")
        name = message.get_param("name", header="content-disposition")
        filename = message.get_param("filename", header="content-disposition")
        if not isinstance(name, str) or not name:
            raise ValueError("Multipart part name is missing")
        if name in parts:
            raise ValueError(f"Duplicate multipart part: {name}")
        maximum = MAX_MEDIA_BYTES if name in {"video", "audio"} else (MAX_METADATA_BYTES if name == "metadata" else MAX_UNKNOWN_PART_BYTES)
        part_path = temp_dir / f"part-{index:02d}.bin"
        size, final = reader.copy_until(delimiter, part_path, maximum)
        parts[name] = MultipartPart(
            name=name,
            path=part_path,
            size=size,
            filename=str(filename) if filename is not None else None,
            content_type=message.get_content_type() if message.get("Content-Type") else None,
        )
        index += 1
        if index > 16:
            raise ValueError("Too many multipart parts")

    trailing_total = len(reader.buffer) + reader.remaining
    # RFC 2046 permits only an optional trailing CRLF after the closing boundary.
    # Reject larger trailers before reading them so a forged Content-Length cannot
    # force the bridge to buffer the remainder of a very large request in memory.
    if trailing_total > 2:
        raise ValueError("Unexpected data follows the closing multipart boundary")
    if reader.remaining > 0:
        reader._fill(trailing_total)
    trailing = bytes(reader.buffer).strip(b"\r\n")
    if trailing:
        raise ValueError("Unexpected data follows the closing multipart boundary")
    return parts


def validate_r5a_state(state_path: Path, check_paths: bool = True) -> dict[str, Any]:
    state = load_json(state_path)
    required = {
        "schema": "resonance.open-nova.local-ai.v1",
        "bootstrap_revision": "R9",
        "engine": "MuseTalk",
        "engine_version": "1.5",
        "engine_revision": EXPECTED_ENGINE_REVISION,
        "ui_url": "http://127.0.0.1:7862",
        "bind_host": "127.0.0.1",
        "precision": "fp16",
        "network_runtime": "offline",
        "live_endpoint_verified": True,
    }
    errors: list[str] = []
    for key, expected in required.items():
        actual = state.get(key)
        if actual != expected:
            errors.append(f"{key}={actual!r}; expected {expected!r}")
    for key in ("engine_path", "python_path", "ffmpeg_path"):
        if not state.get(key):
            errors.append(f"missing {key}")
    if check_paths and not errors:
        engine = Path(str(state["engine_path"]))
        python = Path(str(state["python_path"]))
        ffmpeg = Path(str(state["ffmpeg_path"]))
        required_paths = [
            python,
            ffmpeg,
            engine / "scripts" / "inference.py",
            engine / "models" / "musetalkV15" / "musetalk.json",
            engine / "models" / "musetalkV15" / "unet.pth",
            engine / "models" / "whisper" / "config.json",
            engine / "models" / "whisper" / "pytorch_model.bin",
        ]
        for item in required_paths:
            if not item.exists():
                errors.append(f"required path missing: {item}")
    if errors:
        raise RuntimeError("R5A gate failed: " + " | ".join(errors))
    return state


def build_inference_environment(state: dict[str, Any], root: Path) -> dict[str, str]:
    engine = Path(str(state["engine_path"]))
    ffmpeg = Path(str(state["ffmpeg_path"]))
    env = os.environ.copy()
    env.update({
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
        "DIFFUSERS_OFFLINE": "1",
        "HF_HUB_DISABLE_TELEMETRY": "1",
        "GRADIO_ANALYTICS_ENABLED": "False",
        "PYTHONNOUSERSITE": "1",
        "PYTHONUTF8": "1",
        "NO_PROXY": "127.0.0.1,localhost",
    })
    existing_pythonpath = env.get("PYTHONPATH", "").strip()
    env["PYTHONPATH"] = str(engine) + (os.pathsep + existing_pythonpath if existing_pythonpath else "")
    env["TORCH_HOME"] = str(state.get("torch_home") or (root / "runtime" / "model-cache" / "torch"))
    env["PATH"] = str(ffmpeg.parent) + os.pathsep + env.get("PATH", "")
    return env


@dataclass(frozen=True)
class RuntimePaths:
    root: Path
    state_path: Path
    runtime_dir: Path
    jobs_dir: Path
    logs_dir: Path


class BridgeRuntime:
    def __init__(self, paths: RuntimePaths, state: dict[str, Any], inference_timeout: int) -> None:
        self.paths = paths
        self.state = state
        self.engine_path = Path(str(state["engine_path"]))
        self.python_path = Path(str(state["python_path"]))
        self.ffmpeg_path = Path(str(state["ffmpeg_path"]))
        self.inference_timeout = max(60, inference_timeout)
        self.paths.jobs_dir.mkdir(parents=True, exist_ok=True)
        self.paths.logs_dir.mkdir(parents=True, exist_ok=True)
        self._queue: queue.Queue[str | None] = queue.Queue()
        self._stop = threading.Event()
        self._lock = threading.RLock()
        self._processes: dict[str, subprocess.Popen[Any]] = {}
        self._recover_interrupted_jobs()
        self._worker = threading.Thread(target=self._worker_loop, name="musetalk-r5b-worker", daemon=True)
        self._worker.start()

    def close(self) -> None:
        self._stop.set()
        self._queue.put(None)
        with self._lock:
            processes = list(self._processes.items())
        for job_id, process in processes:
            try:
                process.terminate()
                process.wait(timeout=8)
            except Exception:
                try:
                    process.kill()
                except Exception:
                    pass
            self._update(job_id, status="failed", error="Bridge stopped while inference was active.")

    def _job_dir(self, job_id: str) -> Path:
        if not re.fullmatch(r"[0-9a-f]{32}", job_id):
            raise KeyError("Invalid job id")
        return self.paths.jobs_dir / job_id

    def _state_file(self, job_id: str) -> Path:
        return self._job_dir(job_id) / "job.json"

    def _recover_interrupted_jobs(self) -> None:
        for path in self.paths.jobs_dir.glob("*/job.json"):
            try:
                job = load_json(path)
                if job.get("status") in {"queued", "processing"}:
                    job["status"] = "failed"
                    job["error"] = "Bridge restarted before this job completed. Submit the scene again."
                    job["updated_at"] = utc_now()
                    atomic_json(path, job)
            except Exception:
                continue

    def _read(self, job_id: str) -> dict[str, Any]:
        path = self._state_file(job_id)
        if not path.is_file():
            raise KeyError(job_id)
        return load_json(path)

    def _update(self, job_id: str, **patch: Any) -> dict[str, Any]:
        with self._lock:
            job = self._read(job_id)
            job.update(patch)
            job["updated_at"] = utc_now()
            atomic_json(self._state_file(job_id), job)
            return job

    def list_jobs(self) -> list[dict[str, Any]]:
        jobs: list[dict[str, Any]] = []
        for path in self.paths.jobs_dir.glob("*/job.json"):
            try:
                jobs.append(load_json(path))
            except Exception:
                continue
        jobs.sort(key=lambda row: str(row.get("created_at", "")), reverse=True)
        return jobs[:100]

    def get_job(self, job_id: str) -> dict[str, Any]:
        return self._read(job_id)

    def submit(self, video_upload: MultipartPart, audio_upload: MultipartPart, metadata: dict[str, Any]) -> dict[str, Any]:
        job_id = uuid.uuid4().hex
        job_dir = self._job_dir(job_id)
        job_dir.mkdir(parents=True, exist_ok=False)
        video_path = job_dir / ("input" + media_suffix(video_upload, "video"))
        audio_path = job_dir / ("audio" + media_suffix(audio_upload, "audio"))
        try:
            video_size = int(video_upload.size)
            audio_size = int(audio_upload.size)
            if video_size < 1024:
                raise ValueError("Video upload is unexpectedly small")
            if audio_size < 128:
                raise ValueError("Audio upload is unexpectedly small")
            if video_size > MAX_MEDIA_BYTES or audio_size > MAX_MEDIA_BYTES:
                raise ValueError("Uploaded media exceeds the governed size limit")
            shutil.move(str(video_upload.path), str(video_path))
            shutil.move(str(audio_upload.path), str(audio_path))
            result_dir = job_dir / "result"
            output_path = result_dir / "v15" / "output.mp4"
            job = {
                "schema": BRIDGE_SCHEMA,
                "service": BRIDGE_SERVICE,
                "bridge_version": BRIDGE_VERSION,
                "job_id": job_id,
                "status": "queued",
                "progress": 0,
                "created_at": utc_now(),
                "updated_at": utc_now(),
                "started_at": None,
                "completed_at": None,
                "error": None,
                "cancel_requested": False,
                "video_path": str(video_path),
                "audio_path": str(audio_path),
                "output_path": str(output_path),
                "video_bytes": video_size,
                "audio_bytes": audio_size,
                "video_sha256": sha256_file(video_path),
                "audio_sha256": sha256_file(audio_path),
                "metadata": metadata,
                "engine_revision": EXPECTED_ENGINE_REVISION,
                "network_runtime": "offline",
                "precision": "fp16",
            }
            atomic_json(self._state_file(job_id), job)
            self._queue.put(job_id)
            return self.public_job(job)
        except Exception:
            shutil.rmtree(job_dir, ignore_errors=True)
            raise

    def cancel(self, job_id: str) -> dict[str, Any]:
        with self._lock:
            job = self._read(job_id)
            if job.get("status") in TERMINAL_STATUSES:
                return self.public_job(job)
            job["cancel_requested"] = True
            job["status"] = "canceled"
            job["error"] = "Canceled by user"
            job["completed_at"] = utc_now()
            job["updated_at"] = utc_now()
            atomic_json(self._state_file(job_id), job)
            process = self._processes.get(job_id)
        if process and process.poll() is None:
            try:
                process.terminate()
            except Exception:
                pass
        return self.public_job(job)

    def public_job(self, job: dict[str, Any]) -> dict[str, Any]:
        status = str(job.get("status", "failed"))
        job_id = str(job.get("job_id", ""))
        output_ready = status == "succeeded" and Path(str(job.get("output_path", ""))).is_file()
        return {
            "schema": BRIDGE_SCHEMA,
            "service": BRIDGE_SERVICE,
            "bridge_version": BRIDGE_VERSION,
            "job_id": job_id,
            "status": status,
            "progress": int(job.get("progress") or 0),
            "created_at": job.get("created_at"),
            "updated_at": job.get("updated_at"),
            "started_at": job.get("started_at"),
            "completed_at": job.get("completed_at"),
            "error": job.get("error"),
            "output_ready": output_ready,
            "output_url": f"/api/jobs/{job_id}/output" if output_ready else None,
            "metadata": job.get("metadata") or {},
            "engine_revision": EXPECTED_ENGINE_REVISION,
            "network_runtime": "offline",
        }

    def output_path(self, job_id: str) -> Path:
        job = self._read(job_id)
        if job.get("status") != "succeeded":
            raise FileNotFoundError("Job output is not ready")
        path = Path(str(job.get("output_path", "")))
        if not path.is_file() or path.stat().st_size < 1024:
            raise FileNotFoundError("Job output file is missing")
        return path

    def _worker_loop(self) -> None:
        while not self._stop.is_set():
            job_id = self._queue.get()
            try:
                if job_id is None:
                    return
                job = self._read(job_id)
                if job.get("status") == "canceled" or job.get("cancel_requested"):
                    continue
                self._run_job(job_id)
            except Exception:
                if job_id:
                    try:
                        self._update(job_id, status="failed", progress=0, completed_at=utc_now(), error=traceback.format_exc()[-6000:])
                    except Exception:
                        pass
            finally:
                self._queue.task_done()

    def _run_job(self, job_id: str) -> None:
        job = self._read(job_id)
        job_dir = self._job_dir(job_id)
        config_path = job_dir / "inference.json"
        result_dir = job_dir / "result"
        stdout_path = job_dir / "inference.stdout.log"
        stderr_path = job_dir / "inference.stderr.log"
        config = {
            "task_0": {
                "video_path": str(job["video_path"]),
                "audio_path": str(job["audio_path"]),
                "result_name": "output.mp4",
            }
        }
        atomic_json(config_path, config)
        command = [
            str(self.python_path),
            str(self.engine_path / "scripts" / "inference.py"),
            "--inference_config", str(config_path),
            "--result_dir", str(result_dir),
            "--unet_model_path", str(self.engine_path / "models" / "musetalkV15" / "unet.pth"),
            "--unet_config", str(self.engine_path / "models" / "musetalkV15" / "musetalk.json"),
            "--whisper_dir", str(self.engine_path / "models" / "whisper"),
            "--version", "v15",
            "--fps", "25",
            "--batch_size", "4",
            "--ffmpeg_path", str(self.ffmpeg_path.parent),
            "--use_float16",
        ]
        command_path = job_dir / "command.json"
        atomic_json(command_path, {"command": command, "working_directory": str(self.engine_path)})
        env = build_inference_environment(self.state, self.paths.root)
        self._update(job_id, status="processing", progress=5, started_at=utc_now(), error=None)
        started = time.monotonic()
        with stdout_path.open("wb") as stdout, stderr_path.open("wb") as stderr:
            process = subprocess.Popen(
                command,
                cwd=str(self.engine_path),
                env=env,
                stdout=stdout,
                stderr=stderr,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            with self._lock:
                self._processes[job_id] = process
            try:
                last_progress = -1
                while process.poll() is None:
                    current = self._read(job_id)
                    if current.get("cancel_requested") or current.get("status") == "canceled":
                        process.terminate()
                        try:
                            process.wait(timeout=8)
                        except subprocess.TimeoutExpired:
                            process.kill()
                        return
                    elapsed = time.monotonic() - started
                    if elapsed > self.inference_timeout:
                        process.terminate()
                        try:
                            process.wait(timeout=8)
                        except subprocess.TimeoutExpired:
                            process.kill()
                        self._update(
                            job_id,
                            status="failed",
                            progress=min(90, max(5, last_progress)),
                            completed_at=utc_now(),
                            error=f"MuseTalk inference exceeded the {self.inference_timeout}-second governed timeout.",
                        )
                        return
                    progress = min(90, 8 + int(elapsed / 6))
                    if progress != last_progress:
                        self._update(job_id, progress=progress)
                        last_progress = progress
                    time.sleep(2)
            finally:
                with self._lock:
                    self._processes.pop(job_id, None)
        return_code = int(process.returncode or 0)
        output_path = Path(str(job["output_path"]))
        if return_code != 0:
            detail = safe_tail(stderr_path) or safe_tail(stdout_path)
            self._update(
                job_id,
                status="failed",
                completed_at=utc_now(),
                error=f"MuseTalk inference exited {return_code}. {detail}"[-7000:],
            )
            return
        if not output_path.is_file() or output_path.stat().st_size < 1024:
            detail = safe_tail(stderr_path) or safe_tail(stdout_path)
            self._update(
                job_id,
                status="failed",
                completed_at=utc_now(),
                error=f"MuseTalk exited successfully but no valid output video was created. {detail}"[-7000:],
            )
            return
        self._update(
            job_id,
            status="succeeded",
            progress=100,
            completed_at=utc_now(),
            error=None,
            output_bytes=output_path.stat().st_size,
            output_sha256=sha256_file(output_path),
        )


def health_payload(runtime: BridgeRuntime, host: str, port: int) -> dict[str, Any]:
    return {
        "schema": BRIDGE_SCHEMA,
        "service": BRIDGE_SERVICE,
        "bridge_version": BRIDGE_VERSION,
        "status": "healthy",
        "bind": f"{host}:{port}",
        "engine": "MuseTalk",
        "engine_version": "1.5",
        "engine_revision": EXPECTED_ENGINE_REVISION,
        "precision": "fp16",
        "network_runtime": "offline",
        "queue_depth": runtime._queue.qsize(),
        "active_jobs": len(runtime._processes),
        "time_utc": utc_now(),
    }


class BridgeServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, server_address: tuple[str, int], handler: type[BaseHTTPRequestHandler], runtime: BridgeRuntime):
        super().__init__(server_address, handler)
        self.runtime = runtime


class Handler(BaseHTTPRequestHandler):
    server_version = "ResonanceMuseTalkBridge/1.0"

    @property
    def runtime(self) -> BridgeRuntime:
        return self.server.runtime  # type: ignore[attr-defined]

    def log_message(self, fmt: str, *args: Any) -> None:
        line = f"{utc_now()} {self.client_address[0]} {fmt % args}\n"
        try:
            with (self.runtime.paths.logs_dir / "http.log").open("a", encoding="utf-8") as handle:
                handle.write(line)
        except Exception:
            pass
        sys.stdout.write(line)
        sys.stdout.flush()

    def _origin_allowed(self) -> bool:
        origin = self.headers.get("Origin")
        return not origin or origin in ALLOWED_ORIGINS

    def _cors_origin(self) -> str | None:
        origin = self.headers.get("Origin")
        return origin if origin in ALLOWED_ORIGINS else None

    def _base_headers(self, content_type: str = "application/json; charset=utf-8", length: int | None = None) -> None:
        self.send_header("Content-Type", content_type)
        if length is not None:
            self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        origin = self._cors_origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def _json(self, status: int, data: dict[str, Any], head_only: bool = False) -> None:
        raw = (json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
        self.send_response(status)
        self._base_headers(length=len(raw))
        self.end_headers()
        if not head_only:
            self.wfile.write(raw)

    def _error(self, status: int, message: str) -> None:
        self._json(
            status,
            {"error": message, "status": status, "service": BRIDGE_SERVICE},
            head_only=self.command == "HEAD",
        )

    def do_OPTIONS(self) -> None:
        if not self._origin_allowed():
            self._error(HTTPStatus.FORBIDDEN, "Origin is not allowed")
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self._base_headers(length=0)
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_HEAD(self) -> None:
        self._handle_get(head_only=True)

    def do_GET(self) -> None:
        self._handle_get(head_only=False)

    def _handle_get(self, head_only: bool) -> None:
        if not self._origin_allowed():
            self._error(HTTPStatus.FORBIDDEN, "Origin is not allowed")
            return
        path = urlparse(self.path).path
        if path == "/health":
            host, port = self.server.server_address  # type: ignore[attr-defined]
            self._json(HTTPStatus.OK, health_payload(self.runtime, str(host), int(port)), head_only=head_only)
            return
        if path == "/api/jobs":
            self._json(HTTPStatus.OK, {"jobs": [self.runtime.public_job(j) for j in self.runtime.list_jobs()]}, head_only=head_only)
            return
        match = re.fullmatch(r"/api/jobs/([0-9a-f]{32})", path)
        if match:
            try:
                job = self.runtime.get_job(match.group(1))
                self._json(HTTPStatus.OK, self.runtime.public_job(job), head_only=head_only)
            except KeyError:
                self._error(HTTPStatus.NOT_FOUND, "Job not found")
            return
        match = re.fullmatch(r"/api/jobs/([0-9a-f]{32})/output", path)
        if match:
            try:
                self._serve_file(self.runtime.output_path(match.group(1)), head_only=head_only)
            except (KeyError, FileNotFoundError):
                self._error(HTTPStatus.NOT_FOUND, "Output not found")
            return
        self._error(HTTPStatus.NOT_FOUND, "Endpoint not found")

    def _serve_file(self, path: Path, head_only: bool) -> None:
        size = path.stat().st_size
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        range_header = self.headers.get("Range")
        start = 0
        end = size - 1
        status = HTTPStatus.OK
        if range_header:
            match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header.strip())
            if not match:
                self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return
            left, right = match.groups()
            if not left and not right:
                self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                self._base_headers(content_type=content_type, length=0)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return
            if left:
                start = int(left)
                end = int(right) if right else size - 1
            elif right:
                length = int(right)
                start = max(0, size - length)
            if start < 0 or end < start or start >= size:
                self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return
            end = min(end, size - 1)
            status = HTTPStatus.PARTIAL_CONTENT
        length = end - start + 1
        self.send_response(status)
        self._base_headers(content_type=content_type, length=length)
        self.send_header("Accept-Ranges", "bytes")
        if status == HTTPStatus.PARTIAL_CONTENT:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        if head_only:
            return
        with path.open("rb") as handle:
            handle.seek(start)
            remaining = length
            while remaining > 0:
                block = handle.read(min(STREAM_CHUNK_BYTES, remaining))
                if not block:
                    break
                self.wfile.write(block)
                remaining -= len(block)
        self.wfile.flush()

    def do_POST(self) -> None:
        if not self._origin_allowed():
            self._error(HTTPStatus.FORBIDDEN, "Origin is not allowed")
            return
        path = urlparse(self.path).path
        if path == "/api/jobs":
            self._submit_job()
            return
        match = re.fullmatch(r"/api/jobs/([0-9a-f]{32})/cancel", path)
        if match:
            try:
                self._json(HTTPStatus.OK, self.runtime.cancel(match.group(1)))
            except KeyError:
                self._error(HTTPStatus.NOT_FOUND, "Job not found")
            return
        self._error(HTTPStatus.NOT_FOUND, "Endpoint not found")

    def _submit_job(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._error(HTTPStatus.BAD_REQUEST, "Invalid Content-Length")
            return
        if length <= 0 or length > MAX_REQUEST_BYTES:
            self._error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Request body is empty or too large")
            return
        content_type = self.headers.get("Content-Type", "")
        if not content_type.lower().startswith("multipart/form-data"):
            self._error(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "multipart/form-data is required")
            return
        upload_root = self.runtime.paths.runtime_dir / "uploads"
        upload_root.mkdir(parents=True, exist_ok=True)
        try:
            with tempfile.TemporaryDirectory(prefix="request-", dir=str(upload_root)) as temp_name:
                parts = parse_multipart_upload(self.rfile, length, content_type, Path(temp_name))
                unknown = sorted(set(parts) - {"video", "audio", "metadata"})
                if unknown:
                    raise ValueError("Unexpected multipart fields: " + ", ".join(unknown))
                if "video" not in parts or "audio" not in parts:
                    raise ValueError("Both video and audio files are required")
                video = parts["video"]
                audio = parts["audio"]
                if not video.filename or not audio.filename:
                    raise ValueError("Video and audio must be file uploads")
                raw_metadata = "{}"
                if "metadata" in parts:
                    metadata_part = parts["metadata"]
                    if metadata_part.size > MAX_METADATA_BYTES:
                        raise ValueError("Metadata is too large")
                    raw_metadata = metadata_part.path.read_text(encoding="utf-8")
                metadata = json.loads(raw_metadata) if raw_metadata else {}
                if not isinstance(metadata, dict):
                    raise ValueError("Metadata must be a JSON object")
                result = self.runtime.submit(video, audio, metadata)
                self._json(HTTPStatus.ACCEPTED, result)
        except json.JSONDecodeError:
            self._error(HTTPStatus.BAD_REQUEST, "Metadata is not valid JSON")
        except ValueError as exc:
            self._error(HTTPStatus.BAD_REQUEST, str(exc))
        except Exception as exc:
            self.log_error("submit failed: %s", traceback.format_exc())
            self._error(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))


def self_test(state_path: Path, runtime_dir: Path, skip_path_check: bool) -> int:
    state = validate_r5a_state(state_path, check_paths=not skip_path_check)
    engine = Path(str(state["engine_path"]))
    python = Path(str(state["python_path"]))
    ffmpeg = Path(str(state["ffmpeg_path"]))
    command = [
        str(python), str(engine / "scripts" / "inference.py"),
        "--inference_config", "JOB/inference.json",
        "--result_dir", "JOB/result",
        "--unet_model_path", str(engine / "models" / "musetalkV15" / "unet.pth"),
        "--unet_config", str(engine / "models" / "musetalkV15" / "musetalk.json"),
        "--whisper_dir", str(engine / "models" / "whisper"),
        "--version", "v15", "--fps", "25", "--batch_size", "4",
        "--ffmpeg_path", str(ffmpeg.parent), "--use_float16",
    ]
    if command[-1] != "--use_float16" or command[command.index("--version") + 1] != "v15":
        raise RuntimeError("Command contract self-test failed")
    environment = build_inference_environment(state, state_path.parent.parent)
    probe = subprocess.run(
        [str(python), "-c", "import musetalk; print(musetalk.__file__)"],
        cwd=str(engine),
        env=environment,
        capture_output=True,
        text=True,
        timeout=60,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if probe.returncode != 0:
        raise RuntimeError("Inference environment self-test failed: " + (probe.stderr or probe.stdout)[-2000:])
    runtime_dir.mkdir(parents=True, exist_ok=True)
    print(json.dumps({
        "ok": True,
        "schema": BRIDGE_SCHEMA,
        "service": BRIDGE_SERVICE,
        "bridge_version": BRIDGE_VERSION,
        "engine_revision": state["engine_revision"],
        "command_contract": command,
        "environment_contract": {
            "pythonpath_prepend": str(engine),
            "torch_home": environment["TORCH_HOME"],
            "offline": True,
        },
        "runtime_dir": str(runtime_dir),
    }, indent=2))
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Resonance R5B MuseTalk localhost bridge")
    parser.add_argument("--root", default=os.environ.get("DATANEST_RONSAS_RUNTIME_ROOT", str(Path(os.environ.get("LOCALAPPDATA", Path.home())) / "Resonance" / "DataNest-RONSAS")))
    parser.add_argument("--state", default=None)
    parser.add_argument("--runtime-dir", default=None)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7863)
    parser.add_argument("--inference-timeout", type=int, default=2700)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--skip-path-check", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.host != "127.0.0.1":
        raise RuntimeError("R5B bridge may bind only to 127.0.0.1")
    root = Path(args.root).resolve()
    state_path = Path(args.state).resolve() if args.state else root / "runtime" / "r5-local-ai.json"
    runtime_dir = Path(args.runtime_dir).resolve() if args.runtime_dir else root / "runtime" / "musetalk-bridge"
    if args.self_test:
        return self_test(state_path, runtime_dir, args.skip_path_check)
    state = validate_r5a_state(state_path, check_paths=True)
    paths = RuntimePaths(
        root=root,
        state_path=state_path,
        runtime_dir=runtime_dir,
        jobs_dir=runtime_dir / "jobs",
        logs_dir=runtime_dir / "logs",
    )
    runtime = BridgeRuntime(paths, state, args.inference_timeout)
    server = BridgeServer((args.host, args.port), Handler, runtime)
    print(json.dumps(health_payload(runtime, args.host, args.port), indent=2), flush=True)

    def stop_handler(_signum: int, _frame: Any) -> None:
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT, stop_handler)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, stop_handler)
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        runtime.close()
        server.server_close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise
    except Exception as exc:
        sys.stderr.write(f"R5B bridge fatal error: {exc}\n")
        sys.stderr.write(traceback.format_exc())
        raise SystemExit(1)
