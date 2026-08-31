create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org_type text not null default 'Hospital',
  email_domain text,
  created_at timestamptz not null default now()
);

create unique index organizations_email_domain_key
  on public.organizations (email_domain)
  where email_domain is not null;

alter table public.organizations enable row level security;

create policy "Org members can view their own organization"
  on public.organizations for select
  to authenticated
  using ( id = (select organization_id from public.profiles where id = auth.uid()) );

alter table public.profiles
  drop column organization,
  drop column org_type,
  add column organization_id uuid not null references public.organizations (id);

create function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid()
$$;

create policy "Org members can view each other's profiles"
  on public.profiles for select
  to authenticated
  using ( organization_id = public.current_organization_id() );

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
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'outlook.com',
    'hotmail.com', 'live.com', 'icloud.com', 'me.com', 'aol.com',
    'protonmail.com', 'proton.me', 'mail.com', 'gmx.com', 'yandex.com', 'zoho.com'
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
    select id into v_org_id from public.organizations where email_domain = v_domain;
    if v_org_id is null then
      insert into public.organizations (name, org_type, email_domain)
      values (
        coalesce(nullif(new.raw_user_meta_data ->> 'organization', ''), v_domain),
        coalesce(new.raw_user_meta_data ->> 'org_type', 'Hospital'),
        v_domain
      )
      returning id into v_org_id;
    end if;
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
