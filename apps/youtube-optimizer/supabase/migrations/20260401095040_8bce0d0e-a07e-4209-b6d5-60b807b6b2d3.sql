-- Allow anonymous (unauthenticated) users to insert page views for tracking
CREATE POLICY "Anyone can insert page views"
ON public.page_views
FOR INSERT
TO anon
WITH CHECK (
  (page IS NOT NULL) AND (char_length(page) <= 512)
  AND ((referrer IS NULL) OR (char_length(referrer) <= 2048))
  AND ((user_agent IS NULL) OR (char_length(user_agent) <= 1024))
  AND ((session_id IS NULL) OR (char_length(session_id) <= 128))
);

-- Allow anonymous users to insert feature usage for tracking
CREATE POLICY "Anyone can insert feature usage"
ON public.feature_usage
FOR INSERT
TO anon
WITH CHECK (
  (feature IS NOT NULL) AND (char_length(feature) <= 255)
  AND ((metadata IS NULL) OR (octet_length((metadata)::text) <= 4096))
);