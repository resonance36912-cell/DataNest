-- Resonance customer-facing brand and RONSAS portfolio alignment.
-- Stable technical identifier remains RONSAS; slugs, paths and IDs are preserved.
-- Commercial child classifications and containment relationships remain proposed
-- pending governance approval; nothing is promoted to active by this migration.

DO $$
DECLARE
  v_project_id uuid;
  v_product_id uuid;
  v_proposed_by uuid;
  v_ronsas_item_id uuid;
BEGIN
  SELECT id INTO v_project_id FROM public.projects WHERE slug = 'resonance-datanest' LIMIT 1;
  IF v_project_id IS NULL THEN
    RAISE NOTICE 'Skipping Resonance alignment: prerequisite project resonance-datanest is absent in this replay database.';
    RETURN;
  END IF;

  SELECT id INTO v_product_id
  FROM public.products
  WHERE project_id = v_project_id AND slug = 'ronsas'
  LIMIT 1;
  IF v_product_id IS NULL THEN
    RAISE NOTICE 'Skipping Resonance alignment: prerequisite governed product ronsas is absent in this replay database.';
    RETURN;
  END IF;

  SELECT user_id INTO v_proposed_by
  FROM public.project_members
  WHERE project_id = v_project_id AND role = 'owner' AND status = 'active'
  ORDER BY created_at
  LIMIT 1;
  IF v_proposed_by IS NULL THEN
    RAISE NOTICE 'Skipping Resonance alignment: no active project owner exists in this replay database.';
    RETURN;
  END IF;

  SELECT id INTO v_ronsas_item_id
  FROM public.portfolio_items
  WHERE project_id = v_project_id AND slug = 'ronsas'
  LIMIT 1;
  IF v_ronsas_item_id IS NULL THEN
    RAISE NOTICE 'Skipping Resonance alignment: prerequisite portfolio item ronsas is absent in this replay database.';
    RETURN;
  END IF;

  UPDATE public.products
  SET
    name = 'Resonance',
    full_name = 'Resonance Application Suite',
    metadata = metadata || jsonb_build_object(
      'customer_facing_name', 'Resonance',
      'technical_identifier', 'RONSAS',
      'portfolio', 'Resonance',
      'brand_aliases', jsonb_build_array('RONS', 'RONSAS', 'Resonance Open Nova')
    )
  WHERE id = v_product_id;

  UPDATE public.portfolio_items
  SET
    name = 'Resonance',
    metadata = metadata || jsonb_build_object(
      'customer_facing_name', 'Resonance',
      'technical_identifier', 'RONSAS',
      'commercial_portfolio_role', 'application-suite',
      'commercial_architecture', 'consolidated-portfolio'
    ),
    updated_at = now()
  WHERE id = v_ronsas_item_id;

  UPDATE public.portfolio_items
  SET
    name = CASE slug
      WHEN 'creative-studio' THEN 'Resonance Creator Studio'
      WHEN 'epublisher' THEN 'Resonance Publish'
      WHEN 'lyricsync-studio' THEN 'Resonance Lyrics & Sync'
      WHEN 'scene-song-spark' THEN 'SongSpark'
      WHEN 'sovereignforge' THEN 'Sovereign Forge'
      WHEN 'sync-vision' THEN 'Resonance Media Sync'
      WHEN 'youtube-optimizer' THEN 'Resonance Creator Growth'
      WHEN 'resonance-appdev-reson8-adt' THEN 'Resonance AppDev'
      WHEN 'rons-control-center' THEN 'Resonance Control Center'
      ELSE name
    END,
    metadata = metadata || CASE slug
      WHEN 'creative-studio' THEN jsonb_build_object('customer_facing_name','Resonance Creator Studio','commercial_family','create','commercial_role','primary-product')
      WHEN 'epublisher' THEN jsonb_build_object('customer_facing_name','Resonance Publish','commercial_family','create','commercial_role','module','commercial_parent','creative-studio')
      WHEN 'lyricsync-studio' THEN jsonb_build_object('customer_facing_name','Resonance Lyrics & Sync','commercial_family','create','commercial_role','module','commercial_parent','creative-studio')
      WHEN 'scene-song-spark' THEN jsonb_build_object('customer_facing_name','SongSpark','commercial_family','grow','commercial_role','acquisition-tool')
      WHEN 'sovereignforge' THEN jsonb_build_object('customer_facing_name','Sovereign Forge','commercial_family','build','commercial_role','primary-product')
      WHEN 'sync-vision' THEN jsonb_build_object('customer_facing_name','Resonance Media Sync','commercial_family','create','commercial_role','module','commercial_parent','creative-studio')
      WHEN 'youtube-optimizer' THEN jsonb_build_object('customer_facing_name','Resonance Creator Growth','commercial_family','grow','commercial_role','module','commercial_parent','creative-studio')
      WHEN 'resonance-appdev-reson8-adt' THEN jsonb_build_object('customer_facing_name','Resonance AppDev','commercial_family','build','commercial_role','infrastructure')
      WHEN 'rons-control-center' THEN jsonb_build_object('customer_facing_name','Resonance Control Center','commercial_family','build','commercial_role','infrastructure')
      ELSE '{}'::jsonb
    END,
    updated_at = now()
  WHERE project_id = v_project_id
    AND slug IN (
      'creative-studio','epublisher','lyricsync-studio','scene-song-spark',
      'sovereignforge','sync-vision','youtube-optimizer',
      'resonance-appdev-reson8-adt','rons-control-center'
    );

  UPDATE public.product_records pr
  SET name = CASE pr.name
    WHEN 'Creative Studio' THEN 'Resonance Creator Studio'
    WHEN 'ePublisher' THEN 'Resonance Publish'
    WHEN 'LyricSync Studio' THEN 'Resonance Lyrics & Sync'
    WHEN 'Scene Song Spark' THEN 'SongSpark'
    WHEN 'SovereignForge' THEN 'Sovereign Forge'
    WHEN 'Sync Vision' THEN 'Resonance Media Sync'
    WHEN 'YouTube Optimizer' THEN 'Resonance Creator Growth'
    ELSE pr.name
  END
  WHERE pr.product_id = v_product_id
    AND pr.record_type = 'application'
    AND pr.name IN (
      'Creative Studio','ePublisher','LyricSync Studio','Scene Song Spark',
      'SovereignForge','Sync Vision','YouTube Optimizer'
    );

  INSERT INTO public.portfolio_classifications
    (project_id, portfolio_item_id, classification, target_product_id, status, rationale, evidence_reference, proposed_by)
  SELECT
    pi.project_id,
    pi.id,
    CASE
      WHEN pi.slug IN ('resonance-appdev-reson8-adt','rons-control-center')
        THEN 'shared_datanest_capability'
      ELSE 'product_owned'
    END,
    CASE
      WHEN pi.slug IN ('resonance-appdev-reson8-adt','rons-control-center')
        THEN NULL
      ELSE v_product_id
    END,
    'proposed',
    CASE
      WHEN pi.slug IN ('resonance-appdev-reson8-adt','rons-control-center')
        THEN 'Governed internal/control capability supporting the Resonance suite; not a primary customer purchase decision.'
      ELSE 'Commercially owned Resonance surface under the consolidated portfolio architecture; existing implementation remains available.'
    END,
    'Resonance portfolio reconciliation 2026-10-03; DataNest catalog schema v2',
    v_proposed_by
  FROM public.portfolio_items pi
  WHERE pi.project_id = v_project_id
    AND pi.slug IN (
      'creative-studio','epublisher','lyricsync-studio','scene-song-spark',
      'sovereignforge','sync-vision','youtube-optimizer',
      'resonance-appdev-reson8-adt','rons-control-center'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.portfolio_classifications pc
      WHERE pc.project_id = v_project_id
        AND pc.portfolio_item_id = pi.id
        AND pc.status IN ('proposed','active')
    );

  INSERT INTO public.portfolio_relationships
    (project_id, source_item_id, target_item_id, relationship_type, criticality, status, rationale, evidence_reference, proposed_by)
  SELECT
    v_project_id,
    v_ronsas_item_id,
    pi.id,
    'contains',
    'normal',
    'proposed',
    'Resonance governs the application/capability as part of the consolidated portfolio while preserving the existing implementation surface.',
    'Resonance portfolio reconciliation 2026-10-03; DataNest catalog schema v2',
    v_proposed_by
  FROM public.portfolio_items pi
  WHERE pi.project_id = v_project_id
    AND pi.slug IN (
      'creative-studio','epublisher','lyricsync-studio','scene-song-spark',
      'sovereignforge','sync-vision','youtube-optimizer',
      'resonance-appdev-reson8-adt','rons-control-center'
    )
    AND pi.id <> v_ronsas_item_id
    AND NOT EXISTS (
      SELECT 1 FROM public.portfolio_relationships pr
      WHERE pr.project_id = v_project_id
        AND pr.source_item_id = v_ronsas_item_id
        AND pr.target_item_id = pi.id
        AND pr.relationship_type = 'contains'
        AND pr.status IN ('proposed','active')
    );
END $$;
