from pathlib import Path
import pytest

from services.gateway import subscription_mirror as mod

VALID={
    "id":"11111111-1111-4111-8111-111111111111",
    "user_id":"22222222-2222-4222-8222-222222222222",
    "app":"epublisher","tier":"starter","status":"active",
    "payfast_token":None,"payfast_payment_id":None,"amount_cents":29900,
    "currency":"ZAR","billing_cycle":"monthly","current_period_end":None,
    "cancelled_at":None,"created_at":"2026-09-07T00:00:00Z",
    "updated_at":"2026-09-07T00:00:00Z","superseded_by":None,"superseded_at":None,
}

def test_subscription_mirror_normalizes_provider_neutral_row():
    row=mod.normalize_row(dict(VALID))
    assert row["user_id"]==VALID["user_id"]
    assert row["amount_cents"]==29900
    assert row["payfast_token"] is None

def test_subscription_mirror_rejects_invalid_enums_and_amounts():
    bad=dict(VALID); bad["tier"]="owner"
    with pytest.raises(ValueError): mod.normalize_row(bad)
    bad=dict(VALID); bad["amount_cents"]=-1
    with pytest.raises(ValueError): mod.normalize_row(bad)

def test_subscription_mirror_rejects_duplicates_and_shape_drift():
    with pytest.raises(ValueError,match="Duplicate"):
        mod.normalize_rows([dict(VALID),dict(VALID)])
    bad=dict(VALID); bad["extra"]="x"
    with pytest.raises(ValueError,match="Invalid subscription row"):
        mod.normalize_row(bad)

def test_subscription_mirror_source_never_deletes_rows():
    source=Path("services/gateway/subscription_mirror.py").read_text(encoding="utf-8").lower()
    assert "delete from subscriptions" not in source
    assert '"deleted":0' in source

def test_subscription_mirror_nullable_superseded_uuid_is_validated():
    bad=dict(VALID); bad["superseded_by"]="not-a-uuid"
    with pytest.raises(ValueError,match="superseded_by"):
        mod.normalize_row(bad)


def test_subscription_account_projection_is_user_scoped_and_non_sensitive():
    assert mod.ACCOUNT_FIELDS == (
        "id","app","tier","status","billing_cycle","amount_cents","currency",
        "current_period_end","cancelled_at","updated_at",
    )
    for sensitive in ("user_id","payfast_token","payfast_payment_id","superseded_by","superseded_at"):
        assert sensitive not in mod.ACCOUNT_FIELDS
    source=Path("services/gateway/subscription_mirror.py").read_text(encoding="utf-8")
    assert "WHERE user_id=%s" in source
    assert "LIMIT 200" in source


def test_gateway_account_subscription_read_is_keyed_and_uuid_scoped():
    source=Path("services/gateway/app.py").read_text(encoding="utf-8")
    assert '"read_subscription_account"' in source
    assert 'set(body.args)!={"user_id"}' in source
    assert 'bootstrap_ops.normalize_user_id(body.args.get("user_id"))' in source
    assert "require_procedure_key(request)" in source
