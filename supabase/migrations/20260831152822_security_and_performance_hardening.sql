-- Findings from the final whole-branch review, all cross-task issues no
-- single task's diff could have caught on its own.

-- 1. CRITICAL: profiles.organization_id — the tenancy boundary every
--    other table's RLS depends on via current_organization_id() — was
--    writable by the row's own owner. RLS restricts which ROWS a policy
--    matches, not which COLUMNS an allowed UPDATE may touch, and
--    Supabase's default `grant all on all tables ... to authenticated`
--    was never narrowed. Any signed-in user could set their own
--    organization_id to an arbitrary (non-secret) org uuid and gain full
--    read access to that org's conversations/messages/campaigns —
--    patient health data. Restrict the grant to the columns the app
--    actually writes (src/lib/auth.tsx's updateUser).
revoke update on public.profiles from authenticated;
grant update (full_name, phone, preferred_language) on public.profiles to authenticated;

-- 2. messages had no column restriction on its UPDATE policy, so any org
--    member could rewrite original_text/side/lang/created_by/
--    conversation_id on anyone's message, not just append a translation
--    (the only write the app performs — updateMessageTranslation).
revoke update on public.messages from authenticated;
grant update (translated_text) on public.messages to authenticated;

-- 3. conversations' UPDATE policy exists only so the
--    bump_conversation_updated_at trigger can bump updated_at (never
--    meant to be client-facing — see spec). Make the trigger
--    SECURITY DEFINER so it needs no client grant at all, and remove the
--    client-facing policy + grant entirely, closing off title/created_by
--    reassignment.
create or replace function public.bump_conversation_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

drop policy "Org members can update conversations" on public.conversations;
revoke update on public.conversations from authenticated;

-- 4. Missing indexes on every FK/RLS-filtered column in the new tables.
create index messages_conversation_id_created_at_idx on public.messages (conversation_id, created_at);
create index conversations_organization_id_idx on public.conversations (organization_id);
create index campaigns_organization_id_idx on public.campaigns (organization_id);
create index profiles_organization_id_idx on public.profiles (organization_id);

-- 5. current_organization_id() is STABLE (not IMMUTABLE), so an
--    unwrapped call in a policy qual is re-evaluated per candidate row.
--    The advisor_remediation migration wrapped auth.uid() but its lint
--    rule doesn't pattern-match this function; wrap it the same way.
alter policy "Org members can view conversations" on public.conversations
  using ( organization_id = (select public.current_organization_id()) );
alter policy "Org members can create conversations" on public.conversations
  with check ( organization_id = (select public.current_organization_id()) and created_by = (select auth.uid()) );
alter policy "Creators can delete their conversations" on public.conversations
  using ( organization_id = (select public.current_organization_id()) and created_by = (select auth.uid()) );

alter policy "Org members can view messages" on public.messages
  using ( organization_id = (select public.current_organization_id()) );
alter policy "Org members can send messages" on public.messages
  with check ( organization_id = (select public.current_organization_id()) and created_by = (select auth.uid()) );
alter policy "Org members can update message translations" on public.messages
  using ( organization_id = (select public.current_organization_id()) )
  with check ( organization_id = (select public.current_organization_id()) );

alter policy "Org members can view campaigns" on public.campaigns
  using ( organization_id = (select public.current_organization_id()) );
alter policy "Org members can create campaigns" on public.campaigns
  with check ( organization_id = (select public.current_organization_id()) and created_by = (select auth.uid()) );
alter policy "Creators can delete their campaigns" on public.campaigns
  using ( organization_id = (select public.current_organization_id()) and created_by = (select auth.uid()) );

alter policy "Org members can view their own organization" on public.organizations
  using ( id = (select public.current_organization_id()) );

alter policy "Org members can view each other's profiles" on public.profiles
  using ( organization_id = (select public.current_organization_id()) );

-- 6. Signup race: two people signing up on the same new work domain at
--    once both see no existing org, both try to insert one, and the
--    second hits organizations_email_domain_key and aborts that user's
--    whole signup. Upsert instead of check-then-insert. Also widen the
--    free-provider blocklist per the reviewer's flagged gaps (fail-open
--    on this list means two strangers silently share an org's patient
--    data, so under-covering it is the riskier direction).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_domain text;
  v_org_id uuid;
  v_free_domains text[] := array[
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'ymail.com',
    'rocketmail.com', 'outlook.com', 'hotmail.com', 'hotmail.co.uk', 'live.com', 'live.co.uk',
    'msn.com', 'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'proton.me', 'mail.com',
    'gmx.com', 'gmx.net', 'web.de', 'yandex.com', 'mail.ru', 'zoho.com', 'qq.com', '163.com',
    'naver.com'
  ];
begin
  v_domain := lower(split_part(new.email, '@', 2));

  if v_domain = '' or v_domain = any(v_free_domains) then
    insert into public.organizations (name, org_type, email_domain)
    values (
      coalesce(nullif(new.raw_user_meta_data ->> 'organization', ''), 'My workspace'),
      coalesce(new.raw_user_meta_data ->> 'org_type', 'Hospital'),
      null
    )
    returning id into v_org_id;
  else
    insert into public.organizations (name, org_type, email_domain)
    values (
      coalesce(nullif(new.raw_user_meta_data ->> 'organization', ''), v_domain),
      coalesce(new.raw_user_meta_data ->> 'org_type', 'Hospital'),
      v_domain
    )
    on conflict (email_domain) do update set email_domain = excluded.email_domain
    returning id into v_org_id;
  end if;

  insert into public.profiles (id, full_name, organization_id, phone, preferred_language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    v_org_id,
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(new.raw_user_meta_data ->> 'preferred_language', 'yo')
  );
  return new;
end;
$$;
