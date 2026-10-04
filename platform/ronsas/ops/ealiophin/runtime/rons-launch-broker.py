from __future__ import annotations
import hashlib, hmac, json, os, secrets, time
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import error, parse, request

BIND = "127.0.0.1"
PORT = int(os.getenv("RONS_LAUNCH_BROKER_PORT", "4450"))
GATEWAY = os.getenv("RESONANCE_SOVEREIGN_GATEWAY_URL", "http://127.0.0.1:58600").rstrip("/")
EXCHANGE_KEY_FILE = Path(os.getenv("RONS_AUTH_EXCHANGE_KEY_FILE", r"C:\Users\Ashley\Resonance\OpenNova\runtime\secrets\auth-exchange-key"))
REGISTRY_FILE = Path(os.getenv("RONSAS_MODULE_REGISTRY", r"C:\Users\Ashley\Resonance\OpenNova\integrations\rons-cluster\RONSAS-MODULES.json"))
COOKIE_NAME = "rons_spoke_session"
CODE_TTL = 60
def load_allowed_apps() -> set[str]:
    data = json.loads(REGISTRY_FILE.read_text(encoding="utf-8-sig"))
    if data.get("schema") != "ronsas-module-registry/v1":
        raise RuntimeError("unsupported RONSAS module registry")
    apps = {str(item.get("entitlementAppId", "")).strip() for item in data.get("modules", [])}
    apps.discard("")
    if not apps:
        raise RuntimeError("RONSAS registry has no entitlement modules")
    return apps

ALLOWED_APPS = load_allowed_apps()
PREPARED: dict[str, dict] = {}


def exchange_key() -> bytes:
    value = EXCHANGE_KEY_FILE.read_bytes().strip()
    if len(value) < 32 or len(value) > 4096:
        raise RuntimeError("invalid exchange key")
    return value


def json_bytes(value: object) -> bytes:
    return json.dumps(value, separators=(",", ":")).encode("utf-8")


def gateway_json(path: str, *, method: str = "GET", body: object | None = None, token: str | None = None) -> tuple[int, dict]:
    headers = {"Accept": "application/json"}
    data = None
    if body is not None:
        data = json_bytes(body)
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = request.Request(f"{GATEWAY}{path}", data=data, headers=headers, method=method)
    try:
        with request.urlopen(req, timeout=8) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw or b"{}")
    except error.HTTPError as exc:
        raw = exc.read()
        try:
            payload = json.loads(raw or b"{}")
        except Exception:
            payload = {"error": "invalid upstream response"}
        return exc.code, payload


def anonymous_entitlement(app_id: str) -> dict:
    now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()
    return {"ok": True, "authenticated": False, "app": app_id, "user_id": "", "userId": "",
            "has_access": False, "hasAccess": False, "tier": "free", "status": "inactive",
            "source": "none", "features": {}, "credits_remaining": 0, "creditsRemaining": 0,
            "pack_tier": None, "packTier": None,
            "current_period_end": None, "currentPeriodEnd": None,
            "expiresAt": None, "checkedAt": now}


def cleanup() -> None:
    now = time.time()
    expired = [code for code, item in PREPARED.items() if item["expires_at"] <= now]
    for code in expired:
        PREPARED.pop(code, None)


class Broker(BaseHTTPRequestHandler):
    server_version = "RONSLaunchBroker/1.0"

    def _send_json(self, status: int, payload: object, headers: dict[str, str] | None = None) -> None:
        body = json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0 or length > 16384:
            raise ValueError("invalid request size")
        value = json.loads(self.rfile.read(length))
        if not isinstance(value, dict):
            raise ValueError("JSON object required")
        return value

    def _cookie(self) -> str | None:
        cookie = SimpleCookie()
        cookie.load(self.headers.get("Cookie", ""))
        item = cookie.get(COOKIE_NAME)
        return item.value if item else None


    def do_GET(self) -> None:
        parsed = parse.urlparse(self.path)
        if parsed.path == "/health":
            cleanup()
            return self._send_json(200, {"ok": True, "service": "rons-launch-broker", "suite": "RONSAS", "registry": str(REGISTRY_FILE), "allowed_apps": sorted(ALLOWED_APPS), "prepared": len(PREPARED)})
        if parsed.path == "/_rons/launch":
            return self._launch(parsed)
        if parsed.path == "/_rons/session":
            return self._session()
        return self._send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        parsed = parse.urlparse(self.path)
        if parsed.path == "/prepare":
            return self._prepare()
        if parsed.path == "/_rons/sign-out":
            secure = "; Secure" if self.headers.get("X-Forwarded-Proto", "").lower() == "https" else ""
            return self._send_json(200, {"ok": True}, {"Set-Cookie": f"{COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0{secure}"})
        return self._send_json(404, {"error": "not found"})

    def _prepare(self) -> None:
        supplied = self.headers.get("X-RONS-Exchange-Key", "").encode()
        try:
            expected = exchange_key()
        except Exception:
            return self._send_json(503, {"error": "broker authorization unavailable"})
        if not supplied or not hmac.compare_digest(supplied, expected):
            return self._send_json(401, {"error": "broker authorization failed"})
        try:
            body = self._read_json()
        except Exception:
            return self._send_json(400, {"error": "invalid request"})
        app_id = str(body.get("app", ""))
        ticket = str(body.get("ticket", ""))
        if app_id not in ALLOWED_APPS or len(ticket) < 32 or len(ticket) > 4096:
            return self._send_json(400, {"error": "invalid launch payload"})
        cleanup()
        code = secrets.token_urlsafe(24)
        PREPARED[code] = {"app": app_id, "ticket": ticket, "expires_at": time.time() + CODE_TTL}
        return self._send_json(200, {"code": code, "expires_in": CODE_TTL})

    def _launch(self, parsed) -> None:
        cleanup()
        code = parse.parse_qs(parsed.query).get("code", [""])[0]
        item = PREPARED.pop(code, None)
        if not item:
            return self._send_json(401, {"error": "invalid or expired launch code"})
        routed_app = self.headers.get("X-RONS-App", "")
        if routed_app != item["app"]:
            return self._send_json(403, {"error": "launch audience mismatch"})
        status, payload = gateway_json(
            "/v1/auth/launch-ticket/redeem",
            method="POST",
            body={"app": item["app"], "ticket": item["ticket"]},
        )
        if status != 200:
            return self._send_json(status, {"error": payload.get("detail", "launch redemption failed")})
        session = payload.get("session") if isinstance(payload, dict) else None
        token = session.get("access_token") if isinstance(session, dict) else None
        if not isinstance(token, str) or len(token) < 16 or len(token) > 4096:
            return self._send_json(502, {"error": "invalid redeemed session"})
        secure = "; Secure" if self.headers.get("X-Forwarded-Proto", "").lower() == "https" else ""
        self.send_response(303)
        self.send_header("Location", "/")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Set-Cookie", f"{COOKIE_NAME}={parse.quote(token, safe='')}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400{secure}")
        self.end_headers()

    def _session(self) -> None:
        app_id = self.headers.get("X-RONS-App", "")
        if app_id not in ALLOWED_APPS:
            return self._send_json(400, {"error": "invalid app route"})
        token = self._cookie()
        if not token:
            return self._send_json(200, anonymous_entitlement(app_id))
        status, user = gateway_json("/v1/auth/user", token=token)
        if status != 200:
            return self._send_json(200, anonymous_entitlement(app_id))
        uid = str((user.get("user") or {}).get("id", ""))
        query = {"table": "subscriptions", "action": "select", "columns": "app,tier,status,current_period_end", "filters": [{"column": "user_id", "op": "eq", "value": uid}], "options": {"limit": 100}}
        sub_status, rows = gateway_json("/v1/db/query", method="POST", body=query)
        if sub_status != 200 or not isinstance(rows, list):
            return self._send_json(503, {"error": "entitlement lookup unavailable"})
        wallet_query = {"table": "credit_wallets", "action": "select", "columns": "balance",
                        "filters": [{"column": "user_id", "op": "eq", "value": uid},
                                    {"column": "app", "op": "eq", "value": app_id}],
                        "options": {"limit": 1}}
        wallet_status, wallet_rows = gateway_json("/v1/db/query", method="POST", body=wallet_query)
        credits_remaining = 0
        if wallet_status == 200 and isinstance(wallet_rows, list) and wallet_rows:
            try:
                credits_remaining = max(0, int((wallet_rows[0] or {}).get("balance", 0) or 0))
            except (TypeError, ValueError):
                credits_remaining = 0

        invoice_query = {"table": "invoices", "action": "select", "columns": "tier,status,issued_at",
                         "filters": [{"column": "user_id", "op": "eq", "value": uid},
                                     {"column": "app", "op": "eq", "value": app_id}],
                         "options": {"limit": 100}}
        invoice_status, invoice_rows = gateway_json("/v1/db/query", method="POST", body=invoice_query)
        pack_rank = {"starter_pack": 1, "creator_pack": 2, "studio_pack": 3}
        pack_tier = None
        if invoice_status == 200 and isinstance(invoice_rows, list):
            paid_pack_tiers = [
                str(r.get("tier")) for r in invoice_rows
                if isinstance(r, dict) and r.get("status") == "paid" and str(r.get("tier")) in pack_rank
            ]
            if paid_pack_tiers:
                pack_tier = max(paid_pack_tiers, key=lambda value: pack_rank.get(value, 0))

        active = [r for r in rows if isinstance(r, dict) and r.get("status") == "active"]
        winner = next((r for r in active if r.get("app") == "all_access"), None)
        if winner is None:
            winner = next((r for r in active if r.get("app") == app_id), None)
        tier = str((winner or {}).get("tier", "free"))
        period_end = (winner or {}).get("current_period_end")
        source = "all_access" if (winner or {}).get("app") == "all_access" else ("direct" if winner else "none")
        return self._send_json(200, {
            "ok": True, "authenticated": True, "app": app_id,
            "user_id": uid, "userId": uid,
            "has_access": winner is not None, "hasAccess": winner is not None,
            "tier": tier, "status": (winner or {}).get("status", "inactive"),
            "source": source, "features": {},
            "credits_remaining": credits_remaining, "creditsRemaining": credits_remaining,
            "pack_tier": pack_tier, "packTier": pack_tier,
            "current_period_end": period_end, "currentPeriodEnd": period_end,
            "expiresAt": period_end, "checkedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        })

    def log_message(self, fmt: str, *args) -> None:
        return


def main() -> None:
    server = ThreadingHTTPServer((BIND, PORT), Broker)
    print(f"RONS launch broker http://{BIND}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
