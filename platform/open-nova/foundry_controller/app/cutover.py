from __future__ import annotations

import hashlib
import json
import http.client
import shutil
import subprocess
import uuid
from urllib.parse import urlparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .adapter_engine import SovereignAdapterEngine
from .agent import GovernanceViolation
from .backend_runtime import SovereignBackendRuntime
from .backup_export import SovereignExporter
from .registry import APP_ID_RE, AppRegistry
from .runner import DependencyGuard, StaticSecurityScanner, IsolatedRunner
from .service_fabric import SovereignServiceFabric
from .supply_chain import LocalArtifactStore, dependency_inventory, verify_supply_chain_evidence

IGNORED_PARTS = {
    '.git', 'node_modules', '.venv', 'venv', '__pycache__', '.pytest_cache',
    'dist', 'build', '.next', '.turbo', 'coverage'
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sha256_json(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()


class SovereignCutoverManager:
    """Evidence-first cutover orchestrator for a real managed application.

    This class does not perform production deployment. It records immutable-ish local
    evidence, checks provider-neutral readiness, and blocks certification when the
    actual application source/runtime evidence is absent.
    """

    def __init__(self, workspace_root: Path, policy: dict[str, Any], registry: AppRegistry):
        self.workspace = workspace_root.resolve()
        self.policy = policy
        self.registry = registry
        cfg = policy.get('cutover', {})
        self.apps_root = (self.workspace / str(cfg.get('apps_root', 'apps'))).resolve()
        self.runtime_root = (self.workspace / str(cfg.get('runtime_root', 'runtime/cutover'))).resolve()
        self.require_confirmation = bool(cfg.get('require_confirmation', True))
        self.production_cutover_allowed = bool(cfg.get('production_cutover_allowed', False))
        self.max_fingerprint_files = int(cfg.get('max_fingerprint_files', 10000))
        self.max_fingerprint_bytes = int(cfg.get('max_fingerprint_bytes', 1_000_000_000))
        preview = policy.get('preview', {})
        self.preview_port_min = int(preview.get('port_min', 4310))
        self.preview_port_max = int(preview.get('port_max', 4399))

    def _app(self, app_id: str) -> Path:
        if not APP_ID_RE.fullmatch(app_id):
            raise GovernanceViolation('Invalid application id.')
        app = (self.apps_root / app_id).resolve()
        try:
            app.relative_to(self.apps_root)
        except ValueError as exc:
            raise GovernanceViolation('Application path escaped apps root.') from exc
        if not app.is_dir():
            raise GovernanceViolation('Managed application source is not present locally.')
        return app

    def _tree_fingerprint(self, app: Path) -> dict[str, Any]:
        entries: list[dict[str, Any]] = []
        total = 0
        for path in sorted(app.rglob('*')):
            if path.is_symlink():
                raise GovernanceViolation(f'Symlink detected in managed app: {path.relative_to(app).as_posix()}')
            if not path.is_file():
                continue
            rel = path.relative_to(app)
            if any(part in IGNORED_PARTS for part in rel.parts):
                continue
            # Controller-generated evidence should not cause the application source fingerprint to drift.
            if rel.parts and rel.parts[0] == '.open-nova':
                continue
            size = path.stat().st_size
            total += size
            if len(entries) >= self.max_fingerprint_files:
                raise GovernanceViolation('Cutover fingerprint exceeded governed file-count limit.')
            if total > self.max_fingerprint_bytes:
                raise GovernanceViolation('Cutover fingerprint exceeded governed byte limit.')
            entries.append({
                'path': rel.as_posix(),
                'bytes': size,
                'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            })
        canonical = json.dumps(entries, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
        return {
            'file_count': len(entries),
            'total_bytes': total,
            'tree_sha256': hashlib.sha256(canonical.encode('utf-8')).hexdigest(),
            'files': entries,
        }

    @staticmethod
    def _test_inventory(app: Path) -> dict[str, Any]:
        package = app / 'package.json'
        node_scripts: dict[str, str] = {}
        if package.is_file():
            try:
                data = json.loads(package.read_text(encoding='utf-8'))
                scripts = data.get('scripts') or {}
                if isinstance(scripts, dict):
                    node_scripts = {str(k): str(v) for k, v in sorted(scripts.items()) if k in {'test', 'build', 'lint', 'typecheck'}}
            except (json.JSONDecodeError, OSError):
                pass
        python_tests = sorted(p.relative_to(app).as_posix() for p in app.rglob('test_*.py') if p.is_file() and not p.is_symlink())
        has_pyproject = (app / 'pyproject.toml').is_file()
        has_requirements = (app / 'requirements.txt').is_file()
        suggested_tasks: list[str] = []
        if python_tests or has_pyproject or has_requirements:
            suggested_tasks.extend(['python_compile', 'python_tests'])
        if 'test' in node_scripts:
            suggested_tasks.append('node_test')
        if 'build' in node_scripts:
            suggested_tasks.append('node_build')
        return {
            'python_test_files': python_tests,
            'node_scripts': node_scripts,
            'suggested_isolated_tasks': suggested_tasks,
            'has_executable_regression_target': bool(suggested_tasks),
        }

    @staticmethod
    def _git_head(app: Path) -> str | None:
        try:
            result = subprocess.run(
                ['git', '-C', str(app), 'rev-parse', 'HEAD'],
                capture_output=True, text=True, timeout=5, shell=False,
            )
            if result.returncode == 0:
                value = result.stdout.strip()
                if len(value) == 40:
                    return value
        except (OSError, subprocess.SubprocessError):
            return None
        return None

    def baseline(self, app_id: str, *, confirmed: bool = False) -> dict[str, Any]:
        if self.require_confirmation and not confirmed:
            raise GovernanceViolation('Recording a cutover baseline requires confirmed=true.')
        app = self._app(app_id)
        fingerprint = self._tree_fingerprint(app)
        dependency = DependencyGuard(self.policy).check(app)
        security = StaticSecurityScanner(self.policy).scan(app)
        inventory = dependency_inventory(app)
        cache = LocalArtifactStore(self.workspace, self.policy).project_cache_status(app)
        integrity = verify_supply_chain_evidence(app)
        adapters = SovereignAdapterEngine(self.workspace, self.policy, self.registry).assess(app_id)
        backend_plan = SovereignBackendRuntime(self.workspace, self.policy, self.registry).migration_plan(app_id)
        tests = self._test_inventory(app)
        record = {
            'schema': 'resonance-cutover-baseline/v1',
            'created_at': utc_now(),
            'release': '1.5.8',
            'app_id': app_id,
            'source_fingerprint': fingerprint,
            'git_head': self._git_head(app),
            'dependency_policy': dependency,
            'dependency_inventory': inventory,
            'cache_status': cache,
            'security_scan': security,
            'supply_chain_integrity': integrity,
            'adapter_assessment': adapters,
            'backend_migration_plan': backend_plan,
            'regression_inventory': tests,
            'production_cutover_performed': False,
            'external_ai_used': False,
        }
        baseline_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + fingerprint['tree_sha256'][:12]
        target = (self.runtime_root / app_id / 'baselines').resolve()
        target.mkdir(parents=True, exist_ok=True)
        path = target / f'{baseline_id}.json'
        if path.exists():
            raise GovernanceViolation('Identical cutover baseline already exists; refusing to overwrite.')
        record['baseline_id'] = baseline_id
        record['record_sha256'] = _sha256_json(record)
        path.write_text(json.dumps(record, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        event = self.registry.append(app_id, 'cutover_baseline_recorded', {
            'status': 'cutover_baseline_recorded',
            'baseline_id': baseline_id,
            'tree_sha256': fingerprint['tree_sha256'],
            'production_cutover_performed': False,
        })
        return {
            'app_id': app_id,
            'baseline_id': baseline_id,
            'path': str(path.relative_to(self.workspace)).replace('\\', '/'),
            'tree_sha256': fingerprint['tree_sha256'],
            'file_count': fingerprint['file_count'],
            'regression_inventory': tests,
            'registry_event': event,
            'production_cutover_performed': False,
        }

    def _latest_baseline(self, app_id: str) -> dict[str, Any] | None:
        root = self.runtime_root / app_id / 'baselines'
        if not root.is_dir():
            return None
        paths = sorted(root.glob('*.json'))
        if not paths:
            return None
        try:
            record = json.loads(paths[-1].read_text(encoding='utf-8'))
        except json.JSONDecodeError as exc:
            raise GovernanceViolation('Latest cutover baseline is invalid JSON.') from exc
        digest = record.get('record_sha256')
        base = {k: v for k, v in record.items() if k != 'record_sha256'}
        if digest != _sha256_json(base):
            raise GovernanceViolation('Latest cutover baseline failed integrity verification.')
        return record

    def _latest_record(self, app_id: str, kind: str) -> dict[str, Any] | None:
        root = self.runtime_root / app_id / kind
        if not root.is_dir():
            return None
        paths = sorted(root.glob('*.json'))
        if not paths:
            return None
        try:
            record = json.loads(paths[-1].read_text(encoding='utf-8'))
        except json.JSONDecodeError as exc:
            raise GovernanceViolation(f'Latest cutover {kind} evidence is invalid JSON.') from exc
        digest = record.get('record_sha256')
        base = {k: v for k, v in record.items() if k != 'record_sha256'}
        if digest != _sha256_json(base):
            raise GovernanceViolation(f'Latest cutover {kind} evidence failed integrity verification.')
        return record

    def checkpoint(self, app_id: str, *, confirmed: bool = False) -> dict[str, Any]:
        if self.require_confirmation and not confirmed:
            raise GovernanceViolation('Creating a cutover rollback checkpoint requires confirmed=true.')
        self._app(app_id)
        export = SovereignExporter(self.workspace, self.policy).export(app_id, confirmed=True)
        verified = SovereignExporter(self.workspace, self.policy).verify_export(export['archive'])
        if not verified.get('valid'):
            raise GovernanceViolation('Rollback checkpoint export failed integrity verification.')
        record = {
            'schema': 'resonance-cutover-checkpoint/v1',
            'created_at': utc_now(),
            'release': '1.5.8',
            'app_id': app_id,
            'archive': export['archive'],
            'archive_sha256': export['archive_sha256'],
            'verified': True,
            'secret_files_included': False,
            'source_modified': False,
            'production_cutover_performed': False,
        }
        root = (self.runtime_root / app_id / 'checkpoints').resolve()
        root.mkdir(parents=True, exist_ok=True)
        path = root / f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{export['archive_sha256'][:12]}.json"
        record['record_sha256'] = _sha256_json(record)
        path.write_text(json.dumps(record, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        event = self.registry.append(app_id, 'cutover_checkpoint_created', {
            'status': 'cutover_checkpoint_created', 'archive_sha256': export['archive_sha256'],
            'production_cutover_performed': False,
        })
        return {**record, 'path': str(path.relative_to(self.workspace)).replace('\\', '/'), 'registry_event': event}

    def run_regression(self, app_id: str, *, tasks: list[str] | None = None, confirmed: bool = False, runner: IsolatedRunner | None = None) -> dict[str, Any]:
        if self.require_confirmation and not confirmed:
            raise GovernanceViolation('Recording isolated regression evidence requires confirmed=true.')
        app = self._app(app_id)
        before = self._tree_fingerprint(app)
        inventory = self._test_inventory(app)
        selected = list(tasks or inventory['suggested_isolated_tasks'])
        if not selected:
            raise GovernanceViolation('No governed regression task is declared for this application.')
        if len(selected) > 4 or len(set(selected)) != len(selected):
            raise GovernanceViolation('Regression task selection is invalid.')
        allowed = set(self.policy.get('isolated_runner', {}).get('tasks', {}).keys())
        if any(task not in allowed for task in selected):
            raise GovernanceViolation('Regression task is not governance-allowlisted.')

        isolated = runner or IsolatedRunner(self.workspace, self.policy)
        preflight = isolated.preflight()
        results: list[dict[str, Any]] = []
        executed = False
        scratch: Path | None = None
        blockers: list[str] = []
        try:
            if not preflight.get('engine_found'):
                blockers.append('isolated_runner_unavailable')
            else:
                # Execute only against a disposable copy. The managed source is never mounted into the runner.
                scratch = self.apps_root / f'.cutover-scratch-{app_id}-{uuid.uuid4().hex[:8]}'
                shutil.copytree(app, scratch, symlinks=False, ignore=shutil.ignore_patterns(*IGNORED_PARTS))
                executed = True
                for task in selected:
                    try:
                        result = isolated.run(task, str(scratch.relative_to(self.workspace)).replace('\\', '/'))
                        results.append({
                            'task': result.task, 'engine': result.engine, 'image': result.image,
                            'returncode': result.returncode, 'stdout_tail': result.stdout[-4000:],
                            'stderr_tail': result.stderr[-4000:],
                        })
                        if result.returncode != 0:
                            blockers.append(f'regression_failed:{task}')
                    except GovernanceViolation as exc:
                        blockers.append(f'regression_blocked:{task}:{str(exc)}')
                        break
        finally:
            if scratch is not None:
                shutil.rmtree(scratch, ignore_errors=True)

        after = self._tree_fingerprint(app)
        source_unchanged = before['tree_sha256'] == after['tree_sha256']
        if not source_unchanged:
            blockers.append('managed_source_changed_during_regression')
        passed = executed and not blockers and len(results) == len(selected)
        record = {
            'schema': 'resonance-cutover-regression/v1',
            'created_at': utc_now(), 'release': '1.5.8', 'app_id': app_id,
            'tasks': selected, 'executed': executed, 'passed': passed, 'blockers': blockers,
            'runner_preflight': preflight, 'results': results,
            'source_tree_before': before['tree_sha256'], 'source_tree_after': after['tree_sha256'],
            'managed_source_unchanged': source_unchanged, 'network_mode': 'none',
            'production_cutover_performed': False, 'external_ai_used': False,
        }
        root = (self.runtime_root / app_id / 'regressions').resolve()
        root.mkdir(parents=True, exist_ok=True)
        path = root / f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{before['tree_sha256'][:12]}.json"
        record['record_sha256'] = _sha256_json(record)
        path.write_text(json.dumps(record, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        self.registry.append(app_id, 'cutover_regression_checked', {'status': 'regression_passed' if passed else 'regression_blocked', 'tasks': selected, 'blockers': blockers})
        return {**record, 'path': str(path.relative_to(self.workspace)).replace('\\', '/')}

    def verify_preview(self, app_id: str, *, url: str, confirmed: bool = False) -> dict[str, Any]:
        if self.require_confirmation and not confirmed:
            raise GovernanceViolation('Recording preview verification requires confirmed=true.')
        self._app(app_id)
        parsed = urlparse(url)
        if parsed.scheme != 'http' or parsed.hostname not in {'127.0.0.1', 'localhost'}:
            raise GovernanceViolation('Cutover preview verification is loopback HTTP only.')
        port = parsed.port
        if port is None or not (self.preview_port_min <= port <= self.preview_port_max):
            raise GovernanceViolation('Preview port is outside the governed loopback range.')
        path = parsed.path or '/'
        if parsed.query:
            path += '?' + parsed.query
        reachable = False
        status_code = None
        error = None
        connect_host = '127.0.0.1' if parsed.hostname == 'localhost' else parsed.hostname
        conn = http.client.HTTPConnection(connect_host, port, timeout=0.7)
        try:
            conn.request('GET', path, headers={'Host': parsed.hostname})
            response = conn.getresponse()
            status_code = response.status
            response.read(2048)
            reachable = 200 <= response.status < 400
        except OSError as exc:
            error = type(exc).__name__
        finally:
            conn.close()
        record = {
            'schema': 'resonance-cutover-preview/v1', 'created_at': utc_now(),
            'release': '1.5.8', 'app_id': app_id, 'url': url,
            'host': parsed.hostname, 'port': port, 'loopback_only': True,
            'reachable': reachable, 'status_code': status_code, 'error': error,
            'production': False, 'production_cutover_performed': False,
        }
        root = (self.runtime_root / app_id / 'previews').resolve()
        root.mkdir(parents=True, exist_ok=True)
        path_out = root / f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{port}.json"
        record['record_sha256'] = _sha256_json(record)
        path_out.write_text(json.dumps(record, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        self.registry.append(app_id, 'cutover_preview_checked', {'status': 'preview_ready' if reachable else 'preview_blocked', 'loopback_only': True, 'port': port})
        return {**record, 'path': str(path_out.relative_to(self.workspace)).replace('\\', '/')}

    def plan(self, app_id: str) -> dict[str, Any]:
        app = self._app(app_id)
        baseline = self._latest_baseline(app_id)
        current_fp = self._tree_fingerprint(app)
        adapter = SovereignAdapterEngine(self.workspace, self.policy, self.registry).assess(app_id)
        backend = SovereignBackendRuntime(self.workspace, self.policy, self.registry)
        try:
            backend_health = backend.health()
        except GovernanceViolation as exc:
            backend_health = {"ready": False, "services": [], "errors": [str(exc)]}
        backend_plan = backend.migration_plan(app_id)
        fabric = SovereignServiceFabric(self.workspace, self.policy, self.registry)
        try:
            service_health = fabric.health()
        except GovernanceViolation as exc:
            service_health = {"ready": False, "services": [], "errors": [str(exc)]}
        dependency = DependencyGuard(self.policy).check(app)
        security = StaticSecurityScanner(self.policy).scan(app)
        inventory = dependency_inventory(app)
        cache = LocalArtifactStore(self.workspace, self.policy).project_cache_status(app)
        integrity = verify_supply_chain_evidence(app)
        bindings = app / '.open-nova' / 'service-bindings.json'
        tests = self._test_inventory(app)
        checkpoint = self._latest_record(app_id, 'checkpoints')
        regression = self._latest_record(app_id, 'regressions')
        preview = self._latest_record(app_id, 'previews')

        baseline_current = bool(baseline and baseline.get('source_fingerprint', {}).get('tree_sha256') == current_fp['tree_sha256'])
        regression_current = bool(regression and regression.get('passed') and regression.get('source_tree_before') == current_fp['tree_sha256'] and regression.get('source_tree_after') == current_fp['tree_sha256'])
        checkpoint_valid = bool(checkpoint and checkpoint.get('verified'))
        preview_ready = bool(preview and preview.get('reachable') and preview.get('loopback_only') and not preview.get('production'))
        gates = [
            {'gate': 'real_source_present', 'passed': True, 'critical': True, 'evidence': f'apps/{app_id}'},
            {'gate': 'baseline_recorded_and_current', 'passed': baseline_current, 'critical': True, 'evidence': baseline.get('baseline_id') if baseline else None},
            {'gate': 'dependency_policy_passed', 'passed': bool(dependency.get('passed')), 'critical': True, 'evidence': 'DependencyGuard'},
            {'gate': 'offline_dependency_inventory', 'passed': bool(inventory.get('offline_ready')), 'critical': True, 'evidence': 'dependency inventory'},
            {'gate': 'offline_dependency_cache', 'passed': bool(cache.get('offline_ready')), 'critical': True, 'evidence': 'local artifact cache'},
            {'gate': 'security_scan_passed', 'passed': bool(security.get('passed')), 'critical': True, 'evidence': 'static security scan'},
            {'gate': 'supply_chain_integrity', 'passed': bool(integrity.get('valid')), 'critical': True, 'evidence': 'SBOM + artifact manifest'},
            {'gate': 'service_bindings_present', 'passed': bindings.is_file(), 'critical': True, 'evidence': '.open-nova/service-bindings.json'},
            {'gate': 'provider_adapter_ready', 'passed': not bool(adapter.get('blockers')), 'critical': True, 'evidence': 'adapter assessment'},
            {'gate': 'schema_migration_safe', 'passed': not bool(backend_plan.get('blockers')), 'critical': True, 'evidence': 'backend migration plan'},
            {'gate': 'regression_target_declared', 'passed': bool(tests.get('has_executable_regression_target')), 'critical': True, 'evidence': 'project test/build scripts'},
            {'gate': 'rollback_checkpoint_verified', 'passed': checkpoint_valid, 'critical': True, 'evidence': checkpoint.get('archive_sha256') if checkpoint else None},
            {'gate': 'isolated_regression_passed_current_source', 'passed': regression_current, 'critical': True, 'evidence': regression.get('record_sha256') if regression else None},
            {'gate': 'loopback_preview_verified', 'passed': preview_ready, 'critical': True, 'evidence': preview.get('url') if preview else None},
            {'gate': 'service_fabric_healthy', 'passed': bool(service_health.get('ready')), 'critical': True, 'evidence': 'local service fabric health'},
            {'gate': 'backend_runtime_healthy', 'passed': bool(backend_health.get('ready')), 'critical': True, 'evidence': 'local backend health'},
        ]
        blockers = [g['gate'] for g in gates if g['critical'] and not g['passed']]
        return {
            'schema': 'resonance-real-app-cutover-plan/v1',
            'created_at': utc_now(),
            'release': '1.5.8',
            'app_id': app_id,
            'baseline_id': baseline.get('baseline_id') if baseline else None,
            'current_tree_sha256': current_fp['tree_sha256'],
            'checkpoint': checkpoint,
            'regression': regression,
            'preview': preview,
            'gates': gates,
            'blockers': blockers,
            'ready_for_local_cutover_validation': not blockers,
            'production_cutover_allowed_by_policy': self.production_cutover_allowed,
            'production_cutover_performed': False,
            'external_ai_required': False,
        }

    def certify_local_cutover(self, app_id: str, *, confirmed: bool = False) -> dict[str, Any]:
        if self.require_confirmation and not confirmed:
            raise GovernanceViolation('Local cutover certification requires confirmed=true.')
        plan = self.plan(app_id)
        # Production cutover is never performed by this action, even when local readiness passes.
        status = 'local_cutover_ready' if plan['ready_for_local_cutover_validation'] else 'local_cutover_blocked'
        record = {
            'schema': 'resonance-local-cutover-certification/v1',
            'created_at': utc_now(),
            'release': '1.5.8',
            'app_id': app_id,
            'status': status,
            'ready': plan['ready_for_local_cutover_validation'],
            'blockers': plan['blockers'],
            'baseline_id': plan['baseline_id'],
            'current_tree_sha256': plan['current_tree_sha256'],
            'production_cutover_performed': False,
            'production_cutover_allowed_by_policy': self.production_cutover_allowed,
            'external_ai_used': False,
        }
        root = (self.runtime_root / app_id / 'certifications').resolve()
        root.mkdir(parents=True, exist_ok=True)
        path = root / f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{status}.json"
        record['record_sha256'] = _sha256_json(record)
        path.write_text(json.dumps(record, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        event = self.registry.append(app_id, 'local_cutover_certification_checked', {
            'status': status,
            'blockers': plan['blockers'],
            'production_cutover_performed': False,
        })
        return {**record, 'path': str(path.relative_to(self.workspace)).replace('\\', '/'), 'registry_event': event}

    def verify_baselines(self, app_id: str) -> dict[str, Any]:
        self._app(app_id)
        root = self.runtime_root / app_id / 'baselines'
        if not root.exists():
            return {'schema': 'resonance-cutover-baseline-verification/v1', 'valid': True, 'records': 0}
        count = 0
        for path in sorted(root.glob('*.json')):
            try:
                record = json.loads(path.read_text(encoding='utf-8'))
            except json.JSONDecodeError:
                return {'schema': 'resonance-cutover-baseline-verification/v1', 'valid': False, 'records': count, 'reason': 'invalid_json'}
            digest = record.get('record_sha256')
            base = {k: v for k, v in record.items() if k != 'record_sha256'}
            if digest != _sha256_json(base):
                return {'schema': 'resonance-cutover-baseline-verification/v1', 'valid': False, 'records': count, 'reason': 'hash_mismatch', 'path': path.name}
            count += 1
        return {'schema': 'resonance-cutover-baseline-verification/v1', 'valid': True, 'records': count}
