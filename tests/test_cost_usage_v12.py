from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import pytest

from services.gateway import cost_usage


def valid_event(**overrides):
    event = {
        "app": "youtube_optimizer",
        "operation": "channel_audit_ai",
        "provider": "ollama-local",
        "model": "qwen3-coder:30b",
        "provider_api_cost_usd": 0,
        "infrastructure_cost_status": "unmeasured",
        "input_units": 120,
        "output_units": 55,
        "unit_kind": "tokens",
        "duration_ms": 840,
        "evidence_source": "ollama_response",
        "external_provider": False,
        "request_id": "test-receipt-1",
        "metadata": {"eval_duration_ms": 700},
    }
    event.update(overrides)
    return event


def test_normalize_local_ai_event_separates_api_and_infrastructure_cost():
    row = cost_usage.normalize_event(valid_event())
    assert row["app"] == "youtube_optimizer"
    assert row["provider_api_cost_usd"] == Decimal("0.00000000")
    assert row["infrastructure_cost_status"] == "unmeasured"
    assert row["input_units"] == 120
    assert row["output_units"] == 55


@pytest.mark.parametrize(
    "key",
    ["prompt", "content", "api_key", "access_token", "credential", "raw_payload"],
)
def test_metadata_rejects_sensitive_keys(key):
    with pytest.raises(ValueError, match="Sensitive cost metadata"):
        cost_usage.normalize_event(valid_event(metadata={key: "must-not-persist"}))


def test_metadata_rejects_nested_sensitive_keys():
    with pytest.raises(ValueError, match="Sensitive cost metadata"):
        cost_usage.normalize_event(
            valid_event(metadata={"timings": {"prompt_text": "must-not-persist"}})
        )


def test_rejects_negative_provider_cost():
    with pytest.raises(ValueError, match="provider_api_cost_usd"):
        cost_usage.normalize_event(valid_event(provider_api_cost_usd=-0.01))


def test_rejects_unknown_app_identity():
    with pytest.raises(ValueError, match="Unsupported cost-usage app"):
        cost_usage.normalize_event(valid_event(app="invented_spoke"))


def test_nanosecond_duration_conversion_is_safe():
    assert cost_usage.ns_to_ms(1_999_999) == 1
    assert cost_usage.ns_to_ms(None) is None
    assert cost_usage.ns_to_ms(-1) is None


class FakeCursor:
    def __init__(self):
        self.last_sql = ""
        self.params = None
        self.mode = "insert"

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, sql, params=None):
        self.last_sql = str(sql)
        self.params = params
        self.mode = "summary" if "GROUP BY" in self.last_sql else "insert"

    def fetchone(self):
        if self.mode == "insert":
            return (
                "11111111-1111-4111-8111-111111111111",
                datetime(2026, 9, 19, tzinfo=timezone.utc),
            )
        return None

    def fetchall(self):
        if self.mode != "summary":
            return []
        return [
            (
                "youtube_optimizer",
                "ollama-local",
                "channel_audit_ai",
                False,
                "unmeasured",
                2,
                2,
                "0.00000000",
                240,
                110,
                1680,
            )
        ]


class FakeConnection:
    def __init__(self):
        self.cursor_instance = FakeCursor()

    def cursor(self):
        return self.cursor_instance


def test_record_event_returns_append_receipt_without_content():
    result = cost_usage.record_event(FakeConnection(), valid_event())
    assert result["duplicate"] is False
    assert result["request_id"] == "test-receipt-1"
    assert result["id"] == "11111111-1111-4111-8111-111111111111"


def test_summary_exposes_cost_completeness_and_usage_totals():
    summary = cost_usage.read_summary(FakeConnection())
    assert set(summary) == {"today", "7d", "30d", "all"}
    row = summary["all"]
    assert row["events"] == 2
    assert row["costed_events"] == 2
    assert row["provider_api_cost_usd"] == 0
    assert row["rows"][0]["duration_ms"] == 1680


def test_gateway_contract_protects_cost_ledger_and_wires_procedures():
    source = Path("services/gateway/app.py").read_text(encoding="utf-8")
    contract = Path("governance/provider-neutral-api.yaml").read_text(encoding="utf-8")
    compat = Path("apps/rons-hub-backend/open-nova-adapters/supabase-compat.ts").read_text(encoding="utf-8")
    container = Path("services/gateway/Containerfile").read_text(encoding="utf-8")

    assert 'version="0.12.0"' in source
    assert '"cost_usage_events"' in source
    assert '"record_cost_usage"' in source
    assert '"read_cost_usage_summary"' in source
    assert '"cost_usage_events"' in source.split("PROTECTED_TABLES=", 1)[1].splitlines()[0]
    assert "usage_recorded" in source
    assert "provider_api_cost_usd" in source
    assert "cost_usage.py /app/cost_usage.py" in container
    assert "record_cost_usage" in contract and "record_cost_usage" in compat
    assert "read_cost_usage_summary" in contract and "read_cost_usage_summary" in compat
    assert "cost_usage_events" in contract and "cost_usage_events" in compat


def test_migration_forbids_negative_cost_and_documents_boundary():
    migration = Path(
        "apps/rons-hub-backend/011_cost_usage_events.sql"
    ).read_text(encoding="utf-8")
    assert "CREATE TABLE IF NOT EXISTS public.cost_usage_events" in migration
    assert "provider_api_cost_usd >= 0" in migration
    assert "infrastructure_cost_status" in migration
    assert "prompts, generated content" in migration.lower()
