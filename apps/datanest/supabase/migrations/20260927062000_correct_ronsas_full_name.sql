-- Canonicalize the governed RONSAS identity.
update public.products
set
  full_name = 'Resonance Open Nova Sovereign Application Suite',
  source_payload = jsonb_set(
    coalesce(source_payload, '{}'::jsonb),
    '{full_name}',
    to_jsonb('Resonance Open Nova Sovereign Application Suite'::text),
    true
  ),
  updated_at = now()
where slug = 'ronsas'
  and full_name is distinct from 'Resonance Open Nova Sovereign Application Suite';
