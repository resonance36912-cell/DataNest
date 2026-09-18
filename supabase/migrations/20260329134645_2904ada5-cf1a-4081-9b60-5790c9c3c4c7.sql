DROP POLICY "Authenticated users can insert audit logs" ON public.audit_logs;

CREATE POLICY "Authenticated users can insert audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  channel_url IS NOT NULL
  AND char_length(channel_url) <= 512
  AND (channel_name IS NULL OR char_length(channel_name) <= 255)
);