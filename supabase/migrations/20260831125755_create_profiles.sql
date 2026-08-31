-- Workspace profile for each JOJI account: full name, org and contact
-- details that live alongside Supabase Auth's own users table.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  org_type text not null default 'Hospital',
  organization text,
  phone text not null default '',
  preferred_language text not null default 'yo',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  to authenticated
  using ( (select auth.uid()) = id );

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ( (select auth.uid()) = id )
  with check ( (select auth.uid()) = id );

-- Auto-create a profile row when someone signs up, populated from the
-- metadata passed to supabase.auth.signUp() in src/lib/auth.tsx. Runs as
-- SECURITY DEFINER to bypass RLS for this one insert; safe to expose only
-- as a trigger since RETURNS TRIGGER functions cannot be called directly
-- over the API.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, org_type, organization, phone, preferred_language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'org_type', 'Hospital'),
    nullif(new.raw_user_meta_data ->> 'organization', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(new.raw_user_meta_data ->> 'preferred_language', 'yo')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
