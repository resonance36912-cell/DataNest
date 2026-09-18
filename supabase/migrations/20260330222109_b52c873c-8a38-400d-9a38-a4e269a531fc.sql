INSERT INTO public.user_roles (user_id, role)
VALUES ('13c407dd-d72d-4b7c-8050-e7619a2e7545', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;