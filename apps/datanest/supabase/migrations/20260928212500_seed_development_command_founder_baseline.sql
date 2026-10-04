begin;

with target_project as (
  select id
  from public.projects
  where slug='resonance-datanest'
  order by created_at asc
  limit 1
),
seed(knowledge,category,source_ref) as (
  values
    ('DataNest-Supository/DataNest is the canonical source, runtime, and governance authority for Resonance DataNest and RONSAS.','architecture','account_context'),
    ('RONSAS is consolidated into DataNest rather than maintained as a separate standalone runtime authority.','architecture','account_context'),
    ('The governed Resonance application suite includes Career Compass, SovereignForge, LyricSync Studio, Scene Song Spark, Sync Vision, ePublisher, Creative Studio, YouTube Optimizer, and Sovereign Backend.','product_suite','account_context'),
    ('The active commercial direction is free promotion with paid checkout and billing disabled until pricing is explicitly re-established.','commercial_policy','account_context'),
    ('Core Resonance application operation should remain local-first and sovereign, with external services treated as replaceable dependencies rather than mandatory middlemen.','architecture','portable_handoff'),
    ('GitHub is the source-history authority and Dropbox is the audit/evidence authority for the Resonance sovereign workflow.','governance','portable_handoff'),
    ('The planned custom-domain DNS cutover was removed; the canonical DataNest production URL remains the GitHub Pages deployment until a future custom-domain activation is explicitly authorized.','deployment','account_context'),
    ('DataNest AI supports a project-shared governed provider configuration; the current shared open-model route uses Cloudflare Workers AI with @cf/nvidia/nemotron-3-120b-a12b.','ai_provider','runtime_verified'),
    ('Development Command uses cumulative working memory that is separate from Certified Memory and from the ordinary learning-candidate certification path.','ai_memory','implementation'),
    ('Development Command responses use Angel''s Advocate, Devil''s Advocate, and Synthesis as the dual-perspective reasoning contract.','ai_reasoning','implementation'),
    ('Authentication, project access, provider authorization, execution authority, audit tracing, and Certified Memory governance are not bypassed by the Development Command working-memory lane.','governance','implementation'),
    ('External AI systems may collaborate, audit, review, and propose improvements, but they must not silently bypass Resonance governance controls.','governance','portable_handoff'),
    ('Passwords, API keys, tokens, authentication cookies, and other reusable credentials must not be embedded in Resonance source, audit artifacts, or AI prompts.','security','portable_handoff'),
    ('Public cutover or release should not be declared complete until the required release and validation gates are evidenced green.','release_policy','portable_handoff'),
    ('Preserve existing user and Codex changes; do not blindly reset repositories or remove unrelated work while applying fixes.','engineering_policy','portable_handoff'),
    ('Legal Eagle is a governed specialist experience: jurisdiction is required, legal authority must not be fabricated, and Legal Eagle remains excluded from automatic project-wide learning.','legal_eagle','source_contract')
)
insert into public.development_command_working_memory(
  project_id,
  job_id,
  user_id,
  memory_kind,
  normalized_knowledge,
  content_hash,
  source_trace_id,
  source_label,
  metadata,
  active,
  created_at,
  updated_at
)
select
  p.id,
  null,
  null,
  'founder_baseline',
  s.knowledge,
  encode(extensions.digest(s.knowledge,'sha256'),'hex'),
  null,
  'portable_account_context_20260928',
  jsonb_build_object(
    'category',s.category,
    'source_ref',s.source_ref,
    'working_memory_scope','development_command',
    'baseline_class','non_sensitive_work_context',
    'imported_at','2026-09-28'
  ),
  true,
  now(),
  now()
from target_project p
cross join seed s
on conflict(project_id,memory_kind,content_hash)
do update set
  normalized_knowledge=excluded.normalized_knowledge,
  source_label=excluded.source_label,
  metadata=excluded.metadata,
  active=true,
  updated_at=now();

commit;
