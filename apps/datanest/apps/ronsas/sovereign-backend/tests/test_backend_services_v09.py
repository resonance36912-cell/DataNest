from pathlib import Path
import uuid

from fastapi.testclient import TestClient

from services.auth import app as auth_mod
from services.storage import app as storage_mod
from services.gateway import app as gateway_mod


def test_local_auth_signup_session_roundtrip(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(auth_mod, "DB", tmp_path / "auth.db")
    key = tmp_path / "auth.key"; key.write_text("k" * 64, encoding="utf-8")
    monkeypatch.setattr(auth_mod, "KEY_FILE", key)
    client = TestClient(auth_mod.app)
    signed = client.post("/v1/auth/sign-up", json={"email": "local@example.test", "password": "sovereign-pass-123"})
    assert signed.status_code == 200
    assert str(uuid.UUID(signed.json()["user"]["id"])) == signed.json()["user"]["id"]
    session = client.get("/v1/auth/session")
    assert session.status_code == 200
    assert session.json()["session"]["user"]["email"] == "local@example.test"


def test_local_storage_blocks_path_escape(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(storage_mod, "ROOT", tmp_path.resolve())
    good = storage_mod.resolve("bucket", "folder/file.txt")
    assert str(good).startswith(str(tmp_path.resolve()))
    try:
        storage_mod.resolve("bucket", "../../outside.txt")
        assert False, "path escape should fail"
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 400


def test_gateway_health_reports_driver_state():
    client = TestClient(gateway_mod.app)
    result = client.get("/health")
    assert result.status_code == 200
    body = result.json()
    assert body["service"] == "gateway"
    assert body["version"] == "0.12.0"
    assert "postgres_driver" in body


def test_local_auth_bearer_roundtrip(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(auth_mod, "DB", tmp_path / "auth-bearer.db")
    key = tmp_path / "auth-bearer.key"
    key.write_text("b" * 64, encoding="utf-8")
    monkeypatch.setattr(auth_mod, "KEY_FILE", key)
    signup = TestClient(auth_mod.app).post(
        "/v1/auth/sign-up",
        json={"email": "bearer@example.test", "password": "sovereign-pass-456"},
    )
    assert signup.status_code == 200
    session = signup.json()["session"]
    assert session["token_type"] == "bearer"
    token = session["access_token"]
    stateless = TestClient(auth_mod.app)
    user = stateless.get("/v1/auth/user", headers={"Authorization": f"Bearer {token}"})
    assert user.status_code == 200
    assert user.json()["user"]["email"] == "bearer@example.test"


def test_local_auth_trusted_exchange_mints_matching_external_identity(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(auth_mod, "DB", tmp_path / "auth-exchange.db")
    signing = tmp_path / "auth-signing.key"; signing.write_text("s" * 64, encoding="utf-8")
    exchange = tmp_path / "auth-exchange.key"; exchange.write_text("x" * 64, encoding="utf-8")
    monkeypatch.setattr(auth_mod, "KEY_FILE", signing)
    monkeypatch.setattr(auth_mod, "EXCHANGE_KEY_FILE", exchange)
    subject = "22222222-2222-4222-8222-222222222222"
    client = TestClient(auth_mod.app)
    denied = client.post("/v1/auth/exchange", json={"provider":"supabase","subject":subject})
    assert denied.status_code == 401
    result = client.post("/v1/auth/exchange", headers={"X-RONS-Exchange-Key":"x" * 64}, json={"provider":"supabase","subject":subject})
    assert result.status_code == 200
    assert result.json()["user"]["id"] == subject
    token = result.json()["session"]["access_token"]
    user = TestClient(auth_mod.app).get("/v1/auth/user", headers={"Authorization": f"Bearer {token}"})
    assert user.status_code == 200
    assert user.json()["user"]["id"] == subject
    assert user.json()["user"]["email"] is None


def test_launch_ticket_is_app_bound_short_lived_and_one_time(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(auth_mod, "DB", tmp_path / "auth-launch.db")
    signing=tmp_path / "launch-signing.key"; signing.write_text("l" * 64, encoding="utf-8")
    exchange=tmp_path / "launch-exchange.key"; exchange.write_text("e" * 64, encoding="utf-8")
    monkeypatch.setattr(auth_mod, "KEY_FILE", signing); monkeypatch.setattr(auth_mod, "EXCHANGE_KEY_FILE", exchange)
    client=TestClient(auth_mod.app)
    signed=client.post("/v1/auth/sign-up",json={"email":"launch@example.test","password":"sovereign-launch-123"})
    assert signed.status_code==200
    denied=client.post("/v1/auth/launch-ticket",json={"app":"sync_vision"})
    assert denied.status_code==401
    issued=client.post("/v1/auth/launch-ticket",headers={"X-RONS-Exchange-Key":"e" * 64},json={"app":"sync_vision"})
    assert issued.status_code==200
    ticket=issued.json()["ticket"]; assert issued.json()["expires_in"]<=90
    wrong=TestClient(auth_mod.app).post("/v1/auth/launch-ticket/redeem",json={"app":"epublisher","ticket":ticket})
    assert wrong.status_code==401
    spoke=TestClient(auth_mod.app)
    redeemed=spoke.post("/v1/auth/launch-ticket/redeem",json={"app":"sync_vision","ticket":ticket})
    assert redeemed.status_code==200
    assert spoke.get("/v1/auth/user").json()["user"]["email"]=="launch@example.test"
    replay=TestClient(auth_mod.app).post("/v1/auth/launch-ticket/redeem",json={"app":"sync_vision","ticket":ticket})
    assert replay.status_code==409

def test_launch_ticket_expiry_is_fail_closed(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(auth_mod, "DB", tmp_path / "auth-launch-expired.db")
    key=tmp_path / "expired.key"; key.write_text("z" * 64, encoding="utf-8"); monkeypatch.setattr(auth_mod,"KEY_FILE",key)
    expired=auth_mod.launch_ticket("user-1","creative_studio",ttl=-1)
    result=TestClient(auth_mod.app).post("/v1/auth/launch-ticket/redeem",json={"app":"creative_studio","ticket":expired})
    assert result.status_code==401


class _FakeTx:
    def __init__(self, conn): self.conn=conn; self.before=0
    def __enter__(self): self.before=self.conn.rows; return self
    def __exit__(self, exc_type, exc, tb):
        if exc_type is not None: self.conn.rows=self.before
        return False

class _FakeCursor:
    def __init__(self, conn): self.conn=conn
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def execute(self, stmt, params=None):
        text=str(stmt)
        if text.startswith("CREATE TEMP TABLE"): self.conn.rows=0
        elif text.startswith("INSERT INTO rons_transaction_probe"): self.conn.rows+=1
        elif text.startswith("SELECT COUNT(*) FROM rons_transaction_probe"): pass
        else: raise AssertionError(f"unexpected SQL: {text}")
    def fetchone(self): return (self.conn.rows,)

class _FakeConn:
    def __init__(self): self.rows=0
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def cursor(self): return _FakeCursor(self)
    def transaction(self): return _FakeTx(self)


def test_gateway_procedure_rejects_unauthorized_and_unknown_name(tmp_path: Path, monkeypatch):
    key=tmp_path / "procedure.key"; key.write_text("p" * 64, encoding="utf-8")
    monkeypatch.setattr(gateway_mod,"PROCEDURE_KEY_FILE",str(key))
    client=TestClient(gateway_mod.app)
    denied=client.post("/v1/db/procedure",json={"name":"transaction_probe","args":{}})
    assert denied.status_code==401
    result=client.post("/v1/db/procedure",headers={"X-RONS-Procedure-Key":"p" * 64},json={"name":"not_allowlisted","args":{}})
    assert result.status_code==400
    assert "allowlisted" in result.text


def test_gateway_transaction_probe_commit_and_rollback(tmp_path: Path, monkeypatch):
    conns=[]
    def connect(*args,**kwargs):
        assert kwargs.get("autocommit") is True
        conn=_FakeConn(); conns.append(conn); return conn
    driver=type("FakePsycopg",(),{})(); driver.connect=connect
    monkeypatch.setattr(gateway_mod,"psycopg",driver)
    key=tmp_path / "procedure.key"; key.write_text("p" * 64, encoding="utf-8")
    monkeypatch.setattr(gateway_mod,"PROCEDURE_KEY_FILE",str(key))
    headers={"X-RONS-Procedure-Key":"p" * 64}
    client=TestClient(gateway_mod.app)
    committed=client.post(
        "/v1/db/procedure",headers=headers,json={"name":"transaction_probe","args":{"rollback":False}}
    )
    assert committed.status_code==200
    assert committed.json()=={"procedure":"transaction_probe","committed":True,"row_count":1}
    rolled=client.post(
        "/v1/db/procedure",headers=headers,json={"name":"transaction_probe","args":{"rollback":True}}
    )
    assert rolled.status_code==200
    assert rolled.json()=={"procedure":"transaction_probe","committed":False,"row_count":0}
    invalid=client.post(
        "/v1/db/procedure",headers=headers,json={"name":"transaction_probe","args":{"rollback":"yes"}}
    )
    assert invalid.status_code==400
    unsupported=client.post(
        "/v1/db/procedure",headers=headers,json={"name":"transaction_probe","args":{"sql":"SELECT 1"}}
    )
    assert unsupported.status_code==400


def test_gateway_procedure_contract_is_allowlisted_not_raw_sql():
    gateway_source=Path("services/gateway/app.py").read_text(encoding="utf-8")
    contract=Path("governance/provider-neutral-api.yaml").read_text(encoding="utf-8")
    compat=Path("apps/rons-hub-backend/open-nova-adapters/supabase-compat.ts").read_text(encoding="utf-8")
    assert '"mirror_user_roles"' in gateway_source and '"transaction_probe"' in gateway_source
    for procedure in {"nova_transition_job", "datanest_approve_memory", "datanest_supersede_memory"}:
        assert f'"{procedure}"' in gateway_source
        assert f'"{procedure}"' in compat
    assert 'op_name=="in"' in gateway_source
    assert 'op_name=="text_search"' in gateway_source
    assert 'Upsert requires on_conflict columns' in gateway_source
    assert 'procedure: POST /v1/db/procedure' in contract
    assert 'supported_filters: [eq, neq, gt, gte, lt, lte, in, text_search]' in contract
    assert 'supported_select_options: [order, limit, single, count_exact, head]' in contract
    assert 'upsert_requires_on_conflict: true' in contract
    for procedure in {"nova_transition_job", "datanest_approve_memory", "datanest_supersede_memory"}:
        assert procedure in contract
    assert 'governance_create_proposal' in contract and 'governance_record_decision' in contract
    assert 'arbitrary_sql: false' in contract
    assert 'procedure: "/v1/db/procedure"' in compat
    assert 'arbitrarySql: false' in compat


def test_bootstrap_procedures_are_staged_and_disabled_by_default(tmp_path: Path, monkeypatch):
    assert gateway_mod.BOOTSTRAP_PROCEDURES_ENABLED is False
    baseline={"transaction_probe", "mirror_user_roles", "read_subscription_mirror", "read_subscription_account", "mirror_subscriptions", "read_account_invoices", "read_admin_invoices", "read_billing_account", "read_billing_admin", "record_payfast_launch", "record_payfast_itn_attempt", "settle_payfast_itn", "record_cost_usage", "read_cost_usage_summary", "nova_transition_job", "datanest_approve_memory", "datanest_supersede_memory"}
    assert gateway_mod.ALLOWED_PROCEDURES == baseline | gateway_mod.GOVERNANCE_PROCEDURES
    assert gateway_mod.BOOTSTRAP_PROCEDURES.isdisjoint(gateway_mod.ALLOWED_PROCEDURES)
    for table in {"governance_participants","governance_proposals","governance_evidence","governance_reviews","governance_decisions","governance_events"}:
        assert table in gateway_mod.PROTECTED_TABLES
    key=tmp_path / "procedure.key"; key.write_text("p" * 64, encoding="utf-8")
    monkeypatch.setattr(gateway_mod,"PROCEDURE_KEY_FILE",str(key))
    result=TestClient(gateway_mod.app).post(
        "/v1/db/procedure",
        headers={"X-RONS-Procedure-Key":"p" * 64},
        json={"name":"create_admin_bootstrap_challenge","args":{}},
    )
    assert result.status_code==400
    assert "allowlisted" in result.text


def test_bootstrap_helpers_validate_uuid_and_hash_only():
    subject="22222222-2222-4222-8222-222222222222"
    assert gateway_mod.bootstrap_ops.normalize_user_id(subject)==subject
    assert gateway_mod.bootstrap_ops.valid_token_hash("a" * 64) is True
    assert gateway_mod.bootstrap_ops.valid_token_hash("a" * 63) is False
    assert "verified_email" not in Path("services/gateway/bootstrap.py").read_text(encoding="utf-8")


def test_user_roles_generic_writes_are_blocked_but_reads_remain_provider_neutral():
    client=TestClient(gateway_mod.app)
    denied=client.post("/v1/db/query",json={"table":"user_roles","action":"insert","values":{"id":"11111111-1111-4111-8111-111111111111","user_id":"22222222-2222-4222-8222-222222222222","role":"admin","created_at":"2026-09-07T00:00:00Z"}})
    assert denied.status_code==403
    assert "Protected write" in denied.text
    source=Path("services/gateway/app.py").read_text(encoding="utf-8")
    assert 'PROTECTED_WRITE_TABLES={"user_roles","subscriptions"}' in source


def test_role_mirror_is_keyed_validated_and_never_deletes(tmp_path: Path, monkeypatch):
    key=tmp_path / "procedure.key"; key.write_text("p" * 64, encoding="utf-8")
    monkeypatch.setattr(gateway_mod,"PROCEDURE_KEY_FILE",str(key))
    headers={"X-RONS-Procedure-Key":"p" * 64}
    monkeypatch.setattr(gateway_mod,"psycopg",object())
    client=TestClient(gateway_mod.app)
    invalid=client.post("/v1/db/procedure",headers=headers,json={"name":"mirror_user_roles","args":{"rows":[{"id":"bad","user_id":"bad","role":"owner","created_at":"x"}]}})
    assert invalid.status_code==400
    source=Path("services/gateway/app.py").read_text(encoding="utf-8")
    mirror=source[source.index('if body.name=="mirror_user_roles"'):source.index('if body.name in BOOTSTRAP_PROCEDURES')]
    assert "DELETE FROM user_roles" not in mirror
    assert '"deleted":0' in mirror


def test_subscription_entitlement_query_is_minimal_and_scoped():
    uid="22222222-2222-4222-8222-222222222222"
    valid=gateway_mod.Query(table="subscriptions",action="select",columns="app,tier,status,current_period_end",filters=[{"column":"user_id","op":"eq","value":uid}],options={"limit":100})
    assert gateway_mod.validate_subscription_entitlement_query(valid) is None
    client=TestClient(gateway_mod.app)
    base={"table":"subscriptions","action":"select","filters":[{"column":"user_id","op":"eq","value":uid}],"options":{"limit":100}}
    assert client.post("/v1/db/query",json={**base,"columns":"*"}).status_code==403
    assert client.post("/v1/db/query",json={**base,"columns":"payfast_token"}).status_code==403
    assert client.post("/v1/db/query",json={**base,"columns":"app","filters":[]}).status_code==403
    assert client.post("/v1/db/query",json={**base,"columns":"app","filters":[{"column":"user_id","op":"eq","value":"bad"}]}).status_code==400
    assert client.post("/v1/db/query",json={"table":"subscriptions","action":"insert","values":{},"filters":[]}).status_code==403


def test_subscription_mirror_contract_is_keyed_and_sensitive_fields_protected():
    source=Path("services/gateway/app.py").read_text(encoding="utf-8")
    contract=Path("governance/provider-neutral-api.yaml").read_text(encoding="utf-8")
    assert '"read_subscription_mirror"' in source and '"mirror_subscriptions"' in source
    assert 'PROTECTED_WRITE_TABLES={"user_roles","subscriptions"}' in source
    assert 'subscription_entitlement_columns: [app, tier, status, current_period_end]' in contract
    assert 'payfast_token' not in contract.split('subscription_entitlement_columns:',1)[1].split('procedure_auth_header:',1)[0]


class _CountCursor:
    def __init__(self):
        self.description = []
        self.executed = []

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def execute(self, stmt, params=None):
        self.executed.append((str(stmt), params))

    def fetchone(self):
        return (3,)


class _CountConnection:
    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def cursor(self):
        return _CountCursor()


def test_gateway_exact_count_head_query_for_datanest(monkeypatch):
    driver = type("FakePsycopg", (), {})()
    driver.connect = lambda *args, **kwargs: _CountConnection()
    monkeypatch.setattr(gateway_mod, "psycopg", driver)

    result = TestClient(gateway_mod.app).post(
        "/v1/db/query",
        json={
            "table": "datanest_memories",
            "action": "select",
            "columns": "id",
            "filters": [{"column": "source_id", "op": "eq", "value": "source-1"}],
            "options": {"count": "exact", "head": True},
        },
    )

    assert result.status_code == 200
    assert result.json() == {"data": [], "count": 3}


def test_datanest_supersede_adapts_metadata_jsonb_in_gateway_source():
    source = Path("services/gateway/app.py").read_text(encoding="utf-8")
    assert 'db_value(body.args["_metadata"])' in source


def test_gateway_json_objects_are_adapted_for_postgres(monkeypatch):
    monkeypatch.setattr(gateway_mod, "Jsonb", lambda value: ("jsonb", value))
    payload = {"source": "acceptance", "nested": {"ok": True}}
    assert gateway_mod.db_value(payload) == ("jsonb", payload)
    assert gateway_mod.db_value(["uuid-1", "uuid-2"]) == ["uuid-1", "uuid-2"]
    assert gateway_mod.db_value("plain") == "plain"


def test_datanest_supersede_binds_metadata_as_jsonb(tmp_path: Path, monkeypatch):
    captured = {}

    class ProcedureCursor:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def execute(self, stmt, params=None):
            captured["sql"] = str(stmt)
            captured["params"] = params
            self.description = [type("Column", (), {"name": "id"})()]
        def fetchone(self):
            return ("33333333-3333-4333-8333-333333333333",)

    class ProcedureConnection:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def cursor(self): return ProcedureCursor()

    driver = type("FakePsycopg", (), {})()
    driver.connect = lambda *args, **kwargs: ProcedureConnection()
    monkeypatch.setattr(gateway_mod, "psycopg", driver)
    monkeypatch.setattr(gateway_mod, "Jsonb", lambda value: ("jsonb", value))

    key = tmp_path / "procedure.key"
    key.write_text("p" * 64, encoding="utf-8")
    monkeypatch.setattr(gateway_mod, "PROCEDURE_KEY_FILE", str(key))

    metadata = {"source": "acceptance", "nested": {"ok": True}}
    result = TestClient(gateway_mod.app).post(
        "/v1/db/procedure",
        headers={"X-RONS-Procedure-Key": "p" * 64},
        json={
            "name": "datanest_supersede_memory",
            "args": {
                "_memory_id": "11111111-1111-4111-8111-111111111111",
                "_actor_user_id": "22222222-2222-4222-8222-222222222222",
                "_title": "Replacement",
                "_content": "Governed replacement content",
                "_visibility": "private",
                "_protection": "standard",
                "_governance_decision_id": "44444444-4444-4444-8444-444444444444",
                "_evidence_ids": [],
                "_metadata": metadata,
            },
        },
    )

    assert result.status_code == 200
    assert result.json()["memory"]["id"] == "33333333-3333-4333-8333-333333333333"
    assert "%s::jsonb" in captured["sql"]
    assert captured["params"][-1] == ("jsonb", metadata)
