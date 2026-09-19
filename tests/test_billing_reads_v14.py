from pathlib import Path

from fastapi.testclient import TestClient

from services.gateway import app as gateway_mod
from services.gateway import billing_read


def test_billing_read_models_are_sanitized_and_replay_safe():
    sql=Path("apps/rons-hub-backend/007_billing_reads.sql").read_text(encoding="utf-8")
    for table in ("invoices","credit_wallets","credit_ledger","billing_receipts"):
        assert f"CREATE TABLE IF NOT EXISTS public.{table}" in sql
    assert "raw_payload" not in sql
    assert "payfast_token" not in sql
    assert "CREATE INDEX IF NOT EXISTS" in sql


def test_sensitive_billing_tables_are_blocked_from_generic_query():
    client=TestClient(gateway_mod.app)
    for table in ("invoices","credit_wallets","credit_ledger","billing_receipts"):
        response=client.post("/v1/db/query",json={"table":table,"action":"select","columns":"*"})
        assert response.status_code==403
        assert "Protected table" in response.text


def test_billing_procedures_require_the_key(tmp_path: Path,monkeypatch):
    key=tmp_path / "procedure.key"; key.write_text("p" * 64,encoding="utf-8")
    monkeypatch.setattr(gateway_mod,"PROCEDURE_KEY_FILE",str(key))
    response=TestClient(gateway_mod.app).post("/v1/db/procedure",json={"name":"read_billing_admin","args":{}})
    assert response.status_code==401

def test_billing_helpers_fail_closed_on_bad_user_scope():
    try:
        billing_read.read_account_billing(object(),"not-a-uuid")
        assert False,"invalid billing identity should fail"
    except ValueError as exc:
        assert "Invalid billing user_id" in str(exc)


def test_provider_contract_declares_protected_billing_reads():
    contract=Path("governance/provider-neutral-api.yaml").read_text(encoding="utf-8")
    compat=Path("apps/rons-hub-backend/open-nova-adapters/supabase-compat.ts").read_text(encoding="utf-8")
    assert "protected_reads: [invoices, credit_wallets, credit_ledger, billing_receipts]" in contract
    for name in ("read_account_invoices","read_admin_invoices","read_billing_account","read_billing_admin"):
        assert name in contract
        assert name in compat