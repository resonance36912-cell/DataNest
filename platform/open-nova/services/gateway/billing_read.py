from __future__ import annotations

import uuid
from typing import Any

INVOICE_FIELDS=(
    "id","number","user_id","subscription_id","sku","app","tier","billing_cycle",
    "amount_cents","currency","status","recipient_email","pf_payment_id","m_payment_id",
    "provider","issued_at","refunded_at","pdf_path","metadata","created_at","updated_at",
)
WALLET_FIELDS=("app","balance","currency","updated_at")
RECEIPT_FIELDS=("id","received_at","sku","app","amount_cents","pf_payment_id","payment_status")
LEDGER_FIELDS=("id","user_id","app","delta","balance_after","reason","sku","created_at")


def _uuid(value: Any, name: str) -> str:
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        raise ValueError(f"Invalid {name}")


def _optional_text(value: Any, name: str, max_len: int = 500) -> str | None:
    if value is None or value == "":
        return None
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > max_len:
        raise ValueError(f"Invalid {name}")
    return value.strip()

def _limit(value: Any, maximum: int, default: int) -> int:
    if value is None:
        return default
    if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= maximum:
        raise ValueError(f"limit must be 1..{maximum}")
    return value


def _dict_rows(cur) -> list[dict[str, Any]]:
    rows=cur.fetchall(); names=[d.name for d in cur.description]
    return [dict(zip(names,row)) for row in rows]


def read_account_invoices(conn,user_id: Any,invoice_id: Any=None,pf_payment_id: Any=None,limit: Any=200):
    uid=_uuid(user_id,"invoice user_id")
    iid=_uuid(invoice_id,"invoice id") if invoice_id else None
    pfid=_optional_text(pf_payment_id,"pf_payment_id")
    lim=_limit(limit,500,200)
    if iid and pfid: raise ValueError("Only one invoice lookup key is allowed")
    clauses=["user_id=%s"]; params=[uid]
    if iid: clauses.append("id=%s"); params.append(iid)
    if pfid: clauses.append("pf_payment_id=%s"); params.append(pfid)
    columns=",".join(INVOICE_FIELDS)
    with conn.cursor() as cur:
        cur.execute(f"SELECT {columns} FROM invoices WHERE {' AND '.join(clauses)} ORDER BY issued_at DESC LIMIT %s",params+[lim])
        return _dict_rows(cur)

def read_admin_invoices(conn,status: Any=None,app: Any=None,q: Any=None,invoice_id: Any=None,pf_payment_id: Any=None,limit: Any=500):
    status=_optional_text(status,"invoice status",40)
    app=_optional_text(app,"invoice app",80)
    q=_optional_text(q,"invoice search",200)
    iid=_uuid(invoice_id,"invoice id") if invoice_id else None
    pfid=_optional_text(pf_payment_id,"pf_payment_id")
    lim=_limit(limit,500,500)
    clauses=[]; params=[]
    if status: clauses.append("status=%s"); params.append(status)
    if app: clauses.append("app=%s"); params.append(app)
    if iid: clauses.append("id=%s"); params.append(iid)
    if pfid: clauses.append("pf_payment_id=%s"); params.append(pfid)
    if q:
        like=f"%{q}%"
        clauses.append("(number ILIKE %s OR pf_payment_id ILIKE %s OR recipient_email ILIKE %s)")
        params.extend([like,like,like])
    where=(" WHERE "+" AND ".join(clauses)) if clauses else ""
    columns=",".join(INVOICE_FIELDS)
    with conn.cursor() as cur:
        cur.execute(f"SELECT {columns} FROM invoices{where} ORDER BY issued_at DESC LIMIT %s",params+[lim])
        return _dict_rows(cur)

def read_account_billing(conn,user_id: Any) -> dict[str,list[dict[str,Any]]]:
    uid=_uuid(user_id,"billing user_id")
    with conn.cursor() as cur:
        cur.execute(f"SELECT {','.join(WALLET_FIELDS)} FROM credit_wallets WHERE user_id=%s ORDER BY app ASC",[uid])
        wallets=_dict_rows(cur)
        cur.execute(f"SELECT {','.join(RECEIPT_FIELDS)} FROM billing_receipts WHERE user_id=%s ORDER BY received_at DESC LIMIT 25",[uid])
        receipts=_dict_rows(cur)
    return {"wallets":wallets,"receipts":receipts}


def read_admin_billing(conn) -> dict[str,list[dict[str,Any]]]:
    with conn.cursor() as cur:
        cur.execute("SELECT app,status FROM subscriptions WHERE status='active' ORDER BY app")
        subscriptions=_dict_rows(cur)
        cur.execute("SELECT app,balance FROM credit_wallets ORDER BY app")
        wallets=_dict_rows(cur)
        cur.execute(f"SELECT {','.join(LEDGER_FIELDS)} FROM credit_ledger ORDER BY created_at DESC LIMIT 50")
        ledger=_dict_rows(cur)
    return {"subscriptions":subscriptions,"wallets":wallets,"ledger":ledger}