BEGIN;

DO $$
DECLARE
  t text;
  function_signature text;
  rls_enabled boolean;
  migration_applied boolean;
  hardening_applied boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260916090000'
  ) INTO migration_applied;
  IF NOT migration_applied THEN
    RAISE EXCEPTION 'governance migration is not recorded';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260916114000'
  ) INTO hardening_applied;
  IF NOT hardening_applied THEN
    RAISE EXCEPTION 'governance grant hardening migration is not recorded';
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'governance_participants', 'governance_proposals', 'governance_evidence',
    'governance_reviews', 'governance_decisions', 'governance_events'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'missing governance table: %', t;
    END IF;
    SELECT c.relrowsecurity INTO rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = t;
    IF NOT COALESCE(rls_enabled, false) THEN
      RAISE EXCEPTION 'RLS disabled on governance table: %', t;
    END IF;
    IF NOT has_table_privilege('authenticated', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION 'authenticated role lacks SELECT on %', t;
    END IF;
    IF has_table_privilege('authenticated', 'public.' || t, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || t, 'DELETE')
       OR has_table_privilege('authenticated', 'public.' || t, 'TRUNCATE')
       OR has_table_privilege('authenticated', 'public.' || t, 'REFERENCES')
       OR has_table_privilege('authenticated', 'public.' || t, 'TRIGGER') THEN
      RAISE EXCEPTION 'authenticated role has forbidden non-SELECT privilege on %', t;
    END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT')
       OR has_table_privilege('anon', 'public.' || t, 'INSERT')
       OR has_table_privilege('anon', 'public.' || t, 'UPDATE')
       OR has_table_privilege('anon', 'public.' || t, 'DELETE')
       OR has_table_privilege('anon', 'public.' || t, 'TRUNCATE')
       OR has_table_privilege('anon', 'public.' || t, 'REFERENCES')
       OR has_table_privilege('anon', 'public.' || t, 'TRIGGER') THEN
      RAISE EXCEPTION 'anon role has governance table privilege on %', t;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = t
        AND p.cmd = 'SELECT' AND 'authenticated' = ANY(p.roles)
    ) THEN
      RAISE EXCEPTION 'missing authenticated SELECT policy on %', t;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = t
        AND p.cmd <> 'SELECT' AND 'authenticated' = ANY(p.roles)
    ) THEN
      RAISE EXCEPTION 'authenticated mutation policy exists on %', t;
    END IF;
  END LOOP;

  FOREACH function_signature IN ARRAY ARRAY[
    'public.governance_create_proposal(uuid,text,text,text,jsonb)',
    'public.governance_submit_proposal(uuid,uuid,integer)',
    'public.governance_record_decision(uuid,uuid,integer,public.governance_decision_outcome,text)',
    'public.governance_add_evidence(uuid,uuid,text,text,text,text,text)',
    'public.governance_add_human_review(uuid,uuid,public.governance_review_stance,text,double precision,uuid[])',
    'public.governance_register_agent(uuid,public.governance_participant_kind,text,text,text,jsonb)'
  ] LOOP
    IF to_regprocedure(function_signature) IS NULL THEN
      RAISE EXCEPTION 'missing governance RPC: %', function_signature;
    END IF;
    IF has_function_privilege('authenticated', function_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated can execute governance RPC: %', function_signature;
    END IF;
    IF NOT has_function_privilege('service_role', function_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role cannot execute governance RPC: %', function_signature;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  actor uuid := '00000000-0000-0000-0000-00000000a111';
  proposal public.governance_proposals;
  evidence public.governance_evidence;
  review public.governance_reviews;
  decision public.governance_decisions;
  agent public.governance_participants;
  event_count integer;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    actor, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'governance-runtime-test@local.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

  SELECT * INTO proposal
  FROM public.governance_create_proposal(
    actor,
    'Runtime governance proposal',
    'A synthetic proposal used only by the rollback-only CI runtime check.',
    'This proposal verifies the real governance RPC state machine on a local Supabase stack.',
    jsonb_build_object('test', true)
  );
  IF proposal.status <> 'draft' OR proposal.version <> 1 OR proposal.created_by <> actor THEN
    RAISE EXCEPTION 'proposal create state mismatch';
  END IF;

  SELECT * INTO evidence
  FROM public.governance_add_evidence(
    actor, proposal.id, 'Runtime evidence', 'note', NULL, NULL,
    'Synthetic local-only evidence for runtime verification.'
  );
  IF evidence.proposal_id <> proposal.id OR evidence.created_by <> actor THEN
    RAISE EXCEPTION 'evidence state mismatch';
  END IF;

  SELECT * INTO proposal
  FROM public.governance_submit_proposal(proposal.id, actor, 1);
  IF proposal.status <> 'submitted' OR proposal.version <> 2 THEN
    RAISE EXCEPTION 'proposal submit state mismatch';
  END IF;

  SELECT * INTO review
  FROM public.governance_add_human_review(
    actor, proposal.id, 'support',
    'The runtime transaction confirms the proposal path and audit behavior.',
    0.9, ARRAY[evidence.id]
  );
  IF review.created_by <> actor OR review.proposal_id <> proposal.id THEN
    RAISE EXCEPTION 'review state mismatch';
  END IF;

  SELECT * INTO proposal FROM public.governance_proposals WHERE id = proposal.id;
  IF proposal.status <> 'under_review' OR proposal.version <> 3 THEN
    RAISE EXCEPTION 'review transition mismatch';
  END IF;

  SELECT * INTO decision
  FROM public.governance_record_decision(
    proposal.id, actor, 3, 'approved',
    'The rollback-only runtime smoke test completed every governed transition successfully.'
  );
  SELECT * INTO proposal FROM public.governance_proposals WHERE id = proposal.id;
  IF decision.outcome <> 'approved' OR proposal.status <> 'approved' OR proposal.version <> 4 THEN
    RAISE EXCEPTION 'decision transition mismatch';
  END IF;

  SELECT * INTO agent
  FROM public.governance_register_agent(
    actor, 'ai', 'runtime-advisory-agent', 'Runtime Advisory Agent',
    'CI-only advisory identity', jsonb_build_object('test', true)
  );
  IF agent.kind <> 'ai' OR agent.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'advisory agent identity mismatch';
  END IF;

  BEGIN
    PERFORM public.governance_register_agent(
      actor, 'human', 'forbidden-human-agent', 'Forbidden Human Agent',
      'Must be rejected', '{}'::jsonb
    );
    RAISE EXCEPTION 'human agent registration unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'human_participant_requires_authenticated_identity' THEN
      RAISE;
    END IF;
  END;

  SELECT count(*) INTO event_count
  FROM public.governance_events
  WHERE proposal_id = proposal.id;
  IF event_count <> 5 THEN
    RAISE EXCEPTION 'expected 5 proposal audit events, found %', event_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.governance_reviews gr
    JOIN public.governance_participants gp ON gp.id = gr.participant_id
    WHERE gr.id = review.id AND gp.kind = 'human' AND gp.user_id = actor
  ) THEN
    RAISE EXCEPTION 'human review identity was not derived from actor';
  END IF;
END
$$;

ROLLBACK;