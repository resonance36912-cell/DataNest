from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .agent import GovernanceViolation
from .migration import EXTERNAL_SIGNALS
from .registry import APP_ID_RE, AppRegistry

TEXT_SUFFIXES = {'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.sql', '.json', '.toml', '.yaml', '.yml'}
IGNORED_DIRS = {'.git', 'node_modules', '.venv', 'venv', '__pycache__', 'dist', 'build', '.pytest_cache'}
SUPABASE_IMPORT_RE = re.compile(
    r"import\s*\{\s*createClient\s*\}\s*from\s*(['\"])@supabase/supabase-js\1\s*;?"
)
UNSUPPORTED_PATTERNS = {
    'supabase_rpc': re.compile(r'\.rpc\s*\('),
    'supabase_realtime': re.compile(r'\.(?:channel|removeChannel|removeAllChannels)\s*\(|\.realtime\b'),
    'supabase_functions': re.compile(r'\.functions\b'),
    'firebase_functional_api': re.compile(r"from\s*(['\"])firebase(?:/[^'\"]+)?\1"),
    'openai_sdk': re.compile(r"from\s*(['\"])openai\1|require\s*\(\s*(['\"])openai\2\s*\)"),
    'anthropic_sdk': re.compile(r"from\s*(['\"])@anthropic-ai/sdk\1|from\s+anthropic\b"),
}
DESTRUCTIVE_SQL_RE = re.compile(r'\b(drop\s+(?:table|schema|database)|truncate\s+table)\b', re.I)
DDL_RE = re.compile(r'\b(create\s+table|alter\s+table|create\s+(?:unique\s+)?index|create\s+policy|enable\s+row\s+level\s+security)\b', re.I)
BUCKET_RE = re.compile(r"\.storage\.from\(\s*(['\"])([^'\"]+)\1\s*\)")
AUTH_OP_RE = re.compile(r'\.auth\.(getSession|getUser|signInWithPassword|signUp|signOut|onAuthStateChange)\s*\(')
DB_OP_RE = re.compile(r'\.from\(\s*([\'\"])([^\'\"]+)\1\s*\)')


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


@dataclass(frozen=True)
class Finding:
    provider: str
    capability: str
    path: str
    line: int
    evidence: str
    auto_rewrite_supported: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            'provider': self.provider,
            'capability': self.capability,
            'path': self.path,
            'line': self.line,
            'evidence': self.evidence,
            'auto_rewrite_supported': self.auto_rewrite_supported,
        }


class SovereignAdapterEngine:
    """Provider-to-contract migration planner with reversible, narrow source rewrites.

    The engine never executes generated code and never invents semantic translations for
    provider APIs it cannot prove compatible. Ambiguous constructs become cutover blockers.
    """

    def __init__(self, workspace_root: Path, policy: dict[str, Any], registry: AppRegistry | None = None):
        self.workspace = workspace_root.resolve()
        cfg = policy.get('adapter_engine', {})
        self.apps_root = (self.workspace / str(cfg.get('apps_root', 'apps')).strip('/\\')).resolve()
        self.runtime_root = (self.workspace / str(cfg.get('runtime_root', 'runtime/migrations')).strip('/\\')).resolve()
        self.adapter_dirname = str(cfg.get('adapter_dirname', 'open-nova-adapters'))
        self.max_files = int(cfg.get('max_scan_files', 5000))
        self.max_file_bytes = int(cfg.get('max_file_bytes', 512000))
        self.registry = registry

    def _resolve_app(self, app_id: str) -> Path:
        if not APP_ID_RE.fullmatch(app_id):
            raise GovernanceViolation('Invalid application id.')
        app = (self.apps_root / app_id).resolve()
        try:
            app.relative_to(self.apps_root)
        except ValueError as exc:
            raise GovernanceViolation('Application path escaped apps directory.') from exc
        if not app.exists() or not app.is_dir():
            raise GovernanceViolation('Managed application source is not present locally.')
        return app

    def _iter_text_files(self, app: Path):
        count = 0
        for path in sorted(app.rglob('*')):
            if path.is_symlink() or not path.is_file():
                continue
            rel = path.relative_to(app)
            if any(part in IGNORED_DIRS or part in {'.open-nova', self.adapter_dirname} for part in rel.parts):
                continue
            if path.suffix.lower() not in TEXT_SUFFIXES and path.name not in {'package.json', 'requirements.txt'}:
                continue
            if path.stat().st_size > self.max_file_bytes:
                continue
            count += 1
            if count > self.max_files:
                raise GovernanceViolation('Adapter scan exceeded governed file limit.')
            yield path, rel

    @staticmethod
    def _line_for(text: str, offset: int) -> int:
        return text.count('\n', 0, offset) + 1

    def _provider_findings(self, app: Path) -> tuple[list[Finding], dict[str, Any]]:
        findings: list[Finding] = []
        providers: set[str] = set()
        tables: set[str] = set()
        buckets: set[str] = set()
        auth_ops: set[str] = set()
        sql_files: list[dict[str, Any]] = []
        unsupported: list[dict[str, Any]] = []
        supabase_import_files: list[str] = []
        sovereign_compat_import_files: list[str] = []

        for path, rel in self._iter_text_files(app):
            try:
                text = path.read_text(encoding='utf-8', errors='replace')
            except OSError:
                continue
            lower = text.lower()
            rels = rel.as_posix()
            for provider, markers in EXTERNAL_SIGNALS.items():
                if any(marker.lower() in lower for marker in markers):
                    providers.add(provider)
            if 'open-nova-adapters/supabase-compat' in text.replace('\\', '/'):
                sovereign_compat_import_files.append(rels)
            for match in SUPABASE_IMPORT_RE.finditer(text):
                providers.add('supabase-hosted')
                supabase_import_files.append(rels)
                findings.append(Finding('supabase-hosted', 'client_import', rels, self._line_for(text, match.start()), match.group(0)[:180], True))
            for match in DB_OP_RE.finditer(text):
                providers.add('supabase-hosted')
                tables.add(match.group(2))
                findings.append(Finding('supabase-hosted', 'database', rels, self._line_for(text, match.start()), match.group(0), True))
            for match in BUCKET_RE.finditer(text):
                providers.add('supabase-hosted')
                buckets.add(match.group(2))
                findings.append(Finding('supabase-hosted', 'storage', rels, self._line_for(text, match.start()), match.group(0), True))
            for match in AUTH_OP_RE.finditer(text):
                providers.add('supabase-hosted')
                op = match.group(1)
                auth_ops.add(op)
                supported = op in {'getSession', 'getUser', 'signInWithPassword', 'signUp', 'signOut'}
                findings.append(Finding('supabase-hosted', 'auth', rels, self._line_for(text, match.start()), match.group(0), supported))
                if not supported:
                    unsupported.append({'kind': f'supabase_auth_{op}', 'path': rels, 'line': self._line_for(text, match.start())})
            for kind, pattern in UNSUPPORTED_PATTERNS.items():
                for match in pattern.finditer(text):
                    unsupported.append({'kind': kind, 'path': rels, 'line': self._line_for(text, match.start())})
            if path.suffix.lower() == '.sql':
                ddl = len(DDL_RE.findall(text))
                destructive = [m.group(0) for m in DESTRUCTIVE_SQL_RE.finditer(text)]
                if ddl or destructive or 'supabase' in rels.lower():
                    sql_files.append({'path': rels, 'ddl_statements_detected': ddl, 'destructive_statements': destructive})
                    if destructive:
                        unsupported.append({'kind': 'destructive_sql_requires_human_migration', 'path': rels, 'line': 1})

        # Dedupe deterministic lists.
        dedup_unsup: list[dict[str, Any]] = []
        seen = set()
        for item in unsupported:
            key = (item['kind'], item['path'], item['line'])
            if key not in seen:
                seen.add(key)
                dedup_unsup.append(item)
        return findings, {
            'providers': sorted(providers),
            'database_tables': sorted(tables),
            'storage_buckets': sorted(buckets),
            'auth_operations': sorted(auth_ops),
            'schema_sources': sql_files,
            'unsupported': dedup_unsup,
            'supabase_import_files': sorted(set(supabase_import_files)),
            'sovereign_compat_import_files': sorted(set(sovereign_compat_import_files)),
        }

    def assess(self, app_id: str) -> dict[str, Any]:
        app = self._resolve_app(app_id)
        findings, meta = self._provider_findings(app)
        bindings = app / '.open-nova' / 'service-bindings.json'
        blockers: list[str] = []
        if meta['providers'] and not bindings.exists():
            blockers.append('service_bindings_missing')
        if meta['unsupported']:
            blockers.append('unsupported_provider_operations_require_remediation')
        if 'supabase-hosted' in meta['providers'] and not meta['supabase_import_files'] and not meta['sovereign_compat_import_files']:
            blockers.append('supabase_usage_detected_without_supported_client_import')
        if any(x['destructive_statements'] for x in meta['schema_sources']):
            blockers.append('destructive_schema_change_requires_human_approval')
        return {
            'schema': 'resonance-adapter-assessment/v1',
            'created_at': utc_now(),
            'app_id': app_id,
            'providers': meta['providers'],
            'findings': [f.as_dict() for f in findings],
            'database': {'tables': meta['database_tables'], 'schema_sources': meta['schema_sources']},
            'auth': {'operations': meta['auth_operations']},
            'storage': {'buckets': meta['storage_buckets']},
            'supported_automatic_rewrites': {'supabase_client_imports': meta['supabase_import_files']},
            'unsupported_operations': meta['unsupported'],
            'blockers': blockers,
            'ready_to_generate_adapters': bool(meta['providers']) and bindings.exists(),
            'ready_for_cutover': bool(meta['providers']) and not blockers,
            'external_ai_required': False,
            'source_modified': False,
        }

    def _adapter_files(self, app_id: str) -> dict[str, str]:
        header = '// Generated by Resonance Open Nova v0.8. Provider-neutral local contract.\n'
        contracts = header + '''export type Json = null | boolean | number | string | Json[] | {[key:string]:Json};
export type QueryFilter = {op:string; column:string; value:Json};
export type QueryRequest = {table:string; action:string; columns?:string; values?:unknown; filters:QueryFilter[]; options?:Record<string,unknown>};
'''
        http = header + '''const gateway = () => (import.meta.env?.RESONANCE_GATEWAY_URL || "http://127.0.0.1:58600").replace(/\\/$/, "");
export async function localRequest(path:string, init:RequestInit = {}) {
  const response = await fetch(`${gateway()}${path}`, {credentials:"include", ...init, headers:{"content-type":"application/json", ...(init.headers||{})}});
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) return {data:null, error:{message:data?.detail || data?.message || `Local service error ${response.status}`}};
  return {data, error:null};
}
export {gateway};
'''
        supabase = header + '''import {localRequest, gateway} from "./http";
class QueryBuilder implements PromiseLike<any> {
  private req:any;
  constructor(table:string){this.req={table,action:"select",filters:[]};}
  select(columns="*"){this.req.action="select";this.req.columns=columns;return this;}
  insert(values:any){this.req.action="insert";this.req.values=values;return this;}
  update(values:any){this.req.action="update";this.req.values=values;return this;}
  upsert(values:any){this.req.action="upsert";this.req.values=values;return this;}
  delete(){this.req.action="delete";return this;}
  eq(column:string,value:any){this.req.filters.push({op:"eq",column,value});return this;}
  neq(column:string,value:any){this.req.filters.push({op:"neq",column,value});return this;}
  gt(column:string,value:any){this.req.filters.push({op:"gt",column,value});return this;}
  gte(column:string,value:any){this.req.filters.push({op:"gte",column,value});return this;}
  lt(column:string,value:any){this.req.filters.push({op:"lt",column,value});return this;}
  lte(column:string,value:any){this.req.filters.push({op:"lte",column,value});return this;}
  order(column:string,options:any={}){this.req.options={...(this.req.options||{}),order:{column,...options}};return this;}
  limit(count:number){this.req.options={...(this.req.options||{}),limit:count};return this;}
  single(){this.req.options={...(this.req.options||{}),single:true};return this;}
  async execute(){return localRequest("/v1/db/query",{method:"POST",body:JSON.stringify(this.req)});}
  then(resolve:any,reject:any){return this.execute().then(resolve,reject);}
}
export function createClient(_url?:string,_key?:string){
 return {
  from:(table:string)=>new QueryBuilder(table),
  auth:{
   getSession:()=>localRequest("/v1/auth/session"),
   getUser:()=>localRequest("/v1/auth/user"),
   signInWithPassword:(credentials:any)=>localRequest("/v1/auth/sign-in",{method:"POST",body:JSON.stringify(credentials)}),
   signUp:(credentials:any)=>localRequest("/v1/auth/sign-up",{method:"POST",body:JSON.stringify(credentials)}),
   signOut:()=>localRequest("/v1/auth/sign-out",{method:"POST"}),
  },
  storage:{from:(bucket:string)=>({
   upload:(path:string,file:any)=>localRequest(`/v1/storage/${encodeURIComponent(bucket)}/${encodeURIComponent(path)}`,{method:"PUT",body:file}),
   download:(path:string)=>localRequest(`/v1/storage/${encodeURIComponent(bucket)}/${encodeURIComponent(path)}`),
   remove:(paths:string[])=>localRequest(`/v1/storage/${encodeURIComponent(bucket)}`,{method:"DELETE",body:JSON.stringify({paths})}),
   getPublicUrl:(path:string)=>({data:{publicUrl:`${gateway()}/v1/storage/public/${encodeURIComponent(bucket)}/${encodeURIComponent(path)}`}}),
  })},
 };
}
'''
        ai = header + '''import {localRequest} from "./http";
export async function localChat(messages:Array<{role:string;content:string}>, model?:string){
 return localRequest("/v1/ai/chat",{method:"POST",body:JSON.stringify({messages,model})});
}
'''
        index = header + '''export {createClient as createSovereignClient} from "./supabase-compat";
export {localChat} from "./ai";
'''
        return {
            f'{self.adapter_dirname}/contracts.ts': contracts,
            f'{self.adapter_dirname}/http.ts': http,
            f'{self.adapter_dirname}/supabase-compat.ts': supabase,
            f'{self.adapter_dirname}/ai.ts': ai,
            f'{self.adapter_dirname}/index.ts': index,
        }

    def generate(self, app_id: str, *, confirmed: bool = False) -> dict[str, Any]:
        if not confirmed:
            raise GovernanceViolation('Generating sovereign adapters requires confirmed=true.')
        app = self._resolve_app(app_id)
        assessment = self.assess(app_id)
        if not assessment['providers']:
            raise GovernanceViolation('No supported external provider usage was detected.')
        if not (app / '.open-nova/service-bindings.json').exists():
            raise GovernanceViolation('Service bindings must be generated before adapters.')
        files = self._adapter_files(app_id)
        written: list[str] = []
        for rel, content in files.items():
            target = (app / rel).resolve()
            try:
                target.relative_to(app)
            except ValueError as exc:
                raise GovernanceViolation('Adapter output escaped managed application.') from exc
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding='utf-8')
            written.append(rel)
        migration_dir = app / '.open-nova' / 'migration'
        migration_dir.mkdir(parents=True, exist_ok=True)
        plan_path = migration_dir / 'v0.8-plan.json'
        plan_path.write_text(json.dumps(assessment, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        event = None
        if self.registry:
            event = self.registry.append(app_id, 'sovereign_adapters_generated', {
                'status': 'adapters_generated', 'provider_count': len(assessment['providers']),
                'adapter_file_count': len(written), 'external_ai_required': False,
            })
        return {'app_id': app_id, 'written': written, 'plan': '.open-nova/migration/v0.8-plan.json', 'registry_event': event, 'source_rewritten': False}

    def _relative_adapter_import(self, source_file: Path, app: Path) -> str:
        target = app / self.adapter_dirname / 'supabase-compat'
        rel = os.path.relpath(target, source_file.parent).replace('\\', '/')
        if not rel.startswith('.'):
            rel = './' + rel
        return rel

    def prepare_cutover(self, app_id: str, *, confirmed: bool = False) -> dict[str, Any]:
        if not confirmed:
            raise GovernanceViolation('Provider-source cutover requires confirmed=true.')
        app = self._resolve_app(app_id)
        assessment = self.assess(app_id)
        if assessment['unsupported_operations']:
            raise GovernanceViolation('Automatic cutover blocked by unsupported provider operations.')
        adapter = app / self.adapter_dirname / 'supabase-compat.ts'
        if 'supabase-hosted' in assessment['providers'] and not adapter.exists():
            raise GovernanceViolation('Generate sovereign adapters before provider-source cutover.')

        migration_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
        backup_root = (self.runtime_root / app_id / migration_id / 'backup').resolve()
        backup_root.mkdir(parents=True, exist_ok=False)
        changed: list[dict[str, str]] = []
        try:
            for rel in assessment['supported_automatic_rewrites']['supabase_client_imports']:
                source = (app / rel).resolve()
                source.relative_to(app)
                original = source.read_bytes()
                text = original.decode('utf-8')
                import_path = self._relative_adapter_import(source, app)
                replaced, count = SUPABASE_IMPORT_RE.subn(f'import {{ createClient }} from "{import_path}";', text)
                if count == 0:
                    continue
                backup = backup_root / rel
                backup.parent.mkdir(parents=True, exist_ok=True)
                backup.write_bytes(original)
                source.write_text(replaced, encoding='utf-8')
                changed.append({
                    'path': rel,
                    'original_sha256': sha256_bytes(original),
                    'new_sha256': sha256_bytes(source.read_bytes()),
                    'rewrite': 'supabase_client_import_to_sovereign_compat',
                })
            record = {
                'schema': 'resonance-adapter-cutover/v1', 'migration_id': migration_id, 'app_id': app_id,
                'created_at': utc_now(), 'changes': changed, 'rollback_available': True,
                'external_ai_required': False,
            }
            record_path = backup_root.parent / 'record.json'
            record_path.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
        except Exception:
            for item in changed:
                backup = backup_root / item['path']
                target = app / item['path']
                if backup.exists():
                    target.write_bytes(backup.read_bytes())
            shutil.rmtree(backup_root.parent, ignore_errors=True)
            raise
        if not changed:
            shutil.rmtree(backup_root.parent, ignore_errors=True)
            raise GovernanceViolation('No automatically supported provider imports were available to rewrite.')
        event = None
        if self.registry:
            event = self.registry.append(app_id, 'adapter_cutover_prepared', {
                'status': 'adapter_cutover_prepared', 'migration_id': migration_id,
                'changed_files': len(changed), 'rollback_available': True,
            })
        return {'app_id': app_id, 'migration_id': migration_id, 'changes': changed, 'registry_event': event}

    def verify_cutover(self, app_id: str) -> dict[str, Any]:
        app = self._resolve_app(app_id)
        assessment = self.assess(app_id)
        remaining_imports: list[str] = []
        for path, rel in self._iter_text_files(app):
            text = path.read_text(encoding='utf-8', errors='replace')
            if SUPABASE_IMPORT_RE.search(text):
                remaining_imports.append(rel.as_posix())
        required = [
            app / '.open-nova/service-bindings.json',
            app / '.open-nova/migration/v0.8-plan.json',
            app / self.adapter_dirname / 'supabase-compat.ts',
        ]
        missing = [str(p.relative_to(app)).replace('\\', '/') for p in required if not p.exists()]
        blockers = list(assessment['blockers'])
        # service-binding blocker is stale after the file exists; remove it.
        blockers = [b for b in blockers if b != 'service_bindings_missing']
        if remaining_imports:
            blockers.append('provider_sdk_imports_remain')
        if missing:
            blockers.append('adapter_evidence_missing')
        return {
            'schema': 'resonance-cutover-verification/v1', 'app_id': app_id,
            'remaining_provider_imports': remaining_imports, 'missing_evidence': missing,
            'unsupported_operations': assessment['unsupported_operations'], 'blockers': sorted(set(blockers)),
            'cutover_ready': not blockers and not remaining_imports and not missing,
            'external_ai_required': False,
        }

    def rollback(self, app_id: str, migration_id: str, *, confirmed: bool = False) -> dict[str, Any]:
        if not confirmed:
            raise GovernanceViolation('Adapter cutover rollback requires confirmed=true.')
        if not re.fullmatch(r'\d{8}T\d{6}Z-[0-9a-f]{8}', migration_id):
            raise GovernanceViolation('Invalid migration id.')
        app = self._resolve_app(app_id)
        root = (self.runtime_root / app_id / migration_id).resolve()
        try:
            root.relative_to(self.runtime_root)
        except ValueError as exc:
            raise GovernanceViolation('Migration rollback path escaped runtime root.') from exc
        record_path = root / 'record.json'
        if not record_path.exists():
            raise GovernanceViolation('Migration rollback record not found.')
        record = json.loads(record_path.read_text(encoding='utf-8'))
        restored: list[str] = []
        for item in record.get('changes', []):
            rel = item['path']
            target = (app / rel).resolve()
            target.relative_to(app)
            backup = (root / 'backup' / rel).resolve()
            backup.relative_to(root / 'backup')
            if not target.exists() or sha256_bytes(target.read_bytes()) != item['new_sha256']:
                raise GovernanceViolation(f'Rollback refused because {rel} changed after migration.')
            if sha256_bytes(backup.read_bytes()) != item['original_sha256']:
                raise GovernanceViolation(f'Rollback backup integrity failed for {rel}.')
        for item in record.get('changes', []):
            rel = item['path']
            (app / rel).write_bytes((root / 'backup' / rel).read_bytes())
            restored.append(rel)
        if self.registry:
            self.registry.append(app_id, 'adapter_cutover_rolled_back', {
                'status': 'adapter_cutover_rolled_back', 'migration_id': migration_id, 'restored_files': len(restored)
            })
        return {'app_id': app_id, 'migration_id': migration_id, 'restored': restored, 'rollback_complete': True}
