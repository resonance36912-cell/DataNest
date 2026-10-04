# Supabase migrations

The production Supabase project is `sgqdmfgjbprsoqsmgigi`.

The initial control-plane migration was applied directly through the authorized Supabase connector as:

`bootstrap_resonance_datanest_control_plane`

It creates project, context, tool registry, capability, job, DAG dependency, reservation, run, checkpoint, artifact, event and scheduler-policy tables with RLS enabled.
