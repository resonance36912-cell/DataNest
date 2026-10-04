from __future__ import annotations
import os,re
from pathlib import Path
from typing import Any
import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, Field
try:
    import psycopg
    from psycopg import sql
except Exception:  # allows static/unit validation before local wheel provisioning
    psycopg=None; sql=None

app=FastAPI(title="Resonance Sovereign Gateway",version="0.9.0")
DATABASE_URL=os.getenv("DATABASE_URL","postgresql://resonance@postgres:5432/resonance")
DB_PASSWORD_FILE=os.getenv("POSTGRES_PASSWORD_FILE","/run/secrets/postgres-password")
AUTH_URL=os.getenv("AUTH_URL","http://auth:8080").rstrip("/")
STORAGE_URL=os.getenv("STORAGE_URL","http://storage:9000").rstrip("/")
OLLAMA_URL=os.getenv("OLLAMA_URL","http://host.containers.internal:11434").rstrip("/")
IDENT=re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,62}$")
OPS={"eq":"=","neq":"!=","gt":">","gte":">=","lt":"<","lte":"<="}

class Query(BaseModel):
    table:str
    action:str=Field(pattern="^(select|insert|update|upsert|delete)$")
    columns:str="*"
    values:Any=None
    filters:list[dict[str,Any]]=[]
    options:dict[str,Any]={}

class Chat(BaseModel):
    messages:list[dict[str,str]]
    model:str|None=None

def ident(name:str):
    if not IDENT.fullmatch(name): raise HTTPException(400,"Invalid SQL identifier")
    return sql.Identifier(name)

def where_clause(filters):
    parts=[]; params=[]
    for f in filters:
        op=OPS.get(str(f.get("op")))
        if not op: raise HTTPException(400,"Unsupported filter")
        parts.append(sql.SQL("{} "+op+" %s").format(ident(str(f.get("column")))))
        params.append(f.get("value"))
    return (sql.SQL(" WHERE ")+sql.SQL(" AND ").join(parts),params) if parts else (sql.SQL(""),[])

@app.get("/health")
def health(): return {"ok":True,"service":"gateway","postgres_driver":psycopg is not None}

@app.post("/v1/db/query")
def query(body:Query):
    if psycopg is None: raise HTTPException(503,"Local Postgres driver not provisioned")
    table=ident(body.table); wh,params=where_clause(body.filters)
    password=Path(DB_PASSWORD_FILE).read_text(encoding="utf-8").strip() if Path(DB_PASSWORD_FILE).exists() else None
    with psycopg.connect(DATABASE_URL, password=password) as conn, conn.cursor() as cur:
        if body.action=="select":
            cols=sql.SQL("*") if body.columns=="*" else sql.SQL(",").join(ident(x.strip()) for x in body.columns.split(","))
            stmt=sql.SQL("SELECT {} FROM {}").format(cols,table)+wh
            order=body.options.get("order")
            if order:
                stmt+=sql.SQL(" ORDER BY {}").format(ident(str(order.get("column"))))+sql.SQL(" DESC" if order.get("ascending") is False else " ASC")
            if "limit" in body.options: stmt+=sql.SQL(" LIMIT %s"); params.append(int(body.options["limit"]))
            cur.execute(stmt,params); rows=cur.fetchall(); names=[d.name for d in cur.description]; data=[dict(zip(names,r)) for r in rows]
            if body.options.get("single"): data=data[0] if data else None
            return data
        values=body.values
        if body.action in {"insert","upsert"}:
            rows=values if isinstance(values,list) else [values]
            if not rows or not all(isinstance(r,dict) for r in rows): raise HTTPException(400,"Insert values must be objects")
            columns=list(rows[0]);
            if any(set(r)!=set(columns) for r in rows): raise HTTPException(400,"Insert rows must share columns")
            vals=[v for r in rows for v in [r[c] for c in columns]]
            tuples=sql.SQL(",").join(sql.SQL("(")+sql.SQL(",").join(sql.Placeholder() for _ in columns)+sql.SQL(")") for _ in rows)
            stmt=sql.SQL("INSERT INTO {} ({}) VALUES {}").format(table,sql.SQL(",").join(ident(c) for c in columns),tuples)
            if body.action=="upsert": stmt+=sql.SQL(" ON CONFLICT DO NOTHING")
            stmt+=sql.SQL(" RETURNING *"); cur.execute(stmt,vals); result=cur.fetchall(); names=[d.name for d in cur.description]; return [dict(zip(names,r)) for r in result]
        if body.action=="update":
            if not isinstance(values,dict) or not values: raise HTTPException(400,"Update values required")
            set_clause=sql.SQL(",").join(sql.SQL("{}=%s").format(ident(k)) for k in values); stmt=sql.SQL("UPDATE {} SET ").format(table)+set_clause+wh+sql.SQL(" RETURNING *")
            cur.execute(stmt,list(values.values())+params); result=cur.fetchall(); names=[d.name for d in cur.description]; return [dict(zip(names,r)) for r in result]
        if not body.filters: raise HTTPException(400,"Delete requires at least one filter")
        stmt=sql.SQL("DELETE FROM {}").format(table)+wh+sql.SQL(" RETURNING *"); cur.execute(stmt,params); result=cur.fetchall(); names=[d.name for d in cur.description]; return [dict(zip(names,r)) for r in result]

async def proxy(request:Request,target:str):
    body=await request.body(); headers={k:v for k,v in request.headers.items() if k.lower() not in {"host","content-length"}}
    async with httpx.AsyncClient(timeout=30) as client:
        r=await client.request(request.method,target,content=body,headers=headers,params=request.query_params)
    response=Response(r.content,status_code=r.status_code,media_type=r.headers.get("content-type"))
    for cookie in r.headers.get_list("set-cookie"): response.headers.append("set-cookie",cookie)
    return response

@app.api_route("/v1/auth/{path:path}",methods=["GET","POST"])
async def auth_proxy(path:str,request:Request): return await proxy(request,f"{AUTH_URL}/v1/auth/{path}")
@app.api_route("/v1/storage/{path:path}",methods=["GET","PUT","DELETE"])
async def storage_proxy(path:str,request:Request): return await proxy(request,f"{STORAGE_URL}/v1/storage/{path}")
@app.post("/v1/ai/chat")
async def ai_chat(body:Chat):
    payload={"model":body.model or os.getenv("SOVEREIGN_MODEL","qwen3-coder:30b"),"stream":False,"messages":body.messages}
    async with httpx.AsyncClient(timeout=300) as client:
        try: r=await client.post(f"{OLLAMA_URL}/api/chat",json=payload); r.raise_for_status()
        except Exception as exc: raise HTTPException(503,f"Local AI unavailable: {exc}")
    data=r.json(); return {"message":data.get("message"),"model":data.get("model"),"external_ai_used":False}
