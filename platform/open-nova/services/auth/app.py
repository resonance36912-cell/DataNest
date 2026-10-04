from __future__ import annotations
import base64, hashlib, hmac, json, os, secrets, sqlite3, time
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel

app = FastAPI(title="Resonance Sovereign Auth", version="0.9.0")
DB = Path(os.getenv("AUTH_DB", "/data/auth.db"))
KEY_FILE = Path(os.getenv("AUTH_SIGNING_KEY_FILE", "/run/secrets/auth-signing-key"))
SESSION_COOKIE = "resonance_session"

def db():
    DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB)
    conn.execute("CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,salt BLOB NOT NULL,password_hash BLOB NOT NULL,created_at INTEGER NOT NULL)")
    conn.commit(); return conn

def key() -> bytes:
    if not KEY_FILE.exists(): raise RuntimeError("auth signing key missing")
    return KEY_FILE.read_bytes().strip()

def b64(data: bytes) -> str: return base64.urlsafe_b64encode(data).decode().rstrip("=")
def unb64(data: str) -> bytes: return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))
def hash_password(password: str, salt: bytes) -> bytes: return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
def token(user_id: str, ttl: int = 86400) -> str:
    payload = b64(json.dumps({"sub":user_id,"exp":int(time.time())+ttl}, separators=(",",":")).encode())
    sig = b64(hmac.new(key(), payload.encode(), hashlib.sha256).digest())
    return payload + "." + sig

def verify_token(value: str) -> str | None:
    try:
        payload, sig = value.split(".",1)
        expected = b64(hmac.new(key(), payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected): return None
        data=json.loads(unb64(payload));
        if int(data["exp"]) < int(time.time()): return None
        return str(data["sub"])
    except Exception: return None

def current_user(request: Request):
    uid=verify_token(request.cookies.get(SESSION_COOKIE, ""))
    if not uid: return None
    with db() as c:
        row=c.execute("SELECT id,email,created_at FROM users WHERE id=?",(uid,)).fetchone()
    return {"id":row[0],"email":row[1],"created_at":row[2]} if row else None

class Credentials(BaseModel):
    email: str
    password: str

@app.get("/health")
def health(): return {"ok":True,"service":"auth"}

@app.post("/v1/auth/sign-up")
def signup(body: Credentials, response: Response):
    if "@" not in body.email or len(body.email) > 254: raise HTTPException(400,"Valid email required")
    if len(body.password) < 10: raise HTTPException(400,"Password must be at least 10 characters")
    salt=secrets.token_bytes(16); uid=secrets.token_hex(16)
    try:
        with db() as c: c.execute("INSERT INTO users VALUES(?,?,?,?,?)",(uid,body.email.lower(),salt,hash_password(body.password,salt),int(time.time())))
    except sqlite3.IntegrityError: raise HTTPException(409,"Account already exists")
    t=token(uid); response.set_cookie(SESSION_COOKIE,t,httponly=True,samesite="strict",secure=False,max_age=86400)
    return {"user":{"id":uid,"email":body.email.lower()},"session":{"local":True}}

@app.post("/v1/auth/sign-in")
def signin(body: Credentials, response: Response):
    with db() as c: row=c.execute("SELECT id,email,salt,password_hash FROM users WHERE email=?",(body.email.lower(),)).fetchone()
    if not row or not hmac.compare_digest(hash_password(body.password,row[2]),row[3]): raise HTTPException(401,"Invalid credentials")
    response.set_cookie(SESSION_COOKIE,token(row[0]),httponly=True,samesite="strict",secure=False,max_age=86400)
    return {"user":{"id":row[0],"email":row[1]},"session":{"local":True}}

@app.post("/v1/auth/sign-out")
def signout(response: Response): response.delete_cookie(SESSION_COOKIE); return {"ok":True}
@app.get("/v1/auth/session")
def session(request: Request): return {"session":{"user":current_user(request)} if current_user(request) else None}
@app.get("/v1/auth/user")
def user(request: Request):
    u=current_user(request)
    if not u: raise HTTPException(401,"Not authenticated")
    return {"user":u}
