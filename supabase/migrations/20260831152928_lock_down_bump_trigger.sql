-- bump_conversation_updated_at became SECURITY DEFINER in the previous
-- migration (so the AFTER INSERT trigger no longer needs a client-facing
-- UPDATE grant on conversations). Same treatment as handle_new_user:
-- revoke public EXECUTE. The trigger itself still fires — triggers don't
-- need an EXECUTE grant to run, only direct RPC callers do.
revoke execute on function public.bump_conversation_updated_at() from public, anon, authenticated;
