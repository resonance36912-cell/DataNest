from __future__ import annotations
import mimetypes, os, re
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, Response

app=FastAPI(title="Resonance Sovereign Storage",version="0.9.0")
ROOT=Path(os.getenv("STORAGE_ROOT","/data")).resolve()
NAME=re.compile(r"^[A-Za-z0-9._/-]{1,500}$")

def resolve(bucket:str,path:str="") -> Path:
    if not NAME.fullmatch(bucket) or not NAME.fullmatch(path or "x"): raise HTTPException(400,"Invalid storage path")
    target=(ROOT/bucket/path).resolve()
    try: target.relative_to(ROOT)
    except ValueError: raise HTTPException(400,"Storage path escaped root")
    return target

@app.get("/health")
def health(): return {"ok":True,"service":"storage"}
@app.put("/v1/storage/{bucket}/{path:path}")
async def upload(bucket:str,path:str,request:Request):
    data=await request.body()
    if len(data)>25_000_000: raise HTTPException(413,"Object exceeds local limit")
    target=resolve(bucket,path); target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(data)
    return {"bucket":bucket,"path":path,"bytes":len(data)}
@app.get("/v1/storage/{bucket}/{path:path}")
def download(bucket:str,path:str):
    target=resolve(bucket,path)
    if not target.is_file(): raise HTTPException(404,"Object not found")
    return Response(target.read_bytes(),media_type=mimetypes.guess_type(target.name)[0] or "application/octet-stream")
@app.delete("/v1/storage/{bucket}")
async def remove(bucket:str,request:Request):
    body=await request.json(); removed=[]
    for path in body.get("paths",[]):
        target=resolve(bucket,str(path))
        if target.is_file(): target.unlink(); removed.append(str(path))
    return {"removed":removed}
@app.get("/v1/storage/public/{bucket}/{path:path}")
def public_get(bucket:str,path:str): return download(bucket,path)
