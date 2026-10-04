from __future__ import annotations

import uuid
from typing import Any
from urllib.parse import urlparse

PAYFAST_ACTIONS={
    "https://sandbox.payfast.co.za/eng/process": True,
    "https://www.payfast.co.za/eng/process": False,
}


def _uuid(value: Any) -> str:
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        raise ValueError("Invalid checkout user_id")


def _text(value: Any,name: str,max_len: int,required: bool=True) -> str|None:
    if value is None or value == "":
        if required: raise ValueError(f"Invalid {name}")
        return None
    if not isinstance(value,str) or not value.strip() or len(value.strip())>max_len:
        raise ValueError(f"Invalid {name}")
    return value.strip()

def record_launch(conn,row: Any) -> dict[str,Any]:
    if not isinstance(row,dict): raise ValueError("Invalid checkout launch audit")
    expected={"user_id","sku","m_payment_id","amount_cents","currency","action_url","sandbox","source_ip","user_agent","return_to"}
    if set(row)!=expected: raise ValueError("Invalid checkout launch audit fields")
    user_id=_uuid(row["user_id"])
    sku=_text(row["sku"],"sku",80)
    payment_id=_text(row["m_payment_id"],"m_payment_id",300)
    amount=row["amount_cents"]
    if not isinstance(amount,int) or isinstance(amount,bool) or not 1<=amount<=100_000_000:
        raise ValueError("Invalid amount_cents")
    if row["currency"]!="ZAR": raise ValueError("Invalid checkout currency")
    action=_text(row["action_url"],"action_url",500)
    if action not in PAYFAST_ACTIONS: raise ValueError("Invalid PayFast action URL")
    sandbox=row["sandbox"]
    if not isinstance(sandbox,bool) or PAYFAST_ACTIONS[action] is not sandbox:
        raise ValueError("PayFast sandbox/action mismatch")
    source_ip=_text(row["source_ip"],"source_ip",100,False)
    user_agent=_text(row["user_agent"],"user_agent",1000,False)
    return_to=_text(row["return_to"],"return_to",2048,False)
    if return_to:
        parsed=urlparse(return_to)
        if parsed.scheme not in {"http","https"} or not parsed.netloc:
            raise ValueError("Invalid return_to")
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO payfast_launch_logs
            (user_id,sku,m_payment_id,amount_cents,currency,action_url,sandbox,source_ip,user_agent,return_to)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id::text,created_at""",
            [user_id,sku,payment_id,amount,row["currency"],action,sandbox,source_ip,user_agent,return_to],
        )
        result=cur.fetchone()
    return {"id":str(result[0]),"created_at":result[1].isoformat() if hasattr(result[1],"isoformat") else str(result[1])}
