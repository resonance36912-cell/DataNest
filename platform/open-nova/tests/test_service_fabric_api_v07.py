from pathlib import Path
import json

import yaml
from fastapi.testclient import TestClient

from foundry_controller.app import main


def configured_client(tmp_path: Path, monkeypatch):
    policy = yaml.safe_load(Path('governance/policy.yaml').read_text(encoding='utf-8'))
    policy_path = tmp_path / 'policy.yaml'
    policy_path.write_text(yaml.safe_dump(policy, sort_keys=False), encoding='utf-8')
    governance = tmp_path / 'governance'
    governance.mkdir(parents=True)
    governance.joinpath('service-fabric.yaml').write_text(Path('governance/service-fabric.yaml').read_text(encoding='utf-8'), encoding='utf-8')
    monkeypatch.setattr(main, 'POLICY_PATH', policy_path)
    monkeypatch.setattr(main, 'WORKSPACE_ROOT', tmp_path)
    monkeypatch.setattr(main, 'REGISTRY_PATH', Path('runtime/registry/apps.jsonl'))
    monkeypatch.setattr(main, 'RECEIPT_PATH', tmp_path / 'runtime/receipts/execution.jsonl')
    return TestClient(main.app)


def test_service_catalog_and_compose_preview(tmp_path: Path, monkeypatch):
    client = configured_client(tmp_path, monkeypatch)
    catalog = client.get('/v1/service-fabric')
    assert catalog.status_code == 200, catalog.text
    assert catalog.json()['valid'] is True
    assert catalog.json()['receipt']['external_ai_used'] is False

    compose = client.get('/v1/service-fabric/runtime/compose')
    assert compose.status_code == 200, compose.text
    assert compose.json()['compose']['networks']['resonance-local']['internal'] is True


def test_service_binding_endpoint_roundtrip(tmp_path: Path, monkeypatch):
    client = configured_client(tmp_path, monkeypatch)
    app = tmp_path / 'apps' / 'demo'
    app.mkdir(parents=True)
    (app / 'client.ts').write_text('const url="https://demo.supabase.co";', encoding='utf-8')

    plan = client.get('/v1/service-fabric/demo/migration-plan')
    assert plan.status_code == 200, plan.text
    assert plan.json()['required_local_services'] == ['postgres', 'auth', 'storage', 'gateway']

    denied = client.post('/v1/service-fabric/demo/bindings', json={'confirmed': False})
    assert denied.status_code == 403

    bound = client.post('/v1/service-fabric/demo/bindings', json={'confirmed': True})
    assert bound.status_code == 200, bound.text
    assert bound.json()['contains_secret_values'] is False
    assert (app / '.open-nova/service-bindings.json').exists()
    registry = client.get('/v1/apps').json()
    assert registry['chain']['valid'] is True


def test_runtime_write_is_explicit_and_offline(tmp_path: Path, monkeypatch):
    client = configured_client(tmp_path, monkeypatch)
    denied = client.post('/v1/service-fabric/runtime/compose', json={'confirmed': False})
    assert denied.status_code == 403
    written = client.post('/v1/service-fabric/runtime/compose', json={'confirmed': True})
    assert written.status_code == 200, written.text
    data = written.json()
    assert data['pull_policy'] == 'never'
    assert data['network_internal'] is True
    text = (tmp_path / data['path']).read_text(encoding='utf-8')
    assert 'pull_policy: never' in text
