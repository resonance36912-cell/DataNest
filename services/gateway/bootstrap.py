from __future__ import annotations

import re
import uuid
from typing import Any

TOKEN_HASH_RE = re.compile(r"^[0-9a-f]{64}$")


def normalize_user_id(value: Any) -> str:
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError("Valid UUID user_id required") from exc


def valid_token_hash(value: Any) -> bool:
    return isinstance(value, str) and bool(TOKEN_HASH_RE.fullmatch(value))


def _bootstrap_state(cur, user_id: str) -> tuple[bool, bool, str | None]:
    cur.execute("LOCK TABLE admin_bootstrap_state IN EXCLUSIVE MODE")
    cur.execute("LOCK TABLE user_roles IN SHARE ROW EXCLUSIVE MODE")
    cur.execute("SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id=%s AND role='admin')", [user_id])
    caller_is_admin = bool(cur.fetchone()[0])
    cur.execute("SELECT claimed_by FROM admin_bootstrap_state WHERE singleton=TRUE")
    claimed = cur.fetchone()
    if claimed:
        return caller_is_admin, True, str(claimed[0])
    cur.execute("SELECT user_id FROM user_roles WHERE role='admin' ORDER BY created_at,id LIMIT 1")
    existing = cur.fetchone()
    if existing:
        cur.execute("INSERT INTO admin_bootstrap_state (claimed_by) VALUES (%s) ON CONFLICT (singleton) DO NOTHING", [existing[0]])
        return caller_is_admin, True, str(existing[0])
    return caller_is_admin, False, None


def create_challenge(conn, user_id: str, token_hash: str) -> str:
    if not valid_token_hash(token_hash):
        raise ValueError("Invalid bootstrap challenge hash")
    with conn.transaction(), conn.cursor() as cur:
        caller_is_admin, closed, _ = _bootstrap_state(cur, user_id)
        if closed:
            return "already_admin" if caller_is_admin else "closed"
        cur.execute("LOCK TABLE admin_bootstrap_email_challenges IN SHARE ROW EXCLUSIVE MODE")
        cur.execute("DELETE FROM admin_bootstrap_email_challenges WHERE consumed_at IS NULL AND expires_at <= now()")
        cur.execute(
            "SELECT created_at > now() - interval '60 seconds' FROM admin_bootstrap_email_challenges WHERE user_id=%s AND consumed_at IS NULL FOR UPDATE",
            [user_id],
        )
        recent = cur.fetchone()
        if recent and recent[0]:
            return "verification_recently_sent"
        cur.execute("DELETE FROM admin_bootstrap_email_challenges WHERE user_id=%s AND consumed_at IS NULL", [user_id])
        cur.execute("SELECT 1 FROM admin_bootstrap_email_challenges WHERE user_id=%s LIMIT 1", [user_id])
        if cur.fetchone():
            return "closed"
        cur.execute(
            "INSERT INTO admin_bootstrap_email_challenges (user_id,token_hash,created_at,expires_at) VALUES (%s,%s,now(),now()+interval '15 minutes')",
            [user_id, token_hash],
        )
        return "verification_created"


def cancel_challenge(conn, user_id: str, token_hash: str) -> bool:
    if not valid_token_hash(token_hash):
        return False
    with conn.transaction(), conn.cursor() as cur:
        cur.execute(
            "DELETE FROM admin_bootstrap_email_challenges WHERE user_id=%s AND token_hash=%s AND consumed_at IS NULL RETURNING user_id",
            [user_id, token_hash],
        )
        return cur.fetchone() is not None


def bootstrap_first_admin(conn, user_id: str, token_hash: str) -> str:
    if not valid_token_hash(token_hash):
        return "email_reverification_required"
    with conn.transaction(), conn.cursor() as cur:
        caller_is_admin, closed, _ = _bootstrap_state(cur, user_id)
        if closed:
            return "already_admin" if caller_is_admin else "closed"
        cur.execute("LOCK TABLE admin_bootstrap_email_challenges IN SHARE ROW EXCLUSIVE MODE")
        cur.execute(
            "SELECT 1 FROM admin_bootstrap_email_challenges WHERE user_id=%s AND token_hash=%s AND consumed_at IS NULL AND expires_at > now() FOR UPDATE",
            [user_id, token_hash],
        )
        if not cur.fetchone():
            return "email_reverification_required"
        cur.execute(
            "UPDATE admin_bootstrap_email_challenges SET consumed_at=clock_timestamp() WHERE user_id=%s AND token_hash=%s AND consumed_at IS NULL",
            [user_id, token_hash],
        )
        cur.execute("INSERT INTO admin_bootstrap_state (claimed_by) VALUES (%s)", [user_id])
        cur.execute("INSERT INTO user_roles (user_id,role) VALUES (%s,'admin')", [user_id])
        return "bootstrapped"
