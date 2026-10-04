from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import base64, gc, hashlib, io, json, os, random, threading, time

import torch
from PIL import Image, ImageDraw, ImageFilter
from diffusers import AutoPipelineForText2Image, EulerDiscreteScheduler, StableDiffusionXLPipeline
from safetensors.torch import load_file

BIND = "127.0.0.1"
PORT = int(os.getenv("RONS_EPUBLISHER_IMAGE_PORT", "7865"))
ROOT = Path(os.getenv("RONS_EPUBLISHER_MODELS_ROOT", r"C:\Users\Ashley\Resonance\OpenNova\runtime\models"))
FAST_MODEL = os.getenv("RONS_EPUBLISHER_FAST_MODEL", "stabilityai/sd-turbo")
FAST_DIR = Path(os.getenv("RONS_EPUBLISHER_FAST_MODEL_DIR", str(ROOT / "sd-turbo")))
PREMIUM_BASE = Path(os.getenv("RONS_EPUBLISHER_PREMIUM_BASE", str(ROOT / "sdxl-base" / "sd_xl_base_1.0.safetensors")))
PREMIUM_UNET = Path(os.getenv("RONS_EPUBLISHER_PREMIUM_UNET", str(ROOT / "sdxl-lightning" / "sdxl_lightning_4step_unet.safetensors")))
PREMIUM_LORA = Path(os.getenv("RONS_EPUBLISHER_PREMIUM_LORA", str(ROOT / "sdxl-lightning" / "sdxl_lightning_4step_lora.safetensors")))
MAX_ACTIVE_GENERATIONS = max(1, int(os.getenv("RONS_IMAGE_MAX_ACTIVE", "1")))
IDLE_UNLOAD_SECONDS = max(0, int(os.getenv("RONS_IMAGE_IDLE_UNLOAD_SECONDS", "90")))

_lock = threading.Lock()
_generation_gate = threading.BoundedSemaphore(MAX_ACTIVE_GENERATIONS)
_fast_pipe = None
_premium_pipe = None
_fast_error = None
_premium_error = None
_premium_mode = None
_idle_timer = None

ALLOWED_ORIGINS = {
    "http://127.0.0.1:3101", "http://localhost:3101",
    "http://127.0.0.1:3201", "http://localhost:3201",
    "http://127.0.0.1:4173", "http://localhost:4173",
    "http://127.0.0.1:4273", "http://localhost:4273",
}

def fast_complete():
    return (FAST_DIR / "model_index.json").is_file() and (FAST_DIR / "unet").is_dir()

def lora_fallback_complete():
    return (
        PREMIUM_BASE.is_file()
        and PREMIUM_BASE.stat().st_size > 5_000_000_000
        and PREMIUM_LORA.is_file()
        and PREMIUM_LORA.stat().st_size > 250_000_000
    )

def premium_mode():
    if PREMIUM_UNET.is_file() and PREMIUM_UNET.stat().st_size > 4_800_000_000:
        return "unet-checkpoint"
    if lora_fallback_complete():
        return "lora-fallback"
    return None

def premium_complete():
    return premium_mode() is not None

def _cancel_idle_unload():
    global _idle_timer
    with _lock:
        timer = _idle_timer
        _idle_timer = None
        if timer is not None:
            timer.cancel()

def _unload_pipelines():
    global _fast_pipe, _premium_pipe, _premium_mode, _idle_timer
    with _lock:
        _fast_pipe = None
        _premium_pipe = None
        _premium_mode = None
        _idle_timer = None
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        try:
            torch.cuda.ipc_collect()
        except Exception:
            pass

def _schedule_idle_unload():
    global _idle_timer
    if IDLE_UNLOAD_SECONDS <= 0:
        return
    with _lock:
        if _idle_timer is not None:
            _idle_timer.cancel()
        timer = threading.Timer(IDLE_UNLOAD_SECONDS, _unload_pipelines)
        timer.daemon = True
        _idle_timer = timer
        timer.start()

def dims(orientation, quality, aspect_ratio=""):
    if quality == "fast":
        exact = {"1:1": (512, 512), "4:5": (512, 640), "9:16": (432, 768), "16:9": (768, 432)}
        if aspect_ratio in exact:
            return exact[aspect_ratio]
        if orientation == "portrait":
            return (512, 768)
        if orientation == "square":
            return (512, 512)
        return (768, 512)

    exact = {"1:1": (1024, 1024), "4:5": (832, 1040), "9:16": (576, 1024), "16:9": (1024, 576)}
    if aspect_ratio in exact:
        return exact[aspect_ratio]
    if orientation == "portrait":
        return (768, 1024)
    if orientation == "square":
        return (1024, 1024)
    return (1024, 576)

def get_fast_pipe():
    global _fast_pipe, _fast_error
    if _fast_pipe is not None:
        return _fast_pipe
    if not fast_complete():
        return None
    with _lock:
        if _fast_pipe is None:
            try:
                _fast_pipe = AutoPipelineForText2Image.from_pretrained(
                    str(FAST_DIR), torch_dtype=torch.float16, local_files_only=True, variant="fp16"
                ).to("cuda")
                _fast_pipe.set_progress_bar_config(disable=True)
            except Exception as exc:
                _fast_error = str(exc)
                return None
    return _fast_pipe

def _load_unet_checkpoint_pipe():
    pipe = StableDiffusionXLPipeline.from_single_file(
        str(PREMIUM_BASE),
        torch_dtype=torch.float16,
        use_safetensors=True,
    )
    state_dict = load_file(str(PREMIUM_UNET), device="cpu")
    pipe.unet.load_state_dict(state_dict)
    del state_dict
    gc.collect()
    return pipe

def _load_lora_fallback_pipe():
    pipe = StableDiffusionXLPipeline.from_single_file(
        str(PREMIUM_BASE),
        torch_dtype=torch.float16,
        use_safetensors=True,
    )
    pipe.load_lora_weights(
        str(PREMIUM_LORA.parent),
        weight_name=PREMIUM_LORA.name,
        adapter_name="lightning",
    )
    pipe.fuse_lora(lora_scale=1.0)
    return pipe

def get_premium_pipe():
    global _premium_pipe, _premium_error, _premium_mode

    if _premium_pipe is not None:
        return _premium_pipe
    mode = premium_mode()
    if mode is None:
        return None
    with _lock:
        if _premium_pipe is None:
            selected_mode = mode
            preferred_error = None
            try:
                if mode == "unet-checkpoint":
                    try:
                        pipe = _load_unet_checkpoint_pipe()
                    except Exception as exc:
                        preferred_error = str(exc)
                        if not lora_fallback_complete():
                            raise
                        pipe = _load_lora_fallback_pipe()
                        selected_mode = "lora-fallback"
                else:
                    pipe = _load_lora_fallback_pipe()
                pipe.scheduler = EulerDiscreteScheduler.from_config(
                    pipe.scheduler.config, timestep_spacing="trailing"
                )
                pipe.enable_vae_slicing()
                pipe.enable_vae_tiling()
                pipe.enable_model_cpu_offload()
                pipe.set_progress_bar_config(disable=True)
                _premium_pipe = pipe
                _premium_mode = selected_mode
                _premium_error = (
                    f"unet_checkpoint_load_failed; using_lora_fallback: {preferred_error}"
                    if preferred_error
                    else None
                )
            except Exception as exc:
                if preferred_error and str(exc) != preferred_error:
                    _premium_error = (
                        f"unet_checkpoint_load_failed: {preferred_error}; "
                        f"lora_fallback_load_failed: {exc}"
                    )
                else:
                    _premium_error = str(exc)
                _premium_mode = None
                return None
    return _premium_pipe

def procedural_image(prompt, width, height, seed):

    rng = random.Random(seed)
    digest = hashlib.sha256(prompt.encode("utf-8", "ignore")).digest()
    c1 = tuple(25 + b % 110 for b in digest[:3])
    c2 = tuple(65 + b % 150 for b in digest[3:6])
    img = Image.new("RGB", (width, height), c1)
    px = img.load()
    for y in range(height):
        t = y / max(1, height - 1)
        for x in range(width):
            u = x / max(1, width - 1)
            mix = min(1.0, max(0.0, .62 * t + .38 * u))
            px[x, y] = tuple(int(c1[i] * (1 - mix) + c2[i] * mix) for i in range(3))
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for _ in range(14):
        radius = rng.randint(max(20, min(width, height) // 18), max(45, min(width, height) // 4))
        cx, cy = rng.randint(-radius, width + radius), rng.randint(-radius, height + radius)
        col = tuple(80 + digest[rng.randrange(len(digest))] % 176 for _ in range(3)) + (rng.randint(18, 65),)
        draw.ellipse((cx-radius, cy-radius, cx+radius, cy+radius), fill=col)
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=max(2, min(width, height) // 90)))
    return Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")

def generate_image(body):
    _cancel_idle_unload()
    prompt = str(body.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("prompt required")
    quality = str(body.get("qualityProfile") or body.get("quality_profile") or "premium").strip().lower()
    if quality not in {"fast", "premium", "storyboard_pro"}:
        quality = "premium"
    orientation = str(body.get("orientation") or "landscape").lower()
    aspect_ratio = str(body.get("aspectRatio") or body.get("aspect_ratio") or "").strip()
    width, height = dims(orientation, quality, aspect_ratio)
    seed = int(body.get("seed") or int(time.time() * 1000) % 2_147_483_647)
    negative = str(body.get("negativePrompt") or (
        "low resolution, blurry, jpeg artifacts, distorted anatomy, deformed hands, "
        "extra fingers, duplicate limbs, asymmetrical eyes, random text, watermark, logo, UI overlay"
    ))
    generator = torch.Generator(device="cpu").manual_seed(seed)

    actual_quality = quality
    fallback_reason = None
    pipe = None
    if quality != "fast":
        pipe = get_premium_pipe()
        if pipe is None:
            actual_quality = "fast"
            fallback_reason = _premium_error or "premium_model_not_ready"

    if actual_quality == "fast":
        pipe = get_fast_pipe()
    if pipe is None:
        image = procedural_image(prompt, width, height, seed)
        provider = "rons-local-procedural"
        model = "procedural-v2"
        fallback_reason = fallback_reason or _fast_error or "fast_model_not_ready"
    elif actual_quality == "fast":
        fast_width, fast_height = dims(orientation, "fast", aspect_ratio)
        cuda_generator = torch.Generator(device="cuda").manual_seed(seed)
        with _lock, torch.inference_mode():
            image = pipe(
                prompt=prompt,
                width=fast_width,
                height=fast_height,
                num_inference_steps=1,
                guidance_scale=0.0,
                generator=cuda_generator,
            ).images[0]
        provider = "rons-local-sd-turbo"
        model = FAST_MODEL
        width, height = fast_width, fast_height
    else:
        with _lock, torch.inference_mode():
            image = pipe(
                prompt=prompt,
                negative_prompt=None,
                width=width,
                height=height,
                num_inference_steps=4,
                guidance_scale=0.0,
                generator=generator,
            ).images[0]

        image = image.filter(ImageFilter.UnsharpMask(radius=1.1, percent=115, threshold=3))
        if _premium_mode == "unet-checkpoint":
            provider = "rons-local-sdxl-lightning-unet"
            model = "stabilityai/stable-diffusion-xl-base-1.0 + ByteDance/SDXL-Lightning-4step-UNet"
        else:
            provider = "rons-local-sdxl-lightning"
            model = "stabilityai/stable-diffusion-xl-base-1.0 + ByteDance/SDXL-Lightning-4step-LoRA"

    return image, {
        "provider": provider,
        "model": model,
        "seed": seed,
        "width": width,
        "height": height,
        "requestedQuality": quality,
        "actualQuality": actual_quality if provider != "rons-local-procedural" else "procedural",
        "fallbackReason": fallback_reason,
        "premiumReady": premium_complete(),
    }

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        print("[RONS-IMAGE]", fmt % args, flush=True)

    def cors(self):
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)

    def send_json(self, status, obj, headers=None):

        data = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.cors()
        for key, value in (headers or {}).items():
            self.send_header(key, str(value))
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path in {"/health", "/v1/models"}:
            payload = {
                "ok": True,
                "cuda": torch.cuda.is_available(),
                "fast": {"model": FAST_MODEL, "ready": fast_complete(), "loaded": _fast_pipe is not None, "error": _fast_error},
                "premium": {

                    "model": "SDXL-Lightning 4-step UNet checkpoint (LoRA fallback)",
                    "ready": premium_complete(),
                    "loaded": _premium_pipe is not None,
                    "mode": _premium_mode or premium_mode(),
                    "unet": str(PREMIUM_UNET),
                    "base": str(PREMIUM_BASE),
                    "lora": str(PREMIUM_LORA),
                    "error": _premium_error,
                },
                "maxActive": MAX_ACTIVE_GENERATIONS,
                "idleUnloadSeconds": IDLE_UNLOAD_SECONDS,
            }
            return self.send_json(200, payload)
        return self.send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/v1/images/generate":
            return self.send_json(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length", "0") or 0)
            if n <= 0 or n > 8_000_000:
                return self.send_json(413, {"error": "invalid body"})
            body = json.loads(self.rfile.read(n))
            if not _generation_gate.acquire(blocking=False):
                return self.send_json(
                    503,
                    {"error": "image_service_busy", "retryable": True, "max_active": MAX_ACTIVE_GENERATIONS},
                    {"Retry-After": "2"},
                )

            try:
                image, meta = generate_image(body)
                _schedule_idle_unload()
                buf = io.BytesIO()
                image.save(buf, format="PNG", optimize=True)
                encoded = base64.b64encode(buf.getvalue()).decode("ascii")
                return self.send_json(200, {
                    "ok": True,
                    **meta,
                    "aspectRatio": body.get("aspectRatio") or body.get("aspect_ratio"),
                    "imageUrl": "data:image/png;base64," + encoded,
                })
            finally:
                _generation_gate.release()
        except torch.cuda.OutOfMemoryError:
            torch.cuda.empty_cache()
            gc.collect()
            return self.send_json(507, {"error": "GPU memory exhausted", "retryable": True})
        except ValueError as exc:
            return self.send_json(400, {"error": str(exc)[:500]})
        except Exception as exc:
            return self.send_json(500, {"error": str(exc)[:500]})

class RonsThreadingHTTPServer(ThreadingHTTPServer):
    request_queue_size = int(os.getenv("RONS_IMAGE_LISTEN_BACKLOG", "128"))
    daemon_threads = True

if __name__ == "__main__":
    print(f"RONS premium ePublisher image service http://{BIND}:{PORT}", flush=True)
    print(f"Fast ready={fast_complete()} premium ready={premium_complete()}", flush=True)
    RonsThreadingHTTPServer((BIND, PORT), Handler).serve_forever()
