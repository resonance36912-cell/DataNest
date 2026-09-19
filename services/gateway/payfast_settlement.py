from __future__ import annotations

import calendar
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any

APPS={"epublisher","creative_studio","sync_vision","youtube_optimizer","all_access"}
TIERS={"free","starter","creator","pro","business","all_access","creator_pass","studio_pass","business_pass"}
TIER_RANK={
    "free":0,"starter":1,"creator":2,"creator_pass":3,"pro":4,
    "studio_pass":5,"business":6,"business_pass":6,"all_access":7,
}
HASH_RE=re.compile(r"^[0-9a-fA-F]{64}$")
STATUS_RE=re.compile(r"^[A-Z_]{1,40}$")

ATTEMPT_FIELDS={
    "signature_valid","server_validated","outcome","http_status","sku","user_id",
    "amount_cents","payment_status","pf_payment_id","source_ip","payload_hash","error_message",
}
SETTLEMENT_FIELDS={
    "event_id","payload_hash","sku","user_id","app","tier","amount_cents","currency",
    "billing_cycle","payment_status","pf_payment_id","m_payment_id","payfast_token",
    "recipient_email","source_ip",
}


def _uuid(value: Any,name: str) -> str:
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError,TypeError,AttributeError):
        raise ValueError(f"Invalid {name}")


def _optional_uuid(value: Any) -> str|None:
    if value is None or value=="":
        return None
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError,TypeError,AttributeError):
        return None


def _text(value: Any,name: str,max_len: int,nullable: bool=False) -> str|None:
    if value is None or value=="":
        if nullable:
            return None
        raise ValueError(f"Invalid {name}")
    if not isinstance(value,str):
        raise ValueError(f"Invalid {name}")
    clean=value.strip()
    if not clean or len(clean)>max_len:
        raise ValueError(f"Invalid {name}")
    return clean


def _payload_hash(value: Any) -> str:
    if not isinstance(value,str) or not HASH_RE.fullmatch(value):
        raise ValueError("Invalid payload_hash")
    return value.lower()


def _email(value: Any) -> str|None:
    text=_text(value,"recipient_email",320,True)
    if text is None:
        return None
    lowered=text.lower()
    if "@" not in lowered or lowered.startswith("@") or lowered.endswith("@"):
        raise ValueError("Invalid recipient_email")
    return lowered


def normalize_attempt(row: Any) -> dict[str,Any]:
    if not isinstance(row,dict) or set(row)!=ATTEMPT_FIELDS:
        raise ValueError("Invalid PayFast ITN audit fields")
    signature=row["signature_valid"]; server=row["server_validated"]
    if not isinstance(signature,bool) or not isinstance(server,bool):
        raise ValueError("Invalid PayFast validation flags")
    status=row["http_status"]
    if not isinstance(status,int) or isinstance(status,bool) or not 100<=status<=599:
        raise ValueError("Invalid http_status")
    amount=row["amount_cents"]
    if amount is not None and (not isinstance(amount,int) or isinstance(amount,bool) or not 0<=amount<=100_000_000):
        raise ValueError("Invalid amount_cents")
    payment=_text(row["payment_status"],"payment_status",40,True)
    if payment is not None:
        payment=payment.upper()
        if not STATUS_RE.fullmatch(payment):
            raise ValueError("Invalid payment_status")
    return {
        "signature_valid":signature,
        "server_validated":server,
        "outcome":_text(row["outcome"],"outcome",80),
        "http_status":status,
        "sku":_text(row["sku"],"sku",120,True),
        "user_id":_optional_uuid(row["user_id"]),
        "amount_cents":amount,
        "payment_status":payment,
        "pf_payment_id":_text(row["pf_payment_id"],"pf_payment_id",500,True),
        "source_ip":_text(row["source_ip"],"source_ip",100,True),
        "payload_hash":_payload_hash(row["payload_hash"]),
        "error_message":_text(row["error_message"],"error_message",1000,True),
    }


def normalize_event(event: Any) -> dict[str,Any]:
    if not isinstance(event,dict) or set(event)!=SETTLEMENT_FIELDS:
        raise ValueError("Invalid PayFast settlement fields")
    app=_text(event["app"],"app",80)
    tier=_text(event["tier"],"tier",80)
    if app not in APPS:
        raise ValueError("Unsupported subscription app")
    if tier not in TIERS:
        raise ValueError("Unsupported subscription tier")
    amount=event["amount_cents"]
    if not isinstance(amount,int) or isinstance(amount,bool) or not 1<=amount<=100_000_000:
        raise ValueError("Invalid amount_cents")
    if event["currency"]!="ZAR":
        raise ValueError("Invalid settlement currency")
    if event["billing_cycle"]!="monthly":
        raise ValueError("Invalid billing_cycle")
    payment=_text(event["payment_status"],"payment_status",40).upper()
    if not STATUS_RE.fullmatch(payment):
        raise ValueError("Invalid payment_status")
    return {
        "event_id":_text(event["event_id"],"event_id",500),
        "payload_hash":_payload_hash(event["payload_hash"]),
        "sku":_text(event["sku"],"sku",120),
        "user_id":_uuid(event["user_id"],"settlement user_id"),
        "app":app,
        "tier":tier,
        "amount_cents":amount,
        "currency":"ZAR",
        "billing_cycle":"monthly",
        "payment_status":payment,
        "pf_payment_id":_text(event["pf_payment_id"],"pf_payment_id",500,True),
        "m_payment_id":_text(event["m_payment_id"],"m_payment_id",500,True),
        "payfast_token":_text(event["payfast_token"],"payfast_token",1000,True),
        "recipient_email":_email(event["recipient_email"]),
        "source_ip":_text(event["source_ip"],"source_ip",100,True),
    }


def next_subscription_status(payment_status: str) -> tuple[str,bool]:
    is_refund=payment_status in {"REFUND","REFUNDED"}
    if payment_status=="COMPLETE":
        return "active",False
    if payment_status=="CANCELLED" or is_refund:
        return "cancelled",is_refund
    if payment_status=="FAILED":
        return "past_due",False
    return "pending",False


def classify_change(prior: dict[str,Any]|None,new_tier: str,next_status: str,is_refund: bool) -> str:
    if is_refund:
        return "refund"
    if next_status=="cancelled":
        return "cancel"
    if not prior or prior.get("status")!="active":
        return "initial"
    prior_tier=str(prior.get("tier") or "free")
    if prior_tier==new_tier:
        return "sidegrade"
    before=TIER_RANK.get(prior_tier,0); after=TIER_RANK.get(new_tier,0)
    if after>before:
        return "upgrade"
    if after<before:
        return "downgrade"
    return "sidegrade"


def _next_month(value: datetime) -> datetime:
    year=value.year + (1 if value.month==12 else 0)
    month=1 if value.month==12 else value.month+1
    day=min(value.day,calendar.monthrange(year,month)[1])
    return value.replace(year=year,month=month,day=day)


def _json(value: Any) -> str:
    return json.dumps(value,separators=(",",":"),sort_keys=True)


def _insert_attempt(cur,row: dict[str,Any]):
    cur.execute(
        """INSERT INTO payfast_itn_logs
        (signature_valid,server_validated,outcome,http_status,sku,user_id,amount_cents,
         payment_status,pf_payment_id,source_ip,payload_hash,error_message,metadata)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
        RETURNING id::text,received_at""",
        [
            row["signature_valid"],row["server_validated"],row["outcome"],row["http_status"],
            row["sku"],row["user_id"],row["amount_cents"],row["payment_status"],
            row["pf_payment_id"],row["source_ip"],row["payload_hash"],row["error_message"],
            _json({}),
        ],
    )
    return cur.fetchone()


def record_attempt(conn,row: Any) -> dict[str,Any]:
    clean=normalize_attempt(row)
    with conn.cursor() as cur:
        result=_insert_attempt(cur,clean)
    return {
        "id":str(result[0]),
        "received_at":result[1].isoformat() if hasattr(result[1],"isoformat") else str(result[1]),
    }


def settle(conn,event: Any) -> dict[str,Any]:
    clean=normalize_event(event)
    now=datetime.now(timezone.utc)
    next_status,is_refund=next_subscription_status(clean["payment_status"])
    period_end=_next_month(now) if next_status=="active" else None
    metadata={
        "sku":clean["sku"],
        "user_id":clean["user_id"],
        "payment_status":clean["payment_status"],
        "m_payment_id":clean["m_payment_id"],
    }

    with conn.transaction(), conn.cursor() as cur:
        cur.execute(
            """INSERT INTO webhook_events(provider,event_id,payload_hash,metadata)
            VALUES ('payfast',%s,%s,%s::jsonb)
            ON CONFLICT(provider,event_id) DO NOTHING
            RETURNING id::text""",
            [clean["event_id"],clean["payload_hash"],_json(metadata)],
        )
        claimed=cur.fetchone()
        if not claimed:
            cur.execute(
                """SELECT http_status,response_body,outcome
                FROM webhook_events WHERE provider='payfast' AND event_id=%s""",
                [clean["event_id"]],
            )
            prior_event=cur.fetchone()
            prior_status=int(prior_event[0]) if prior_event and prior_event[0] is not None else 200
            prior_body=str(prior_event[1]) if prior_event and prior_event[1] is not None else "ok"
            prior_outcome=str(prior_event[2]) if prior_event and prior_event[2] is not None else "unknown"
            _insert_attempt(cur,{
                "signature_valid":True,"server_validated":True,
                "outcome":"duplicate_webhook","http_status":prior_status,
                "sku":clean["sku"],"user_id":clean["user_id"],
                "amount_cents":clean["amount_cents"],"payment_status":clean["payment_status"],
                "pf_payment_id":clean["pf_payment_id"],"source_ip":clean["source_ip"],
                "payload_hash":clean["payload_hash"],
                "error_message":f"Replay of {clean['event_id']}; prior outcome={prior_outcome}",
            })
            return {
                "duplicate":True,"outcome":prior_outcome,
                "http_status":prior_status,"response_body":prior_body,
                "subscription_id":None,
            }

        webhook_id=str(claimed[0])

        cur.execute(
            """SELECT id::text,app,tier,status
            FROM subscriptions WHERE user_id=%s AND app=%s FOR UPDATE""",
            [clean["user_id"],clean["app"]],
        )
        prior_raw=cur.fetchone()
        prior=None
        if prior_raw:
            prior={"id":str(prior_raw[0]),"app":str(prior_raw[1]),"tier":str(prior_raw[2]),"status":str(prior_raw[3])}

        cur.execute(
            """INSERT INTO subscriptions
            (user_id,app,tier,status,payfast_token,payfast_payment_id,amount_cents,currency,
             billing_cycle,current_period_end,cancelled_at,updated_at,superseded_by,superseded_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL,NULL)
            ON CONFLICT(user_id,app) DO UPDATE SET
              tier=EXCLUDED.tier,status=EXCLUDED.status,payfast_token=EXCLUDED.payfast_token,
              payfast_payment_id=EXCLUDED.payfast_payment_id,amount_cents=EXCLUDED.amount_cents,
              currency=EXCLUDED.currency,billing_cycle=EXCLUDED.billing_cycle,
              current_period_end=EXCLUDED.current_period_end,cancelled_at=EXCLUDED.cancelled_at,
              updated_at=EXCLUDED.updated_at,superseded_by=NULL,superseded_at=NULL
            RETURNING id::text""",
            [
                clean["user_id"],clean["app"],clean["tier"],next_status,clean["payfast_token"],
                clean["pf_payment_id"],clean["amount_cents"],clean["currency"],clean["billing_cycle"],
                period_end,now if next_status=="cancelled" else None,now,
            ],
        )
        new_sub_id=str(cur.fetchone()[0])

        if next_status in {"active","cancelled"}:
            change_type=classify_change(prior,clean["tier"],next_status,is_refund)
            cur.execute(
                """INSERT INTO plan_changes
                (user_id,from_sub_id,to_sub_id,from_app,from_tier,to_app,to_tier,change_type,reason,pf_payment_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                [
                    clean["user_id"],prior["id"] if prior else None,new_sub_id,
                    prior["app"] if prior else None,prior["tier"] if prior else None,
                    clean["app"],clean["tier"],change_type,
                    f"payfast_itn:{clean['payment_status']}",clean["pf_payment_id"],
                ],
            )

        if next_status=="active" and clean["app"]=="all_access":
            cur.execute(
                """UPDATE subscriptions SET
                  status='cancelled',cancelled_at=%s,superseded_by=%s,superseded_at=%s,updated_at=%s
                WHERE user_id=%s AND status='active' AND app<>'all_access'
                RETURNING id::text,app,tier""",
                [now,new_sub_id,now,now,clean["user_id"]],
            )
            for row in cur.fetchall():
                cur.execute(
                    """INSERT INTO plan_changes
                    (user_id,from_sub_id,to_sub_id,from_app,from_tier,to_app,to_tier,
                     change_type,reason,pf_payment_id)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,'supersede',%s,%s)""",
                    [
                        clean["user_id"],str(row[0]),new_sub_id,str(row[1]),str(row[2]),
                        clean["app"],clean["tier"],f"superseded_by_bundle:{clean['tier']}",
                        clean["pf_payment_id"],
                    ],
                )

        if clean["pf_payment_id"] and (clean["payment_status"]=="COMPLETE" or is_refund):
            invoice_status="refunded" if is_refund else "paid"
            invoice_number=f"INV-{clean['pf_payment_id']}"
            cur.execute(
                """INSERT INTO invoices
                (user_id,subscription_id,number,sku,app,tier,billing_cycle,amount_cents,currency,
                 status,recipient_email,pf_payment_id,m_payment_id,provider,issued_at,refunded_at,metadata,updated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'payfast',%s,%s,%s::jsonb,%s)
                ON CONFLICT(provider,pf_payment_id) DO UPDATE SET
                  subscription_id=EXCLUDED.subscription_id,sku=EXCLUDED.sku,app=EXCLUDED.app,
                  tier=EXCLUDED.tier,billing_cycle=EXCLUDED.billing_cycle,
                  amount_cents=EXCLUDED.amount_cents,currency=EXCLUDED.currency,status=EXCLUDED.status,
                  recipient_email=COALESCE(EXCLUDED.recipient_email,invoices.recipient_email),
                  m_payment_id=EXCLUDED.m_payment_id,refunded_at=EXCLUDED.refunded_at,
                  metadata=EXCLUDED.metadata,updated_at=EXCLUDED.updated_at""",
                [
                    clean["user_id"],new_sub_id,invoice_number,clean["sku"],clean["app"],clean["tier"],
                    clean["billing_cycle"],clean["amount_cents"],clean["currency"],invoice_status,
                    clean["recipient_email"],clean["pf_payment_id"],clean["m_payment_id"],
                    now,now if is_refund else None,
                    _json({"payment_status":clean["payment_status"],"source":"payfast_itn"}),now,
                ],
            )
            cur.execute(
                """INSERT INTO billing_receipts
                (id,user_id,received_at,sku,app,amount_cents,pf_payment_id,payment_status)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT(id) DO UPDATE SET
                  received_at=EXCLUDED.received_at,amount_cents=EXCLUDED.amount_cents,
                  payment_status=EXCLUDED.payment_status""",
                [
                    webhook_id,clean["user_id"],now,clean["sku"],clean["app"],
                    clean["amount_cents"],clean["pf_payment_id"],clean["payment_status"],
                ],
            )

        if next_status=="active" and clean["pf_payment_id"] and clean["recipient_email"]:
            cur.execute(
                "SELECT reason FROM email_suppression_list WHERE lower(email)=lower(%s) LIMIT 1",
                [clean["recipient_email"]],
            )
            suppression=cur.fetchone()
            email_status="suppressed" if suppression else "queued"
            skipped=f"suppressed:{suppression[0]}" if suppression else None
            cur.execute(
                """INSERT INTO subscription_email_sends
                (pf_payment_id,user_id,recipient_email,sku,app,tier,amount_cents,status,skipped_reason)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT(pf_payment_id) DO NOTHING""",
                [
                    clean["pf_payment_id"],clean["user_id"],clean["recipient_email"],clean["sku"],
                    clean["app"],clean["tier"],clean["amount_cents"],email_status,skipped,
                ],
            )

        outcome="subscription_refunded" if is_refund else f"subscription_{next_status}"
        cur.execute(
            """UPDATE webhook_events SET processed_at=%s,outcome=%s,http_status=200,response_body='ok'
            WHERE id=%s""",
            [now,outcome,webhook_id],
        )
        _insert_attempt(cur,{
            "signature_valid":True,"server_validated":True,
            "outcome":outcome,"http_status":200,
            "sku":clean["sku"],"user_id":clean["user_id"],
            "amount_cents":clean["amount_cents"],"payment_status":clean["payment_status"],
            "pf_payment_id":clean["pf_payment_id"],"source_ip":clean["source_ip"],
            "payload_hash":clean["payload_hash"],"error_message":None,
        })

    return {
        "duplicate":False,"outcome":outcome,"http_status":200,
        "response_body":"ok","subscription_id":new_sub_id,
    }
