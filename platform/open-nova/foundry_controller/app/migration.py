from __future__ import annotations

import json
import re
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .agent import GovernanceViolation, slugify

IGNORED_DIRS = {'.git', 'node_modules', '.venv', 'venv', '__pycache__', 'dist', 'build', '.pytest_cache'}
SECRET_NAMES = {'.env', '.env.local', '.env.production', '.env.development', '.env.test'}
SECRET_SUFFIXES = {'.pem', '.key', '.p12', '.pfx', '.jks', '.keystore'}
SECRET_BASENAMES = {'id_rsa', 'id_ed25519', 'id_ecdsa', 'id_dsa'}


def is_secret_file(path: Path) -> bool:
    name = path.name.lower()
    return name == '.env' or name.startswith('.env.') or name in SECRET_BASENAMES or path.suffix.lower() in SECRET_SUFFIXES
EXTERNAL_SIGNALS = {
    'lovable': ('lovable', 'lovable.app'),
    'supabase-hosted': ('supabase.co', '@supabase/', 'VITE_SUPABASE_', 'SUPABASE_URL'),
    'firebase': ('firebaseapp.com', 'firebaseio.com', 'firebase'),
    'vercel': ('vercel.app', '@vercel/'),
    'netlify': ('netlify.app', '@netlify/'),
    'openai-api': ('api.openai.com', 'OPENAI_API_KEY'),
    'anthropic-api': ('api.anthropic.com', 'ANTHROPIC_API_KEY'),
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class MigrationAssessment:
    source: str
    app_id: str
    stack: list[str]
    files: int
    bytes: int
    secret_files: list[str]
    external_dependencies: list[dict[str, Any]]
    lockfiles: list[str]
    symlink_files: list[str]
    blockers: list[str]

    def as_dict(self) -> dict[str, Any]:
        return {
            'source': self.source, 'app_id': self.app_id, 'stack': self.stack,
            'files': self.files, 'bytes': self.bytes, 'secret_files': self.secret_files,
            'external_dependencies': self.external_dependencies, 'lockfiles': self.lockfiles,
            'symlink_files': self.symlink_files, 'blockers': self.blockers, 'ready_to_import': not self.blockers,
        }


class SovereignMigrator:
    """Imports a clean copy from a governed local inbox. The source is never modified."""

    def __init__(self, workspace_root: Path, policy: dict[str, Any]):
        self.workspace = workspace_root.resolve()
        cfg = policy.get('migration', {})
        self.source_root = (self.workspace / str(cfg.get('source_root', 'imports/projects')).strip('/\\')).resolve()
        self.destination_root = (self.workspace / str(cfg.get('destination_root', 'apps')).strip('/\\')).resolve()
        self.max_files = int(cfg.get('max_files', 5000))
        self.max_total_bytes = int(cfg.get('max_total_bytes', 250_000_000))
        self.block_secrets = bool(cfg.get('block_secret_files', True))

    def resolve_source(self, relative: str) -> Path:
        if not relative or relative.startswith(('/', '\\')):
            raise GovernanceViolation('Migration source must be repository-relative.')
        source = (self.workspace / relative).resolve()
        try:
            source.relative_to(self.source_root)
        except ValueError as exc:
            raise GovernanceViolation('Migration source must be inside the governed imports/projects inbox.') from exc
        if not source.exists() or not source.is_dir():
            raise GovernanceViolation('Migration source project does not exist.')
        return source

    def _iter_source_files(self, source: Path):
        for path in sorted(source.rglob('*')):
            if path.is_symlink() or path.is_dir() or any(part in IGNORED_DIRS for part in path.relative_to(source).parts):
                continue
            yield path

    def assess(self, source_relative: str, app_name: str | None = None) -> MigrationAssessment:
        source = self.resolve_source(source_relative)
        app_id = slugify(app_name or source.name)
        stack: set[str] = set()
        secret_files: list[str] = []
        external_hits: dict[str, set[str]] = {}
        lockfiles: list[str] = []
        symlink_files = [str(p.relative_to(source)).replace('\\', '/') for p in sorted(source.rglob('*')) if p.is_symlink()]
        count = 0
        total = 0
        names = {p.name for p in source.iterdir()}
        if 'package.json' in names:
            stack.add('node')
        if 'vite.config.ts' in names or 'vite.config.js' in names:
            stack.add('vite')
        if 'requirements.txt' in names or 'pyproject.toml' in names:
            stack.add('python')
        if (source / 'supabase').is_dir():
            stack.add('supabase')
        if (source / 'src').is_dir():
            stack.add('frontend-source')

        for path in self._iter_source_files(source):
            rel = str(path.relative_to(source)).replace('\\', '/')
            count += 1
            total += path.stat().st_size
            if count > self.max_files:
                raise GovernanceViolation(f'Migration source exceeds {self.max_files} files.')
            if total > self.max_total_bytes:
                raise GovernanceViolation('Migration source exceeds governed total-size limit.')
            if is_secret_file(path):
                secret_files.append(rel)
            if path.name in {'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'poetry.lock', 'uv.lock', 'Pipfile.lock'}:
                lockfiles.append(rel)
            if path.stat().st_size > 512_000:
                continue
            try:
                text = path.read_text(encoding='utf-8', errors='replace')
            except OSError:
                continue
            lower = text.lower()
            for name, markers in EXTERNAL_SIGNALS.items():
                matched = [marker for marker in markers if marker.lower() in lower]
                if matched:
                    external_hits.setdefault(name, set()).update(matched)

        blockers: list[str] = []
        if secret_files and self.block_secrets:
            blockers.append('Secret-bearing files must be removed from the migration source or replaced by safe .env.example templates.')
        if symlink_files:
            blockers.append('Symlinks are not admitted during migration because they can escape the staged source boundary.')
        external = [{'service': name, 'signals': sorted(values), 'requires_migration_review': True} for name, values in sorted(external_hits.items())]
        return MigrationAssessment(
            source=source_relative.replace('\\', '/'), app_id=app_id, stack=sorted(stack),
            files=count, bytes=total, secret_files=secret_files, external_dependencies=external,
            lockfiles=sorted(lockfiles), symlink_files=symlink_files, blockers=blockers,
        )

    def import_copy(self, source_relative: str, app_name: str | None = None, *, confirmed: bool = False) -> dict[str, Any]:
        if not confirmed:
            raise GovernanceViolation('Migration import requires confirmed=true.')
        assessment = self.assess(source_relative, app_name)
        if assessment.blockers:
            raise GovernanceViolation('Migration blocked: ' + '; '.join(assessment.blockers))
        source = self.resolve_source(source_relative)
        destination = (self.destination_root / assessment.app_id).resolve()
        try:
            destination.relative_to(self.destination_root)
        except ValueError as exc:
            raise GovernanceViolation('Migration destination escaped governed apps directory.') from exc
        if destination.exists():
            raise GovernanceViolation('Destination application already exists; migration will not overwrite it.')

        destination.mkdir(parents=True, exist_ok=False)
        copied: list[str] = []
        try:
            for src in self._iter_source_files(source):
                rel = src.relative_to(source)
                if is_secret_file(src):
                    continue
                dst = destination / rel
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
                copied.append(str(rel).replace('\\', '/'))
            report = {
                'schema': 'resonance-migration/v1',
                'created_at': utc_now(),
                'source': assessment.source,
                'source_modified': False,
                'destination': f'apps/{assessment.app_id}',
                'assessment': assessment.as_dict(),
                'copied_files': len(copied),
                'external_ai_used': False,
                'next_gate': 'supply_chain_and_security_validation',
            }
            (destination / 'MIGRATION_REPORT.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
            return report
        except Exception:
            shutil.rmtree(destination, ignore_errors=True)
            raise
