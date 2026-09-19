from pathlib import Path

from fastapi.testclient import TestClient

from services.gateway import app as gateway_mod
from services.gateway import checkout_audit


def valid_row():
    return {
        "user_id":"22222222-2222-4222-8222-222222222222",
        "sku":"all_access:creator_pass:monthly",
        "m_payment_id":"22222222-2222-4222-8222-222222222222:all_access:creator_pass:monthly:1",
        "amount_cents":49900,"currency":"ZAR",
        "action_url":"https://www.payfast.co.za/eng/process","sandbox":False,
        "source_ip":None,"user_agent":"pytest","return_to":"https://reson8.life/account/subscriptions",
    }


def test_checkout_audit_schema_is_metadata_only_and_replay_safe():
    sql=Path("apps/rons-hub-backend/008_payfast_launch_audit.sql").read_text(encoding="utf-8")
    assert "CREATE TABLE IF NOT EXISTS public.payfast_launch_logs" in sql
    assert "CREATE INDEX IF NOT EXISTS" in sql
    lowered=sql.lower()
    for secret in ("merchant_key","passphrase","card_number","payment_token"):
        assert f"  {secret} " not in lowered

def test_checkout_audit_table_is_not_generically_accessible():
    response=TestClient(gateway_mod.app).post(
        "/v1/db/query",
        json={"table":"payfast_launch_logs","action":"select","columns":"*"},
    )
    assert response.status_code==403
    assert "Protected table" in response.text


def test_checkout_audit_procedure_requires_key(tmp_path: Path,monkeypatch):
    key=tmp_path / "procedure.key"; key.write_text("p" * 64,encoding="utf-8")
    monkeypatch.setattr(gateway_mod,"PROCEDURE_KEY_FILE",str(key))
    response=TestClient(gateway_mod.app).post(
        "/v1/db/procedure",
        json={"name":"record_payfast_launch","args":{"row":valid_row()}},
    )
    assert response.status_code==401


def test_checkout_audit_validation_fails_before_database_use():
    row=valid_row(); row["user_id"]="not-a-uuid"
    try: checkout_audit.record_launch(object(),row)
    except ValueError as exc: assert "Invalid checkout user_id" in str(exc)
    else: assert False,"invalid user id should fail"

def test_checkout_audit_action_and_sandbox_must_match():
    row=valid_row(); row["sandbox"]=True
    try: checkout_audit.record_launch(object(),row)
    except ValueError as exc: assert "sandbox/action mismatch" in str(exc)
    else: assert False,"mismatched PayFast action should fail"


def test_checkout_contract_and_container_are_governed():
    contract=Path("governance/provider-neutral-api.yaml").read_text(encoding="utf-8")
    compat=Path("apps/rons-hub-backend/open-nova-adapters/supabase-compat.ts").read_text(encoding="utf-8")
    container=Path("services/gateway/Containerfile").read_text(encoding="utf-8")
    assert "record_payfast_launch" in contract and "record_payfast_launch" in compat
    assert "protected_audits:" in contract and "payfast_launch_logs" in contract
    assert "protectedAudits:" in compat and "payfast_launch_logs" in compat
    assert "COPY services/gateway/checkout_audit.py /app/checkout_audit.py" in container
