from __future__ import annotations

import json
import re
import uuid
from typing import Any

PARTICIPANT_KINDS={"human","ai","service"}
PROPOSAL_REVIEWABLE={"submitted","under_review","decision_ready","deferred"}
STANCES={"support","oppose","neutral","abstain"}
OUTCOMES={"approved","declined","deferred"}
EVIDENCE_KINDS={"reference","artifact","hash","note"}
SHA256_RE=re.compile(r"^[A-Fa-f0-9]{64}$")

class GovernanceNotFound(Exception): pass
class GovernanceForbidden(Exception): pass
class GovernanceConflict(Exception): pass

def _uuid(value: Any,name: str) -> str:
    try: return str(uuid.UUID(str(value)))
    except (ValueError,TypeError,AttributeError): raise ValueError(f"invalid_{name}")

def _text(value: Any,name: str,minimum: int,maximum: int) -> str:
    if not isinstance(value,str): raise ValueError(f"invalid_{name}")
    value=value.strip()
    if not minimum<=len(value)<=maximum: raise ValueError(f"invalid_{name}")
    return value

def _optional_text(value: Any,name: str,maximum: int) -> str|None:
    if value is None or value=="": return None
    if not isinstance(value,str): raise ValueError(f"invalid_{name}")
    value=value.strip()
    if not value or len(value)>maximum: raise ValueError(f"invalid_{name}")
    return value

def _metadata(value: Any) -> dict[str,Any]:
    if value is None: return {}
    if not isinstance(value,dict) or len(value)>40: raise ValueError("invalid_metadata")
    return value

def _dict_rows(cur) -> list[dict[str,Any]]:
    rows=cur.fetchall(); names=[d.name for d in cur.description]
    return [dict(zip(names,row)) for row in rows]

def _one(cur) -> dict[str,Any]|None:
    row=cur.fetchone()
    if row is None: return None
    return dict(zip([d.name for d in cur.description],row))

def _event(cur,proposal_id,event_type,actor_user_id,metadata,participant_id=None):
    cur.execute(
        "INSERT INTO governance_events(proposal_id,event_type,actor_user_id,participant_id,metadata) VALUES (%s,%s,%s,%s,%s::jsonb)",
        [proposal_id,event_type,actor_user_id,participant_id,json.dumps(metadata,separators=(",",":"))],
    )

def _require_admin(cur,user_id: str):
    cur.execute("SELECT 1 FROM user_roles WHERE user_id=%s AND role='admin' LIMIT 1",[user_id])
    if cur.fetchone() is None: raise GovernanceForbidden("admin_required")

def list_participants(conn) -> list[dict[str,Any]]:
    with conn.cursor() as cur:
        cur.execute("SELECT id,kind,slug,display_name,role_label,status,metadata,created_at FROM governance_participants ORDER BY created_at ASC LIMIT 200")
        return _dict_rows(cur)

def list_proposals(conn) -> list[dict[str,Any]]:
    with conn.cursor() as cur:
        cur.execute("SELECT id,title,summary,status,version,created_by,submitted_at,decided_at,created_at,updated_at FROM governance_proposals ORDER BY updated_at DESC LIMIT 100")
        return _dict_rows(cur)

def get_proposal(conn,proposal_id: Any) -> dict[str,Any]:
    pid=_uuid(proposal_id,"proposal_id")
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM governance_proposals WHERE id=%s",[pid]); proposal=_one(cur)
        if proposal is None: raise GovernanceNotFound("proposal_not_found")
        cur.execute("SELECT * FROM governance_evidence WHERE proposal_id=%s ORDER BY created_at",[pid]); evidence=_dict_rows(cur)
        cur.execute("""SELECT r.*,p.id AS p_id,p.kind AS p_kind,p.slug AS p_slug,p.display_name AS p_display_name,p.role_label AS p_role_label,p.status AS p_status
                       FROM governance_reviews r JOIN governance_participants p ON p.id=r.participant_id
                       WHERE r.proposal_id=%s ORDER BY r.created_at""",[pid])
        reviews=[]
        for row in _dict_rows(cur):
            participant={"id":row.pop("p_id"),"kind":row.pop("p_kind"),"slug":row.pop("p_slug"),"display_name":row.pop("p_display_name"),"role_label":row.pop("p_role_label"),"status":row.pop("p_status")}
            row["participant"]=participant; reviews.append(row)
        cur.execute("SELECT * FROM governance_decisions WHERE proposal_id=%s",[pid]); decision=_one(cur)
        cur.execute("SELECT * FROM governance_events WHERE proposal_id=%s ORDER BY created_at",[pid]); events=_dict_rows(cur)
    return {"proposal":proposal,"evidence":evidence,"reviews":reviews,"decision":decision,"events":events}

def create_proposal(conn,args: dict[str,Any]) -> dict[str,Any]:
    expected={"actor_user_id","title","summary","body","metadata"}
    if set(args)!=expected: raise ValueError("invalid_create_proposal_args")
    uid=_uuid(args["actor_user_id"],"actor_user_id")
    title=_text(args["title"],"title",3,180); summary=_text(args["summary"],"summary",10,1200); body=_text(args["body"],"body",20,20000); metadata=_metadata(args["metadata"])
    with conn.cursor() as cur:
        cur.execute("INSERT INTO governance_proposals(title,summary,body,metadata,created_by) VALUES (%s,%s,%s,%s::jsonb,%s) RETURNING *",[title,summary,body,json.dumps(metadata),uid]); proposal=_one(cur)
        _event(cur,proposal["id"],"proposal.created",uid,{"version":1})
    return proposal

def submit_proposal(conn,args: dict[str,Any]) -> dict[str,Any]:
    if set(args)!={"proposal_id","actor_user_id","expected_version"}: raise ValueError("invalid_submit_proposal_args")
    pid=_uuid(args["proposal_id"],"proposal_id"); uid=_uuid(args["actor_user_id"],"actor_user_id"); version=args["expected_version"]
    if not isinstance(version,int) or isinstance(version,bool) or version<1: raise ValueError("invalid_expected_version")
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM governance_proposals WHERE id=%s FOR UPDATE",[pid]); proposal=_one(cur)
        if proposal is None: raise GovernanceNotFound("proposal_not_found")
        if str(proposal["created_by"])!=uid: raise GovernanceForbidden("proposal_submit_forbidden")
        if proposal["status"]!="draft": raise GovernanceConflict("proposal_not_draft")
        if proposal["version"]!=version: raise GovernanceConflict("proposal_version_conflict")
        cur.execute("UPDATE governance_proposals SET status='submitted',submitted_at=now(),version=version+1,updated_at=now() WHERE id=%s RETURNING *",[pid]); proposal=_one(cur)
        _event(cur,pid,"proposal.submitted",uid,{"version":proposal["version"]})
    return proposal

def add_evidence(conn,args: dict[str,Any]) -> dict[str,Any]:
    expected={"actor_user_id","proposal_id","label","kind","uri","sha256","summary"}
    if set(args)!=expected: raise ValueError("invalid_add_evidence_args")
    uid=_uuid(args["actor_user_id"],"actor_user_id"); pid=_uuid(args["proposal_id"],"proposal_id")
    label=_text(args["label"],"label",1,180); kind=args["kind"]
    if kind not in EVIDENCE_KINDS: raise ValueError("invalid_evidence_kind")
    uri=_optional_text(args["uri"],"uri",2000); summary=_optional_text(args["summary"],"summary",2000); sha=args["sha256"]
    if sha is not None and (not isinstance(sha,str) or not SHA256_RE.fullmatch(sha)): raise ValueError("invalid_sha256")
    if uri is None and sha is None and summary is None: raise ValueError("evidence_content_required")
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM governance_proposals WHERE id=%s",[pid])
        if cur.fetchone() is None: raise GovernanceNotFound("proposal_not_found")
        cur.execute("INSERT INTO governance_evidence(proposal_id,label,kind,uri,sha256,summary,created_by) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *",[pid,label,kind,uri,sha,summary,uid]); evidence=_one(cur)
        _event(cur,pid,"evidence.added",uid,{"evidence_id":str(evidence["id"]),"kind":kind})
    return evidence

def add_review(conn,args: dict[str,Any]) -> dict[str,Any]:
    expected={"actor_user_id","proposal_id","stance","rationale","confidence","evidence_ids"}
    if set(args)!=expected: raise ValueError("invalid_add_review_args")
    uid=_uuid(args["actor_user_id"],"actor_user_id"); pid=_uuid(args["proposal_id"],"proposal_id")
    stance=args["stance"]
    if stance not in STANCES: raise ValueError("invalid_review_stance")
    rationale=_text(args["rationale"],"rationale",10,8000); confidence=args["confidence"]
    if confidence is not None and (isinstance(confidence,bool) or not isinstance(confidence,(int,float)) or not 0<=float(confidence)<=1): raise ValueError("invalid_confidence")
    raw_ids=args["evidence_ids"]
    if not isinstance(raw_ids,list) or len(raw_ids)>100: raise ValueError("invalid_evidence_ids")
    eids=[uuid.UUID(_uuid(x,"evidence_id")) for x in raw_ids]
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM governance_proposals WHERE id=%s FOR UPDATE",[pid]); proposal=_one(cur)
        if proposal is None: raise GovernanceNotFound("proposal_not_found")
        if proposal["status"] not in PROPOSAL_REVIEWABLE: raise GovernanceConflict("proposal_not_reviewable")
        if eids:
            cur.execute("SELECT id FROM governance_evidence WHERE proposal_id=%s AND id=ANY(%s::uuid[])",[pid,eids])
            if len(cur.fetchall())!=len(set(eids)): raise GovernanceConflict("review_evidence_mismatch")
        slug=f"human-{uid}"
        cur.execute("INSERT INTO governance_participants(kind,user_id,slug,display_name,role_label,created_by) VALUES ('human',%s,%s,%s,'Human reviewer',%s) ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO NOTHING RETURNING *",[uid,slug,f"Human {uid[:8]}",uid]); participant=_one(cur)
        if participant is None:
            cur.execute("SELECT * FROM governance_participants WHERE user_id=%s",[uid]); participant=_one(cur)
        cur.execute("INSERT INTO governance_reviews(proposal_id,participant_id,stance,rationale,confidence,evidence_ids,created_by) VALUES (%s,%s,%s,%s,%s,%s::uuid[],%s) RETURNING *",[pid,participant["id"],stance,rationale,confidence,eids,uid]); review=_one(cur)
        if proposal["status"] in {"submitted","deferred"}:
            cur.execute("UPDATE governance_proposals SET status='under_review',version=version+1,updated_at=now() WHERE id=%s",[pid])
        _event(cur,pid,"review.added",uid,{"review_id":str(review["id"]),"stance":stance},participant["id"])
    return review

def record_decision(conn,args: dict[str,Any]) -> dict[str,Any]:
    expected={"proposal_id","actor_user_id","expected_version","outcome","rationale"}
    if set(args)!=expected: raise ValueError("invalid_record_decision_args")
    pid=_uuid(args["proposal_id"],"proposal_id"); uid=_uuid(args["actor_user_id"],"actor_user_id"); version=args["expected_version"]; outcome=args["outcome"]
    if not isinstance(version,int) or isinstance(version,bool) or version<1: raise ValueError("invalid_expected_version")
    if outcome not in OUTCOMES: raise ValueError("invalid_decision_outcome")
    rationale=_text(args["rationale"],"rationale",10,10000)
    with conn.cursor() as cur:
        _require_admin(cur,uid)
        cur.execute("SELECT * FROM governance_proposals WHERE id=%s FOR UPDATE",[pid]); proposal=_one(cur)
        if proposal is None: raise GovernanceNotFound("proposal_not_found")
        if proposal["version"]!=version: raise GovernanceConflict("proposal_version_conflict")
        if proposal["status"] not in PROPOSAL_REVIEWABLE: raise GovernanceConflict("proposal_not_decidable")
        cur.execute("SELECT 1 FROM governance_decisions WHERE proposal_id=%s",[pid])
        if cur.fetchone() is not None: raise GovernanceConflict("proposal_already_decided")
        cur.execute("INSERT INTO governance_decisions(proposal_id,outcome,rationale,decided_by) VALUES (%s,%s,%s,%s) RETURNING *",[pid,outcome,rationale,uid]); decision=_one(cur)
        cur.execute("UPDATE governance_proposals SET status=%s,decided_at=now(),version=version+1,updated_at=now() WHERE id=%s",[outcome,pid])
        _event(cur,pid,"proposal.decided",uid,{"outcome":outcome,"decision_id":str(decision["id"])})
    return decision

def register_agent(conn,args: dict[str,Any]) -> dict[str,Any]:
    expected={"actor_user_id","kind","slug","display_name","role_label","metadata"}
    if set(args)!=expected: raise ValueError("invalid_register_agent_args")
    uid=_uuid(args["actor_user_id"],"actor_user_id"); kind=args["kind"]
    if kind not in PARTICIPANT_KINDS or kind=="human": raise ValueError("human_participant_requires_authenticated_identity")
    slug=_text(args["slug"],"slug",2,80); display=_text(args["display_name"],"display_name",2,120); role=_text(args["role_label"],"role_label",2,160); metadata=_metadata(args["metadata"])
    with conn.cursor() as cur:
        _require_admin(cur,uid)
        try:
            cur.execute("INSERT INTO governance_participants(kind,user_id,slug,display_name,role_label,metadata,created_by) VALUES (%s,NULL,%s,%s,%s,%s::jsonb,%s) RETURNING *",[kind,slug,display,role,json.dumps(metadata),uid]); participant=_one(cur)
        except Exception as exc:
            if 'unique' in str(exc).lower() or 'duplicate' in str(exc).lower(): raise GovernanceConflict("participant_slug_conflict") from exc
            raise
        _event(cur,None,"participant.registered",uid,{"kind":kind,"slug":slug},participant["id"])
    return participant
