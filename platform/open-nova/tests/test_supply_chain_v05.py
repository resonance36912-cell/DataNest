import json
from pathlib import Path

import pytest

from foundry_controller.app.agent import GovernanceViolation
from foundry_controller.app.supply_chain import (
    LocalArtifactStore,
    dependency_inventory,
    verify_supply_chain_evidence,
    write_supply_chain_evidence,
)


def policy():
    return {
        'supply_chain': {
            'artifact_store': 'runtime/supply-chain/artifacts',
            'artifact_inbox': 'imports/artifacts',
            'max_artifact_bytes': 1000000,
        }
    }


def test_sbom_and_manifest_detect_tamper(tmp_path: Path):
    project = tmp_path / 'apps' / 'demo'
    project.mkdir(parents=True)
    (project / 'app.py').write_text('print("ok")\n')
    (project / 'requirements.txt').write_text('fastapi==0.116.1\n')
    evidence = write_supply_chain_evidence(project, 'demo')
    assert len(evidence['tree_sha256']) == 64
    assert verify_supply_chain_evidence(project)['valid'] is True
    sbom = json.loads((project / 'SBOM.cdx.json').read_text())
    assert sbom['bomFormat'] == 'CycloneDX'
    assert sbom['components'][0]['name'] == 'fastapi'
    (project / 'app.py').write_text('print("changed")\n')
    assert verify_supply_chain_evidence(project)['valid'] is False


def test_dependency_inventory_marks_floating_versions_unresolved(tmp_path: Path):
    project = tmp_path / 'app'
    project.mkdir()
    (project / 'package.json').write_text(json.dumps({'dependencies': {'react': '^19.1.1'}}))
    inv = dependency_inventory(project)
    assert inv['count'] == 1
    assert inv['offline_ready'] is False
    assert inv['unresolved'][0]['name'] == 'react'


def test_local_artifact_store_is_content_addressed_and_inbox_only(tmp_path: Path):
    inbox = tmp_path / 'imports' / 'artifacts'
    inbox.mkdir(parents=True)
    src = inbox / 'demo.whl'
    src.write_bytes(b'wheel-bytes')
    store = LocalArtifactStore(tmp_path, policy())
    item = store.ingest('imports/artifacts/demo.whl')
    assert len(item.sha256) == 64
    assert (tmp_path / item.stored_path).read_bytes() == b'wheel-bytes'
    assert store.verify()['valid'] is True

    outside = tmp_path / 'outside.whl'
    outside.write_bytes(b'no')
    with pytest.raises(GovernanceViolation):
        store.ingest('outside.whl')


def test_cache_status_requires_indexed_artifact(tmp_path: Path):
    project = tmp_path / 'apps' / 'demo'
    project.mkdir(parents=True)
    (project / 'requirements.txt').write_text('fastapi==0.116.1\n')
    inbox = tmp_path / 'imports' / 'artifacts'
    inbox.mkdir(parents=True)
    (inbox / 'fastapi.whl').write_bytes(b'local-wheel')
    store = LocalArtifactStore(tmp_path, policy())
    before = store.project_cache_status(project)
    assert before['offline_ready'] is False
    assert before['missing'] == ['pkg:pypi/fastapi@0.116.1']
    store.ingest('imports/artifacts/fastapi.whl', purl='pkg:pypi/fastapi@0.116.1')
    after = store.project_cache_status(project)
    assert after['offline_ready'] is True
    assert after['missing'] == []


def test_ed25519_local_attestation_detects_manifest_change(tmp_path: Path):
    import shutil
    if not shutil.which('openssl'):
        pytest.skip('openssl unavailable')
    from foundry_controller.app.supply_chain import LocalAttestor

    project = tmp_path / 'apps' / 'demo'
    project.mkdir(parents=True)
    (project / 'app.py').write_text('print("ok")\n')
    write_supply_chain_evidence(project, 'demo')
    p = policy()
    p['supply_chain'].update({
        'signing_private_key': 'runtime/secrets/attestation.key',
        'signing_public_key': 'runtime/secrets/attestation.pub.pem',
    })
    attestor = LocalAttestor(tmp_path, p)
    with pytest.raises(GovernanceViolation):
        attestor.initialize(confirmed=False)
    attestor.initialize(confirmed=True)
    attestor.sign(project, confirmed=True)
    assert attestor.verify(project)['valid'] is True
    manifest = json.loads((project / 'ARTIFACT_MANIFEST.json').read_text())
    manifest['app_id'] = 'tampered'
    (project / 'ARTIFACT_MANIFEST.json').write_text(json.dumps(manifest))
    assert attestor.verify(project)['valid'] is False
