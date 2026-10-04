from pathlib import Path

from fastapi.testclient import TestClient
import yaml

from foundry_controller.app import main as mainmod


def configure(tmp_path: Path, monkeypatch):
    root = Path(__file__).parents[1]
    policy = yaml.safe_load((root / 'governance' / 'policy.yaml').read_text(encoding='utf-8'))
    policy['execution']['workspace_root'] = str(tmp_path)
    gov = tmp_path / 'governance'
    gov.mkdir(parents=True)
    policy_path = gov / 'policy.yaml'
    policy_path.write_text(yaml.safe_dump(policy, sort_keys=False), encoding='utf-8')
    monkeypatch.setattr(mainmod, 'POLICY_PATH', policy_path)
    monkeypatch.setattr(mainmod, 'WORKSPACE_ROOT', tmp_path)
    monkeypatch.setattr(mainmod, 'REGISTRY_PATH', tmp_path / 'runtime' / 'registry' / 'apps.jsonl')
    monkeypatch.setattr(mainmod, 'RECEIPT_PATH', tmp_path / 'runtime' / 'receipts' / 'execution.jsonl')
    app = tmp_path / 'apps' / 'reson8-life'
    app.mkdir(parents=True)
    (app / 'main.py').write_text('print("ok")\n', encoding='utf-8')
    (app / 'requirements.txt').write_text('', encoding='utf-8')
    return TestClient(mainmod.app)


def test_cutover_routes_are_exposed(tmp_path: Path, monkeypatch):
    client = configure(tmp_path, monkeypatch)
    base = client.post('/v1/cutover/reson8-life/baseline', json={'confirmed': True})
    assert base.status_code == 200
    plan = client.get('/v1/cutover/reson8-life/plan')
    assert plan.status_code == 200
    assert plan.json()['production_cutover_performed'] is False
    verify = client.get('/v1/cutover/reson8-life/baselines/verify')
    assert verify.status_code == 200 and verify.json()['valid'] is True
    cert = client.post('/v1/cutover/reson8-life/certify-local', json={'confirmed': True})
    assert cert.status_code == 200
    assert cert.json()['production_cutover_performed'] is False
