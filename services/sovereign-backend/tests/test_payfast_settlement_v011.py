from pathlib import Path

from fastapi.testclient import TestClient

from services.gateway import app as gateway_mod
from services.gateway import payfast_settlement


def valid_event():
    return {
        "event_id":"PF-TEST-001",
        "payload_hash":"a"*64,
        "sku":"all_access:creator_pass:monthly",
        "user_id":"22222222-2222-4222-8222-222222222222",
        "app":"all_access",
        "tier":"creator_pass",
        "amount_cents":49900,
        "currency":"ZAR",
        "billing_cycle":"monthly",
        "payment_status":"COMPLETE",
        "pf_payment_id":"PF-TEST-001",
        "m_payment_id":"m-test-001",
        "payfast_token":"token-test",
        "recipient_email":"QA@STAGING.INVALID",
        "source_ip":"127.0.0.1",
    }


def valid_attempt():
    return {
        "signature_valid":False,
        "server_validated":False,
        "outcome":"invalid_signature",
        "http_status":400,
        "sku":"all_access:creator_pass:monthly",
        "user_id":"not-a-uuid",
        "amount_cents":49900,
        "payment_status":"COMPLETE",
        "pf_payment_id":"PF-TEST-001",
        "source_ip":"127.0.0.1",
        "payload_hash":"b"*64,
        "error_message":"Signature mismatch",
    }


def test_itn_migration_is_sanitized_and_idempotent():
    sql=Path("apps/rons-hub-backend/010_payfast_itn_settlement.sql").read_text(encoding="utf-8")
    for table in (
        "payfast_itn_logs","webhook_events","plan_changes",
        "subscription_email_sends","email_suppression_list",
    ):
        assert f"CREATE TABLE IF NOT EXISTS public.{table}" in sql
    assert "webhook_events_provider_event_unique" in sql
    assert "'refund'" in sql
    lowered=sql.lower()
    assert "raw_payload" not in lowered
    for secret_column in ("merchant_key","passphrase","card_number","cvv"):
        assert f"  {secret_column} " not in lowered


def test_itn_tables_are_blocked_from_generic_query():
    client=TestClient(gateway_mod.app)
    for table in (
        "payfast_itn_logs","webhook_events","plan_changes",
        "subscription_email_sends","email_suppression_list",
    ):
        response=client.post("/v1/db/query",json={"table":table,"action":"select","columns":"*"})
        assert response.status_code==403
        assert "Protected table" in response.text


def test_itn_procedures_require_procedure_key(tmp_path: Path,monkeypatch):
    key=tmp_path / "procedure.key"
    key.write_text("p"*64,encoding="utf-8")
    monkeypatch.setattr(gateway_mod,"PROCEDURE_KEY_FILE",str(key))
    client=TestClient(gateway_mod.app)
    for name,args in (
        ("record_payfast_itn_attempt",{"row":valid_attempt()}),
        ("settle_payfast_itn",{"event":valid_event()}),
    ):
        response=client.post("/v1/db/procedure",json={"name":name,"args":args})
        assert response.status_code==401


def test_event_normalization_is_strict_and_sanitized():
    event=valid_event()
    clean=payfast_settlement.normalize_event(event)
    assert clean["recipient_email"]=="qa@staging.invalid"
    assert clean["payload_hash"]=="a"*64
    assert clean["amount_cents"]==49900

    event=valid_event()
    event["raw_payload"]={"forbidden":True}
    try:
        payfast_settlement.normalize_event(event)
    except ValueError as exc:
        assert "settlement fields" in str(exc)
    else:
        assert False,"raw payload field should be rejected"

    event=valid_event()
    event["payload_hash"]="not-a-hash"
    try:
        payfast_settlement.normalize_event(event)
    except ValueError as exc:
        assert "payload_hash" in str(exc)
    else:
        assert False,"invalid payload hash should be rejected"

    event=valid_event()
    event["amount_cents"]=0
    try:
        payfast_settlement.normalize_event(event)
    except ValueError as exc:
        assert "amount_cents" in str(exc)
    else:
        assert False,"zero-value settlement should be rejected"


def test_attempt_logging_tolerates_invalid_user_identifier_without_raw_payload():
    row=valid_attempt()
    clean=payfast_settlement.normalize_attempt(row)
    assert clean["user_id"] is None
    assert clean["signature_valid"] is False
    assert clean["server_validated"] is False
    assert set(clean)=={
        "signature_valid","server_validated","outcome","http_status","sku","user_id",
        "amount_cents","payment_status","pf_payment_id","source_ip","payload_hash","error_message",
    }


def test_payment_status_mapping_matches_existing_itn_contract():
    assert payfast_settlement.next_subscription_status("COMPLETE")==("active",False)
    assert payfast_settlement.next_subscription_status("CANCELLED")==("cancelled",False)
    assert payfast_settlement.next_subscription_status("REFUND")==("cancelled",True)
    assert payfast_settlement.next_subscription_status("REFUNDED")==("cancelled",True)
    assert payfast_settlement.next_subscription_status("FAILED")==("past_due",False)
    assert payfast_settlement.next_subscription_status("PROCESSING")==("pending",False)


def test_plan_change_classification_is_deterministic():
    assert payfast_settlement.classify_change(None,"creator","active",False)=="initial"
    assert payfast_settlement.classify_change({"tier":"starter","status":"active"},"creator","active",False)=="upgrade"
    assert payfast_settlement.classify_change({"tier":"business","status":"active"},"creator","active",False)=="downgrade"
    assert payfast_settlement.classify_change({"tier":"creator","status":"active"},"creator","active",False)=="sidegrade"
    assert payfast_settlement.classify_change({"tier":"creator","status":"active"},"creator","cancelled",False)=="cancel"
    assert payfast_settlement.classify_change({"tier":"creator","status":"active"},"creator","cancelled",True)=="refund"


def test_provider_contract_and_container_expose_only_named_itn_procedures():
    contract=Path("governance/provider-neutral-api.yaml").read_text(encoding="utf-8")
    compat=Path("apps/rons-hub-backend/open-nova-adapters/supabase-compat.ts").read_text(encoding="utf-8")
    container=Path("services/gateway/Containerfile").read_text(encoding="utf-8")
    app=Path("services/gateway/app.py").read_text(encoding="utf-8")
    for name in ("record_payfast_itn_attempt","settle_payfast_itn"):
        assert name in contract
        assert name in compat
        assert name in app
    assert "payfast_itn_logs" in contract and "webhook_events" in contract
    assert "payfast_itn_logs" in compat and "webhook_events" in compat
    assert "COPY services/gateway/payfast_settlement.py /app/payfast_settlement.py" in container
    assert 'version="0.12.0"' in app

def test_canonical_deploy_targets_gateway_v012():
    compose=Path("deploy/compose.backend.yml").read_text(encoding="utf-8")
    assert "image: resonance-service-gateway:0.12" in compose
    assert "image: resonance-service-gateway:0.11" not in compose
    assert "image: resonance-service-gateway:0.10" not in compose
