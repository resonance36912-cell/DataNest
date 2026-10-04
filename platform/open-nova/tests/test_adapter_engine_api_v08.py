from pathlib import Path

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
    governance.joinpath('provider-neutral-api.yaml').write_text(Path('governance/provider-neutral-api.yaml').read_text(encoding='utf-8'), encoding='utf-8')
    monkeypatch.setattr(main, 'POLICY_PATH', policy_path)
    monkeypatch.setattr(main, 'WORKSPACE_ROOT', tmp_path)
    monkeypatch.setattr(main, 'REGISTRY_PATH', Path('runtime/registry/apps.jsonl'))
    monkeypatch.setattr(main, 'RECEIPT_PATH', tmp_path / 'runtime/receipts/execution.jsonl')
    return TestClient(main.app)


def test_adapter_api_assess_generate_cutover_verify_rollback(tmp_path: Path, monkeypatch):
    client = configured_client(tmp_path, monkeypatch)
    app = tmp_path / 'apps/demo'
    (app / 'src').mkdir(parents=True)
    (app / 'src/client.ts').write_text('''import { createClient } from "@supabase/supabase-js";\nconst supabase=createClient("https://demo.supabase.co","x");\nexport const q=()=>supabase.from("items").select("*");\n''', encoding='utf-8')

    bound = client.post('/v1/service-fabric/demo/bindings', json={'confirmed': True})
    assert bound.status_code == 200, bound.text
    assessed = client.get('/v1/adapters/demo/assess')
    assert assessed.status_code == 200, assessed.text
    assert assessed.json()['ready_to_generate_adapters'] is True

    denied = client.post('/v1/adapters/demo/generate', json={'confirmed': False})
    assert denied.status_code == 403
    generated = client.post('/v1/adapters/demo/generate', json={'confirmed': True})
    assert generated.status_code == 200, generated.text

    cutover = client.post('/v1/adapters/demo/cutover', json={'confirmed': True})
    assert cutover.status_code == 200, cutover.text
    migration_id = cutover.json()['migration_id']
    verified = client.get('/v1/adapters/demo/verify')
    assert verified.status_code == 200, verified.text
    assert verified.json()['cutover_ready'] is True

    rollback = client.post('/v1/adapters/demo/rollback', json={'migration_id': migration_id, 'confirmed': True})
    assert rollback.status_code == 200, rollback.text
    assert rollback.json()['rollback_complete'] is True
