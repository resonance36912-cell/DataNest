from __future__ import annotations
import hmac,os,re
from pathlib import Path
from typing import Any
import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, Field
try:
    from . import bootstrap as bootstrap_ops
except ImportError:
    import bootstrap as bootstrap_ops
try:
    from . import subscription_mirror as subscription_ops
except ImportError:
    import subscription_mirror as subscription_ops
try:
    from . import billing_read as billing_ops
except ImportError:
    import billing_read as billing_ops
try:
    from . import checkout_audit as checkout_ops
except ImportError:
    import checkout_audit as checkout_ops
try:
    from . import payfast_settlement as payfast_settlement_ops
except ImportError:
    import payfast_settlement as payfast_settlement_ops
try:
    from . import governance as governance_ops
except ImportError:
    import governance as governance_ops
try:
    from . import cost_usage as cost_usage_ops
except ImportError:
    import cost_usage as cost_usage_ops
try:
    import psycopg
    from psycopg import sql
    from psycopg.types.json import Jsonb
except Exception:  # allows static/unit validation before local wheel provisioning
    psycopg=None; sql=None; Jsonb=None

app=FastAPI(title="Resonance Sovereign Gateway",version="0.12.0")
DATABASE_URL=os.getenv("DATABASE_URL","postgresql://resonance@postgres:5432/resonance")
DB_PASSWORD_FILE=os.getenv("POSTGRES_PASSWORD_FILE","/run/secrets/postgres-password")
PROCEDURE_KEY_FILE=os.getenv("GATEWAY_PROCEDURE_KEY_FILE","/run/secrets/gateway-procedure-key")
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
    app:str|None=None
    operation:str|None=None

class ProcedureCall(BaseModel):
    name:str=Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")
    args:dict[str,Any]=Field(default_factory=dict)

BOOTSTRAP_PROCEDURES={"create_admin_bootstrap_challenge","cancel_admin_bootstrap_challenge","bootstrap_first_admin"}
BOOTSTRAP_PROCEDURES_ENABLED=os.getenv("RONS_BOOTSTRAP_PROCEDURES_ENABLED","0")=="1"
GOVERNANCE_PROCEDURES={
    "governance_list_participants","governance_list_proposals","governance_get_proposal",
    "governance_create_proposal","governance_submit_proposal","governance_add_evidence",
    "governance_add_review","governance_record_decision","governance_register_agent",
}
ALLOWED_PROCEDURES={"transaction_probe","mirror_user_roles","read_subscription_mirror","read_subscription_account","mirror_subscriptions","read_account_invoices","read_admin_invoices","read_billing_account","read_billing_admin","record_payfast_launch","record_payfast_itn_attempt","settle_payfast_itn","record_cost_usage","read_cost_usage_summary","nova_transition_job","datanest_approve_memory","datanest_supersede_memory"} | GOVERNANCE_PROCEDURES | (BOOTSTRAP_PROCEDURES if BOOTSTRAP_PROCEDURES_ENABLED else set())
PROTECTED_TABLES={"admin_bootstrap_state","admin_bootstrap_email_challenges","invoices","credit_wallets","credit_ledger","billing_receipts","payfast_launch_logs","payfast_itn_logs","webhook_events","plan_changes","subscription_email_sends","email_suppression_list","cost_usage_events","governance_participants","governance_proposals","governance_evidence","governance_reviews","governance_decisions","governance_events"}
PROTECTED_WRITE_TABLES={"user_roles","subscriptions"}
SUBSCRIPTION_ENTITLEMENT_COLUMNS={"app","tier","status","current_period_end"}

class _ProbeRollback(Exception):
    pass

def ident(name:str):
    if not IDENT.fullmatch(name): raise HTTPException(400,"Invalid SQL identifier")
    return sql.Identifier(name)

def db_value(value:Any):
    if isinstance(value,dict) and Jsonb is not None: return Jsonb(value)
    return value

def where_clause(filters):
    parts=[]; params=[]
    for f in filters:
        op_name=str(f.get("op"))
        column=ident(str(f.get("column")))
        if op_name=="in":
            values=f.get("value")
            if not isinstance(values,list) or not values: raise HTTPException(400,"IN filter requires a non-empty list")
            parts.append(sql.SQL("{} IN ({})").format(column,sql.SQL(",").join(sql.Placeholder() for _ in values)))
            params.extend(values)
            continue
        if op_name=="text_search":
            if str(f.get("column")) == "search_document":
                parts.append(sql.SQL("{} @@ plainto_tsquery('simple', %s)").format(column))
            else:
                parts.append(sql.SQL("to_tsvector('simple', COALESCE({},'')) @@ plainto_tsquery('simple', %s)").format(column))
            params.append(f.get("value"))
            continue
        op=OPS.get(op_name)
        if not op: raise HTTPException(400,"Unsupported filter")
        parts.append(sql.SQL("{} "+op+" %s").format(column))
        params.append(f.get("value"))
    return (sql.SQL(" WHERE ")+sql.SQL(" AND ").join(parts),params) if parts else (sql.SQL(""),[])

def validate_subscription_entitlement_query(body:Query):
    if body.table!="subscriptions" or body.action!="select": return
    if body.columns=="*": raise HTTPException(403,"Subscription mirror fields require a named procedure")
    columns=[x.strip() for x in body.columns.split(",") if x.strip()]
    if not columns or not set(columns).issubset(SUBSCRIPTION_ENTITLEMENT_COLUMNS): raise HTTPException(403,"Subscription mirror fields require a named procedure")
    if len(body.filters)!=1: raise HTTPException(403,"Subscription reads require one user_id filter")
    f=body.filters[0]
    if set(f)!={"column","op","value"} or f.get("column")!="user_id" or f.get("op")!="eq": raise HTTPException(403,"Subscription reads require one user_id filter")
    try: bootstrap_ops.normalize_user_id(f.get("value"))
    except ValueError as exc: raise HTTPException(400,str(exc))
    if set(body.options)-{"limit"}: raise HTTPException(403,"Unsupported subscription read option")
    limit=body.options.get("limit",100)
    if not isinstance(limit,int) or isinstance(limit,bool) or not 1<=limit<=100: raise HTTPException(400,"Subscription read limit must be 1..100")

@app.get("/health")
def health(): return {"ok":True,"service":"gateway","version":app.version,"postgres_driver":psycopg is not None}

@app.post("/v1/db/query")
def query(body:Query):
    validate_subscription_entitlement_query(body)
    if body.table in PROTECTED_TABLES: raise HTTPException(403,"Protected table requires a named procedure")
    if body.table in PROTECTED_WRITE_TABLES and body.action != "select": raise HTTPException(403,"Protected write requires a named procedure")
    if psycopg is None: raise HTTPException(503,"Local Postgres driver not provisioned")
    table=ident(body.table); wh,params=where_clause(body.filters)
    password=Path(DB_PASSWORD_FILE).read_text(encoding="utf-8").strip() if Path(DB_PASSWORD_FILE).exists() else None
    with psycopg.connect(DATABASE_URL, password=password) as conn, conn.cursor() as cur:
        if body.action=="select":
            count_mode=body.options.get("count")
            if count_mode not in {None,"exact"}: raise HTTPException(400,"Unsupported count mode")
            head=body.options.get("head",False)
            if not isinstance(head,bool): raise HTTPException(400,"head must be boolean")
            exact_count=None
            if count_mode=="exact":
                count_stmt=sql.SQL("SELECT COUNT(*) FROM {}").format(table)+wh
                cur.execute(count_stmt,params)
                exact_count=int(cur.fetchone()[0])
            if head:
                return {"data":[],"count":exact_count}
            cols=sql.SQL("*") if body.columns=="*" else sql.SQL(",").join(ident(x.strip()) for x in body.columns.split(","))
            stmt=sql.SQL("SELECT {} FROM {}").format(cols,table)+wh
            order=body.options.get("order")
            if order:
                stmt+=sql.SQL(" ORDER BY {}").format(ident(str(order.get("column"))))+sql.SQL(" DESC" if order.get("ascending") is False else " ASC")
            if "limit" in body.options: stmt+=sql.SQL(" LIMIT %s"); params.append(int(body.options["limit"]))
            cur.execute(stmt,params); rows=cur.fetchall(); names=[d.name for d in cur.description]; data=[dict(zip(names,r)) for r in rows]
            if body.options.get("single"): data=data[0] if data else None
            return {"data":data,"count":exact_count} if count_mode=="exact" else data
        values=body.values
        if body.action in {"insert","upsert"}:
            rows=values if isinstance(values,list) else [values]
            if not rows or not all(isinstance(r,dict) for r in rows): raise HTTPException(400,"Insert values must be objects")
            columns=list(rows[0]);
            if any(set(r)!=set(columns) for r in rows): raise HTTPException(400,"Insert rows must share columns")
            vals=[db_value(r[c]) for r in rows for c in columns]
            tuples=sql.SQL(",").join(sql.SQL("(")+sql.SQL(",").join(sql.Placeholder() for _ in columns)+sql.SQL(")") for _ in rows)
            stmt=sql.SQL("INSERT INTO {} ({}) VALUES {}").format(table,sql.SQL(",").join(ident(c) for c in columns),tuples)
            if body.action=="upsert":
                conflict=str(body.options.get("on_conflict","")).strip()
                if not conflict: raise HTTPException(400,"Upsert requires on_conflict columns")
                conflict_cols=[x.strip() for x in conflict.split(",") if x.strip()]
                if not conflict_cols or any(x not in columns for x in conflict_cols): raise HTTPException(400,"Invalid on_conflict columns")
                updates=[c for c in columns if c not in conflict_cols]
                if updates:
                    stmt+=sql.SQL(" ON CONFLICT ({}) DO UPDATE SET {}").format(
                        sql.SQL(",").join(ident(c) for c in conflict_cols),
                        sql.SQL(",").join(sql.SQL("{}=EXCLUDED.{}").format(ident(c),ident(c)) for c in updates),
                    )
                else:
                    stmt+=sql.SQL(" ON CONFLICT ({}) DO NOTHING").format(sql.SQL(",").join(ident(c) for c in conflict_cols))
            stmt+=sql.SQL(" RETURNING *"); cur.execute(stmt,vals); result=cur.fetchall(); names=[d.name for d in cur.description]; return [dict(zip(names,r)) for r in result]
        if body.action=="update":
            if not isinstance(values,dict) or not values: raise HTTPException(400,"Update values required")
            set_clause=sql.SQL(",").join(sql.SQL("{}=%s").format(ident(k)) for k in values); stmt=sql.SQL("UPDATE {} SET ").format(table)+set_clause+wh+sql.SQL(" RETURNING *")
            cur.execute(stmt,[db_value(v) for v in values.values()]+params); result=cur.fetchall(); names=[d.name for d in cur.description]; return [dict(zip(names,r)) for r in result]
        if not body.filters: raise HTTPException(400,"Delete requires at least one filter")
        stmt=sql.SQL("DELETE FROM {}").format(table)+wh+sql.SQL(" RETURNING *"); cur.execute(stmt,params); result=cur.fetchall(); names=[d.name for d in cur.description]; return [dict(zip(names,r)) for r in result]

def canonical_local_identity(request:Request,user_id:str,verified_email:str|None=None) -> bool:
    auth=request.headers.get("authorization","")
    if not auth.lower().startswith("bearer "): raise HTTPException(401,"User authentication required")
    with httpx.Client(timeout=5) as client:
        response=client.get(f"{AUTH_URL}/v1/auth/user",headers={"Authorization":auth})
    if response.status_code!=200: raise HTTPException(401,"User authentication failed")
    user=(response.json() or {}).get("user") or {}
    try: canonical_id=bootstrap_ops.normalize_user_id(user.get("id"))
    except ValueError: raise HTTPException(401,"User authentication failed")
    if canonical_id!=user_id: raise HTTPException(401,"User identity mismatch")
    if verified_email is None: return True
    email=user.get("email")
    return isinstance(email,str) and email.strip().lower()==verified_email.strip().lower()

def require_procedure_key(request:Request):
    path=Path(PROCEDURE_KEY_FILE)
    if not path.exists(): raise HTTPException(503,"Procedure authorization is not configured")
    expected=path.read_bytes().strip()
    supplied=request.headers.get("x-rons-procedure-key","").encode()
    if not supplied or not hmac.compare_digest(supplied,expected): raise HTTPException(401,"Procedure authorization failed")

@app.post("/v1/db/procedure")
def procedure(body:ProcedureCall,request:Request):
    require_procedure_key(request)
    if body.name not in ALLOWED_PROCEDURES: raise HTTPException(400,"Procedure is not allowlisted")
    if psycopg is None: raise HTTPException(503,"Local Postgres driver not provisioned")
    if body.name=="transaction_probe":
        if set(body.args)-{"rollback"}: raise HTTPException(400,"Unsupported transaction probe argument")
        rollback=body.args.get("rollback",False)
        if not isinstance(rollback,bool): raise HTTPException(400,"rollback must be boolean")
        password=Path(DB_PASSWORD_FILE).read_text(encoding="utf-8").strip() if Path(DB_PASSWORD_FILE).exists() else None
        with psycopg.connect(DATABASE_URL,password=password,autocommit=True) as conn, conn.cursor() as cur:
            cur.execute("CREATE TEMP TABLE rons_transaction_probe (marker integer NOT NULL)")
            if rollback:
                try:
                    with conn.transaction():
                        cur.execute("INSERT INTO rons_transaction_probe (marker) VALUES (%s)",[1])
                        raise _ProbeRollback()
                except _ProbeRollback:
                    pass
            else:
                with conn.transaction():
                    cur.execute("INSERT INTO rons_transaction_probe (marker) VALUES (%s)",[1])
            cur.execute("SELECT COUNT(*) FROM rons_transaction_probe")
            row_count=int(cur.fetchone()[0])
        expected=0 if rollback else 1
        if row_count!=expected: raise HTTPException(500,"Transaction probe failed")
        return {"procedure":"transaction_probe","committed":not rollback,"row_count":row_count}
    if body.name=="mirror_user_roles":
        if set(body.args)!={"rows"} or not isinstance(body.args.get("rows"),list): raise HTTPException(400,"mirror_user_roles requires rows")
        rows=body.args["rows"]
        if len(rows)>10000: raise HTTPException(400,"Too many role rows")
        clean=[]; seen=set()
        for row in rows:
            if not isinstance(row,dict) or set(row)!={"id","user_id","role","created_at"}: raise HTTPException(400,"Invalid role row")
            try: rid=bootstrap_ops.normalize_user_id(row["id"]); uid=bootstrap_ops.normalize_user_id(row["user_id"])
            except ValueError as exc: raise HTTPException(400,str(exc))
            role=row["role"]; created=row["created_at"]
            if role not in {"admin","user"} or not isinstance(created,str) or not created.strip(): raise HTTPException(400,"Invalid role row")
            key=(uid,role)
            if key in seen: raise HTTPException(400,"Duplicate role row")
            seen.add(key); clean.append((rid,uid,role,created))
        password=Path(DB_PASSWORD_FILE).read_text(encoding="utf-8").strip() if Path(DB_PASSWORD_FILE).exists() else None
        inserted=updated=0
        with psycopg.connect(DATABASE_URL,password=password,autocommit=True) as conn, conn.transaction(), conn.cursor() as cur:
            cur.execute("LOCK TABLE user_roles IN SHARE ROW EXCLUSIVE MODE")
            for rid,uid,role,created in clean:
                cur.execute("SELECT id::text FROM user_roles WHERE user_id=%s AND role=%s FOR UPDATE",[uid,role]); existing=cur.fetchone()
                if existing and str(existing[0])!=rid: raise HTTPException(409,"Role identity conflict")
                if existing:
                    cur.execute("UPDATE user_roles SET created_at=%s WHERE id=%s",[created,rid]); updated+=1
                else:
                    cur.execute("INSERT INTO user_roles(id,user_id,role,created_at) VALUES (%s,%s,%s,%s)",[rid,uid,role,created]); inserted+=1
        return {"procedure":"mirror_user_roles","inserted":inserted,"updated":updated,"deleted":0}
    if body.name=="read_subscription_mirror":
        if body.args: raise HTTPException(400,"read_subscription_mirror takes no arguments")
        password=Path(DB_PASSWORD_FILE).read_text(encoding="utf-8").strip() if Path(DB_PASSWORD_FILE).exists() else None
        with psycopg.connect(DATABASE_URL,password=password) as conn:
            rows=subscription_ops.read_rows(conn)
        return {"procedure":"read_subscription_mirror","rows":rows}
    if body.name=="read_subscription_account":
        if set(body.args)!={"user_id"}: raise HTTPException(400,"read_subscription_account requires user_id")
        try: user_id=bootstrap_ops.normalize_user_id(body.args.get("user_id"))
        except ValueError as exc: raise HTTPException(400,str(exc))
        password=Path(DB_PASSWORD_FILE).read_text(encoding="utf-8").strip() if Path(DB_PASSWORD_FILE).exists() else None
        with psycopg.connect(DATABASE_URL,password=password) as conn:
            rows=subscription_ops.read_account_rows(conn,user_id)
        return {"procedure":"read_subscription_account","rows":rows}
    if body.name=="read_account_invoices":
        expected={"user_id","id","pf_payment_id","limit"}
        if set(body.args)!=expected: raise HTTPException(400,"read_account_invoices requires user_id,id,pf_payment_id,limit")
        password=Path(DB_PASSWORD_FILE).read_text(encoding="utf-8").strip() if Path(DB_PASSWORD_FILE).exists() else None
        with psycopg.connect(DATABASE_URL,password=password) as conn:
            try: rows=billing_ops.read_account_invoices(conn,body.args["user_id"],body.args["id"],body.args["pf_payment_id"],body.args["limit"])
            except ValueError as exc: raise HTTPException(400,str(exc))
        return {"procedure":"read_account_invoices","rows":rows}
    if body.name=="read_admin_invoices":
        expected={"status","app","q","id","pf_payment_id","limit"}
        if set(body.args)!=expected: raise HTTPException(400,"read_admin_invoices requires status,app,q,id,pf_payment_id,limit")
        password=Path(DB_PASSWORD_FILE).read_text(encoding="utf-8").strip() if Path(DB_PASSWORD_FILE).exists() else None
        with psycopg.connect(DATABASE_URL,password=password) as conn:
            try: rows=billing_ops.read_admin_invoices(conn,body.args["status"],body.args["app"],body.args["q"],body.args["id"],body.args["pf_payment_id"],body.args["limit"])
            except ValueError as exc: raise HTTPException(400,str(exc))
        return {"procedure":"read_admin_invoices","rows":rows}
    if body.name=="read_billing_account":
        if set(body.args)!={"user_id"}: raise HTTPException(400,"read_billing_account requires user_id")
        password=Path(DB_PASSWORD_FILE).read_text(encoding="utf-8").strip() if Path(DB_PASSWORD_FILE).exists() else None
        with psycopg.connect(DATABASE_URL,password=password) as conn:
            try: result=billing_ops.read_account_billing(conn,body.args["user_id"])
            except ValueError as exc: raise HTTPException(400,str(exc))
        return {"procedure":"read_billing_account",**result}
    if body.name=="read_billing_admin":
        if body.args: raise HTTPException(400,"read_billing_admin takes no arguments")
        password=Path(DB_PASSWORD_FILE).read_text(encoding="utf-8").strip() if Path(DB_PASSWORD_FILE).exists() else None
        with psycopg.connect(DATABASE_URL,password=password) as conn:
            result=billing_ops.read_admin_billing(conn)
        return {"procedure":"read_billing_admin",**result}
    if body.name=="record_payfast_launch":
        if set(body.args)!={"row"} or not isinstance(body.args.get("row"),dict):
            raise HTTPException(400,"record_payfast_launch requires row")
        password=Path(DB_PASSWORD_FILE).read_text(encoding="utf-8").strip() if Path(DB_PASSWORD_FILE).exists() else None
        with psycopg.connect(DATABASE_URL,password=password) as conn:
            try: result=checkout_ops.record_launch(conn,body.args["row"])
            except ValueError as exc: raise HTTPException(400,str(exc))
        return {"procedure":"record_payfast_launch",**result}
    if body.name=="record_payfast_itn_attempt":
        if set(body.args)!={"row"} or not isinstance(body.args.get("row"),dict):
            raise HTTPException(400,"record_payfast_itn_attempt requires row")
        password=Path(DB_PASSWORD_FILE).read_text(encoding="utf-8").strip() if Path(DB_PASSWORD_FILE).exists() else None
        with psycopg.connect(DATABASE_URL,password=password) as conn:
            try: result=payfast_settlement_ops.record_attempt(conn,body.args["row"])
            except ValueError as exc: raise HTTPException(400,str(exc))
        return {"procedure":"record_payfast_itn_attempt",**result}
    if body.name=="settle_payfast_itn":
        if set(body.args)!={"event"} or not isinstance(body.args.get("event"),dict):
            raise HTTPException(400,"settle_payfast_itn requires event")
        password=Path(DB_PASSWORD_FILE).read_text(encoding="utf-8").strip() if Path(DB_PASSWORD_FILE).exists() else None
        with psycopg.connect(DATABASE_URL,password=password) as conn:
            try: result=payfast_settlement_ops.settle(conn,body.args["event"])
            except ValueError as exc: raise HTTPException(400,str(exc))
        return {"procedure":"settle_payfast_itn",**result}
    if body.name=="record_cost_usage":
        if set(body.args)!={"event"} or not isinstance(body.args.get("event"),dict):
            raise HTTPException(400,"record_cost_usage requires event")
        password=Path(DB_PASSWORD_FILE).read_text(encoding="utf-8").strip() if Path(DB_PASSWORD_FILE).exists() else None
        with psycopg.connect(DATABASE_URL,password=password) as conn:
            try: result=cost_usage_ops.record_event(conn,body.args["event"])
            except ValueError as exc: raise HTTPException(400,str(exc))
        return {"procedure":"record_cost_usage",**result}
    if body.name=="read_cost_usage_summary":
        if body.args:
            raise HTTPException(400,"read_cost_usage_summary takes no arguments")
        password=Path(DB_PASSWORD_FILE).read_text(encoding="utf-8").strip() if Path(DB_PASSWORD_FILE).exists() else None
        with psycopg.connect(DATABASE_URL,password=password) as conn:
            result=cost_usage_ops.read_summary(conn)
        return {"procedure":"read_cost_usage_summary","summary":result}
    if body.name=="mirror_subscriptions":
        if set(body.args)!={"rows"}: raise HTTPException(400,"mirror_subscriptions requires rows")
        password=Path(DB_PASSWORD_FILE).read_text(encoding="utf-8").strip() if Path(DB_PASSWORD_FILE).exists() else None
        with psycopg.connect(DATABASE_URL,password=password,autocommit=True) as conn:
            try: result=subscription_ops.mirror_rows(conn,body.args.get("rows"))
            except ValueError as exc: raise HTTPException(400,str(exc))
            except subscription_ops.SubscriptionConflict as exc: raise HTTPException(409,str(exc))
        return {"procedure":"mirror_subscriptions",**result}
    if body.name=="nova_transition_job":
        expected={"p_job_id","p_expected_version","p_next_state","p_actor_user_id","p_reason"}
        if set(body.args)-expected or not {"p_job_id","p_expected_version","p_next_state","p_actor_user_id"}.issubset(body.args):
            raise HTTPException(400,"nova_transition_job requires job, version, next state, actor, and reason")
        password=Path(DB_PASSWORD_FILE).read_text(encoding="utf-8").strip() if Path(DB_PASSWORD_FILE).exists() else None
        with psycopg.connect(DATABASE_URL,password=password) as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM public.nova_transition_job(%s::uuid,%s::integer,%s::text,%s::uuid,%s::text)",
                [body.args["p_job_id"],body.args["p_expected_version"],body.args["p_next_state"],body.args["p_actor_user_id"],body.args.get("p_reason","")],
            )
            row=cur.fetchone()
            if not row: raise HTTPException(500,"nova_transition_job returned no row")
            names=[d.name for d in cur.description]
            return {"procedure":"nova_transition_job","job":dict(zip(names,row))}

    if body.name=="datanest_approve_memory":
        expected={"_memory_id","_actor_user_id","_governance_decision_id"}
        if set(body.args)!=expected:
            raise HTTPException(400,"datanest_approve_memory requires memory, actor, and governance decision")
        password=Path(DB_PASSWORD_FILE).read_text(encoding="utf-8").strip() if Path(DB_PASSWORD_FILE).exists() else None
        with psycopg.connect(DATABASE_URL,password=password) as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM public.datanest_approve_memory(%s::uuid,%s::uuid,%s::uuid)",
                [body.args["_memory_id"],body.args["_actor_user_id"],body.args["_governance_decision_id"]],
            )
            row=cur.fetchone()
            if not row: raise HTTPException(500,"datanest_approve_memory returned no row")
            names=[d.name for d in cur.description]
            return {"procedure":"datanest_approve_memory","memory":dict(zip(names,row))}

    if body.name=="datanest_supersede_memory":
        expected={"_memory_id","_actor_user_id","_title","_content","_visibility","_protection","_governance_decision_id","_evidence_ids","_metadata"}
        if set(body.args)!=expected:
            raise HTTPException(400,"datanest_supersede_memory requires the complete reviewed argument set")
        password=Path(DB_PASSWORD_FILE).read_text(encoding="utf-8").strip() if Path(DB_PASSWORD_FILE).exists() else None
        with psycopg.connect(DATABASE_URL,password=password) as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM public.datanest_supersede_memory(%s::uuid,%s::uuid,%s::text,%s::text,%s::public.datanest_visibility,%s::public.datanest_protection,%s::uuid,%s::uuid[],%s::jsonb)",
                [body.args["_memory_id"],body.args["_actor_user_id"],body.args["_title"],body.args["_content"],body.args["_visibility"],body.args["_protection"],body.args["_governance_decision_id"],body.args["_evidence_ids"],db_value(body.args["_metadata"])],
            )
            row=cur.fetchone()
            if not row: raise HTTPException(500,"datanest_supersede_memory returned no row")
            names=[d.name for d in cur.description]
            return {"procedure":"datanest_supersede_memory","memory":dict(zip(names,row))}

    if body.name in GOVERNANCE_PROCEDURES:
        password=Path(DB_PASSWORD_FILE).read_text(encoding="utf-8").strip() if Path(DB_PASSWORD_FILE).exists() else None
        try:
            with psycopg.connect(DATABASE_URL,password=password) as conn:
                if body.name=="governance_list_participants": payload={"participants":governance_ops.list_participants(conn)}
                elif body.name=="governance_list_proposals": payload={"proposals":governance_ops.list_proposals(conn)}
                elif body.name=="governance_get_proposal":
                    if set(body.args)!={"proposal_id"}: raise ValueError("invalid_get_proposal_args")
                    payload=governance_ops.get_proposal(conn,body.args["proposal_id"])
                elif body.name=="governance_create_proposal": payload={"proposal":governance_ops.create_proposal(conn,body.args)}
                elif body.name=="governance_submit_proposal": payload={"proposal":governance_ops.submit_proposal(conn,body.args)}
                elif body.name=="governance_add_evidence": payload={"evidence":governance_ops.add_evidence(conn,body.args)}
                elif body.name=="governance_add_review": payload={"review":governance_ops.add_review(conn,body.args)}
                elif body.name=="governance_record_decision": payload={"decision":governance_ops.record_decision(conn,body.args)}
                else: payload={"participant":governance_ops.register_agent(conn,body.args)}
        except governance_ops.GovernanceNotFound as exc: raise HTTPException(404,str(exc))
        except governance_ops.GovernanceForbidden as exc: raise HTTPException(403,str(exc))
        except governance_ops.GovernanceConflict as exc: raise HTTPException(409,str(exc))
        except ValueError as exc: raise HTTPException(400,str(exc))
        return {"procedure":body.name,**payload}
    if body.name in BOOTSTRAP_PROCEDURES:
        args=body.args
        expected={"user_id","token_hash"} if body.name=="cancel_admin_bootstrap_challenge" else {"user_id","verified_email","token_hash"}
        if set(args)!=expected: raise HTTPException(400,"Invalid bootstrap procedure arguments")
        try: user_id=bootstrap_ops.normalize_user_id(args.get("user_id"))
        except ValueError as exc: raise HTTPException(400,str(exc))
        if body.name=="cancel_admin_bootstrap_challenge":
            canonical_local_identity(request,user_id)
        else:
            verified_email=args.get("verified_email")
            if not isinstance(verified_email,str) or not verified_email.strip():
                return {"procedure":body.name,"result":"email_unverified"}
            if not canonical_local_identity(request,user_id,verified_email):
                return {"procedure":body.name,"result":"email_unverified"}
        password=Path(DB_PASSWORD_FILE).read_text(encoding="utf-8").strip() if Path(DB_PASSWORD_FILE).exists() else None
        with psycopg.connect(DATABASE_URL,password=password,autocommit=True) as conn:
            try:
                if body.name=="create_admin_bootstrap_challenge": result=bootstrap_ops.create_challenge(conn,user_id,args.get("token_hash"))
                elif body.name=="cancel_admin_bootstrap_challenge": result=bootstrap_ops.cancel_challenge(conn,user_id,args.get("token_hash"))
                else: result=bootstrap_ops.bootstrap_first_admin(conn,user_id,args.get("token_hash"))
            except ValueError as exc: raise HTTPException(400,str(exc))
        return {"procedure":body.name,"result":result}
    raise HTTPException(500,"Allowlisted procedure has no implementation")

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
    try:
        app_id=cost_usage_ops.normalize_app(body.app)
        operation=cost_usage_ops.normalize_operation(body.operation)
    except ValueError as exc:
        raise HTTPException(400,str(exc))
    payload={"model":body.model or os.getenv("SOVEREIGN_MODEL","qwen3-coder:30b"),"stream":False,"messages":body.messages}
    async with httpx.AsyncClient(timeout=300) as client:
        try: r=await client.post(f"{OLLAMA_URL}/api/chat",json=payload); r.raise_for_status()
        except Exception as exc: raise HTTPException(503,f"Local AI unavailable: {exc}")
    data=r.json()
    usage_event={
        "app":app_id,
        "operation":operation,
        "provider":"ollama-local",
        "model":str(data.get("model") or payload["model"]),
        "provider_api_cost_usd":0,
        "infrastructure_cost_status":"unmeasured",
        "input_units":data.get("prompt_eval_count"),
        "output_units":data.get("eval_count"),
        "unit_kind":"tokens",
        "duration_ms":cost_usage_ops.ns_to_ms(data.get("total_duration")),
        "evidence_source":"ollama_response",
        "external_provider":False,
        "request_id":None,
        "metadata":{
            "load_duration_ms":cost_usage_ops.ns_to_ms(data.get("load_duration")),
            "input_eval_duration_ms":cost_usage_ops.ns_to_ms(data.get("prompt_eval_duration")),
            "eval_duration_ms":cost_usage_ops.ns_to_ms(data.get("eval_duration")),
        },
    }
    usage_receipt=None
    usage_recorded=False
    if psycopg is not None:
        try:
            password=Path(DB_PASSWORD_FILE).read_text(encoding="utf-8").strip() if Path(DB_PASSWORD_FILE).exists() else None
            with psycopg.connect(DATABASE_URL,password=password) as conn:
                usage_receipt=cost_usage_ops.record_event(conn,usage_event)
            usage_recorded=True
        except Exception:
            usage_recorded=False
    return {
        "message":data.get("message"),
        "model":data.get("model"),
        "external_ai_used":False,
        "usage":{
            "app":app_id,
            "operation":operation,
            "provider":"ollama-local",
            "provider_api_cost_usd":0,
            "infrastructure_cost_status":"unmeasured",
            "input_units":usage_event["input_units"],
            "output_units":usage_event["output_units"],
            "unit_kind":"tokens",
            "duration_ms":usage_event["duration_ms"],
        },
        "usage_recorded":usage_recorded,
        "usage_receipt_id":usage_receipt.get("id") if usage_receipt else None,
    }
