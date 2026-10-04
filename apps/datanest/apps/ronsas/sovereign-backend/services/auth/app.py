from __future__ import annotations
import base64, hashlib, hmac, json, os, secrets, sqlite3, time, uuid
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel

app = FastAPI(title="Resonance Sovereign Auth", version="0.9.0")
DB = Path(os.getenv("AUTH_DB", "/data/auth.db"))
KEY_FILE = Path(os.getenv("AUTH_SIGNING_KEY_FILE", "/run/secrets/auth-signing-key"))
EXCHANGE_KEY_FILE = Path(os.getenv("AUTH_EXCHANGE_KEY_FILE", "/run/secrets/auth-exchange-key"))
SESSION_COOKIE = "resonance_session"
LAUNCH_TICKET_TTL = max(30, min(300, int(os.getenv("RONS_LAUNCH_TICKET_TTL", "90"))))
LAUNCH_APPS = {"epublisher","creative_studio","sync_vision","youtube_optimizer"}

def db():
    DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB)
    conn.execute("CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,salt BLOB NOT NULL,password_hash BLOB NOT NULL,created_at INTEGER NOT NULL)")
    conn.execute("CREATE TABLE IF NOT EXISTS external_users(id TEXT PRIMARY KEY,provider TEXT NOT NULL,provider_subject TEXT UNIQUE NOT NULL,created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL)")
    conn.execute("CREATE TABLE IF NOT EXISTS launch_ticket_redemptions(jti TEXT PRIMARY KEY,redeemed_at INTEGER NOT NULL,app TEXT NOT NULL,user_id TEXT NOT NULL)")
    conn.commit(); return conn

def key() -> bytes:
    if not KEY_FILE.exists(): raise RuntimeError("auth signing key missing")
    return KEY_FILE.read_bytes().strip()

def exchange_key() -> bytes:
    if not EXCHANGE_KEY_FILE.exists(): raise RuntimeError("auth exchange key missing")
    return EXCHANGE_KEY_FILE.read_bytes().strip()

def b64(data: bytes) -> str: return base64.urlsafe_b64encode(data).decode().rstrip("=")
def unb64(data: str) -> bytes: return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))
def hash_password(password: str, salt: bytes) -> bytes: return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
def token(user_id: str, ttl: int = 86400) -> str:
    payload = b64(json.dumps({"sub":user_id,"exp":int(time.time())+ttl}, separators=(",",":")).encode())
    sig = b64(hmac.new(key(), payload.encode(), hashlib.sha256).digest())
    return payload + "." + sig

def launch_ticket(user_id: str, app_id: str, ttl: int | None = None) -> str:
    now=int(time.time()); exp=now+(ttl if ttl is not None else LAUNCH_TICKET_TTL)
    data={"typ":"rons-launch","sub":user_id,"aud":app_id,"jti":secrets.token_urlsafe(18),"iat":now,"exp":exp}
    payload=b64(json.dumps(data,separators=(",",":"),sort_keys=True).encode())
    sig=b64(hmac.new(key(),b"rons-launch-ticket:"+payload.encode(),hashlib.sha256).digest())
    return payload+"."+sig

def verify_launch_ticket(value: str, app_id: str) -> dict | None:
    try:
        payload,sig=value.split(".",1)
        expected=b64(hmac.new(key(),b"rons-launch-ticket:"+payload.encode(),hashlib.sha256).digest())
        if not hmac.compare_digest(sig,expected): return None
        data=json.loads(unb64(payload)); now=int(time.time())
        if data.get("typ")!="rons-launch" or data.get("aud")!=app_id: return None
        if int(data.get("exp",0))<now or int(data.get("iat",now+1))>now+5: return None
        if not isinstance(data.get("jti"),str) or not isinstance(data.get("sub"),str): return None
        return data
    except Exception: return None

def verify_token(value: str) -> str | None:
    try:
        payload, sig = value.split(".",1)
        expected = b64(hmac.new(key(), payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected): return None
        data=json.loads(unb64(payload));
        if int(data["exp"]) < int(time.time()): return None
        return str(data["sub"])
    except Exception: return None

def request_token(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        value = auth[7:].strip()
        if value:
            return value
    return request.cookies.get(SESSION_COOKIE, "")

def current_user(request: Request):
    uid=verify_token(request_token(request))
    if not uid: return None
    with db() as c:
        row=c.execute("SELECT id,email,created_at FROM users WHERE id=?",(uid,)).fetchone()
        if row: return {"id":row[0],"email":row[1],"created_at":row[2]}
        external=c.execute("SELECT id,provider,created_at FROM external_users WHERE id=?",(uid,)).fetchone()
    return {"id":external[0],"email":None,"external_provider":external[1],"created_at":external[2]} if external else None

class Credentials(BaseModel):
    email: str
    password: str

class ExternalIdentity(BaseModel):
    provider: str
    subject: str

class LaunchTicketRequest(BaseModel):
    app: str

class LaunchTicketRedeem(BaseModel):
    app: str
    ticket: str

@app.get("/health")
def health(): return {"ok":True,"service":"auth"}

@app.post("/v1/auth/sign-up")
def signup(body: Credentials, response: Response):
    if "@" not in body.email or len(body.email) > 254: raise HTTPException(400,"Valid email required")
    if len(body.password) < 10: raise HTTPException(400,"Password must be at least 10 characters")
    salt=secrets.token_bytes(16); uid=str(uuid.uuid4())
    try:
        with db() as c: c.execute("INSERT INTO users VALUES(?,?,?,?,?)",(uid,body.email.lower(),salt,hash_password(body.password,salt),int(time.time())))
    except sqlite3.IntegrityError: raise HTTPException(409,"Account already exists")
    t=token(uid); response.set_cookie(SESSION_COOKIE,t,httponly=True,samesite="strict",secure=False,max_age=86400)
    return {"user":{"id":uid,"email":body.email.lower()},"session":{"local":True,"access_token":t,"token_type":"bearer","expires_in":86400}}

@app.post("/v1/auth/sign-in")
def signin(body: Credentials, response: Response):
    with db() as c: row=c.execute("SELECT id,email,salt,password_hash FROM users WHERE email=?",(body.email.lower(),)).fetchone()
    if not row or not hmac.compare_digest(hash_password(body.password,row[2]),row[3]): raise HTTPException(401,"Invalid credentials")
    t=token(row[0]); response.set_cookie(SESSION_COOKIE,t,httponly=True,samesite="strict",secure=False,max_age=86400)
    return {"user":{"id":row[0],"email":row[1]},"session":{"local":True,"access_token":t,"token_type":"bearer","expires_in":86400}}

@app.post("/v1/auth/exchange")
def exchange_identity(body: ExternalIdentity, request: Request, response: Response):
    supplied=request.headers.get("x-rons-exchange-key", "").encode()
    expected=exchange_key()
    if not supplied or not hmac.compare_digest(supplied, expected): raise HTTPException(401,"Exchange authorization failed")
    if body.provider != "supabase": raise HTTPException(400,"Unsupported identity provider")
    try: subject=str(uuid.UUID(body.subject))
    except (ValueError, AttributeError): raise HTTPException(400,"Valid UUID subject required")
    now=int(time.time())
    with db() as c:
        c.execute("INSERT OR IGNORE INTO external_users(id,provider,provider_subject,created_at,last_seen_at) VALUES(?,?,?,?,?)",(subject,body.provider,subject,now,now))
        c.execute("UPDATE external_users SET last_seen_at=? WHERE provider=? AND provider_subject=?",(now,body.provider,subject))
        row=c.execute("SELECT id,provider,created_at FROM external_users WHERE provider=? AND provider_subject=?",(body.provider,subject)).fetchone()
    if not row or row[0] != subject: raise HTTPException(409,"Identity mapping conflict")
    t=token(subject); response.set_cookie(SESSION_COOKIE,t,httponly=True,samesite="strict",secure=False,max_age=86400)
    return {"user":{"id":subject,"email":None,"external_provider":body.provider},"session":{"local":True,"access_token":t,"token_type":"bearer","expires_in":86400}}

@app.post("/v1/auth/launch-ticket")
def issue_launch_ticket(body: LaunchTicketRequest, request: Request):
    supplied=request.headers.get("x-rons-exchange-key", "").encode(); expected=exchange_key()
    if not supplied or not hmac.compare_digest(supplied, expected): raise HTTPException(401,"Launch authorization failed")
    if body.app not in LAUNCH_APPS: raise HTTPException(400,"Unsupported launch app")
    user=current_user(request)
    if not user: raise HTTPException(401,"Not authenticated")
    value=launch_ticket(str(user["id"]),body.app)
    return {"ticket":value,"app":body.app,"expires_in":LAUNCH_TICKET_TTL}

@app.post("/v1/auth/launch-ticket/redeem")
def redeem_launch_ticket(body: LaunchTicketRedeem, response: Response):
    if body.app not in LAUNCH_APPS: raise HTTPException(400,"Unsupported launch app")
    data=verify_launch_ticket(body.ticket,body.app)
    if not data: raise HTTPException(401,"Invalid or expired launch ticket")
    now=int(time.time()); uid=str(data["sub"]); jti=str(data["jti"])
    try:
        with db() as c:
            c.execute("INSERT INTO launch_ticket_redemptions(jti,redeemed_at,app,user_id) VALUES(?,?,?,?)",(jti,now,body.app,uid))
    except sqlite3.IntegrityError: raise HTTPException(409,"Launch ticket already redeemed")
    t=token(uid); response.set_cookie(SESSION_COOKIE,t,httponly=True,samesite="strict",secure=False,max_age=86400)
    return {"user_id":uid,"app":body.app,"session":{"local":True,"access_token":t,"token_type":"bearer","expires_in":86400}}

@app.post("/v1/auth/sign-out")
def signout(response: Response): response.delete_cookie(SESSION_COOKIE); return {"ok":True}
@app.get("/v1/auth/session")
def session(request: Request): return {"session":{"user":current_user(request)} if current_user(request) else None}
@app.get("/v1/auth/user")
def user(request: Request):
    u=current_user(request)
    if not u: raise HTTPException(401,"Not authenticated")
    return {"user":u}
