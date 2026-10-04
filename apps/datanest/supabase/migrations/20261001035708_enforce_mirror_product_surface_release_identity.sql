create unique index if not exists product_surfaces_mirror_release_identity_idx
  on public.product_surfaces (project_id, name, build_commit, release_id)
  where name = 'Mirror-DataNest Production Candidate'
    and build_commit is not null
    and release_id is not null;
