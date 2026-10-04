import json, os, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = int(os.getenv("RONS_LLM_PORT", "7866"))
OLLAMA = os.getenv("RONS_OLLAMA_URL", "http://127.0.0.1:11434")
MODEL = os.getenv("RONS_LLM_MODEL", "qwen3:8b")
NUM_CTX = max(4096, min(32768, int(os.getenv("RONS_LLM_NUM_CTX", "16384"))))
NUM_PREDICT = max(256, min(8192, int(os.getenv("RONS_LLM_NUM_PREDICT", "4096"))))
ALLOWED_ORIGINS = {"http://127.0.0.1:3101", "http://localhost:3101"}

def ollama_generate(prompt, system=""):
    payload = json.dumps({"model": MODEL, "prompt": prompt, "system": system,
                          "stream": False, "think": False, "keep_alive": 0,
                          "options": {"temperature": 0.35, "num_ctx": NUM_CTX, "num_predict": NUM_PREDICT}}).encode()
    req = urllib.request.Request(f"{OLLAMA}/api/generate", data=payload,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        data = json.loads(r.read().decode("utf-8"))
    return data

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("[RONS-LLM]", fmt % args)

    def cors(self):
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
    def send_json(self, code, obj):
        raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.cors()
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            try:
                with urllib.request.urlopen(f"{OLLAMA}/api/tags", timeout=3) as r:
                    tags = json.loads(r.read().decode("utf-8"))
                names = [m.get("name") for m in tags.get("models", [])]
                self.send_json(200, {"ok": True, "model": MODEL, "model_ready": MODEL in names,
                                     "ollama": True, "models": names, "num_ctx": NUM_CTX, "num_predict": NUM_PREDICT})
            except Exception as e:
                self.send_json(503, {"ok": False, "model": MODEL, "model_ready": False,
                                     "ollama": False, "error": str(e)})
            return
        self.send_json(404, {"error": "not found"})
    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(n) or b"{}")
            if self.path == "/v1/translate":
                if MODEL.endswith(":0.5b"):
                    self.send_json(503, {"error": "Multilingual publishing model not ready. The compact local model is reserved for rewrite tasks.", "model": MODEL, "quality_gate": True})
                    return
                chapters = body.get("chapters") or []
                language = body.get("targetLanguage") or "English"
                locale_hint = {"Afrikaans": "Use authentic South African Afrikaans, never Dutch.", "isiZulu": "Use standard South African isiZulu.", "isiXhosa": "Use standard South African isiXhosa.", "Sesotho": "Use standard Southern Sotho (Sesotho) as used in South Africa."}.get(language, "")
                out = []
                for ch in chapters:
                    src = json.dumps({"title": ch.get("title", ""), "body": ch.get("body", "")}, ensure_ascii=False)
                    prompt = (f"Translate this JSON object's title and body into {language}. {locale_hint} Preserve meaning, names, paragraph breaks, and tone. "
                              "Return only valid JSON with exactly keys title and body.\n" + src)
                    raw = ollama_generate(prompt, "You are a precise literary translator. Output JSON only."); text = str(raw.get('response') or '').strip()
                    try:
                        a, b = text.find("{"), text.rfind("}") + 1
                        item = json.loads(text[a:b])
                    except Exception:
                        item = {"title": ch.get("title", ""), "body": text}
                    out.append({"title": item.get("title", ch.get("title", "")), "body": item.get("body", ch.get("body", ""))})
                self.send_json(200, {"chapters": out, "provider": "rons-local-ollama", "model": MODEL})
                return
            if self.path == "/v1/rewrite":
                text = str(body.get("text") or "")
                instruction = str(body.get("instruction") or "Improve clarity and style while preserving meaning.")
                raw = ollama_generate(f"Instruction: {instruction}\n\nText:\n{text}", "Return only the revised text.")
                result = str(raw.get('response') or '').strip()
                self.send_json(200, {"text": result, "provider": "rons-local-ollama", "model": MODEL, "usage": {"input_tokens": int(raw.get("prompt_eval_count") or 0), "output_tokens": int(raw.get("eval_count") or 0), "cached_input_tokens": 0}})
                return
            self.send_json(404, {"error": "not found"})
        except Exception as e:
            self.send_json(500, {"error": str(e), "model": MODEL})

if __name__ == "__main__":
    print(f"RONS local LLM service: http://{HOST}:{PORT} model={MODEL}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()

