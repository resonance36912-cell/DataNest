import json
from pathlib import Path

import pytest

from foundry_controller.app.agent import GovernanceViolation
from foundry_controller.app.migration import SovereignMigrator


def policy():
    return {
        'migration': {
            'source_root': 'imports/projects',
            'destination_root': 'apps',
            'copy_only': True,
            'source_mutation_allowed': False,
            'overwrite_existing_app': False,
            'block_secret_files': True,
            'max_files': 100,
            'max_total_bytes': 1000000,
        }
    }


def make_lovable_like(root: Path):
    root.mkdir(parents=True)
    (root / 'src').mkdir()
    (root / 'src' / 'main.tsx').write_text('const url = "https://abc.supabase.co"; // lovable\n')
    (root / 'package.json').write_text(json.dumps({
        'dependencies': {'@supabase/supabase-js': '2.55.0', 'react': '19.1.1'}
    }))
    (root / 'package-lock.json').write_text('{}')
    (root / 'vite.config.ts').write_text('export default {}\n')


def test_migration_assesses_lovable_and_hosted_dependencies(tmp_path: Path):
    src = tmp_path / 'imports' / 'projects' / 'legacy'
    make_lovable_like(src)
    assessment = SovereignMigrator(tmp_path, policy()).assess('imports/projects/legacy')
    assert {'node', 'vite', 'frontend-source'} <= set(assessment.stack)
    services = {x['service'] for x in assessment.external_dependencies}
    assert 'lovable' in services
    assert 'supabase-hosted' in services
    assert assessment.blockers == []


def test_migration_blocks_secret_files(tmp_path: Path):
    src = tmp_path / 'imports' / 'projects' / 'legacy'
    make_lovable_like(src)
    (src / '.env').write_text('SECRET=value\n')
    migrator = SovereignMigrator(tmp_path, policy())
    assessment = migrator.assess('imports/projects/legacy')
    assert '.env' in assessment.secret_files
    with pytest.raises(GovernanceViolation):
        migrator.import_copy('imports/projects/legacy', confirmed=True)


def test_import_is_copy_only_and_never_overwrites(tmp_path: Path):
    src = tmp_path / 'imports' / 'projects' / 'legacy'
    make_lovable_like(src)
    original = (src / 'src' / 'main.tsx').read_text()
    migrator = SovereignMigrator(tmp_path, policy())
    report = migrator.import_copy('imports/projects/legacy', app_name='Imported Legacy', confirmed=True)
    dest = tmp_path / 'apps' / 'imported-legacy'
    assert dest.exists()
    assert (src / 'src' / 'main.tsx').read_text() == original
    assert json.loads((dest / 'MIGRATION_REPORT.json').read_text())['source_modified'] is False
    assert report['destination'] == 'apps/imported-legacy'
    with pytest.raises(GovernanceViolation):
        migrator.import_copy('imports/projects/legacy', app_name='Imported Legacy', confirmed=True)


def test_migration_source_cannot_escape_inbox(tmp_path: Path):
    outside = tmp_path / 'other'
    outside.mkdir()
    with pytest.raises(GovernanceViolation):
        SovereignMigrator(tmp_path, policy()).assess('other')
