from __future__ import annotations

import asyncio
import copy
import hashlib
import html
import inspect
import ipaddress
import json
import os
import re
import socket
import ssl
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Awaitable, Callable, Iterable, Mapping, Sequence
from urllib.parse import parse_qs, quote, unquote, urlencode, urljoin, urlsplit, urlunsplit
from xml.etree import ElementTree

import httpx
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator


SERVICE_NAME = "Resonance Open Nova Sovereign Research"
SERVICE_VERSION = "0.2.0"
POLICY_PATH_DEFAULT = Path("governance/research-policy.json")
RUNTIME_ROOT_DEFAULT = Path("runtime/research")
EPUBLISHER_ORIGIN = "http://localhost:3101"
EPUBLISHER_LOOPBACK_ORIGIN = "http://127.0.0.1:3101"

MAX_TOPIC_HARD = 1_000
MAX_URL_LENGTH_HARD = 2_048
MAX_URLS_HARD = 24
MAX_CONFIG_BYTES_HARD = 32_768
MAX_CONTENT_CHARS_HARD = 200_000
MAX_RESPONSE_BYTES_HARD = 4_000_000
REDIRECT_CODES = {301, 302, 303, 307, 308}
YOUTUBE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

ReceiptWriter = Callable[[dict[str, Any]], Any]
Resolver = Callable[[str, int], Sequence[str] | Awaitable[Sequence[str]]]


class ResearchError(RuntimeError):
    """Base error for governed research failures."""


class ResearchSecurityError(ResearchError):
    """Raised when a URL or caller violates a local security boundary."""


class FetchError(ResearchError):
    """Raised when a governed public fetch cannot complete safely."""


class ExtractionUnavailable(ResearchError):
    """Raised when a reachable source has no usable public text."""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _normalise_topic(value: str, maximum: int) -> str:
    topic = " ".join(value.split())
    if len(topic) < 2:
        raise ValueError("topic must contain at least two characters")
    if len(topic) > maximum:
        raise ValueError(f"topic exceeds the governed {maximum}-character limit")
    return topic


def _bounded_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        candidate = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(candidate, maximum))


def _bounded_float(value: Any, default: float, minimum: float, maximum: float) -> float:
    try:
        candidate = float(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(candidate, maximum))


@dataclass(frozen=True)
class ResearchPolicy:
    """Hard-capped local policy. A missing file uses these restrictive defaults."""

    enabled: bool = True
    max_topic_chars: int = 500
    max_sources: int = 12
    max_urls: int = 12
    max_content_chars: int = 120_000
    max_response_bytes: int = 2_000_000
    max_discovery_bytes: int = 3_000_000
    max_verify_bytes: int = 65_536
    max_redirects: int = 3
    max_network_concurrency: int = 4
    max_job_concurrency: int = 2
    max_jobs: int = 64
    connect_timeout_seconds: float = 3.0
    read_timeout_seconds: float = 10.0
    dns_timeout_seconds: float = 2.0
    discovery_cache_ttl_seconds: int = 900
    extraction_cache_ttl_seconds: int = 3_600
    job_ttl_seconds: int = 3_600
    cache_entries: int = 128
    allow_http: bool = False
    allowed_origins: tuple[str, ...] = (EPUBLISHER_ORIGIN, EPUBLISHER_LOOPBACK_ORIGIN)
    policy_path: str = str(POLICY_PATH_DEFAULT)
    policy_loaded: bool = False

    @classmethod
    def load(cls, path: str | os.PathLike[str] | None = None) -> "ResearchPolicy":
        policy_path = Path(path) if path is not None else POLICY_PATH_DEFAULT
        if not policy_path.exists():
            return cls(policy_path=str(policy_path), policy_loaded=False)
        try:
            raw = json.loads(policy_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise ResearchError(f"research policy is unreadable: {exc}") from exc
        if not isinstance(raw, dict):
            raise ResearchError("research policy must be a JSON object")

        limits = raw.get("limits") if isinstance(raw.get("limits"), dict) else {}
        network = raw.get("network") if isinstance(raw.get("network"), dict) else {}
        cache = raw.get("cache") if isinstance(raw.get("cache"), dict) else {}
        jobs = raw.get("jobs") if isinstance(raw.get("jobs"), dict) else {}

        def pick(section: Mapping[str, Any], key: str, fallback: Any) -> Any:
            return section.get(key, raw.get(key, fallback))

        configured_origins = raw.get("allowed_origins", [EPUBLISHER_ORIGIN, EPUBLISHER_LOOPBACK_ORIGIN])
        if not isinstance(configured_origins, list):
            configured_origins = [EPUBLISHER_ORIGIN, EPUBLISHER_LOOPBACK_ORIGIN]
        allowed_origins = tuple(
            origin
            for origin in configured_origins
            if isinstance(origin, str)
            and re.fullmatch(r"http://(?:localhost|127\.0\.0\.1)(?::\d{1,5})?", origin)
        ) or (EPUBLISHER_ORIGIN, EPUBLISHER_LOOPBACK_ORIGIN)

        return cls(
            enabled=raw.get("enabled") is not False,
            max_topic_chars=_bounded_int(pick(limits, "max_topic_chars", 500), 500, 32, MAX_TOPIC_HARD),
            max_sources=_bounded_int(pick(limits, "max_sources", 12), 12, 1, MAX_URLS_HARD),
            max_urls=_bounded_int(pick(limits, "max_urls", 12), 12, 1, MAX_URLS_HARD),
            max_content_chars=_bounded_int(
                pick(limits, "max_content_chars", 120_000), 120_000, 2_000, MAX_CONTENT_CHARS_HARD
            ),
            max_response_bytes=_bounded_int(
                pick(network, "max_response_bytes", 2_000_000), 2_000_000, 65_536, MAX_RESPONSE_BYTES_HARD
            ),
            max_discovery_bytes=_bounded_int(
                pick(network, "max_discovery_bytes", 3_000_000), 3_000_000, 32_768, MAX_RESPONSE_BYTES_HARD
            ),
            max_verify_bytes=_bounded_int(
                pick(network, "max_verify_bytes", 65_536), 65_536, 1_024, 262_144
            ),
            max_redirects=_bounded_int(pick(network, "max_redirects", 3), 3, 0, 5),
            max_network_concurrency=_bounded_int(
                pick(network, "max_concurrency", 4), 4, 1, 8
            ),
            max_job_concurrency=_bounded_int(pick(jobs, "max_concurrency", 2), 2, 1, 4),
            max_jobs=_bounded_int(pick(jobs, "max_retained", 64), 64, 4, 128),
            connect_timeout_seconds=_bounded_float(
                pick(network, "connect_timeout_seconds", 3.0), 3.0, 1.0, 10.0
            ),
            read_timeout_seconds=_bounded_float(
                pick(network, "read_timeout_seconds", 10.0), 10.0, 2.0, 30.0
            ),
            dns_timeout_seconds=_bounded_float(
                pick(network, "dns_timeout_seconds", 2.0), 2.0, 0.5, 5.0
            ),
            discovery_cache_ttl_seconds=_bounded_int(
                pick(cache, "discovery_ttl_seconds", 900), 900, 30, 86_400
            ),
            extraction_cache_ttl_seconds=_bounded_int(
                pick(cache, "extraction_ttl_seconds", 3_600), 3_600, 60, 86_400
            ),
            job_ttl_seconds=_bounded_int(pick(jobs, "ttl_seconds", 3_600), 3_600, 60, 86_400),
            cache_entries=_bounded_int(pick(cache, "max_entries", 128), 128, 8, 512),
            # HTTP can only be explicitly enabled. All addresses are still DNS/IP checked.
            allow_http=network.get("allow_http") is True,
            allowed_origins=allowed_origins,
            policy_path=str(policy_path),
            policy_loaded=True,
        )

    @property
    def allowed_schemes(self) -> frozenset[str]:
        return frozenset({"https", "http"} if self.allow_http else {"https"})


class DiscoverRequest(BaseModel):
    topic: str = Field(min_length=2, max_length=MAX_TOPIC_HARD)
    limit: int | None = Field(default=None, ge=1, le=MAX_URLS_HARD)

    @field_validator("topic")
    @classmethod
    def strip_topic(cls, value: str) -> str:
        return " ".join(value.split())


class VerifyRequest(BaseModel):
    urls: list[str] = Field(min_length=1, max_length=MAX_URLS_HARD)

    @field_validator("urls")
    @classmethod
    def validate_urls(cls, values: list[str]) -> list[str]:
        cleaned: list[str] = []
        for value in values:
            candidate = value.strip()
            if not candidate or len(candidate) > MAX_URL_LENGTH_HARD:
                raise ValueError("each URL must be between 1 and 2048 characters")
            cleaned.append(candidate)
        return cleaned


class JobRequest(BaseModel):
    topic: str = Field(min_length=2, max_length=MAX_TOPIC_HARD)
    config: dict[str, Any] = Field(default_factory=dict)
    urls: list[str] = Field(default_factory=list, max_length=MAX_URLS_HARD)

    @field_validator("topic")
    @classmethod
    def strip_topic(cls, value: str) -> str:
        return " ".join(value.split())

    @field_validator("urls")
    @classmethod
    def validate_urls(cls, values: list[str]) -> list[str]:
        return VerifyRequest.validate_urls(values) if values else []

    @field_validator("config")
    @classmethod
    def bound_config(cls, value: dict[str, Any]) -> dict[str, Any]:
        try:
            payload = json.dumps(value, ensure_ascii=False, sort_keys=True)
        except (TypeError, ValueError) as exc:
            raise ValueError("config must be JSON serializable") from exc
        if len(payload.encode("utf-8")) > MAX_CONFIG_BYTES_HARD:
            raise ValueError("config exceeds the 32768-byte limit")
        return value


@dataclass
class FetchResult:
    requested_url: str
    final_url: str
    status_code: int
    headers: dict[str, str]
    body: bytes
    truncated: bool = False

    def text(self) -> str:
        content_type = self.headers.get("content-type", "")
        match = re.search(r"charset\s*=\s*[\"']?([^;\s\"']+)", content_type, flags=re.I)
        encoding = match.group(1) if match else "utf-8"
        try:
            return self.body.decode(encoding, errors="replace")
        except LookupError:
            return self.body.decode("utf-8", errors="replace")


@dataclass
class JobRecord:
    job_id: str
    topic_hash: str
    status: str = "queued"
    progress: int = 0
    status_message: str = "Research job queued"
    created_at: str = field(default_factory=_utc_now)
    updated_at: str = field(default_factory=_utc_now)
    error: str | None = None
    processed_sources: list[dict[str, Any]] = field(default_factory=list)

    def public(self, include_results: bool = False) -> dict[str, Any]:
        ready = sum(item.get("status") == "ready" for item in self.processed_sources)
        failed = sum(item.get("status") == "error" for item in self.processed_sources)
        payload: dict[str, Any] = {
            "jobId": self.job_id,
            "status": self.status,
            "progress": self.progress,
            "statusMessage": self.status_message,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "sourceCount": len(self.processed_sources),
            "readySources": ready,
            "failedSources": failed,
        }
        if self.error:
            payload["error"] = self.error
        if include_results:
            payload["processedSources"] = copy.deepcopy(self.processed_sources)
        return payload


class BoundedDiskCache:
    """Small local JSON cache addressed only by hashes, never raw topics."""

    def __init__(self, root: Path, max_entries: int) -> None:
        self.root = root
        self.max_entries = max_entries
        self._memory: dict[str, tuple[float, Any]] = {}
        self._lock = threading.RLock()

    @staticmethod
    def _safe_name(namespace: str, key: str) -> str:
        namespace = re.sub(r"[^a-z0-9_-]", "-", namespace.lower())[:24]
        digest = key if re.fullmatch(r"[a-f0-9]{64}", key) else _sha256_text(key)
        return f"{namespace}-{digest}.json"

    def get(self, namespace: str, key: str, ttl_seconds: int) -> Any | None:
        cache_key = f"{namespace}:{key}"
        now = time.time()
        with self._lock:
            memory = self._memory.get(cache_key)
            if memory and now - memory[0] <= ttl_seconds:
                return copy.deepcopy(memory[1])

            path = self.root / self._safe_name(namespace, key)
            try:
                if not path.is_file() or path.stat().st_size > MAX_RESPONSE_BYTES_HARD * 2:
                    return None
                record = json.loads(path.read_text(encoding="utf-8"))
                stored_at = float(record["storedAt"])
                if now - stored_at > ttl_seconds:
                    return None
                value = record["value"]
            except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
                return None
            self._memory[cache_key] = (stored_at, value)
            return copy.deepcopy(value)

    def set(self, namespace: str, key: str, value: Any) -> None:
        now = time.time()
        cache_key = f"{namespace}:{key}"
        record = {"storedAt": now, "value": value}
        encoded = json.dumps(record, ensure_ascii=False, separators=(",", ":"))
        if len(encoded.encode("utf-8")) > MAX_RESPONSE_BYTES_HARD * 2:
            return
        with self._lock:
            self.root.mkdir(parents=True, exist_ok=True)
            path = self.root / self._safe_name(namespace, key)
            temp_name: str | None = None
            try:
                with tempfile.NamedTemporaryFile(
                    mode="w", encoding="utf-8", newline="\n", dir=self.root, delete=False
                ) as handle:
                    handle.write(encoded)
                    temp_name = handle.name
                os.replace(temp_name, path)
                temp_name = None
                self._memory[cache_key] = (now, copy.deepcopy(value))
                self._prune_locked()
            finally:
                if temp_name:
                    try:
                        Path(temp_name).unlink(missing_ok=True)
                    except OSError:
                        pass

    def _prune_locked(self) -> None:
        try:
            entries = sorted(
                (item for item in self.root.glob("*.json") if item.is_file()),
                key=lambda item: item.stat().st_mtime,
                reverse=True,
            )
        except OSError:
            return
        for item in entries[self.max_entries :]:
            try:
                item.unlink()
            except OSError:
                pass
        if len(self._memory) > self.max_entries:
            oldest = sorted(self._memory.items(), key=lambda item: item[1][0])
            for key, _value in oldest[: len(self._memory) - self.max_entries]:
                self._memory.pop(key, None)


class _PlainTextHTMLParser(HTMLParser):
    SKIP_TAGS = {"script", "style", "noscript", "svg", "canvas", "template", "form"}
    BLOCK_TAGS = {
        "article", "aside", "blockquote", "br", "dd", "div", "dl", "dt", "figcaption",
        "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main",
        "nav", "ol", "p", "pre", "section", "table", "td", "th", "tr", "ul",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._skip_depth = 0
        self._title_depth = 0
        self.parts: list[str] = []
        self.title_parts: list[str] = []
        self.description = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        lowered = tag.lower()
        if lowered in self.SKIP_TAGS:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if lowered == "title":
            self._title_depth += 1
        elif lowered == "meta" and not self.description:
            data = {str(key).lower(): value or "" for key, value in attrs}
            if data.get("name", "").lower() == "description" or data.get("property", "").lower() == "og:description":
                self.description = data.get("content", "")
        if lowered in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        lowered = tag.lower()
        if lowered in self.SKIP_TAGS:
            if self._skip_depth:
                self._skip_depth -= 1
            return
        if self._skip_depth:
            return
        if lowered == "title" and self._title_depth:
            self._title_depth -= 1
        if lowered in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        value = data.strip()
        if not value:
            return
        if self._title_depth:
            self.title_parts.append(value)
        self.parts.append(value)


def _clean_text(value: str, maximum: int) -> str:
    value = html.unescape(value)
    lines: list[str] = []
    for raw_line in value.replace("\r", "\n").split("\n"):
        line = " ".join(raw_line.split())
        if line and (not lines or line != lines[-1]):
            lines.append(line)
    return "\n\n".join(lines)[:maximum].strip()


def _strip_html_fragment(value: str, maximum: int = 500) -> str:
    parser = _PlainTextHTMLParser()
    try:
        parser.feed(value)
    except Exception:
        pass
    return _clean_text(" ".join(parser.parts), maximum)


def _extract_html_document(value: str, maximum: int) -> tuple[str, str, str]:
    parser = _PlainTextHTMLParser()
    try:
        parser.feed(value)
        parser.close()
    except Exception as exc:
        raise ExtractionUnavailable(f"HTML parsing failed: {exc}") from exc
    title = _clean_text(" ".join(parser.title_parts), 300)
    description = _clean_text(parser.description, 500)
    content = _clean_text("\n".join(parser.parts), maximum)
    if not content:
        raise ExtractionUnavailable("The page did not expose readable public text")
    return title, description, content


def _extract_json_object_after_marker(document: str, marker: str) -> dict[str, Any] | None:
    marker_index = document.find(marker)
    while marker_index >= 0:
        start = document.find("{", marker_index + len(marker))
        if start < 0:
            return None
        depth = 0
        in_string = False
        escaped = False
        for index in range(start, len(document)):
            char = document[index]
            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
                continue
            if char == '"':
                in_string = True
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    try:
                        parsed = json.loads(document[start : index + 1])
                    except json.JSONDecodeError:
                        break
                    return parsed if isinstance(parsed, dict) else None
        marker_index = document.find(marker, marker_index + len(marker))
    return None


def _walk_json(root: Any, maximum_nodes: int = 50_000) -> Iterable[Any]:
    stack = [root]
    visited = 0
    while stack and visited < maximum_nodes:
        item = stack.pop()
        visited += 1
        yield item
        if isinstance(item, dict):
            stack.extend(reversed(list(item.values())))
        elif isinstance(item, list):
            stack.extend(reversed(item))


def _text_runs(value: Any) -> str:
    if not isinstance(value, dict):
        return ""
    if isinstance(value.get("simpleText"), str):
        return value["simpleText"]
    runs = value.get("runs")
    if isinstance(runs, list):
        return "".join(str(run.get("text", "")) for run in runs if isinstance(run, dict))
    return ""


def _parse_youtube_search_html(document: str, limit: int) -> list[dict[str, Any]]:
    data = (
        _extract_json_object_after_marker(document, "ytInitialData =")
        or _extract_json_object_after_marker(document, "var ytInitialData =")
        or _extract_json_object_after_marker(document, '"ytInitialData":')
    )
    if not data:
        return []
    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    for node in _walk_json(data):
        if not isinstance(node, dict) or not isinstance(node.get("videoRenderer"), dict):
            continue
        renderer = node["videoRenderer"]
        video_id = str(renderer.get("videoId", ""))
        if not YOUTUBE_ID_RE.fullmatch(video_id) or video_id in seen:
            continue
        seen.add(video_id)
        title = _clean_text(_text_runs(renderer.get("title")), 300) or "YouTube video"
        description = ""
        snippets = renderer.get("detailedMetadataSnippets")
        if isinstance(snippets, list) and snippets and isinstance(snippets[0], dict):
            description = _text_runs(snippets[0].get("snippetText"))
        if not description:
            description = _text_runs(renderer.get("descriptionSnippet"))
        results.append(
            {
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "title": title,
                "description": _clean_text(description, 500),
                "type": "youtube",
                "provider": "youtube-public-search",
                "selected": True,
            }
        )
        if len(results) >= limit:
            break
    return results


def _youtube_video_id(url: str) -> str | None:
    try:
        parsed = urlsplit(url)
        host = (parsed.hostname or "").lower().rstrip(".")
    except ValueError:
        return None
    video_id = ""
    if host in {"youtu.be", "www.youtu.be"}:
        video_id = parsed.path.strip("/").split("/")[0]
    elif host in {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"}:
        if parsed.path == "/watch":
            video_id = parse_qs(parsed.query).get("v", [""])[0]
        elif parsed.path.startswith(("/embed/", "/shorts/", "/live/")):
            parts = parsed.path.strip("/").split("/")
            video_id = parts[1] if len(parts) > 1 else ""
    elif host in {"youtube-nocookie.com", "www.youtube-nocookie.com"} and parsed.path.startswith("/embed/"):
        parts = parsed.path.strip("/").split("/")
        video_id = parts[1] if len(parts) > 1 else ""
    return video_id if YOUTUBE_ID_RE.fullmatch(video_id) else None


def _parse_caption_payload(payload: str, maximum: int) -> str:
    stripped = payload.lstrip("\ufeff \t\r\n")
    chunks: list[str] = []
    if stripped.startswith("{"):
        try:
            data = json.loads(stripped)
        except json.JSONDecodeError as exc:
            raise ExtractionUnavailable("Public caption JSON was malformed") from exc
        for event in data.get("events", []) if isinstance(data, dict) else []:
            if not isinstance(event, dict):
                continue
            text_value = "".join(
                str(segment.get("utf8", ""))
                for segment in event.get("segs", [])
                if isinstance(segment, dict)
            )
            if text_value.strip():
                chunks.append(text_value)
    elif stripped.startswith("WEBVTT"):
        for line in stripped.splitlines()[1:]:
            value = line.strip()
            if value and "-->" not in value and not value.isdigit() and not value.startswith(("NOTE", "STYLE")):
                chunks.append(re.sub(r"<[^>]+>", "", value))
    else:
        try:
            root = ElementTree.fromstring(stripped)
        except ElementTree.ParseError as exc:
            raise ExtractionUnavailable("Public caption XML was malformed") from exc
        for node in root.iter():
            if node.tag.rsplit("}", 1)[-1] in {"text", "p"}:
                text_value = "".join(node.itertext())
                if text_value.strip():
                    chunks.append(text_value)
    content = _clean_text(" ".join(chunks), maximum)
    if not content:
        raise ExtractionUnavailable("The video has no usable public captions")
    return content


def _is_public_ip(address: str) -> bool:
    try:
        candidate = ipaddress.ip_address(address.split("%", 1)[0])
    except ValueError:
        return False
    return bool(candidate.is_global)


def _validate_url_syntax(url: str, allowed_schemes: frozenset[str]) -> tuple[str, str, int]:
    raw = url.strip()
    if not raw or len(raw) > MAX_URL_LENGTH_HARD:
        raise ResearchSecurityError("URL is empty or exceeds the governed length limit")
    if "\\" in raw or any(ord(char) < 32 for char in raw):
        raise ResearchSecurityError("URL contains forbidden characters")
    try:
        parsed = urlsplit(raw)
        scheme = parsed.scheme.lower()
        host = (parsed.hostname or "").rstrip(".").lower()
        port = parsed.port or (443 if scheme == "https" else 80)
    except ValueError as exc:
        raise ResearchSecurityError("URL is malformed") from exc
    if scheme not in allowed_schemes:
        raise ResearchSecurityError("Only governed public HTTP(S) URLs are allowed")
    if not host or parsed.username is not None or parsed.password is not None:
        raise ResearchSecurityError("URL host is missing or contains user information")
    try:
        host = host.encode("idna").decode("ascii")
    except UnicodeError as exc:
        raise ResearchSecurityError("URL host is invalid") from exc
    try:
        literal_ip = ipaddress.ip_address(host)
    except ValueError:
        literal_ip = None
    if literal_ip is not None and not literal_ip.is_global:
        raise ResearchSecurityError("Non-public IP addresses are blocked")
    if port not in {80, 443}:
        raise ResearchSecurityError("Only standard public web ports 80 and 443 are allowed")
    if host == "localhost" or host.endswith((".localhost", ".local", ".internal", ".lan", ".home.arpa")):
        raise ResearchSecurityError("Local and private hostnames are blocked")
    if parsed.fragment:
        parsed = parsed._replace(fragment="")
    normalised = urlunsplit((scheme, parsed.netloc, parsed.path or "/", parsed.query, ""))
    return normalised, host, port


async def _system_resolver(host: str, port: int) -> Sequence[str]:
    def resolve() -> list[str]:
        results = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        return sorted({str(item[4][0]).split("%", 1)[0] for item in results})

    return await asyncio.to_thread(resolve)


class ResearchService:
    def __init__(
        self,
        policy: ResearchPolicy | None = None,
        runtime_root: str | os.PathLike[str] | None = None,
        receipt_writer: ReceiptWriter | None = None,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        resolver: Resolver | None = None,
    ) -> None:
        self.policy = policy or ResearchPolicy.load()
        self.runtime_root = Path(runtime_root) if runtime_root is not None else RUNTIME_ROOT_DEFAULT
        self.receipt_writer = receipt_writer
        self.transport = transport
        # httpx otherwise pins Certifi's bundle.  An explicit default SSL
        # context also honours Ealiophin's trusted Windows root store while
        # retaining full hostname and certificate verification.
        self.ssl_context = ssl.create_default_context()
        self.resolver = resolver or _system_resolver
        self.cache = BoundedDiskCache(self.runtime_root / "cache", self.policy.cache_entries)
        self._network_slots = asyncio.Semaphore(self.policy.max_network_concurrency)
        self._job_slots = asyncio.Semaphore(self.policy.max_job_concurrency)
        self._jobs: dict[str, JobRecord] = {}
        self._job_tasks: set[asyncio.Task[Any]] = set()
        self._jobs_lock = threading.RLock()
        self._candidate_metadata: dict[str, tuple[float, dict[str, Any]]] = {}

    def _ensure_enabled(self) -> None:
        if not self.policy.enabled:
            raise ResearchError("sovereign research is disabled by local governance policy")

    async def _append_receipt(self, event: dict[str, Any]) -> Any | None:
        if self.receipt_writer is None:
            return None
        governed_event = {
            "timestamp": _utc_now(),
            "project": "ePublisher",
            "service": "open-nova-sovereign-research",
            "external_ai_used": False,
            "paid_api_used": False,
            "credentials_used": False,
            **event,
        }
        # A programming error must never put a raw topic into the append-only receipt.
        for forbidden in ("topic", "raw_topic", "query"):
            governed_event.pop(forbidden, None)
        result = self.receipt_writer(governed_event)
        if inspect.isawaitable(result):
            return await result
        return result

    async def _resolve_public(self, host: str, port: int) -> list[str]:
        try:
            resolved = self.resolver(host, port)
            if inspect.isawaitable(resolved):
                addresses = await asyncio.wait_for(resolved, timeout=self.policy.dns_timeout_seconds)
            else:
                addresses = resolved
        except asyncio.TimeoutError as exc:
            raise FetchError("DNS resolution timed out") from exc
        except (OSError, socket.gaierror) as exc:
            raise FetchError("DNS resolution failed") from exc
        cleaned = sorted({str(address).split("%", 1)[0] for address in addresses})
        if not cleaned:
            raise FetchError("DNS returned no addresses")
        if any(not _is_public_ip(address) for address in cleaned):
            raise ResearchSecurityError("DNS resolved to a non-public address")
        return cleaned

    async def _validated_url(self, url: str) -> str:
        normalised, host, port = _validate_url_syntax(url, self.policy.allowed_schemes)
        literal: str | None
        try:
            literal = str(ipaddress.ip_address(host))
        except ValueError:
            literal = None
        if literal is not None:
            if not _is_public_ip(literal):
                raise ResearchSecurityError("Non-public IP addresses are blocked")
        else:
            await self._resolve_public(host, port)
        return normalised

    async def _safe_fetch(
        self,
        url: str,
        *,
        max_bytes: int | None = None,
        allow_truncate: bool = False,
        accept: str = "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
    ) -> FetchResult:
        self._ensure_enabled()
        byte_limit = min(max_bytes or self.policy.max_response_bytes, MAX_RESPONSE_BYTES_HARD)
        requested_url = url.strip()
        current = requested_url
        visited: set[str] = set()
        timeout = httpx.Timeout(
            connect=self.policy.connect_timeout_seconds,
            read=self.policy.read_timeout_seconds,
            write=self.policy.connect_timeout_seconds,
            pool=self.policy.connect_timeout_seconds,
        )
        headers = {
            "Accept": accept,
            "Accept-Encoding": "gzip, deflate",
            "Cache-Control": "no-cache",
            "User-Agent": "ResonanceOpenNovaResearch/0.2 (https://reson8.life; sovereign-local; credential-free)",
        }
        async with self._network_slots:
            async with httpx.AsyncClient(
                follow_redirects=False,
                timeout=timeout,
                transport=self.transport,
                trust_env=False,
                verify=self.ssl_context,
                headers=headers,
            ) as client:
                for redirect_count in range(self.policy.max_redirects + 1):
                    current = await self._validated_url(current)
                    if current in visited:
                        raise FetchError("Redirect loop detected")
                    visited.add(current)
                    try:
                        async with client.stream("GET", current) as response:
                            if response.status_code in REDIRECT_CODES:
                                location = response.headers.get("location", "")
                                if not location:
                                    raise FetchError("Redirect response omitted its destination")
                                if redirect_count >= self.policy.max_redirects:
                                    raise FetchError("Redirect limit exceeded")
                                # The next loop validates DNS/IP and scheme before following it.
                                current = urljoin(current, location)
                                continue
                            if response.status_code < 200 or response.status_code >= 300:
                                raise FetchError(f"Public source returned HTTP {response.status_code}")
                            content_length = response.headers.get("content-length")
                            if content_length and not allow_truncate:
                                try:
                                    if int(content_length) > byte_limit:
                                        raise FetchError("Public source exceeds the governed response-size limit")
                                except ValueError:
                                    pass
                            chunks: list[bytes] = []
                            total = 0
                            truncated = False
                            async for chunk in response.aiter_bytes():
                                if not chunk:
                                    continue
                                room = byte_limit - total
                                if len(chunk) > room:
                                    if not allow_truncate:
                                        raise FetchError("Public source exceeds the governed response-size limit")
                                    chunks.append(chunk[: max(room, 0)])
                                    total = byte_limit
                                    truncated = True
                                    break
                                chunks.append(chunk)
                                total += len(chunk)
                                if allow_truncate and total >= byte_limit:
                                    truncated = True
                                    break
                            return FetchResult(
                                requested_url=requested_url,
                                final_url=current,
                                status_code=response.status_code,
                                headers={key.lower(): value for key, value in response.headers.items()},
                                body=b"".join(chunks),
                                truncated=truncated,
                            )
                    except httpx.TimeoutException as exc:
                        raise FetchError("Public source request timed out") from exc
                    except httpx.HTTPError as exc:
                        raise FetchError("Public source request failed") from exc
        raise FetchError("Public source request could not complete")

    async def _discover_bing(self, topic: str, limit: int) -> list[dict[str, Any]]:
        url = "https://www.bing.com/search?" + urlencode({"q": topic, "format": "rss"})
        result = await self._safe_fetch(
            url,
            max_bytes=self.policy.max_discovery_bytes,
            accept="application/rss+xml,application/xml,text/xml;q=0.9",
        )
        try:
            root = ElementTree.fromstring(result.text())
        except ElementTree.ParseError as exc:
            raise ExtractionUnavailable("Bing RSS returned malformed XML") from exc
        sources: list[dict[str, Any]] = []
        for item in root.iter():
            if item.tag.rsplit("}", 1)[-1].lower() != "item":
                continue
            fields: dict[str, str] = {}
            for child in item:
                fields[child.tag.rsplit("}", 1)[-1].lower()] = "".join(child.itertext()).strip()
            link = fields.get("link", "").strip()
            if not link:
                continue
            sources.append(
                {
                    "url": link,
                    "title": _clean_text(fields.get("title", ""), 300) or link,
                    "description": _strip_html_fragment(fields.get("description", ""), 500),
                    "type": "web",
                    "provider": "bing-rss",
                    "selected": True,
                }
            )
            if len(sources) >= limit:
                break
        return sources

    async def _discover_wikipedia(self, topic: str, limit: int) -> list[dict[str, Any]]:
        url = "https://en.wikipedia.org/w/api.php?" + urlencode(
            {
                "action": "query",
                "format": "json",
                "list": "search",
                "srsearch": topic,
                "srlimit": limit,
                "utf8": 1,
            }
        )
        result = await self._safe_fetch(
            url,
            max_bytes=self.policy.max_discovery_bytes,
            accept="application/json",
        )
        try:
            data = json.loads(result.text())
        except json.JSONDecodeError as exc:
            raise ExtractionUnavailable("Wikipedia returned malformed JSON") from exc
        entries = data.get("query", {}).get("search", []) if isinstance(data, dict) else []
        sources: list[dict[str, Any]] = []
        for entry in entries if isinstance(entries, list) else []:
            if not isinstance(entry, dict):
                continue
            title = _clean_text(str(entry.get("title", "")), 300)
            if not title:
                continue
            slug = quote(title.replace(" ", "_"), safe="()_-~")
            sources.append(
                {
                    "url": f"https://en.wikipedia.org/wiki/{slug}",
                    "title": title,
                    "description": _strip_html_fragment(str(entry.get("snippet", "")), 500),
                    "type": "web",
                    "provider": "wikipedia",
                    "selected": True,
                }
            )
            if len(sources) >= limit:
                break
        return sources

    async def _discover_youtube(self, topic: str, limit: int) -> list[dict[str, Any]]:
        url = "https://www.youtube.com/results?" + urlencode({"search_query": topic})
        result = await self._safe_fetch(
            url,
            max_bytes=self.policy.max_discovery_bytes,
            accept="text/html,application/xhtml+xml",
        )
        return _parse_youtube_search_html(result.text(), limit)

    def _remember_candidates(self, sources: Sequence[dict[str, Any]]) -> None:
        now = time.time()
        for source in sources:
            url = str(source.get("url", ""))
            if url:
                self._candidate_metadata[_sha256_text(url)] = (now, copy.deepcopy(source))
        if len(self._candidate_metadata) > self.policy.cache_entries * 2:
            ordered = sorted(self._candidate_metadata.items(), key=lambda item: item[1][0], reverse=True)
            self._candidate_metadata = dict(ordered[: self.policy.cache_entries])

    def _known_candidate(self, url: str) -> dict[str, Any] | None:
        item = self._candidate_metadata.get(_sha256_text(url))
        if not item or time.time() - item[0] > self.policy.discovery_cache_ttl_seconds:
            return None
        return copy.deepcopy(item[1])

    async def discover(self, topic: str, limit: int | None = None) -> dict[str, Any]:
        self._ensure_enabled()
        normalised_topic = _normalise_topic(topic, self.policy.max_topic_chars)
        result_limit = min(limit or self.policy.max_sources, self.policy.max_sources)
        topic_hash = _sha256_text(normalised_topic.casefold())
        cache_key = _sha256_text(f"{topic_hash}:{result_limit}:bing+wikipedia+youtube:v2")
        cached = self.cache.get("discover", cache_key, self.policy.discovery_cache_ttl_seconds)
        if isinstance(cached, dict):
            cached["cached"] = True
            self._remember_candidates(cached.get("sources", []))
            await self._append_receipt(
                {
                    "event": "sovereign_research_discovery",
                    "topic_sha256": topic_hash,
                    "source_count": len(cached.get("sources", [])),
                    "source_url_sha256": [_sha256_text(str(item.get("url", ""))) for item in cached.get("sources", [])],
                    "cache_hit": True,
                    "network_used": False,
                }
            )
            return cached

        provider_results = await asyncio.gather(
            self._discover_bing(normalised_topic, result_limit),
            self._discover_wikipedia(normalised_topic, result_limit),
            self._discover_youtube(normalised_topic, result_limit),
            return_exceptions=True,
        )
        lists: list[list[dict[str, Any]]] = []
        provider_errors: list[str] = []
        provider_names = ("bing-rss", "wikipedia", "youtube-public-search")
        for provider, value in zip(provider_names, provider_results):
            if isinstance(value, BaseException):
                provider_errors.append(provider)
                lists.append([])
            else:
                lists.append(value)

        # Round-robin keeps web and video representation deterministic.
        sources: list[dict[str, Any]] = []
        seen: set[str] = set()
        for index in range(result_limit):
            for provider_sources in lists:
                if index >= len(provider_sources):
                    continue
                source = provider_sources[index]
                key = str(source.get("url", "")).strip()
                if not key or key in seen:
                    continue
                seen.add(key)
                sources.append(source)
                if len(sources) >= result_limit:
                    break
            if len(sources) >= result_limit:
                break
        youtube_count = sum(item.get("type") == "youtube" for item in sources)
        response = {
            "sources": sources,
            "stats": {
                "total": len(sources),
                "youtube": youtube_count,
                "web": len(sources) - youtube_count,
            },
            "providers": provider_names,
            "providerErrors": provider_errors,
            "cached": False,
        }
        self.cache.set("discover", cache_key, response)
        self._remember_candidates(sources)
        await self._append_receipt(
            {
                "event": "sovereign_research_discovery",
                "topic_sha256": topic_hash,
                "source_count": len(sources),
                "source_url_sha256": [_sha256_text(str(item["url"])) for item in sources],
                "providers_failed": provider_errors,
                "cache_hit": False,
                "network_used": True,
            }
        )
        return response

    async def _verify_one(self, url: str) -> dict[str, Any]:
        try:
            result = await self._safe_fetch(
                url,
                max_bytes=self.policy.max_verify_bytes,
                allow_truncate=True,
            )
            return {
                "url": url,
                "finalUrl": result.final_url,
                "verified": True,
                "status": "ready",
                "statusCode": result.status_code,
                "contentType": result.headers.get("content-type", "").split(";", 1)[0],
            }
        except ResearchError as exc:
            return {
                "url": url,
                "verified": False,
                "status": "error",
                "error": str(exc),
            }

    async def verify(self, urls: Sequence[str]) -> dict[str, Any]:
        self._ensure_enabled()
        if not urls or len(urls) > self.policy.max_urls:
            raise ValueError(f"urls must contain between 1 and {self.policy.max_urls} entries")
        results = await asyncio.gather(*(self._verify_one(url.strip()) for url in urls))
        verified = sum(item["verified"] is True for item in results)
        await self._append_receipt(
            {
                "event": "sovereign_research_verification",
                "url_sha256": [_sha256_text(url.strip()) for url in urls],
                "verified_count": verified,
                "failed_count": len(results) - verified,
                "network_used": True,
            }
        )
        for result in results:
            result["accessible"] = result["verified"]
            if "error" in result:
                result["reason"] = result["error"]
        unavailable = len(results) - verified
        return {
            "results": results,
            "verified": verified,
            "failed": unavailable,
            "stats": {"total": len(results), "accessible": verified, "unavailable": unavailable},
        }

    @staticmethod
    def _caption_tracks(player: dict[str, Any]) -> list[dict[str, Any]]:
        for node in _walk_json(player):
            if isinstance(node, dict) and isinstance(node.get("captionTracks"), list):
                return [item for item in node["captionTracks"] if isinstance(item, dict)]
        return []

    @staticmethod
    def _select_caption_track(tracks: Sequence[dict[str, Any]], language: str) -> dict[str, Any] | None:
        if not tracks:
            return None
        requested = language.casefold().split("-", 1)[0]

        def rank(track: dict[str, Any]) -> tuple[int, int]:
            code = str(track.get("languageCode", "")).casefold()
            manual = 0 if track.get("kind") != "asr" else 1
            if code == language.casefold():
                language_rank = 0
            elif code.split("-", 1)[0] == requested:
                language_rank = 1
            elif code.startswith("en"):
                language_rank = 2
            else:
                language_rank = 3
            return language_rank, manual

        return min(tracks, key=rank)

    async def _extract_youtube(self, url: str, language: str) -> tuple[str, str, str, str, bool]:
        video_id = _youtube_video_id(url)
        if not video_id:
            raise ExtractionUnavailable("YouTube URL does not contain a public video ID")
        watch_url = f"https://www.youtube.com/watch?v={video_id}"
        result = await self._safe_fetch(watch_url, max_bytes=self.policy.max_response_bytes)
        document = result.text()
        player = (
            _extract_json_object_after_marker(document, "ytInitialPlayerResponse =")
            or _extract_json_object_after_marker(document, "var ytInitialPlayerResponse =")
            or _extract_json_object_after_marker(document, '"ytInitialPlayerResponse":')
        )
        if not player:
            raise ExtractionUnavailable("YouTube did not expose public player metadata")
        details = player.get("videoDetails") if isinstance(player.get("videoDetails"), dict) else {}
        title = _clean_text(str(details.get("title", "")), 300) or "YouTube video"
        full_description = _clean_text(str(details.get("shortDescription", "")), 10_000)
        description = full_description[:500]
        track = self._select_caption_track(self._caption_tracks(player), language)
        if track and isinstance(track.get("baseUrl"), str):
            try:
                captions = await self._safe_fetch(
                    track["baseUrl"],
                    max_bytes=self.policy.max_response_bytes,
                    accept="application/json,application/xml,text/xml,text/vtt,text/plain",
                )
                content = _parse_caption_payload(captions.text(), self.policy.max_content_chars)
                return title, description, content, result.final_url, True
            except ResearchError:
                # Public caption URLs can expire or be withheld by the video owner.
                # Keep honest, cited metadata rather than pretending a transcript exists.
                pass
        metadata = _clean_text(
            f"{title}\n\n{full_description}\n\n"
            "Open Nova note: no usable public caption track was available; this source contains video metadata only.",
            self.policy.max_content_chars,
        )
        return title, description, metadata, result.final_url, False

    async def _extract_webpage(self, url: str) -> tuple[str, str, str, str]:
        result = await self._safe_fetch(url, max_bytes=self.policy.max_response_bytes)
        content_type = result.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        document = result.text()
        if content_type in {"text/html", "application/xhtml+xml", ""} or document.lstrip().startswith("<"):
            title, description, content = _extract_html_document(document, self.policy.max_content_chars)
        elif content_type.startswith("text/"):
            title, description = "", ""
            content = _clean_text(document, self.policy.max_content_chars)
            if not content:
                raise ExtractionUnavailable("The text source was empty")
        else:
            raise ExtractionUnavailable("Source is not a supported public text or HTML page")
        return title, description, content, result.final_url

    async def _extract_wikipedia(self, url: str) -> tuple[str, str, str, str]:
        parsed = urlsplit(url)
        host = (parsed.hostname or "").lower()
        if not (host == "wikipedia.org" or host.endswith(".wikipedia.org")):
            raise ExtractionUnavailable("URL is not a Wikipedia article")
        marker = "/wiki/"
        if marker not in parsed.path:
            raise ExtractionUnavailable("Wikipedia URL does not identify an article")
        page_title = unquote(parsed.path.split(marker, 1)[1]).replace("_", " ").strip()
        if not page_title:
            raise ExtractionUnavailable("Wikipedia article title is missing")
        api_url = f"https://{host}/w/api.php?" + urlencode(
            {
                "action": "query",
                "format": "json",
                "prop": "extracts|info",
                "explaintext": 1,
                "exintro": 1,
                "inprop": "url",
                "redirects": 1,
                "titles": page_title,
            }
        )
        result = await self._safe_fetch(
            api_url,
            max_bytes=self.policy.max_response_bytes,
            accept="application/json",
        )
        try:
            data = json.loads(result.text())
            pages = data.get("query", {}).get("pages", {})
            page = next(iter(pages.values())) if isinstance(pages, dict) and pages else {}
        except (json.JSONDecodeError, AttributeError, StopIteration) as exc:
            raise ExtractionUnavailable("Wikipedia returned malformed article data") from exc
        if not isinstance(page, dict) or page.get("missing") is not None:
            raise ExtractionUnavailable("Wikipedia article was not found")
        title = _clean_text(str(page.get("title", page_title)), 300)
        content = _clean_text(str(page.get("extract", "")), self.policy.max_content_chars)
        if not content:
            raise ExtractionUnavailable("Wikipedia article did not expose readable text")
        canonical = str(page.get("canonicalurl") or page.get("fullurl") or url)
        return title, content[:500], content, canonical

    def _candidate_for_url(self, url: str) -> dict[str, Any]:
        known = self._known_candidate(url)
        if known:
            return known
        youtube = _youtube_video_id(url) is not None
        parsed = urlsplit(url)
        return {
            "url": url,
            "title": (parsed.hostname or url)[:300],
            "description": "",
            "type": "youtube" if youtube else "web",
            "provider": "youtube-public" if youtube else "user-url",
            "selected": True,
        }

    async def _process_candidate(self, candidate: dict[str, Any], language: str) -> dict[str, Any]:
        original_url = str(candidate.get("url", "")).strip()
        source_id = "research-" + _sha256_text(original_url)[:24]
        provider = str(candidate.get("provider", "public-web"))[:80]
        cached = self.cache.get(
            "extract", _sha256_text(original_url), self.policy.extraction_cache_ttl_seconds
        )
        if isinstance(cached, dict) and cached.get("status") == "ready":
            cached["url"] = original_url
            cached["id"] = source_id
            cached["cached"] = True
            return cached
        try:
            if candidate.get("type") == "youtube" or _youtube_video_id(original_url):
                title, description, content, final_url, transcript_available = await self._extract_youtube(
                    original_url, language
                )
                extraction_provider = (
                    "youtube-public-captions" if transcript_available else "youtube-public-metadata"
                )
            else:
                source_host = (urlsplit(original_url).hostname or "").lower()
                if source_host == "wikipedia.org" or source_host.endswith(".wikipedia.org"):
                    title, description, content, final_url = await self._extract_wikipedia(original_url)
                    extraction_provider = "wikipedia-public-api"
                else:
                    title, description, content, final_url = await self._extract_webpage(original_url)
                    extraction_provider = "public-webpage"
                transcript_available = None
            title = title or str(candidate.get("title", "")) or original_url
            description = description or str(candidate.get("description", ""))
            content_hash = _sha256_text(content)
            source = {
                "id": source_id,
                "type": "search",
                "title": _clean_text(title, 300),
                "url": original_url,
                "canonicalUrl": final_url,
                "provider": provider,
                "extractionProvider": extraction_provider,
                "retrievedAt": _utc_now(),
                "contentHash": content_hash,
                "verified": True,
                "content": content,
                "status": "ready",
                "description": _clean_text(description, 500),
                "cached": False,
            }
            if transcript_available is not None:
                source["transcriptAvailable"] = transcript_available
            self.cache.set("extract", _sha256_text(original_url), source)
            return source
        except ResearchError as exc:
            return {
                "id": source_id,
                "type": "search",
                "title": _clean_text(str(candidate.get("title", "")), 300) or original_url,
                "url": original_url,
                "provider": provider,
                "verified": False,
                "status": "error",
                "error": str(exc),
            }

    def _update_job(self, job_id: str, **changes: Any) -> None:
        with self._jobs_lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            for key, value in changes.items():
                setattr(job, key, value)
            job.updated_at = _utc_now()

    def _prune_jobs(self) -> None:
        cutoff = time.time() - self.policy.job_ttl_seconds
        with self._jobs_lock:
            removable: list[tuple[str, float]] = []
            for job_id, job in self._jobs.items():
                if job.status not in {"queued", "discovering", "extracting"}:
                    try:
                        timestamp = datetime.fromisoformat(job.updated_at).timestamp()
                    except ValueError:
                        timestamp = 0.0
                    if timestamp < cutoff:
                        removable.append((job_id, timestamp))
            for job_id, _timestamp in removable:
                self._jobs.pop(job_id, None)
            if len(self._jobs) > self.policy.max_jobs:
                completed = sorted(
                    (
                        (job_id, job.created_at)
                        for job_id, job in self._jobs.items()
                        if job.status not in {"queued", "discovering", "extracting"}
                    ),
                    key=lambda item: item[1],
                )
                for job_id, _created in completed[: len(self._jobs) - self.policy.max_jobs]:
                    self._jobs.pop(job_id, None)

    async def start_job(self, topic: str, config: Mapping[str, Any], urls: Sequence[str]) -> str:
        self._ensure_enabled()
        normalised_topic = _normalise_topic(topic, self.policy.max_topic_chars)
        if len(urls) > self.policy.max_urls:
            raise ValueError(f"urls exceeds the governed {self.policy.max_urls}-URL limit")
        config_size = len(json.dumps(dict(config), ensure_ascii=False, sort_keys=True).encode("utf-8"))
        if config_size > MAX_CONFIG_BYTES_HARD:
            raise ValueError("config exceeds the governed size limit")
        self._prune_jobs()
        with self._jobs_lock:
            active = sum(job.status in {"queued", "discovering", "extracting"} for job in self._jobs.values())
            if active >= self.policy.max_jobs:
                raise ResearchError("the local research job queue is full")
            job_id = str(uuid.uuid4())
            topic_hash = _sha256_text(normalised_topic.casefold())
            self._jobs[job_id] = JobRecord(job_id=job_id, topic_hash=topic_hash)
        await self._append_receipt(
            {
                "event": "sovereign_research_job_accepted",
                "job_id": job_id,
                "topic_sha256": topic_hash,
                "url_sha256": [_sha256_text(url.strip()) for url in urls],
                "network_used": False,
            }
        )
        task = asyncio.create_task(
            self._run_job(job_id, normalised_topic, copy.deepcopy(dict(config)), [url.strip() for url in urls])
        )
        self._job_tasks.add(task)
        task.add_done_callback(self._job_tasks.discard)
        return job_id

    async def _run_job(
        self, job_id: str, topic: str, config: Mapping[str, Any], urls: Sequence[str]
    ) -> None:
        async with self._job_slots:
            try:
                if urls:
                    candidates = [self._candidate_for_url(url) for url in urls]
                    self._update_job(
                        job_id,
                        status="extracting",
                        progress=25,
                        status_message=f"Extracting {len(candidates)} selected public sources",
                    )
                else:
                    self._update_job(
                        job_id,
                        status="discovering",
                        progress=10,
                        status_message="Discovering credential-free public sources",
                    )
                    discovered = await self.discover(topic)
                    candidates = list(discovered.get("sources", []))[: self.policy.max_sources]
                    self._update_job(
                        job_id,
                        status="extracting",
                        progress=25,
                        status_message=f"Extracting {len(candidates)} public sources",
                    )
                if not candidates:
                    raise ExtractionUnavailable("No public sources were available for extraction")

                language = str(config.get("bookLanguage") or config.get("language") or "en")[:16]
                completed = 0
                progress_lock = asyncio.Lock()

                async def process(candidate: dict[str, Any]) -> dict[str, Any]:
                    nonlocal completed
                    source = await self._process_candidate(candidate, language)
                    async with progress_lock:
                        completed += 1
                        progress = 25 + int(65 * completed / max(len(candidates), 1))
                        self._update_job(
                            job_id,
                            progress=progress,
                            status_message=f"Extracted {completed} of {len(candidates)} public sources",
                        )
                    return source

                processed = await asyncio.gather(*(process(candidate) for candidate in candidates))
                ready = sum(item.get("status") == "ready" for item in processed)
                if ready == len(processed):
                    status, message, error = "complete", "Sovereign research complete", None
                elif ready:
                    status, message, error = (
                        "partial_complete",
                        f"Research complete with {ready} of {len(processed)} sources ready",
                        None,
                    )
                else:
                    message = "No selected source yielded usable public text"
                    status, error = "failed", message
                self._update_job(
                    job_id,
                    status=status,
                    progress=100,
                    status_message=message,
                    error=error,
                    processed_sources=processed,
                )
                await self._append_receipt(
                    {
                        "event": "sovereign_research_job_completed",
                        "job_id": job_id,
                        "topic_sha256": _sha256_text(topic.casefold()),
                        "status": status,
                        "source_url_sha256": [_sha256_text(str(item.get("url", ""))) for item in processed],
                        "content_sha256": [
                            str(item["contentHash"]) for item in processed if item.get("contentHash")
                        ],
                        "ready_count": ready,
                        "failed_count": len(processed) - ready,
                        "network_used": True,
                    }
                )
            except Exception as exc:
                message = str(exc) if isinstance(exc, ResearchError) else "Local research job failed"
                self._update_job(
                    job_id,
                    status="failed",
                    progress=100,
                    status_message="Sovereign research failed",
                    error=message,
                )
                await self._append_receipt(
                    {
                        "event": "sovereign_research_job_failed",
                        "job_id": job_id,
                        "topic_sha256": _sha256_text(topic.casefold()),
                        "error_sha256": _sha256_text(message),
                        "network_used": True,
                    }
                )

    def get_job(self, job_id: str, include_results: bool = False) -> dict[str, Any] | None:
        self._prune_jobs()
        with self._jobs_lock:
            job = self._jobs.get(job_id)
            return job.public(include_results) if job else None

    def health(self) -> dict[str, Any]:
        return {
            "service": SERVICE_NAME,
            "version": SERVICE_VERSION,
            "status": "ready" if self.policy.enabled else "disabled",
            "mode": "sovereign-local",
            "enabled": self.policy.enabled,
            "providers": ["bing-rss", "wikipedia", "youtube-public-search", "youtube-public-captions"],
            "credentialsRequired": False,
            "creditsRequired": False,
            "externalAiUsed": False,
            "loopbackOnly": True,
            "allowedOrigins": list(self.policy.allowed_origins),
            "policyLoaded": self.policy.policy_loaded,
            "policyPath": self.policy.policy_path,
            "limits": {
                "maxSources": self.policy.max_sources,
                "maxUrls": self.policy.max_urls,
                "maxContentChars": self.policy.max_content_chars,
                "maxRedirects": self.policy.max_redirects,
                "maxConcurrency": self.policy.max_network_concurrency,
            },
        }


router = APIRouter(prefix="/v1/research", tags=["sovereign-research"])


def _request_service(request: Request) -> ResearchService:
    service = getattr(request.app.state, "open_nova_research_service", None)
    if not isinstance(service, ResearchService):
        raise HTTPException(status_code=503, detail="Sovereign research service is not installed")
    return service


def _loopback_guard(request: Request) -> None:
    peer = request.client.host if request.client else ""
    try:
        if not ipaddress.ip_address(peer).is_loopback:
            raise ValueError
    except ValueError as exc:
        raise HTTPException(status_code=403, detail="Research API accepts loopback clients only") from exc

    host_header = request.headers.get("host", "")
    try:
        host = urlsplit("//" + host_header).hostname or ""
        host_ip: ipaddress.IPv4Address | ipaddress.IPv6Address | None
        try:
            host_ip = ipaddress.ip_address(host)
        except ValueError:
            host_ip = None
        host_allowed = host.casefold() == "localhost" or bool(host_ip and host_ip.is_loopback)
    except ValueError:
        host_allowed = False
    if not host_allowed:
        raise HTTPException(status_code=403, detail="Research API Host must be localhost or a loopback IP")

    origin = request.headers.get("origin")
    service = _request_service(request)
    if origin is not None and origin not in service.policy.allowed_origins:
        raise HTTPException(status_code=403, detail="Browser origin is not allowed")


@router.get("/health", dependencies=[Depends(_loopback_guard)])
async def research_health(request: Request) -> dict[str, Any]:
    return _request_service(request).health()


@router.post("/discover", dependencies=[Depends(_loopback_guard)])
async def research_discover(request: Request, body: DiscoverRequest) -> dict[str, Any]:
    service = _request_service(request)
    try:
        return await service.discover(body.topic, body.limit)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ResearchError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/verify", dependencies=[Depends(_loopback_guard)])
async def research_verify(request: Request, body: VerifyRequest) -> dict[str, Any]:
    service = _request_service(request)
    try:
        return await service.verify(body.urls)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ResearchError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/jobs", status_code=202, dependencies=[Depends(_loopback_guard)])
async def research_start_job(request: Request, body: JobRequest) -> dict[str, Any]:
    service = _request_service(request)
    try:
        job_id = await service.start_job(body.topic, body.config, body.urls)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ResearchError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"jobId": job_id, "status": "queued"}


@router.get("/jobs/{job_id}", dependencies=[Depends(_loopback_guard)])
async def research_job_status(
    request: Request,
    job_id: str,
    include_results: bool = Query(default=False),
) -> dict[str, Any]:
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", job_id):
        raise HTTPException(status_code=404, detail="Research job not found")
    job = _request_service(request).get_job(job_id, include_results=include_results)
    if job is None:
        raise HTTPException(status_code=404, detail="Research job not found")
    return job


def install_research_service(
    app: FastAPI,
    receipt_writer: ReceiptWriter | None = None,
    *,
    policy_path: str | os.PathLike[str] | None = None,
    runtime_root: str | os.PathLike[str] | None = None,
) -> ResearchService:
    """Install the sovereign router once without starting or replacing any service."""

    existing = getattr(app.state, "open_nova_research_service", None)
    if isinstance(existing, ResearchService):
        if receipt_writer is not None:
            existing.receipt_writer = receipt_writer
        return existing

    policy = ResearchPolicy.load(policy_path)
    service = ResearchService(
        policy=policy,
        runtime_root=runtime_root if runtime_root is not None else RUNTIME_ROOT_DEFAULT,
        receipt_writer=receipt_writer,
    )
    app.state.open_nova_research_service = service
    app.include_router(router)
    if not getattr(app.state, "open_nova_research_cors_installed", False):
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(policy.allowed_origins),
            allow_credentials=False,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["Content-Type"],
            max_age=600,
        )
        app.state.open_nova_research_cors_installed = True
    return service


__all__ = [
    "EPUBLISHER_ORIGIN",
    "EPUBLISHER_LOOPBACK_ORIGIN",
    "FetchError",
    "ResearchError",
    "ResearchPolicy",
    "ResearchSecurityError",
    "ResearchService",
    "install_research_service",
    "router",
]
