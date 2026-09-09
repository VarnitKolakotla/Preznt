
-- Trigger functions: revoke EXECUTE from every role. Triggers still fire
-- because the trigger runs with the table-owner privileges.
REVOKE ALL ON FUNCTION public.enforce_college_domain() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.provision_verified_user() FROM PUBLIC, anon, authenticated;

-- has_role is used inside RLS policies; policies evaluate as the current role,
-- so authenticated must keep EXECUTE. Revoke from anon.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
