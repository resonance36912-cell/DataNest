begin;

revoke update,delete,truncate on table public.ai_evidence_derivations from service_role;
revoke update,delete,truncate on table public.ai_evidence_derivation_reviews from service_role;
grant select,insert on table public.ai_evidence_derivations to service_role;
grant select,insert on table public.ai_evidence_derivation_reviews to service_role;

commit;
