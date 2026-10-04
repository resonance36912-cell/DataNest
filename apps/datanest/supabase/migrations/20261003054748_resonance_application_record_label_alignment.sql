-- Normalize remaining Resonance application catalog record labels.
-- Stable technical identifiers and portfolio slugs remain unchanged.

UPDATE public.product_records pr
SET name = CASE pr.name
  WHEN 'Resonance AppDev / Reson8 ADT' THEN 'Resonance AppDev'
  WHEN 'RONS Control Center' THEN 'Resonance Control Center'
  ELSE pr.name
END
FROM public.products p
WHERE pr.product_id = p.id
  AND p.slug = 'ronsas'
  AND pr.record_type = 'application'
  AND pr.name IN ('Resonance AppDev / Reson8 ADT','RONS Control Center');
