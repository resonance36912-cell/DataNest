from pathlib import Path

from foundry_controller.app.backend_runtime import SQL_DESTRUCTIVE, SQL_TRANSACTION_BANNED

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "apps" / "rons-hub-backend" / "005_entitlement_log.sql"


def audit_sql() -> str:
    return MIGRATION.read_text(encoding="utf-8")


def test_entitlement_audit_migration_is_non_destructive_and_provider_neutral():
    sql = audit_sql()
    assert SQL_DESTRUCTIVE.search(sql) is None
    assert SQL_TRANSACTION_BANNED.search(sql) is None
    lowered = sql.lower()
    for provider_owned in (
        "auth.uid()", "authenticated", "service_role",
        "enable row level security", "security definer",
    ):
        assert provider_owned not in lowered


def test_entitlement_audit_schema_matches_hub_audit_contract():
    sql = audit_sql()
    for column in (
        "user_id UUID", "app TEXT NOT NULL", "tier TEXT", "status TEXT NOT NULL",
        "source TEXT", "error TEXT", "source_ip TEXT", "user_agent TEXT",
        "created_at TIMESTAMPTZ NOT NULL DEFAULT now()",
    ):
        assert column in sql
    for app in (
        "epublisher", "creative_studio", "sync_vision",
        "youtube_optimizer", "all_access",
    ):
        assert app in sql
    assert "idx_entitlement_log_created_at" in sql
    assert "idx_entitlement_log_user_app" in sql
