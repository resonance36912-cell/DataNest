import json
import zipfile
from pathlib import Path

import yaml
from fastapi.testclient import TestClient

from foundry_controller.app.agent import GovernanceViolation
from foundry_controller.app.backup_export import SovereignExporter
from foundry_controller.app.registry import AppRegistry
from foundry_controller.app.suite_control import SuiteControlCentre
from foundry_controller.app.supply_chain import write_supply_chain_evidence
from foundry_controller.app import main


def policy_for(tmp_path: Path):
    policy = yaml.safe_load(Path('governance/policy.yaml').read_text())
    (tmp_path / 'governance').mkdir(parents=True, exist_ok=True)
    (tmp_path / 'governance' / 'suite.yaml').write_text(Path('governance/suite.yaml').read_text())
    (tmp_path / 'governance' / 'local-service-replacements.yaml').write_text(Path('governance/local-service-replacements.yaml').read_text())
    return policy


def control(tmp_path: Path):
    policy = policy_for(tmp_path)
    registry = AppRegistry(tmp_path / 'runtime/registry/apps.jsonl')
    return SuiteControlCentre(tmp_path, policy, registry), policy


def test_catalog_declares_resonance_suite(tmp_path: Path):
    cc, _ = control(tmp_path)
    ids = [a['app_id'] for a in cc.catalog()]
    assert ids == [
        'reson8-life', 'resonanceonline-life', 'creative-studio', 'lyricsync-studio',
        'youtube-optimizer', 'scene-song-spark', 'sovereignforge'
    ]


def test_staged_project_is_detected_without_source_mutation(tmp_path: Path):
    cc, _ = control(tmp_path)
    staged = tmp_path / 'imports/projects/creative-studio'
    staged.mkdir(parents=True)
    (staged / 'src.txt').write_text('hello')
    before = (staged / 'src.txt').read_text()
    state = cc.status('creative-studio')
    assert state['migration_state'] == 'staged_for_assessment'
    assert state['staged_source'] == 'imports/projects/creative-studio'
    assert (staged / 'src.txt').read_text() == before


def test_remediation_detects_hosted_dependencies_and_maps_local_targets(tmp_path: Path):
    cc, _ = control(tmp_path)
    app = tmp_path / 'apps/reson8-life'
    app.mkdir(parents=True)
    (app / 'client.ts').write_text('const x="https://demo.supabase.co"; const y="lovable.app";')
    plan = cc.remediation_plan('reson8-life')
    services = {x['service'] for x in plan['actions']}
    assert 'lovable' in services
    assert 'supabase-hosted' in services
    assert any('Open Nova' in x['target'] for x in plan['actions'] if x['service'] == 'lovable')
    assert plan['destructive_actions'] is False


def test_sovereign_ready_requires_valid_evidence(tmp_path: Path):
    cc, _ = control(tmp_path)
    app = tmp_path / 'apps/sovereignforge'
    app.mkdir(parents=True)
    (app / 'app.py').write_text('print("local")\n')
    before = cc.status('sovereignforge')
    assert before['sovereign_ready'] is False
    write_supply_chain_evidence(app, 'sovereignforge')
    after = cc.status('sovereignforge')
    assert after['sovereign_ready'] is True
    assert after['migration_state'] == 'sovereign_ready'


def test_remediation_plan_write_is_controller_owned(tmp_path: Path):
    cc, _ = control(tmp_path)
    plan = cc.remediation_plan('youtube-optimizer', write=True)
    path = tmp_path / plan['plan_path']
    assert path.is_file()
    stored = json.loads(path.read_text())
    assert stored['app_id'] == 'youtube-optimizer'
    assert stored['external_ai_required'] is False


def test_export_excludes_secrets_git_and_is_verifiable(tmp_path: Path):
    _, policy = control(tmp_path)
    app = tmp_path / 'apps/creative-studio'
    (app / '.git').mkdir(parents=True)
    (app / '.git/config').write_text('secret-git-data')
    (app / 'src').mkdir(parents=True)
    (app / 'src/app.js').write_text('console.log("ok")')
    (app / '.env').write_text('TOKEN=secret')
    exporter = SovereignExporter(tmp_path, policy)
    result = exporter.export('creative-studio', confirmed=True)
    archive = tmp_path / result['archive']
    assert archive.is_file()
    with zipfile.ZipFile(archive) as zf:
        names = zf.namelist()
        assert 'creative-studio/src/app.js' in names
        assert not any(name.endswith('/.env') for name in names)
        assert not any('/.git/' in name for name in names)
        assert 'creative-studio/RESONANCE_EXPORT_MANIFEST.json' in names
    verified = exporter.verify_export(result['archive'])
    assert verified['valid'] is True


def test_export_requires_confirmation(tmp_path: Path):
    _, policy = control(tmp_path)
    app = tmp_path / 'apps/scene-song-spark'
    app.mkdir(parents=True)
    (app / 'index.html').write_text('ok')
    exporter = SovereignExporter(tmp_path, policy)
    try:
        exporter.export('scene-song-spark', confirmed=False)
    except GovernanceViolation as exc:
        assert 'confirmed=true' in str(exc)
    else:
        raise AssertionError('export must require confirmation')


def configured_client(tmp_path: Path, monkeypatch):
    policy = policy_for(tmp_path)
    policy_path = tmp_path / 'policy.yaml'
    policy_path.write_text(yaml.safe_dump(policy, sort_keys=False))
    monkeypatch.setattr(main, 'POLICY_PATH', policy_path)
    monkeypatch.setattr(main, 'WORKSPACE_ROOT', tmp_path)
    monkeypatch.setattr(main, 'REGISTRY_PATH', Path('runtime/registry/apps.jsonl'))
    monkeypatch.setattr(main, 'RECEIPT_PATH', tmp_path / 'runtime/receipts/execution.jsonl')
    return TestClient(main.app)


def test_suite_api_and_export_roundtrip(tmp_path: Path, monkeypatch):
    client = configured_client(tmp_path, monkeypatch)
    app = tmp_path / 'apps/reson8-life'
    app.mkdir(parents=True)
    (app / 'app.py').write_text('print("hello")\n')
    write_supply_chain_evidence(app, 'reson8-life')

    overview = client.get('/v1/suite')
    assert overview.status_code == 200, overview.text
    assert len(overview.json()['apps']) == 7

    status = client.get('/v1/suite/reson8-life')
    assert status.status_code == 200
    assert status.json()['sovereign_ready'] is True

    plan = client.post('/v1/suite/reson8-life/remediation', json={'write': True})
    assert plan.status_code == 200, plan.text
    assert plan.json()['receipt']['external_ai_used'] is False

    exported = client.post('/v1/suite/reson8-life/export', json={'confirmed': True})
    assert exported.status_code == 200, exported.text
    archive = exported.json()['export']['archive']
    verified = client.post('/v1/exports/verify', json={'archive': archive})
    assert verified.status_code == 200
    assert verified.json()['valid'] is True

def test_migration_blocks_env_variants_and_symlinks(tmp_path: Path):
    from foundry_controller.app.migration import SovereignMigrator
    _, policy = control(tmp_path)
    src = tmp_path / 'imports/projects/unsafe-migration'
    src.mkdir(parents=True)
    (src / '.env.staging').write_text('TOKEN=secret')
    outside = tmp_path / 'outside.txt'
    outside.write_text('outside')
    link = src / 'outside-link'
    try:
        link.symlink_to(outside)
    except OSError:
        link = None
    assessment = SovereignMigrator(tmp_path, policy).assess('imports/projects/unsafe-migration')
    assert '.env.staging' in assessment.secret_files
    assert assessment.blockers
    if link is not None:
        assert 'outside-link' in assessment.symlink_files
        assert any('Symlinks' in blocker for blocker in assessment.blockers)


def test_export_excludes_env_variant(tmp_path: Path):
    _, policy = control(tmp_path)
    app = tmp_path / 'apps/youtube-optimizer'
    app.mkdir(parents=True)
    (app / 'app.js').write_text('ok')
    (app / '.env.staging').write_text('TOKEN=secret')
    result = SovereignExporter(tmp_path, policy).export('youtube-optimizer', confirmed=True)
    with zipfile.ZipFile(tmp_path / result['archive']) as zf:
        assert not any(name.endswith('.env.staging') for name in zf.namelist())
