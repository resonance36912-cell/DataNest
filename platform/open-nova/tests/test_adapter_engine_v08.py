from pathlib import Path
import json

import pytest

from foundry_controller.app.adapter_engine import SovereignAdapterEngine
from foundry_controller.app.agent import GovernanceViolation
from foundry_controller.app.registry import AppRegistry


def policy() -> dict:
    return {
        'adapter_engine': {
            'apps_root': 'apps', 'runtime_root': 'runtime/migrations',
            'adapter_dirname': 'open-nova-adapters', 'max_scan_files': 100,
            'max_file_bytes': 512000,
        }
    }


def make_app(tmp_path: Path, source: str, *, bindings: bool = True) -> tuple[SovereignAdapterEngine, Path]:
    app = tmp_path / 'apps/demo'
    (app / 'src').mkdir(parents=True)
    (app / 'src/client.ts').write_text(source, encoding='utf-8')
    if bindings:
        binding_dir = app / '.open-nova'
        binding_dir.mkdir(parents=True)
        (binding_dir / 'service-bindings.json').write_text(json.dumps({'bindings': []}), encoding='utf-8')
    registry = AppRegistry(tmp_path / 'runtime/registry/apps.jsonl')
    return SovereignAdapterEngine(tmp_path, policy(), registry), app


BASE = '''import { createClient } from "@supabase/supabase-js";
const supabase = createClient("https://demo.supabase.co", "public-value");
export async function list(){ return await supabase.from("items").select("*").eq("active", true); }
export async function login(email:string,password:string){ return supabase.auth.signInWithPassword({email,password}); }
export async function avatar(file:any){ return supabase.storage.from("avatars").upload("me.png", file); }
'''


def test_assessment_maps_database_auth_storage(tmp_path: Path):
    engine, _ = make_app(tmp_path, BASE)
    result = engine.assess('demo')
    assert 'supabase-hosted' in result['providers']
    assert 'items' in result['database']['tables']
    assert 'avatars' in result['storage']['buckets']
    assert 'signInWithPassword' in result['auth']['operations']
    assert result['ready_to_generate_adapters'] is True


def test_missing_service_bindings_is_blocker(tmp_path: Path):
    engine, _ = make_app(tmp_path, BASE, bindings=False)
    result = engine.assess('demo')
    assert 'service_bindings_missing' in result['blockers']
    assert result['ready_to_generate_adapters'] is False


def test_generate_requires_confirmation_and_writes_neutral_contract(tmp_path: Path):
    engine, app = make_app(tmp_path, BASE)
    with pytest.raises(GovernanceViolation, match='confirmed=true'):
        engine.generate('demo', confirmed=False)
    result = engine.generate('demo', confirmed=True)
    assert len(result['written']) == 5
    assert (app / 'open-nova-adapters/supabase-compat.ts').exists()
    assert (app / '.open-nova/migration/v0.8-plan.json').exists()
    assert result['source_rewritten'] is False


def test_unsupported_rpc_blocks_automatic_cutover(tmp_path: Path):
    engine, _ = make_app(tmp_path, BASE + '\nexport const x = supabase.rpc("do_thing");\n')
    engine.generate('demo', confirmed=True)
    assessment = engine.assess('demo')
    assert any(x['kind'] == 'supabase_rpc' for x in assessment['unsupported_operations'])
    with pytest.raises(GovernanceViolation, match='unsupported provider operations'):
        engine.prepare_cutover('demo', confirmed=True)


def test_destructive_sql_is_explicit_blocker(tmp_path: Path):
    engine, app = make_app(tmp_path, BASE)
    migrations = app / 'supabase/migrations'
    migrations.mkdir(parents=True)
    (migrations / '001.sql').write_text('create table x(id int); drop table old_data;', encoding='utf-8')
    assessment = engine.assess('demo')
    assert 'destructive_schema_change_requires_human_approval' in assessment['blockers']


def test_cutover_rewrites_only_supported_import_and_is_verifiable(tmp_path: Path):
    engine, app = make_app(tmp_path, BASE)
    engine.generate('demo', confirmed=True)
    result = engine.prepare_cutover('demo', confirmed=True)
    migrated = (app / 'src/client.ts').read_text(encoding='utf-8')
    assert '@supabase/supabase-js' not in migrated
    assert '../open-nova-adapters/supabase-compat' in migrated
    assert len(result['changes']) == 1
    verification = engine.verify_cutover('demo')
    assert verification['remaining_provider_imports'] == []
    assert verification['cutover_ready'] is True


def test_cutover_has_integrity_checked_rollback(tmp_path: Path):
    engine, app = make_app(tmp_path, BASE)
    engine.generate('demo', confirmed=True)
    result = engine.prepare_cutover('demo', confirmed=True)
    restored = engine.rollback('demo', result['migration_id'], confirmed=True)
    assert restored['rollback_complete'] is True
    assert '@supabase/supabase-js' in (app / 'src/client.ts').read_text(encoding='utf-8')


def test_rollback_refuses_to_overwrite_post_migration_user_change(tmp_path: Path):
    engine, app = make_app(tmp_path, BASE)
    engine.generate('demo', confirmed=True)
    result = engine.prepare_cutover('demo', confirmed=True)
    with (app / 'src/client.ts').open('a', encoding='utf-8') as f:
        f.write('\n// user edit after migration\n')
    with pytest.raises(GovernanceViolation, match='changed after migration'):
        engine.rollback('demo', result['migration_id'], confirmed=True)


def test_invalid_app_id_cannot_escape_apps_root(tmp_path: Path):
    engine, _ = make_app(tmp_path, BASE)
    with pytest.raises(GovernanceViolation, match='Invalid application id'):
        engine.assess('../governance')


def test_controller_owned_adapter_segments_are_protected_from_generic_agent(tmp_path: Path):
    from foundry_controller.app.agent import SovereignWorkspace
    p = {'execution': {'workspace_root': '.'}, 'protected_path_segments': ['.open-nova', 'open-nova-adapters']}
    ws = SovereignWorkspace(tmp_path, p)
    assert ws.is_protected('apps/demo/.open-nova/service-bindings.json') is True
    assert ws.is_protected('apps/demo/open-nova-adapters/http.ts') is True
    assert ws.is_protected('apps/demo/src/app.ts') is False
