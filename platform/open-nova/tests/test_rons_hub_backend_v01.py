from pathlib import Path

from foundry_controller.app.backend_runtime import SQL_DESTRUCTIVE, SQL_TRANSACTION_BANNED, sql_top_level_text

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "apps" / "rons-hub-backend" / "001_rons_hub_entitlements.sql"
IDENTITY_MIGRATION = ROOT / "apps" / "rons-hub-backend" / "002_identity_links.sql"


def migration_sql() -> str:
    return MIGRATION.read_text(encoding="utf-8")


def test_rons_hub_entitlement_migration_is_governed_and_non_destructive():
    sql = migration_sql()
    assert SQL_DESTRUCTIVE.search(sql) is None
    assert SQL_TRANSACTION_BANNED.search(sql) is None
    lowered = sql.lower()
    for provider_owned in (
        "auth.uid()",
        "to authenticated",
        "to service_role",
        "enable row level security",
    ):
        assert provider_owned not in lowered


def test_rons_hub_entitlement_schema_matches_current_catalog():
    sql = migration_sql()
    for app in (
        "epublisher", "creative_studio", "sync_vision",
        "youtube_optimizer", "all_access",
    ):
        assert app in sql
    for tier in (
        "free", "starter", "creator", "pro", "business", "all_access",
        "creator_pass", "studio_pass", "business_pass",
    ):
        assert tier in sql
    for status in ("pending", "active", "past_due", "cancelled"):
        assert status in sql
    assert "superseded_by UUID" in sql
    assert "UNIQUE (user_id, app)" in sql


def test_rons_identity_link_migration_is_credential_free_and_non_destructive():
    sql = IDENTITY_MIGRATION.read_text(encoding="utf-8")
    assert SQL_DESTRUCTIVE.search(sql) is None
    assert SQL_TRANSACTION_BANNED.search(sql) is None
    lowered = sql.lower()
    for forbidden in ("password_hash", "access_token", "refresh_token", "email text", "auth.uid()", "service_role"):
        assert forbidden not in lowered
    assert "provider_subject UUID NOT NULL" in sql
    assert "PRIMARY KEY (provider, provider_subject)" in sql
    assert "sovereign_user_id TEXT" in sql

ROLE_MIGRATION = ROOT / "apps" / "rons-hub-backend" / "003_user_roles.sql"


def test_rons_user_roles_migration_is_provider_neutral_and_non_destructive():
    sql = ROLE_MIGRATION.read_text(encoding="utf-8")
    assert SQL_DESTRUCTIVE.search(sql) is None
    assert SQL_TRANSACTION_BANNED.search(sql) is None
    lowered = sql.lower()
    for provider_owned in (
        "auth.uid()", "to authenticated", "to service_role",
        "enable row level security", "security definer",
    ):
        assert provider_owned not in lowered
    assert "role TEXT NOT NULL CHECK (role IN ('admin', 'user'))" in sql
    assert "UNIQUE (user_id, role)" in sql

BOOTSTRAP_MIGRATION = ROOT / "apps" / "rons-hub-backend" / "004_admin_bootstrap.sql"


def test_rons_admin_bootstrap_migration_is_provider_neutral_and_guarded():
    sql = BOOTSTRAP_MIGRATION.read_text(encoding="utf-8")
    assert SQL_DESTRUCTIVE.search(sql) is None
    assert SQL_TRANSACTION_BANNED.search(sql_top_level_text(sql)) is None
    lowered = sql.lower()
    for provider_owned in ("auth.users", "auth.uid()", "service_role", "to authenticated", "security definer"):
        assert provider_owned not in lowered
    assert "CREATE TABLE IF NOT EXISTS admin_bootstrap_state" in sql
    assert "CREATE TABLE IF NOT EXISTS admin_bootstrap_email_challenges" in sql
    assert "token_hash ~ '^[0-9a-f]{64}$'" in sql
    assert "INTERVAL '15 minutes'" in sql
    assert "LOCK TABLE user_roles IN SHARE ROW EXCLUSIVE MODE" in sql
    assert "CREATE OR REPLACE FUNCTION enforce_first_admin_claim()" in sql
    assert "CREATE TRIGGER enforce_first_admin_claim" in sql
    assert "email TEXT" not in sql
    assert "password" not in lowered and "access_token" not in lowered and "refresh_token" not in lowered

CI_SETTINGS_MIGRATION = ROOT / "apps" / "rons-hub-backend" / "006_ci_settings.sql"


def test_rons_ci_settings_migration_is_provider_neutral_and_non_destructive():
    sql = CI_SETTINGS_MIGRATION.read_text(encoding="utf-8")
    assert SQL_DESTRUCTIVE.search(sql) is None
    assert SQL_TRANSACTION_BANNED.search(sql_top_level_text(sql)) is None
    lowered = sql.lower()
    for provider_owned in (
        "auth.users", "auth.uid()", "to authenticated", "to service_role",
        "enable row level security", "security definer",
    ):
        assert provider_owned not in lowered
    assert "CREATE TABLE IF NOT EXISTS ci_alert_config" in sql
    assert "CONSTRAINT ci_alert_config_singleton CHECK (id = 1)" in sql
    assert "default_branch_only BOOLEAN NOT NULL DEFAULT TRUE" in sql
    assert "slack_webhook_url TEXT" in sql
    assert "CREATE TABLE IF NOT EXISTS ci_repo_presets" in sql
    assert "user_id UUID NOT NULL" in sql
    assert "UNIQUE (user_id, name)" in sql
