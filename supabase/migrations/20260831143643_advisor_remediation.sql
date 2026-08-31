-- Fixes surfaced by `supabase db advisors` after applying the
-- organizations/conversations/messages/campaigns migrations:
--
-- 1. set_message_organization_id() and bump_conversation_updated_at() had
--    no pinned search_path (function_search_path_mutable) — pin both to
--    match the convention already used by handle_new_user() and
--    current_organization_id().
-- 2. Several RLS policies called auth.uid() directly instead of
--    (select auth.uid()), which Postgres re-evaluates per row instead of
--    once per query (auth_rls_initplan).
-- 3. profiles had two permissive SELECT policies for `authenticated`
--    (multiple_permissive_policies) — "Users can view their own profile"
--    is now fully subsumed by "Org members can view each other's
--    profiles" (your own row always satisfies organization_id =
--    current_organization_id(), since that function derives from your own
--    profile), so the narrower policy is redundant and is dropped.

create or replace function public.set_message_organization_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.organization_id := (
    select organization_id from public.conversations where id = new.conversation_id
  );
  return new;
end;
$$;

create or replace function public.bump_conversation_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

alter policy "Org members can create conversations"
  on public.conversations
  with check ( organization_id = public.current_organization_id() and created_by = (select auth.uid()) );

alter policy "Creators can delete their conversations"
  on public.conversations
  using ( organization_id = public.current_organization_id() and created_by = (select auth.uid()) );

alter policy "Org members can send messages"
  on public.messages
  with check ( organization_id = public.current_organization_id() and created_by = (select auth.uid()) );

alter policy "Org members can create campaigns"
  on public.campaigns
  with check ( organization_id = public.current_organization_id() and created_by = (select auth.uid()) );

alter policy "Creators can delete their campaigns"
  on public.campaigns
  using ( organization_id = public.current_organization_id() and created_by = (select auth.uid()) );

drop policy "Users can view their own profile" on public.profiles;
