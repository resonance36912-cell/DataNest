from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .agent import GovernanceViolation

IGNORED_DIRS = {'.git', 'node_modules', '.venv', 'venv', '__pycache__', 'dist', 'build', '.pytest_cache'}
HASH_SKIP = {'SBOM.cdx.json', 'ARTIFACT_MANIFEST.json', 'ARTIFACT_MANIFEST.sig'}
PY_REQ_RE = re.compile(r'^([A-Za-z0-9_.-]+)==([^\s;]+)')


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def tree_manifest(project: Path, max_files: int = 5000) -> dict[str, Any]:
    project = project.resolve()
    files: list[dict[str, Any]] = []
    for path in sorted(project.rglob('*')):
        if path.is_dir() or any(part in IGNORED_DIRS for part in path.parts):
            continue
        rel = str(path.relative_to(project)).replace('\\', '/')
        if Path(rel).name in HASH_SKIP:
            continue
        if len(files) >= max_files:
            raise GovernanceViolation(f'Artifact manifest exceeds {max_files} files.')
        files.append({'path': rel, 'bytes': path.stat().st_size, 'sha256': sha256_file(path)})
    canonical = json.dumps(files, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
    return {
        'algorithm': 'sha256',
        'files': files,
        'file_count': len(files),
        'tree_sha256': hashlib.sha256(canonical.encode('utf-8')).hexdigest(),
    }


def _python_components(project: Path) -> list[dict[str, Any]]:
    path = project / 'requirements.txt'
    if not path.exists():
        return []
    items: list[dict[str, Any]] = []
    for raw in path.read_text(encoding='utf-8', errors='replace').splitlines():
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        m = PY_REQ_RE.match(line)
        if m:
            name, version = m.groups()
            items.append({
                'type': 'library', 'name': name, 'version': version,
                'purl': f'pkg:pypi/{name.lower().replace("_", "-")}@{version}',
                'ecosystem': 'pypi', 'declared_in': 'requirements.txt',
            })
        else:
            items.append({'type': 'library', 'name': line, 'version': 'UNRESOLVED', 'ecosystem': 'pypi', 'declared_in': 'requirements.txt'})
    return items


def _node_components(project: Path) -> list[dict[str, Any]]:
    package = project / 'package.json'
    if not package.exists():
        return []
    try:
        data = json.loads(package.read_text(encoding='utf-8'))
    except json.JSONDecodeError as exc:
        raise GovernanceViolation(f'Cannot generate SBOM from invalid package.json: {exc.msg}') from exc
    out: list[dict[str, Any]] = []
    for section in ('dependencies', 'devDependencies', 'optionalDependencies'):
        deps = data.get(section, {})
        if not isinstance(deps, dict):
            continue
        for name, raw_version in sorted(deps.items()):
            version = str(raw_version).strip()
            # Reproducibility requires an exact declared version; ranges such as ^, ~, *, >= are unresolved.
            normalized = version[1:] if version.startswith('v') else version
            resolved = normalized if re.fullmatch(r'\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?', normalized) else 'UNRESOLVED'
            item: dict[str, Any] = {
                'type': 'library', 'name': name, 'version': resolved,
                'ecosystem': 'npm', 'declared_in': f'package.json:{section}', 'declared_version': version,
            }
            if resolved != 'UNRESOLVED':
                scoped = name.replace('@', '%40', 1) if name.startswith('@') else name
                item['purl'] = f'pkg:npm/{scoped}@{resolved}'
            out.append(item)
    return out


def dependency_inventory(project: Path) -> dict[str, Any]:
    components = _python_components(project) + _node_components(project)
    unresolved = [x for x in components if x.get('version') == 'UNRESOLVED']
    return {
        'components': components,
        'count': len(components),
        'unresolved': unresolved,
        'offline_ready': not unresolved,
    }


def generate_cyclonedx_sbom(project: Path, app_id: str) -> dict[str, Any]:
    inventory = dependency_inventory(project)
    components = []
    for item in inventory['components']:
        component = {k: item[k] for k in ('type', 'name', 'version') if k in item}
        if item.get('purl'):
            component['purl'] = item['purl']
        component['properties'] = [
            {'name': 'resonance:ecosystem', 'value': item.get('ecosystem', 'unknown')},
            {'name': 'resonance:declared_in', 'value': item.get('declared_in', '')},
        ]
        components.append(component)
    return {
        'bomFormat': 'CycloneDX',
        'specVersion': '1.5',
        'serialNumber': f'urn:uuid:{_stable_uuid(app_id, tree_manifest(project)["tree_sha256"])}',
        'version': 1,
        'metadata': {
            'timestamp': utc_now(),
            'tools': {'components': [{'type': 'application', 'name': 'Resonance Sovereign Foundry', 'version': '0.6.0'}]},
            'component': {'type': 'application', 'name': app_id},
            'properties': [
                {'name': 'resonance:zero_credit', 'value': 'true'},
                {'name': 'resonance:offline_ready', 'value': str(inventory['offline_ready']).lower()},
            ],
        },
        'components': components,
    }


def _stable_uuid(app_id: str, digest: str) -> str:
    raw = hashlib.sha256(f'{app_id}:{digest}'.encode()).hexdigest()[:32]
    return f'{raw[:8]}-{raw[8:12]}-5{raw[13:16]}-a{raw[17:20]}-{raw[20:32]}'


def write_supply_chain_evidence(project: Path, app_id: str) -> dict[str, Any]:
    manifest = tree_manifest(project)
    sbom = generate_cyclonedx_sbom(project, app_id)
    (project / 'SBOM.cdx.json').write_text(json.dumps(sbom, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    evidence = {
        'schema': 'resonance-artifact-manifest/v1',
        'created_at': utc_now(),
        'app_id': app_id,
        **manifest,
        'sbom_sha256': sha256_file(project / 'SBOM.cdx.json'),
        'external_ai_required': False,
    }
    (project / 'ARTIFACT_MANIFEST.json').write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    return evidence


def verify_supply_chain_evidence(project: Path) -> dict[str, Any]:
    manifest_path = project / 'ARTIFACT_MANIFEST.json'
    sbom_path = project / 'SBOM.cdx.json'
    if not manifest_path.exists() or not sbom_path.exists():
        return {'valid': False, 'reason': 'Supply-chain evidence missing.'}
    try:
        stored = json.loads(manifest_path.read_text(encoding='utf-8'))
    except json.JSONDecodeError:
        return {'valid': False, 'reason': 'Artifact manifest is invalid JSON.'}
    current = tree_manifest(project)
    sbom_digest = sha256_file(sbom_path)
    valid = stored.get('tree_sha256') == current['tree_sha256'] and stored.get('sbom_sha256') == sbom_digest
    return {
        'valid': valid,
        'stored_tree_sha256': stored.get('tree_sha256'),
        'current_tree_sha256': current['tree_sha256'],
        'stored_sbom_sha256': stored.get('sbom_sha256'),
        'current_sbom_sha256': sbom_digest,
        'file_count': current['file_count'],
    }


@dataclass(frozen=True)
class CachedArtifact:
    name: str
    sha256: str
    bytes: int
    stored_path: str


class LocalArtifactStore:
    """Controller-owned content-addressed store. It never downloads from a network."""

    def __init__(self, workspace_root: Path, policy: dict[str, Any]):
        cfg = policy.get('supply_chain', {})
        relative = str(cfg.get('artifact_store', 'runtime/supply-chain/artifacts')).strip('/\\')
        self.root = (workspace_root.resolve() / relative).resolve()
        self.inbox = (workspace_root.resolve() / str(cfg.get('artifact_inbox', 'imports/artifacts')).strip('/\\')).resolve()
        self.workspace = workspace_root.resolve()
        self.max_artifact_bytes = int(cfg.get('max_artifact_bytes', 1_000_000_000))
        self.index = (workspace_root.resolve() / str(cfg.get('artifact_index', 'runtime/supply-chain/artifacts.jsonl')).strip('/\\')).resolve()

    def _require_inbox_source(self, relative: str) -> Path:
        source = (self.workspace / relative).resolve()
        try:
            source.relative_to(self.inbox)
        except ValueError as exc:
            raise GovernanceViolation('Supply-chain artifact must come from the governed local artifact inbox.') from exc
        if not source.exists() or not source.is_file():
            raise GovernanceViolation('Artifact source does not exist or is not a file.')
        if source.stat().st_size > self.max_artifact_bytes:
            raise GovernanceViolation('Artifact exceeds governance size limit.')
        return source

    def ingest(self, source_relative: str, *, purl: str | None = None) -> CachedArtifact:
        source = self._require_inbox_source(source_relative)
        digest = sha256_file(source)
        dest_dir = self.root / digest
        dest = dest_dir / source.name
        dest_dir.mkdir(parents=True, exist_ok=True)
        if dest.exists() and sha256_file(dest) != digest:
            raise GovernanceViolation('Content-addressed artifact collision detected.')
        if not dest.exists():
            shutil.copy2(source, dest)
        stored_path = str(dest.relative_to(self.workspace)).replace('\\', '/')
        if purl:
            if not re.fullmatch(r'pkg:[A-Za-z0-9.+_-]+/.+@[^\s]+', purl):
                raise GovernanceViolation('Invalid package URL (purl) for cached artifact.')
            self.index.parent.mkdir(parents=True, exist_ok=True)
            record = {'timestamp': utc_now(), 'purl': purl, 'sha256': digest, 'bytes': dest.stat().st_size, 'stored_path': stored_path}
            with self.index.open('a', encoding='utf-8') as f:
                f.write(json.dumps(record, ensure_ascii=False) + '\n')
        return CachedArtifact(source.name, digest, dest.stat().st_size, stored_path)

    def indexed_purls(self) -> dict[str, dict[str, Any]]:
        result: dict[str, dict[str, Any]] = {}
        if not self.index.exists():
            return result
        for line in self.index.read_text(encoding='utf-8').splitlines():
            if not line.strip():
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError as exc:
                raise GovernanceViolation('Local artifact index is corrupt.') from exc
            if isinstance(item.get('purl'), str):
                result[item['purl']] = item
        return result

    def project_cache_status(self, project: Path) -> dict[str, Any]:
        inv = dependency_inventory(project)
        index = self.indexed_purls()
        required = [item.get('purl') for item in inv['components'] if item.get('purl')]
        missing = [purl for purl in required if purl not in index]
        unresolved = [item['name'] for item in inv['unresolved']]
        return {'offline_ready': not missing and not unresolved, 'required': required, 'cached': [p for p in required if p in index], 'missing': missing, 'unresolved': unresolved}

    def verify(self) -> dict[str, Any]:
        checked = 0
        corrupt: list[str] = []
        if not self.root.exists():
            return {'valid': True, 'checked': 0, 'corrupt': []}
        for digest_dir in self.root.iterdir():
            if not digest_dir.is_dir() or not re.fullmatch(r'[0-9a-f]{64}', digest_dir.name):
                corrupt.append(str(digest_dir.relative_to(self.workspace)).replace('\\', '/'))
                continue
            for file in digest_dir.iterdir():
                if not file.is_file():
                    continue
                checked += 1
                if sha256_file(file) != digest_dir.name:
                    corrupt.append(str(file.relative_to(self.workspace)).replace('\\', '/'))
        return {'valid': not corrupt, 'checked': checked, 'corrupt': corrupt}

class LocalAttestor:
    """Optional local Ed25519 signing via OpenSSL. Private key remains in a protected runtime path."""

    def __init__(self, workspace_root: Path, policy: dict[str, Any]):
        self.workspace = workspace_root.resolve()
        cfg = policy.get('supply_chain', {})
        self.private_key = (self.workspace / str(cfg.get('signing_private_key', 'runtime/secrets/attestation.key')).strip('/\\')).resolve()
        self.public_key = (self.workspace / str(cfg.get('signing_public_key', 'runtime/secrets/attestation.pub.pem')).strip('/\\')).resolve()

    def _openssl(self) -> str:
        exe = shutil.which('openssl')
        if not exe:
            raise GovernanceViolation('OpenSSL is required for local artifact signing.')
        return exe

    def initialize(self, *, confirmed: bool) -> dict[str, Any]:
        if not confirmed:
            raise GovernanceViolation('Local signing-key creation requires confirmed=true.')
        if self.private_key.exists() or self.public_key.exists():
            raise GovernanceViolation('Local attestation key already exists; refusing to overwrite trust identity.')
        self.private_key.parent.mkdir(parents=True, exist_ok=True)
        import subprocess
        gen = subprocess.run([self._openssl(), 'genpkey', '-algorithm', 'ED25519', '-out', str(self.private_key)], capture_output=True, text=True, shell=False, check=False)
        if gen.returncode != 0:
            raise GovernanceViolation((gen.stderr or 'Failed to create local signing key.')[-4000:])
        try:
            os.chmod(self.private_key, 0o600)
        except OSError:
            pass
        pub = subprocess.run([self._openssl(), 'pkey', '-in', str(self.private_key), '-pubout', '-out', str(self.public_key)], capture_output=True, text=True, shell=False, check=False)
        if pub.returncode != 0:
            self.private_key.unlink(missing_ok=True)
            raise GovernanceViolation((pub.stderr or 'Failed to derive local public key.')[-4000:])
        return {'algorithm': 'Ed25519', 'private_key_created': True, 'public_key': str(self.public_key.relative_to(self.workspace)).replace('\\', '/')}

    def sign(self, project: Path, *, confirmed: bool) -> dict[str, Any]:
        if not confirmed:
            raise GovernanceViolation('Artifact attestation requires confirmed=true.')
        manifest = project / 'ARTIFACT_MANIFEST.json'
        if not manifest.exists():
            raise GovernanceViolation('Generate supply-chain evidence before signing.')
        if not self.private_key.exists() or not self.public_key.exists():
            raise GovernanceViolation('Local attestation key is not initialized.')
        import subprocess
        sig = project / 'ARTIFACT_MANIFEST.sig'
        proc = subprocess.run([
            self._openssl(), 'pkeyutl', '-sign', '-rawin', '-inkey', str(self.private_key),
            '-in', str(manifest), '-out', str(sig),
        ], capture_output=True, text=True, shell=False, check=False)
        if proc.returncode != 0:
            raise GovernanceViolation((proc.stderr or 'Artifact signing failed.')[-4000:])
        return {'algorithm': 'Ed25519', 'signature_path': str(sig.name), 'signature_sha256': sha256_file(sig)}

    def verify(self, project: Path) -> dict[str, Any]:
        manifest = project / 'ARTIFACT_MANIFEST.json'
        sig = project / 'ARTIFACT_MANIFEST.sig'
        if not manifest.exists() or not sig.exists() or not self.public_key.exists():
            return {'valid': False, 'reason': 'Manifest, signature, or local public key missing.'}
        import subprocess
        proc = subprocess.run([
            self._openssl(), 'pkeyutl', '-verify', '-rawin', '-pubin', '-inkey', str(self.public_key),
            '-in', str(manifest), '-sigfile', str(sig),
        ], capture_output=True, text=True, shell=False, check=False)
        return {'valid': proc.returncode == 0, 'algorithm': 'Ed25519', 'signature_sha256': sha256_file(sig)}
