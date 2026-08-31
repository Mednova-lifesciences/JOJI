-- The previous migration's upsert (`on conflict (email_domain) do update
-- ...`) doesn't specify the partial index's predicate
-- (`where email_domain is not null`), so Postgres can't find a matching
-- unique constraint to use as the conflict arbiter and every signup on a
-- non-free-provider domain fails with "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification" (surfaced to the
-- client as a generic "Database error saving new user"). Caught live via
-- the Task 11 signup smoke test. Add the missing predicate.
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
    on conflict (email_domain) where email_domain is not null
    do update set email_domain = excluded.email_domain
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
