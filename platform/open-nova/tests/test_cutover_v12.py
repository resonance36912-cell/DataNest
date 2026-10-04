from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml

from foundry_controller.app.agent import GovernanceViolation
from foundry_controller.app.cutover import SovereignCutoverManager
from foundry_controller.app.registry import AppRegistry


def policy(tmp_path: Path) -> dict:
    p = yaml.safe_load((Path(__file__).parents[1] / 'governance' / 'policy.yaml').read_text(encoding='utf-8'))
    p['execution']['workspace_root'] = str(tmp_path)
    return p


def setup_app(tmp_path: Path, app_id: str = 'reson8-life') -> tuple[Path, dict, AppRegistry, SovereignCutoverManager]:
    app = tmp_path / 'apps' / app_id
    (app / 'tests').mkdir(parents=True)
    (app / 'app.py').write_text('def answer():\n    return 42\n', encoding='utf-8')
    (app / 'tests' / 'test_app.py').write_text('from app import answer\n\ndef test_answer():\n    assert answer() == 42\n', encoding='utf-8')
    (app / 'requirements.txt').write_text('fastapi==0.116.1\n', encoding='utf-8')
    pol = policy(tmp_path)
    reg = AppRegistry(tmp_path / 'runtime' / 'registry' / 'apps.jsonl')
    mgr = SovereignCutoverManager(tmp_path, pol, reg)
    return app, pol, reg, mgr


def test_baseline_requires_confirmation(tmp_path: Path):
    _, _, _, mgr = setup_app(tmp_path)
    with pytest.raises(GovernanceViolation):
        mgr.baseline('reson8-life', confirmed=False)


def test_baseline_records_real_source_fingerprint(tmp_path: Path):
    app, _, _, mgr = setup_app(tmp_path)
    result = mgr.baseline('reson8-life', confirmed=True)
    assert result['file_count'] == 3
    assert result['production_cutover_performed'] is False
    record = json.loads((tmp_path / result['path']).read_text(encoding='utf-8'))
    assert record['source_fingerprint']['tree_sha256'] == result['tree_sha256']
    assert record['regression_inventory']['has_executable_regression_target'] is True
    assert record['external_ai_used'] is False
    # Controller evidence should not change the source fingerprint.
    (app / '.open-nova').mkdir(exist_ok=True)
    (app / '.open-nova' / 'local-note.json').write_text('{}', encoding='utf-8')
    plan = mgr.plan('reson8-life')
    assert plan['baseline_id'] == result['baseline_id']
    assert 'baseline_recorded_and_current' not in plan['blockers']


def test_source_drift_invalidates_baseline(tmp_path: Path):
    app, _, _, mgr = setup_app(tmp_path)
    mgr.baseline('reson8-life', confirmed=True)
    (app / 'app.py').write_text('def answer():\n    return 43\n', encoding='utf-8')
    plan = mgr.plan('reson8-life')
    assert 'baseline_recorded_and_current' in plan['blockers']
    assert plan['ready_for_local_cutover_validation'] is False


def test_cutover_certification_never_performs_production_cutover(tmp_path: Path):
    _, _, _, mgr = setup_app(tmp_path)
    mgr.baseline('reson8-life', confirmed=True)
    cert = mgr.certify_local_cutover('reson8-life', confirmed=True)
    assert cert['production_cutover_performed'] is False
    assert cert['production_cutover_allowed_by_policy'] is False
    assert cert['status'] in {'local_cutover_ready', 'local_cutover_blocked'}


def test_baseline_tamper_is_detected(tmp_path: Path):
    _, _, _, mgr = setup_app(tmp_path)
    result = mgr.baseline('reson8-life', confirmed=True)
    path = tmp_path / result['path']
    record = json.loads(path.read_text(encoding='utf-8'))
    record['app_id'] = 'tampered'
    path.write_text(json.dumps(record), encoding='utf-8')
    verified = mgr.verify_baselines('reson8-life')
    assert verified['valid'] is False
    assert verified['reason'] == 'hash_mismatch'


def test_symlink_in_managed_source_is_blocked(tmp_path: Path):
    app, _, _, mgr = setup_app(tmp_path)
    outside = tmp_path / 'outside.txt'
    outside.write_text('outside', encoding='utf-8')
    try:
        (app / 'escape.txt').symlink_to(outside)
    except (OSError, NotImplementedError):
        pytest.skip('symlinks unavailable on this platform')
    with pytest.raises(GovernanceViolation):
        mgr.baseline('reson8-life', confirmed=True)


def test_verified_rollback_checkpoint_is_created(tmp_path: Path):
    _, _, _, mgr = setup_app(tmp_path)
    result = mgr.checkpoint('reson8-life', confirmed=True)
    assert result['verified'] is True
    assert result['production_cutover_performed'] is False
    assert (tmp_path / result['archive']).is_file()


def test_isolated_regression_uses_disposable_copy_and_preserves_source(tmp_path: Path):
    from foundry_controller.app.runner import IsolatedTaskResult

    app, _, _, mgr = setup_app(tmp_path)
    before = (app / 'app.py').read_text(encoding='utf-8')

    class FakeRunner:
        def preflight(self):
            return {'engine': 'fake', 'engine_found': True, 'images': {'resonance-runner-python:0.3': True}, 'network_mode': 'none', 'pull_policy': 'never'}

        def run(self, task_name, project_relative):
            assert project_relative.startswith('apps/.cutover-scratch-reson8-life-')
            return IsolatedTaskResult(task_name, 'fake', 'resonance-runner-python:0.3', ['fake'], 0, 'passed', '')

    result = mgr.run_regression('reson8-life', tasks=['python_compile', 'python_tests'], confirmed=True, runner=FakeRunner())
    assert result['passed'] is True
    assert result['managed_source_unchanged'] is True
    assert result['network_mode'] == 'none'
    assert (app / 'app.py').read_text(encoding='utf-8') == before
    assert not list((tmp_path / 'apps').glob('.cutover-scratch-*'))


def test_regression_without_runner_records_blocker(tmp_path: Path):
    _, _, _, mgr = setup_app(tmp_path)

    class MissingRunner:
        def preflight(self):
            return {'engine': 'podman', 'engine_found': False, 'images': {}, 'network_mode': 'none', 'pull_policy': 'never'}

    result = mgr.run_regression('reson8-life', tasks=['python_tests'], confirmed=True, runner=MissingRunner())
    assert result['passed'] is False
    assert result['executed'] is False
    assert 'isolated_runner_unavailable' in result['blockers']


def test_preview_verification_rejects_non_loopback(tmp_path: Path):
    _, _, _, mgr = setup_app(tmp_path)
    with pytest.raises(GovernanceViolation):
        mgr.verify_preview('reson8-life', url='http://example.com:4310', confirmed=True)


def test_preview_verification_accepts_live_loopback(tmp_path: Path):
    import threading
    from http.server import BaseHTTPRequestHandler, HTTPServer

    _, pol, _, mgr = setup_app(tmp_path)
    server = None
    port = None
    for candidate in range(pol['preview']['port_min'], pol['preview']['port_max'] + 1):
        try:
            server = HTTPServer(('127.0.0.1', candidate), type('Handler', (BaseHTTPRequestHandler,), {
                'do_GET': lambda self: (self.send_response(200), self.end_headers(), self.wfile.write(b'ok')),
                'log_message': lambda *args: None,
            }))
            port = candidate
            break
        except OSError:
            continue
    if server is None or port is None:
        pytest.skip('No governed preview port available')
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        result = mgr.verify_preview('reson8-life', url=f'http://127.0.0.1:{port}/', confirmed=True)
        assert result['reachable'] is True
        assert result['loopback_only'] is True
        assert result['production'] is False
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_plan_rejects_tampered_checkpoint_evidence(tmp_path: Path):
    _, _, _, mgr = setup_app(tmp_path)
    mgr.baseline('reson8-life', confirmed=True)
    result = mgr.checkpoint('reson8-life', confirmed=True)
    path = tmp_path / result['path']
    record = json.loads(path.read_text(encoding='utf-8'))
    record['verified'] = False
    path.write_text(json.dumps(record), encoding='utf-8')
    with pytest.raises(GovernanceViolation):
        mgr.plan('reson8-life')
