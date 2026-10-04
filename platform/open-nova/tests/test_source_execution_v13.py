from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest
import yaml

from foundry_controller.app.agent import GovernanceViolation
from foundry_controller.app.registry import AppRegistry
from foundry_controller.app.source_execution import RealSourceIngestor, MigrationExecutionManager

ROOT = Path(__file__).parents[1]


def policy(tmp_path: Path) -> dict:
    p = yaml.safe_load((ROOT / 'governance' / 'policy.yaml').read_text(encoding='utf-8'))
    p['execution']['workspace_root'] = str(tmp_path)
    # Runtime modules resolve these governance files from the workspace.
    (tmp_path / 'governance').mkdir(parents=True, exist_ok=True)
    for name in ['service-fabric.yaml', 'backend-runtime.yaml', 'local-service-replacements.yaml', 'suite.yaml']:
        shutil.copy2(ROOT / 'governance' / name, tmp_path / 'governance' / name)
    return p


def registry(tmp_path: Path) -> AppRegistry:
    return AppRegistry(tmp_path / 'runtime' / 'registry' / 'apps.jsonl')


def make_local_source(tmp_path: Path, name: str = 'source') -> Path:
    src = tmp_path.parent / f'{tmp_path.name}-{name}'
    src.mkdir(parents=True, exist_ok=True)
    (src / 'README.md').write_text('# Real app\n', encoding='utf-8')
    (src / 'src').mkdir()
    (src / 'src' / 'main.ts').write_text('export const value = 42;\n', encoding='utf-8')
    return src


def test_stage_local_requires_confirmation(tmp_path: Path):
    pol = policy(tmp_path)
    src = make_local_source(tmp_path)
    mgr = RealSourceIngestor(tmp_path, pol, registry(tmp_path))
    with pytest.raises(GovernanceViolation):
        mgr.stage_local('reson8-life', str(src), confirmed=False)


def test_stage_local_copies_without_recording_source_path(tmp_path: Path):
    pol = policy(tmp_path)
    src = make_local_source(tmp_path)
    mgr = RealSourceIngestor(tmp_path, pol, registry(tmp_path))
    result = mgr.stage_local('reson8-life', str(src), confirmed=True)
    assert result['staged'] is True
    assert result['source_modified'] is False
    assert result['source_path_recorded'] is False
    assert (tmp_path / 'imports/projects/reson8-life/src/main.ts').is_file()
    record = json.loads((tmp_path / 'runtime/source-ingestion/reson8-life/latest.json').read_text(encoding='utf-8'))
    assert 'source_path_sha256' in record
    assert str(src) not in json.dumps(record)
    assert record['network_used'] is False


def test_stage_local_rejects_secret_bearing_source(tmp_path: Path):
    pol = policy(tmp_path)
    src = make_local_source(tmp_path)
    (src / '.env.production.local').write_text('TOKEN=secret\n', encoding='utf-8')
    mgr = RealSourceIngestor(tmp_path, pol, registry(tmp_path))
    with pytest.raises(GovernanceViolation, match='secret-bearing'):
        mgr.stage_local('reson8-life', str(src), confirmed=True)
    assert not (tmp_path / 'imports/projects/reson8-life').exists()


def test_source_evidence_tamper_is_detected(tmp_path: Path):
    pol = policy(tmp_path)
    src = make_local_source(tmp_path)
    mgr = RealSourceIngestor(tmp_path, pol, registry(tmp_path))
    mgr.stage_local('reson8-life', str(src), confirmed=True)
    path = tmp_path / 'runtime/source-ingestion/reson8-life/latest.json'
    record = json.loads(path.read_text(encoding='utf-8'))
    record['tree_sha256'] = '0' * 64
    path.write_text(json.dumps(record), encoding='utf-8')
    with pytest.raises(GovernanceViolation, match='integrity'):
        mgr.status('reson8-life')


def test_import_staged_real_source_is_copy_only_and_writes_supply_chain(tmp_path: Path):
    pol = policy(tmp_path)
    src = make_local_source(tmp_path)
    mgr = RealSourceIngestor(tmp_path, pol, registry(tmp_path))
    mgr.stage_local('reson8-life', str(src), confirmed=True)
    before = (src / 'src/main.ts').read_bytes()
    result = mgr.import_staged('reson8-life', confirmed=True)
    assert result['imported'] is True
    assert result['source_modified'] is False
    assert result['supply_chain_verified'] is True
    assert (src / 'src/main.ts').read_bytes() == before
    assert (tmp_path / 'apps/reson8-life/SBOM.cdx.json').is_file()


def make_managed_supabase_app(tmp_path: Path) -> Path:
    app = tmp_path / 'apps/reson8-life'
    (app / 'src').mkdir(parents=True, exist_ok=True)
    (app / 'src/client.ts').write_text(
        'import { createClient } from "@supabase/supabase-js";\n'
        'export const client = createClient("https://example.supabase.co", "public-anon-key");\n',
        encoding='utf-8',
    )
    (app / 'package.json').write_text(json.dumps({
        'name': 'reson8-life', 'version': '1.0.0',
        'dependencies': {'@supabase/supabase-js': '2.55.0'},
    }), encoding='utf-8')
    (app / 'package-lock.json').write_text(json.dumps({
        'name': 'reson8-life', 'version': '1.0.0', 'lockfileVersion': 3, 'packages': {}
    }), encoding='utf-8')
    return app


def test_migration_prepare_creates_baseline_and_checkpoint(tmp_path: Path):
    pol = policy(tmp_path)
    make_managed_supabase_app(tmp_path)
    mgr = MigrationExecutionManager(tmp_path, pol, registry(tmp_path))
    result = mgr.prepare('reson8-life', confirmed=True)
    assert result['baseline_id']
    assert len(result['checkpoint_sha256']) == 64
    assert result['production_cutover_performed'] is False
    assert result['network_used'] is False


def test_supported_migration_requires_prepare_first(tmp_path: Path):
    pol = policy(tmp_path)
    make_managed_supabase_app(tmp_path)
    mgr = MigrationExecutionManager(tmp_path, pol, registry(tmp_path))
    with pytest.raises(GovernanceViolation, match='baseline'):
        mgr.execute_supported('reson8-life', confirmed=True)


def test_supported_supabase_cutover_and_rollback(tmp_path: Path):
    pol = policy(tmp_path)
    app = make_managed_supabase_app(tmp_path)
    original = (app / 'src/client.ts').read_text(encoding='utf-8')
    mgr = MigrationExecutionManager(tmp_path, pol, registry(tmp_path))
    prep = mgr.prepare('reson8-life', confirmed=True)
    assert prep['ready_for_supported_execution'] is True
    result = mgr.execute_supported('reson8-life', confirmed=True)
    assert result['rollback_available'] is True
    assert result['production_cutover_performed'] is False
    migrated = (app / 'src/client.ts').read_text(encoding='utf-8')
    assert '@supabase/supabase-js' not in migrated
    assert 'open-nova-adapters/supabase-compat' in migrated
    assert (app / '.open-nova/service-bindings.json').is_file()
    assert (app / 'open-nova-adapters/supabase-compat.ts').is_file()
    rolled = mgr.rollback('reson8-life', result['migration_id'], confirmed=True)
    assert rolled['supply_chain_verified'] is True
    assert (app / 'src/client.ts').read_text(encoding='utf-8') == original


def test_unsupported_provider_semantics_block_execution(tmp_path: Path):
    pol = policy(tmp_path)
    app = make_managed_supabase_app(tmp_path)
    (app / 'src/realtime.ts').write_text('client.channel("updates").subscribe();\n', encoding='utf-8')
    mgr = MigrationExecutionManager(tmp_path, pol, registry(tmp_path))
    prep = mgr.prepare('reson8-life', confirmed=True)
    assert prep['ready_for_supported_execution'] is False
    with pytest.raises(GovernanceViolation, match='unsupported'):
        mgr.execute_supported('reson8-life', confirmed=True)
