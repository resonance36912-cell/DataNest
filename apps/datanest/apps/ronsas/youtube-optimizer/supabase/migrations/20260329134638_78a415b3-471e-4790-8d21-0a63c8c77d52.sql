-- Drop old permissive policies
DROP POLICY "Anyone can insert page views" ON public.page_views;
DROP POLICY "Anyone can insert feature usage" ON public.feature_usage;

-- page_views: restrict to authenticated, validate field lengths
CREATE POLICY "Authenticated users can insert page views"
ON public.page_views
FOR INSERT
TO authenticated
WITH CHECK (
  page IS NOT NULL
  AND char_length(page) <= 512
  AND (referrer IS NULL OR char_length(referrer) <= 2048)
  AND (user_agent IS NULL OR char_length(user_agent) <= 1024)
  AND (session_id IS NULL OR char_length(session_id) <= 128)
);

-- feature_usage: restrict to authenticated, validate field lengths and feature name
CREATE POLICY "Authenticated users can insert feature usage"
ON public.feature_usage
FOR INSERT
TO authenticated
WITH CHECK (
  feature IS NOT NULL
  AND char_length(feature) <= 255
  AND (metadata IS NULL OR octet_length(metadata::text) <= 4096)
);