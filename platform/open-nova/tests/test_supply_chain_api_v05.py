import json
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from foundry_controller.app import main


def configured_client(tmp_path: Path, monkeypatch):
    policy = yaml.safe_load(Path('governance/policy.yaml').read_text())
    policy_path = tmp_path / 'policy.yaml'
    policy_path.write_text(yaml.safe_dump(policy, sort_keys=False))
    monkeypatch.setattr(main, 'POLICY_PATH', policy_path)
    monkeypatch.setattr(main, 'WORKSPACE_ROOT', tmp_path)
    monkeypatch.setattr(main, 'REGISTRY_PATH', Path('runtime/registry/apps.jsonl'))
    monkeypatch.setattr(main, 'RECEIPT_PATH', tmp_path / 'runtime/receipts/execution.jsonl')
    return TestClient(main.app)


def test_migrate_generate_attest_and_verify(tmp_path: Path, monkeypatch):
    client = configured_client(tmp_path, monkeypatch)
    src = tmp_path / 'imports' / 'projects' / 'legacy'
    (src / 'src').mkdir(parents=True)
    (src / 'src' / 'main.tsx').write_text('export const x = 1;\n')
    (src / 'package.json').write_text(json.dumps({'dependencies': {'react': '19.1.1'}}))
    (src / 'package-lock.json').write_text('{}')

    assessed = client.post('/v1/migration/assess', json={'source_dir': 'imports/projects/legacy', 'app_name': 'Legacy Sovereign'})
    assert assessed.status_code == 200, assessed.text
    assert assessed.json()['assessment']['ready_to_import'] is True

    imported = client.post('/v1/migration/import', json={'source_dir': 'imports/projects/legacy', 'app_name': 'Legacy Sovereign', 'confirmed': True})
    assert imported.status_code == 200, imported.text
    data = imported.json()
    assert data['report']['source_modified'] is False
    assert data['registry_event']['app_id'] == 'legacy-sovereign'
    assert (tmp_path / 'apps' / 'legacy-sovereign' / 'SBOM.cdx.json').exists()

    verified = client.post('/v1/supply-chain/verify', json={'project_dir': 'apps/legacy-sovereign'})
    assert verified.status_code == 200
    assert verified.json()['valid'] is True


def test_artifact_cache_endpoint_and_status(tmp_path: Path, monkeypatch):
    client = configured_client(tmp_path, monkeypatch)
    project = tmp_path / 'apps' / 'demo'
    project.mkdir(parents=True)
    (project / 'requirements.txt').write_text('fastapi==0.116.1\n')
    inbox = tmp_path / 'imports' / 'artifacts'
    inbox.mkdir(parents=True)
    (inbox / 'fastapi.whl').write_bytes(b'wheel')

    before = client.post('/v1/supply-chain/cache-status', json={'project_dir': 'apps/demo'}).json()
    assert before['offline_ready'] is False
    ingested = client.post('/v1/supply-chain/artifacts/ingest', json={
        'source_path': 'imports/artifacts/fastapi.whl',
        'purl': 'pkg:pypi/fastapi@0.116.1',
    })
    assert ingested.status_code == 200, ingested.text
    after = client.post('/v1/supply-chain/cache-status', json={'project_dir': 'apps/demo'}).json()
    assert after['offline_ready'] is True


def test_api_local_signing_roundtrip(tmp_path: Path, monkeypatch):
    import shutil
    if not shutil.which('openssl'):
        pytest.skip('openssl unavailable')
    client = configured_client(tmp_path, monkeypatch)
    project = tmp_path / 'apps' / 'demo'
    project.mkdir(parents=True)
    (project / 'app.py').write_text('print("ok")\n')

    generated = client.post('/v1/supply-chain/generate', json={'project_dir': 'apps/demo'})
    assert generated.status_code == 200, generated.text
    init = client.post('/v1/supply-chain/signing/init', json={'confirmed': True})
    assert init.status_code == 200, init.text
    signed = client.post('/v1/supply-chain/sign', json={'project_dir': 'apps/demo', 'confirmed': True})
    assert signed.status_code == 200, signed.text
    verified = client.post('/v1/supply-chain/signature/verify', json={'project_dir': 'apps/demo'})
    assert verified.status_code == 200
    assert verified.json()['valid'] is True
