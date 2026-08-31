create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) default public.current_organization_id(),
  created_by uuid not null references auth.users (id),
  title text not null,
  patient_language text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conversations enable row level security;

create policy "Org members can view conversations"
  on public.conversations for select
  to authenticated
  using ( organization_id = public.current_organization_id() );

create policy "Org members can create conversations"
  on public.conversations for insert
  to authenticated
  with check ( organization_id = public.current_organization_id() and created_by = auth.uid() );

create policy "Org members can update conversations"
  on public.conversations for update
  to authenticated
  using ( organization_id = public.current_organization_id() )
  with check ( organization_id = public.current_organization_id() );

create policy "Creators can delete their conversations"
  on public.conversations for delete
  to authenticated
  using ( organization_id = public.current_organization_id() and created_by = auth.uid() );

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  organization_id uuid not null references public.organizations (id),
  side text not null check (side in ('patient', 'doctor')),
  original_text text not null,
  translated_text text,
  lang text not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "Org members can view messages"
  on public.messages for select
  to authenticated
  using ( organization_id = public.current_organization_id() );

create policy "Org members can send messages"
  on public.messages for insert
  to authenticated
  with check ( organization_id = public.current_organization_id() and created_by = auth.uid() );

create policy "Org members can update message translations"
  on public.messages for update
  to authenticated
  using ( organization_id = public.current_organization_id() )
  with check ( organization_id = public.current_organization_id() );

create function public.set_message_organization_id()
returns trigger
language plpgsql
as $$
begin
  new.organization_id := (
    select organization_id from public.conversations where id = new.conversation_id
  );
  return new;
end;
$$;

create trigger before_message_insert
  before insert on public.messages
  for each row execute function public.set_message_organization_id();

create function public.bump_conversation_updated_at()
returns trigger
language plpgsql
as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

create trigger after_message_insert
  after insert on public.messages
  for each row execute function public.bump_conversation_updated_at();

alter publication supabase_realtime add table public.messages;
