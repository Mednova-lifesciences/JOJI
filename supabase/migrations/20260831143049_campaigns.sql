create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) default public.current_organization_id(),
  created_by uuid not null references auth.users (id),
  title text not null,
  source_text text not null,
  topic text,
  audience text,
  kit jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.campaigns enable row level security;

create policy "Org members can view campaigns"
  on public.campaigns for select
  to authenticated
  using ( organization_id = public.current_organization_id() );

create policy "Org members can create campaigns"
  on public.campaigns for insert
  to authenticated
  with check ( organization_id = public.current_organization_id() and created_by = auth.uid() );

create policy "Creators can delete their campaigns"
  on public.campaigns for delete
  to authenticated
  using ( organization_id = public.current_organization_id() and created_by = auth.uid() );
