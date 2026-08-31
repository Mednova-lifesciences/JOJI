-- handle_new_user is only meant to run as the auth.users insert trigger.
-- Postgres grants EXECUTE to PUBLIC on new functions by default, which
-- exposes it at /rest/v1/rpc/handle_new_user. Revoke that; the trigger
-- itself still runs since triggers don't need an EXECUTE grant.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
