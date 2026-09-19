from __future__ import annotations

import uuid
from typing import Any

APPS={"epublisher","creative_studio","sync_vision","youtube_optimizer","all_access"}
TIERS={"free","starter","creator","pro","business","all_access","creator_pass","studio_pass","business_pass"}
STATUSES={"pending","active","past_due","cancelled"}
FIELDS=("id","user_id","app","tier","status","payfast_token","payfast_payment_id","amount_cents","currency","billing_cycle","current_period_end","cancelled_at","created_at","updated_at","superseded_by","superseded_at")
ACCOUNT_FIELDS=("id","app","tier","status","billing_cycle","amount_cents","currency","current_period_end","cancelled_at","updated_at")

class SubscriptionConflict(Exception):
    pass

def _uuid(value:Any,name:str,nullable:bool=False):
    if nullable and (value is None or value==""): return None
    try: return str(uuid.UUID(str(value)))
    except (ValueError,TypeError,AttributeError): raise ValueError(f"Invalid {name}")

def _text(value:Any,name:str,nullable:bool=False):
    if nullable and (value is None or value==""): return None
    if not isinstance(value,str) or not value.strip(): raise ValueError(f"Invalid {name}")
    return value.strip()

def normalize_row(row:Any) -> dict[str,Any]:
    if not isinstance(row,dict) or set(row)!=set(FIELDS): raise ValueError("Invalid subscription row")
    app=_text(row["app"],"subscription app"); tier=_text(row["tier"],"subscription tier"); status=_text(row["status"],"subscription status")
    if app not in APPS or tier not in TIERS or status not in STATUSES: raise ValueError("Unsupported subscription enum value")
    amount=row["amount_cents"]
    if not isinstance(amount,int) or isinstance(amount,bool) or amount<0: raise ValueError("Invalid amount_cents")
    return {
        "id":_uuid(row["id"],"subscription id"),
        "user_id":_uuid(row["user_id"],"subscription user_id"),
        "app":app,"tier":tier,"status":status,
        "payfast_token":_text(row["payfast_token"],"payfast_token",True),
        "payfast_payment_id":_text(row["payfast_payment_id"],"payfast_payment_id",True),
        "amount_cents":amount,
        "currency":_text(row["currency"],"currency"),
        "billing_cycle":_text(row["billing_cycle"],"billing_cycle"),
        "current_period_end":_text(row["current_period_end"],"current_period_end",True),
        "cancelled_at":_text(row["cancelled_at"],"cancelled_at",True),
        "created_at":_text(row["created_at"],"created_at"),
        "updated_at":_text(row["updated_at"],"updated_at"),
        "superseded_by":_uuid(row["superseded_by"],"superseded_by",True),
        "superseded_at":_text(row["superseded_at"],"superseded_at",True),
    }

def normalize_rows(rows:Any) -> list[dict[str,Any]]:
    if not isinstance(rows,list): raise ValueError("mirror_subscriptions requires rows")
    if len(rows)>10000: raise ValueError("Too many subscription rows")
    clean=[]; seen=set()
    for raw in rows:
        row=normalize_row(raw); key=(row["user_id"],row["app"])
        if key in seen: raise ValueError("Duplicate subscription row")
        seen.add(key); clean.append(row)
    return clean
def read_rows(conn) -> list[dict[str,Any]]:
    columns=",".join(FIELDS)
    with conn.cursor() as cur:
        cur.execute(f"SELECT {columns} FROM subscriptions ORDER BY created_at,id LIMIT 10000")
        rows=cur.fetchall(); names=[d.name for d in cur.description]
    return [dict(zip(names,row)) for row in rows]

def read_account_rows(conn,user_id:Any) -> list[dict[str,Any]]:
    uid=_uuid(user_id,"subscription user_id")
    columns=",".join(ACCOUNT_FIELDS)
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT {columns} FROM subscriptions WHERE user_id=%s ORDER BY updated_at DESC,id LIMIT 200",
            [uid],
        )
        rows=cur.fetchall(); names=[d.name for d in cur.description]
    return [dict(zip(names,row)) for row in rows]

def mirror_rows(conn,rows:Any) -> dict[str,int]:
    clean=normalize_rows(rows); inserted=updated=0
    with conn.transaction(), conn.cursor() as cur:
        cur.execute("LOCK TABLE subscriptions IN SHARE ROW EXCLUSIVE MODE")
        for row in clean:
            cur.execute("SELECT id::text FROM subscriptions WHERE user_id=%s AND app=%s FOR UPDATE",[row["user_id"],row["app"]])
            existing=cur.fetchone()
            if existing and str(existing[0])!=row["id"]: raise SubscriptionConflict("Subscription identity conflict")
            core=[row[k] for k in FIELDS if k not in {"superseded_by","superseded_at"}]
            if existing:
                cur.execute("UPDATE subscriptions SET tier=%s,status=%s,payfast_token=%s,payfast_payment_id=%s,amount_cents=%s,currency=%s,billing_cycle=%s,current_period_end=%s,cancelled_at=%s,created_at=%s,updated_at=%s,superseded_by=NULL,superseded_at=NULL WHERE id=%s",core[3:14]+[row["id"]])
                updated+=1
            else:
                cur.execute("INSERT INTO subscriptions(id,user_id,app,tier,status,payfast_token,payfast_payment_id,amount_cents,currency,billing_cycle,current_period_end,cancelled_at,created_at,updated_at,superseded_by,superseded_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL,NULL)",core)
                inserted+=1
        for row in clean:
            cur.execute("UPDATE subscriptions SET superseded_by=%s,superseded_at=%s WHERE id=%s",[row["superseded_by"],row["superseded_at"],row["id"]])
    return {"inserted":inserted,"updated":updated,"deleted":0}
