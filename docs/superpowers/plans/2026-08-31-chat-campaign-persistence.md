# Chat & Campaign Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist translate-page conversations and campaign kits to Supabase, shared within an organization (derived from verified work email domain), with realtime cross-device sync for the active conversation, continuous mic recording, and per-panel maximize/restore layout.

**Architecture:** New Postgres tables (`organizations`, `conversations`, `messages`, `campaigns`) with RLS scoped by a `current_organization_id()` helper function; `profiles.organization_id` replaces the old free-text `organization`/`org_type` columns. Frontend gets two new thin data-layer modules (`src/lib/conversations.ts`, `src/lib/campaigns.ts`) wrapping Supabase queries + a realtime subscription helper, consumed by reworked `translate-page.tsx` and `campaign-page.tsx` components. `src/lib/auth.tsx` and `settings-page.tsx` are updated so `JojiUser.organization`/`orgType` become read-only fields sourced from the joined `organizations` row.

**Tech Stack:** Supabase (Postgres, Auth, Realtime), `@supabase/supabase-js`, React 19, TanStack Start/Router, existing shadcn/radix UI components, sonner toasts, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-08-31-chat-campaign-persistence-design.md`

## Global Constraints

- No unit/e2e test framework exists in this repo (verified: only `node_modules` contains `*.test.ts` files). Every task's verification is `npx tsc --noEmit -p .`, `npx eslint <changed files>`, and `npm run build` — plus direct Supabase SQL smoke tests for DB tasks (Tasks 1–4) and a real-browser Playwright pass at the end (Task 11). Do not add a test framework as part of this plan.
- Prettier formatting: after writing/editing any `.ts`/`.tsx` file, run `npx prettier --write <file>` before linting — this repo's ESLint config enforces `prettier/prettier` as an error.
- The Supabase CLI is already linked to project ref `nwipvcbgdpzetndqtrkg` in this working directory (`supabase/config.toml` exists). Migrations are created with `supabase migration new <name>` and pushed with `supabase db push --yes`.
- No production user rows exist yet (`profiles` count is 0 as of this plan's writing) — schema changes do not need data-preserving backfill logic.
- Keep the existing `useAuth()` contract's method names (`signIn`, `signUp`, `signOut`, `updateUser`) — only the shape of what's read from `profiles` changes.
- Follow existing code style: no comments except where a non-obvious constraint justifies one (this codebase's existing files are a good model — see `src/lib/auth.tsx`, `src/components/joji/translate-page.tsx`).
- Vercel project `mednova/joji` is git-linked to `Mednova-lifesciences/JOJI` on `main` — pushing to `main` auto-deploys to production. Task 11 pushes only after everything else is verified locally.

---

## Task 1: Migration — organizations table & profiles restructure

**Files:**
- Create: `supabase/migrations/<timestamp>_organizations_and_profiles.sql` (timestamp from `supabase migration new`)

**Interfaces:**
- Produces: table `public.organizations(id, name, org_type, email_domain, created_at)`; function `public.current_organization_id() returns uuid`; `public.profiles` gains `organization_id uuid not null references organizations(id)` and loses `organization`, `org_type`; rewritten `public.handle_new_user()` trigger function (same name/signature as before, so the existing `on_auth_user_created` trigger picks it up automatically).

- [ ] **Step 1: Create the migration file**

Run: `supabase migration new organizations_and_profiles`

- [ ] **Step 2: Write the migration SQL**

Write this exact content to the generated file:

```sql
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
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations
git commit -m "Add organizations table, move org fields off profiles"
```

Do NOT run `supabase db push` yet — Task 4 pushes all three schema migrations together.

---

## Task 2: Migration — conversations & messages, realtime

**Files:**
- Create: `supabase/migrations/<timestamp>_conversations_and_messages.sql`

**Interfaces:**
- Consumes: `public.current_organization_id()` from Task 1.
- Produces: tables `public.conversations(id, organization_id, created_by, title, patient_language, created_at, updated_at)` and `public.messages(id, conversation_id, organization_id, side, original_text, translated_text, lang, created_by, created_at)`; `messages` added to the `supabase_realtime` publication.

- [ ] **Step 1: Create the migration file**

Run: `supabase migration new conversations_and_messages`

- [ ] **Step 2: Write the migration SQL**

```sql
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
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations
git commit -m "Add conversations and messages tables with realtime"
```

---

## Task 3: Migration — campaigns

**Files:**
- Create: `supabase/migrations/<timestamp>_campaigns.sql`

**Interfaces:**
- Consumes: `public.current_organization_id()` from Task 1.
- Produces: table `public.campaigns(id, organization_id, created_by, title, source_text, topic, audience, kit, created_at)`.

- [ ] **Step 1: Create the migration file**

Run: `supabase migration new campaigns`

- [ ] **Step 2: Write the migration SQL**

```sql
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
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations
git commit -m "Add campaigns table"
```

---

## Task 4: Push migrations & verify against the live database

**Files:** none (CLI/SQL only)

**Interfaces:**
- Consumes: all three migrations from Tasks 1–3.
- Produces: a live, verified schema on project `nwipvcbgdpzetndqtrkg` that Tasks 5–11 build against.

- [ ] **Step 1: Push the migrations**

Run: `supabase db push --yes`
Expected: all three new migrations listed and applied without error.

- [ ] **Step 2: Run the security advisor**

Run: `supabase db advisors --linked`
Expected: no new warnings beyond the pre-existing `rls_auto_enable` platform-managed one (already present before this plan). If `handle_new_user`, `bump_conversation_updated_at`, or `set_message_organization_id` show up as anon/authenticated-executable SECURITY DEFINER warnings, investigate — only `handle_new_user` and `current_organization_id` are intentionally SECURITY DEFINER, and neither should be flagged as newly problematic (they were already reviewed in the spec).

- [ ] **Step 3: Smoke-test org-by-domain signup logic**

Run these against the live project (replace nothing — these are throwaway accounts you'll delete in Step 5):

```bash
curl -s -X POST "https://nwipvcbgdpzetndqtrkg.supabase.co/auth/v1/signup" \
  -H "apikey: sb_publishable_EzyEgbcsU_uxvF4DMQA_Sw_iHhGqjwp" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke-a1@joji-plan-test.com","password":"Sm0keTest!2026","data":{"full_name":"Smoke A1","organization":"JOJI Plan Test Clinic","org_type":"Hospital","phone":"+2348000000001","preferred_language":"yo"}}'

curl -s -X POST "https://nwipvcbgdpzetndqtrkg.supabase.co/auth/v1/signup" \
  -H "apikey: sb_publishable_EzyEgbcsU_uxvF4DMQA_Sw_iHhGqjwp" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke-a2@joji-plan-test.com","password":"Sm0keTest!2026","data":{"full_name":"Smoke A2","organization":"Different Typed Name","org_type":"NGO","phone":"+2348000000002","preferred_language":"yo"}}'

curl -s -X POST "https://nwipvcbgdpzetndqtrkg.supabase.co/auth/v1/signup" \
  -H "apikey: sb_publishable_EzyEgbcsU_uxvF4DMQA_Sw_iHhGqjwp" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke-b1@gmail.com","password":"Sm0keTest!2026","data":{"full_name":"Smoke B1","organization":"Whatever","org_type":"Hospital","phone":"+2348000000003","preferred_language":"yo"}}'
```

Note each response's `"id"` field (the user id) for Step 4/5.

- [ ] **Step 4: Verify org matching and RLS boundaries**

```bash
supabase db query "select p.id, p.full_name, o.name, o.email_domain from public.profiles p join public.organizations o on o.id = p.organization_id where p.full_name like 'Smoke %' order by p.full_name" --linked
```

Expected: `smoke-a1` and `smoke-a2` share the **same** `organizations.id`/`name` (`JOJI Plan Test Clinic` — the first signup's typed name wins) with `email_domain = 'joji-plan-test.com'`; `smoke-b1` has a **different**, distinct org with `email_domain` null.

Then verify cross-org RLS: as the `smoke-a1` user, insert a conversation and confirm `smoke-b1` cannot see it:

```bash
supabase db query "select organization_id from public.profiles where full_name = 'Smoke A1'" --linked
```

Use that `organization_id` to directly insert a test conversation row scoped to org A (bypassing RLS via the CLI's elevated connection is fine here — the point is to then confirm RLS blocks cross-org `SELECT` through the actual anon-key + user-JWT path, not to test the CLI's own access):

```bash
supabase db query "insert into public.conversations (organization_id, created_by, title, patient_language) select p.organization_id, p.id, 'RLS test chat', 'yo' from public.profiles p where p.full_name = 'Smoke A1' returning id" --linked
```

Then, using the smoke-b1 user's access token (obtained from their signup response's `access_token`, or via a fresh `signInWithPassword` call if confirmation is required and blocks it — if email confirmation blocks login, skip the live-JWT check and instead confirm via SQL that `smoke-b1`'s `organization_id` differs from the inserted conversation's `organization_id`, which is sufficient to prove the RLS predicate will exclude it):

```bash
supabase db query "select (select organization_id from public.profiles where full_name = 'Smoke B1') = (select organization_id from public.conversations where title = 'RLS test chat') as would_be_visible" --linked
```

Expected: `would_be_visible` is `false`.

- [ ] **Step 5: Clean up smoke-test data**

```bash
supabase db query "delete from auth.users where email in ('smoke-a1@joji-plan-test.com', 'smoke-a2@joji-plan-test.com', 'smoke-b1@gmail.com')" --linked
```

Confirm cascade cleanup:

```bash
supabase db query "select count(*) from public.organizations where email_domain in ('joji-plan-test.com')" --linked
```

Expected: `0` (org row has no FK from profiles anymore once the users are gone, but nothing else references it, so this is just confirming no orphaned data assertions are needed — if the count is nonzero, delete it manually: `supabase db query "delete from public.organizations where email_domain = 'joji-plan-test.com'" --linked`).

- [ ] **Step 6: Verify realtime publication**

```bash
supabase db query "select tablename from pg_publication_tables where pubname = 'supabase_realtime'" --linked
```

Expected: `messages` is in the list.

No commit for this task (no files changed).

---

## Task 5: Update auth.tsx & settings-page.tsx for the organizations schema

**Files:**
- Modify: `src/lib/auth.tsx` (full replacement)
- Modify: `src/components/joji/settings-page.tsx` (full replacement)

**Interfaces:**
- Consumes: `profiles.organization_id` + `organizations(name, org_type)` from Task 1.
- Produces: `JojiUser.organization: string` and `JojiUser.orgType: string` (both now always-present, read-only, sourced from the joined org row — no longer part of `updateUser`'s writable patch).

- [ ] **Step 1: Replace `src/lib/auth.tsx`**

```tsx
/**
 * Supabase-backed auth for JOJI. Session state comes from Supabase Auth;
 * profile fields (name, phone, preferred language) live in the `profiles`
 * table, and organization/org_type are read-only, joined from `profiles.
 * organization_id -> organizations` (see supabase/migrations) since an
 * organization is now shared across everyone on the same work email domain.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "./supabase";

export type JojiUser = {
  id: string;
  fullName: string;
  email: string;
  orgType: string;
  organization: string;
  phone: string;
  preferredLanguage: string;
};

type ProfileRow = {
  id: string;
  full_name: string;
  phone: string;
  preferred_language: string;
  organizations: { name: string; org_type: string } | null;
};

type SignUpInput = {
  fullName: string;
  email: string;
  password: string;
  orgType: string;
  organization?: string;
  phone: string;
  preferredLanguage?: string;
};

type AuthState = {
  user: JojiUser | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Returns needsEmailConfirmation: true when the project requires the user to click a confirmation link before a session exists. */
  signUp: (input: SignUpInput) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => void;
  updateUser: (patch: Partial<Pick<JojiUser, "fullName" | "phone" | "preferredLanguage">>) => void;
};

const AuthContext = createContext<AuthState | null>(null);

function toJojiUser(session: Session, profile: ProfileRow): JojiUser {
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    fullName: profile.full_name,
    orgType: profile.organizations?.org_type ?? "Hospital",
    organization: profile.organizations?.name ?? "",
    phone: profile.phone,
    preferredLanguage: profile.preferred_language,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<JojiUser | null>(null);
  const [ready, setReady] = useState(false);

  const loadUser = useCallback(async (session: Session | null) => {
    if (!session) {
      setUser(null);
      return;
    }
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, full_name, phone, preferred_language, organizations(name, org_type)")
      .eq("id", session.user.id)
      .single<ProfileRow>();
    if (error || !profile) {
      setUser(null);
      return;
    }
    setUser(toJojiUser(session, profile));
  }, []);

  useEffect(() => {
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      void loadUser(session).finally(() => {
        if (active) setReady(true);
      });
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadUser]);

  const signIn = useCallback<AuthState["signIn"]>(
    async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw new Error(error.message);
      await loadUser(data.session);
    },
    [loadUser],
  );

  const signUp = useCallback<AuthState["signUp"]>(
    async (input) => {
      const { data, error } = await supabase.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: {
          data: {
            full_name: input.fullName,
            org_type: input.orgType,
            organization: input.organization ?? "",
            phone: input.phone,
            preferred_language: input.preferredLanguage ?? "yo",
          },
        },
      });
      if (error) throw new Error(error.message);
      if (!data.session) return { needsEmailConfirmation: true };
      await loadUser(data.session);
      return { needsEmailConfirmation: false };
    },
    [loadUser],
  );

  const signOut = useCallback(() => {
    void supabase.auth.signOut();
  }, []);

  const updateUser = useCallback<AuthState["updateUser"]>((patch) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      void supabase
        .from("profiles")
        .update({
          full_name: next.fullName,
          phone: next.phone,
          preferred_language: next.preferredLanguage,
        })
        .eq("id", next.id)
        .then(({ error }) => {
          if (error) toast.error(`Could not save changes: ${error.message}`);
        });
      return next;
    });
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, ready, signIn, signUp, signOut, updateUser }),
    [user, ready, signIn, signUp, signOut, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
```

- [ ] **Step 2: Replace `src/components/joji/settings-page.tsx`**

```tsx
import { useState, type FormEvent } from "react";
import { Check, Languages, Save, Settings2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { PATIENT_LANGUAGES } from "@/lib/joji";
import { WorkspaceHeader } from "./workspace-header";

export function SettingsPage() {
  const { user, updateUser } = useAuth();
  const [saved, setSaved] = useState(false);

  if (!user) return null;

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    updateUser({
      fullName: String(form.get("fullName")),
      phone: String(form.get("phone")),
      preferredLanguage: String(form.get("preferredLanguage")),
    });
    setSaved(true);
    toast.success("Settings saved");
    window.setTimeout(() => setSaved(false), 1600);
  }

  return (
    <div className="min-h-screen">
      <WorkspaceHeader
        eyebrow="Settings / Workspace profile"
        title="Make JOJI fit your team."
        description="Keep your organisation details and preferred patient language ready for the next consultation."
      />
      <form onSubmit={save} className="max-w-3xl space-y-6 px-5 py-6 sm:px-8 lg:px-10">
        <section className="surface p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-secondary text-teal">
              <UserRound className="size-5" />
            </span>
            <div>
              <p className="label-mono text-muted-foreground">Your profile</p>
              <h2 className="text-xl font-semibold">Personal details</h2>
            </div>
          </div>
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" name="fullName" defaultValue={user.fullName} required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user.email} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input id="phone" name="phone" defaultValue={user.phone} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preferredLanguage">Patient language</Label>
              <Select name="preferredLanguage" defaultValue={user.preferredLanguage}>
                <SelectTrigger id="preferredLanguage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PATIENT_LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="surface p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-secondary text-teal">
              <Settings2 className="size-5" />
            </span>
            <div>
              <p className="label-mono text-muted-foreground">Organisation</p>
              <h2 className="text-xl font-semibold">Workspace details</h2>
            </div>
          </div>
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Organisation name</Label>
              <Input value={user.organization} disabled />
            </div>
            <div className="space-y-2">
              <Label>Organisation type</Label>
              <Input value={user.orgType} disabled />
            </div>
          </div>
          <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
            <Languages className="size-3.5 text-teal" /> Organisation details are set from your
            work email domain and shared with your teammates — contact support to change them.
          </p>
        </section>

        <div className="flex items-center justify-between border-t border-border pt-5">
          <p className="text-xs text-muted-foreground">Changes save to your Supabase profile.</p>
          <Button type="submit">
            {saved ? <Check className="size-4" /> : <Save className="size-4" />}{" "}
            {saved ? "Saved" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Format, typecheck, lint**

```bash
npx prettier --write src/lib/auth.tsx src/components/joji/settings-page.tsx
npx tsc --noEmit -p .
npx eslint src/lib/auth.tsx src/components/joji/settings-page.tsx
```

Expected: no errors from either changed file (the pre-existing unrelated `src/lib/speech.ts` errors are fine to still see here if they haven't been fixed yet — Task 8 doesn't fix them, they're out of scope, just confirm no *new* errors from these two files).

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth.tsx src/components/joji/settings-page.tsx
git commit -m "Move organization/org_type to the organizations table (read-only in UI)"
```

---

## Task 6: `src/lib/conversations.ts` data layer

**Files:**
- Create: `src/lib/conversations.ts`
- Modify: `src/lib/joji.ts` (append `formatDateTime`)

**Interfaces:**
- Consumes: `supabase` client from `src/lib/supabase.ts`.
- Produces: `Conversation`, `ConversationMessage` types; `listConversations()`, `createConversation()`, `deleteConversation()`, `listMessages()`, `insertMessage()`, `updateMessageTranslation()`, `subscribeToConversationMessages()` — all consumed by Task 9.

- [ ] **Step 1: Create `src/lib/conversations.ts`**

```ts
import { supabase } from "./supabase";

export type Conversation = {
  id: string;
  title: string;
  patientLanguage: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationMessage = {
  id: string;
  conversationId: string;
  side: "patient" | "doctor";
  originalText: string;
  translatedText: string | null;
  lang: string;
  createdBy: string;
  createdAt: string;
};

type ConversationRow = {
  id: string;
  title: string;
  patient_language: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  side: "patient" | "doctor";
  original_text: string;
  translated_text: string | null;
  lang: string;
  created_by: string;
  created_at: string;
};

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    patientLanguage: row.patient_language,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMessage(row: MessageRow): ConversationMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    side: row.side,
    originalText: row.original_text,
    translatedText: row.translated_text,
    lang: row.lang,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, patient_language, created_by, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ConversationRow[]).map(toConversation);
}

export async function createConversation(input: {
  title: string;
  patientLanguage: string;
  createdBy: string;
}): Promise<Conversation> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      title: input.title,
      patient_language: input.patientLanguage,
      created_by: input.createdBy,
    })
    .select("id, title, patient_language, created_by, created_at, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return toConversation(data as ConversationRow);
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await supabase.from("conversations").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listMessages(conversationId: string): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, conversation_id, side, original_text, translated_text, lang, created_by, created_at",
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as MessageRow[]).map(toMessage);
}

export async function insertMessage(input: {
  conversationId: string;
  side: "patient" | "doctor";
  originalText: string;
  lang: string;
  createdBy: string;
}): Promise<ConversationMessage> {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      side: input.side,
      original_text: input.originalText,
      lang: input.lang,
      created_by: input.createdBy,
    })
    .select(
      "id, conversation_id, side, original_text, translated_text, lang, created_by, created_at",
    )
    .single();
  if (error) throw new Error(error.message);
  return toMessage(data as MessageRow);
}

export async function updateMessageTranslation(id: string, translatedText: string): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .update({ translated_text: translatedText })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export function subscribeToConversationMessages(
  conversationId: string,
  onChange: (message: ConversationMessage) => void,
  onConnectionChange?: (connected: boolean) => void,
): () => void {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onChange(toMessage(payload.new as MessageRow)),
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onChange(toMessage(payload.new as MessageRow)),
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") onConnectionChange?.(true);
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        onConnectionChange?.(false);
      }
    });
  return () => {
    void supabase.removeChannel(channel);
  };
}
```

- [ ] **Step 2: Append `formatDateTime` to `src/lib/joji.ts`**

Add this function directly after the existing `formatDate` function (which ends at the line `return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });\n}`):

```ts
export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
```

- [ ] **Step 3: Format, typecheck, lint**

```bash
npx prettier --write src/lib/conversations.ts src/lib/joji.ts
npx tsc --noEmit -p .
npx eslint src/lib/conversations.ts src/lib/joji.ts
```

Expected: no errors from either file.

- [ ] **Step 4: Commit**

```bash
git add src/lib/conversations.ts src/lib/joji.ts
git commit -m "Add conversations data layer and formatDateTime helper"
```

---

## Task 7: `src/lib/campaigns.ts` data layer

**Files:**
- Create: `src/lib/campaigns.ts`

**Interfaces:**
- Consumes: `supabase` client; `CampaignKit` type from `src/lib/ai.types.ts`.
- Produces: `SavedCampaign` type; `listCampaigns()`, `saveCampaign()`, `deleteCampaign()` — consumed by Task 10.

- [ ] **Step 1: Create `src/lib/campaigns.ts`**

```ts
import { supabase } from "./supabase";
import type { CampaignKit } from "./ai.types";

export type SavedCampaign = {
  id: string;
  title: string;
  sourceText: string;
  topic: string | null;
  audience: string | null;
  kit: CampaignKit;
  createdBy: string;
  createdAt: string;
};

type CampaignRow = {
  id: string;
  title: string;
  source_text: string;
  topic: string | null;
  audience: string | null;
  kit: CampaignKit;
  created_by: string;
  created_at: string;
};

function toSavedCampaign(row: CampaignRow): SavedCampaign {
  return {
    id: row.id,
    title: row.title,
    sourceText: row.source_text,
    topic: row.topic,
    audience: row.audience,
    kit: row.kit,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function listCampaigns(): Promise<SavedCampaign[]> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, title, source_text, topic, audience, kit, created_by, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as CampaignRow[]).map(toSavedCampaign);
}

export async function saveCampaign(input: {
  sourceText: string;
  topic?: string;
  audience?: string;
  kit: CampaignKit;
  createdBy: string;
}): Promise<SavedCampaign> {
  const title = input.topic?.trim() || input.sourceText.trim().slice(0, 60);
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      title,
      source_text: input.sourceText,
      topic: input.topic || null,
      audience: input.audience || null,
      kit: input.kit,
      created_by: input.createdBy,
    })
    .select("id, title, source_text, topic, audience, kit, created_by, created_at")
    .single();
  if (error) throw new Error(error.message);
  return toSavedCampaign(data as CampaignRow);
}

export async function deleteCampaign(id: string): Promise<void> {
  const { error } = await supabase.from("campaigns").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Format, typecheck, lint**

```bash
npx prettier --write src/lib/campaigns.ts
npx tsc --noEmit -p .
npx eslint src/lib/campaigns.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/campaigns.ts
git commit -m "Add campaigns data layer"
```

---

## Task 8: Continuous mic recording

**Files:**
- Modify: `src/lib/speech.ts:59`

**Interfaces:** none (internal behavior change only; `startDictation`'s signature is unchanged).

- [ ] **Step 1: Change `continuous` to `true`**

In `src/lib/speech.ts`, find this line inside `startDictation`:

```ts
  recognition.continuous = false;
```

Replace with:

```ts
  recognition.continuous = true;
```

- [ ] **Step 2: Format, typecheck, lint**

```bash
npx prettier --write src/lib/speech.ts
npx tsc --noEmit -p .
npx eslint src/lib/speech.ts
```

Expected: the pre-existing 3 errors in this file (`'result' is possibly 'undefined'` at lines 66–67) are unrelated to this change and were present before this plan — confirm the count/location hasn't changed, don't fix them (out of scope).

- [ ] **Step 3: Commit**

```bash
git add src/lib/speech.ts
git commit -m "Keep the mic listening until manually stopped"
```

---

## Task 9: `translate-page.tsx` — persistence, history, realtime

**Files:**
- Modify: `src/components/joji/translate-page.tsx` (full replacement)

**Interfaces:**
- Consumes: everything from `src/lib/conversations.ts` (Task 6), `formatDateTime` from `src/lib/joji.ts` (Task 6), `useAuth()` (Task 5).
- Produces: the reworked `TranslatePage` component, including per-panel maximize/restore layout (folded into this task rather than split out, since the layout state and the icon buttons that drive it aren't independently reviewable from the panel they live in).

- [ ] **Step 1: Replace `src/components/joji/translate-page.tsx`**

```tsx
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  History,
  Languages,
  Loader2,
  Maximize2,
  MessageSquareQuote,
  Mic,
  MicOff,
  Minimize2,
  Plus,
  Send,
  Siren,
  Trash2,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth";
import {
  createConversation,
  deleteConversation,
  insertMessage,
  listConversations,
  listMessages,
  subscribeToConversationMessages,
  updateMessageTranslation,
  type Conversation,
  type ConversationMessage,
} from "@/lib/conversations";
import { translateText } from "@/lib/ai.functions";
import { detectEmergency, formatDateTime, LANGUAGE_NAMES, PATIENT_LANGUAGES } from "@/lib/joji";
import { startDictation, speak, speechRecognitionSupported } from "@/lib/speech";
import { takeTranslatePrefill } from "@/lib/translate-prefill";
import { cn } from "@/lib/utils";
import { WorkspaceHeader } from "./workspace-header";

export function TranslatePage() {
  const { user } = useAuth();
  const translate = useServerFn(translateText);
  const [language, setLanguage] = useState("yo");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  const [patientDraft, setPatientDraft] = useState("");
  const [doctorDraft, setDoctorDraft] = useState("");
  const [busy, setBusy] = useState<"patient" | "doctor" | null>(null);
  const [listening, setListening] = useState<"patient" | "doctor" | null>(null);
  const [interim, setInterim] = useState("");
  const [layout, setLayout] = useState<"split" | "patient" | "doctor">("split");
  const stopDictationRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const prefill = takeTranslatePrefill();
    if (prefill) setPatientDraft(prefill);
  }, []);

  useEffect(() => {
    let active = true;
    listConversations()
      .then((rows) => {
        if (active) setConversations(rows);
      })
      .catch((error: unknown) => {
        if (active) toast.error(error instanceof Error ? error.message : "Could not load chats.");
      })
      .finally(() => {
        if (active) setConversationsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!activeConversation) return;
    let reconnectToastShown = false;
    const unsubscribe = subscribeToConversationMessages(
      activeConversation.id,
      (incoming) => {
        setMessages((current) => {
          const index = current.findIndex((message) => message.id === incoming.id);
          if (index === -1) return [...current, incoming];
          const next = [...current];
          next[index] = incoming;
          return next;
        });
      },
      (connected) => {
        if (!connected) {
          reconnectToastShown = true;
          toast.error("Live sync lost — reconnecting…", { id: "realtime-status" });
        } else if (reconnectToastShown) {
          reconnectToastShown = false;
          toast.success("Live sync restored", { id: "realtime-status" });
        }
      },
    );
    return unsubscribe;
  }, [activeConversation]);

  const patientName = LANGUAGE_NAMES[language] ?? language;

  async function openConversation(conversation: Conversation) {
    setActiveConversation(conversation);
    setLanguage(conversation.patientLanguage);
    setMessages([]);
    setHistoryOpen(false);
    try {
      const rows = await listMessages(conversation.id);
      setMessages(rows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load this chat.");
    }
  }

  async function handleCreateChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    if (!title) return;
    setCreatingChat(true);
    try {
      const conversation = await createConversation({
        title,
        patientLanguage: language,
        createdBy: user.id,
      });
      setConversations((current) => [conversation, ...current]);
      setActiveConversation(conversation);
      setMessages([]);
      setNewChatOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start a new chat.");
    } finally {
      setCreatingChat(false);
    }
  }

  async function handleDeleteConversation(id: string) {
    try {
      await deleteConversation(id);
      setConversations((current) => current.filter((conversation) => conversation.id !== id));
      if (activeConversation?.id === id) {
        setActiveConversation(null);
        setMessages([]);
      }
      toast.success("Chat deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete this chat.");
    }
  }

  async function send(side: "patient" | "doctor", draft?: string) {
    if (!activeConversation || !user) return;
    const text = (draft ?? (side === "patient" ? patientDraft : doctorDraft)).trim();
    if (!text || busy) return;
    if (side === "patient") setPatientDraft("");
    else setDoctorDraft("");
    setBusy(side);
    try {
      const inserted = await insertMessage({
        conversationId: activeConversation.id,
        side,
        originalText: text,
        lang: side === "patient" ? language : "en",
        createdBy: user.id,
      });
      setMessages((current) => [...current, inserted]);
      const result = await translate({
        data: {
          text,
          fromLang: side === "patient" ? language : "en",
          toLang: side === "patient" ? "en" : language,
        },
      });
      await updateMessageTranslation(inserted.id, result.translation);
      setMessages((current) =>
        current.map((message) =>
          message.id === inserted.id
            ? { ...message, translatedText: result.translation }
            : message,
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Translation failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  function toggleDictation(side: "patient" | "doctor") {
    if (!activeConversation) {
      toast.error("Start a new chat first.");
      return;
    }
    if (listening) {
      stopDictationRef.current?.();
      setListening(null);
      return;
    }
    if (!speechRecognitionSupported()) {
      toast.error("Voice input is not supported in this browser. Please type instead.");
      return;
    }
    setListening(side);
    stopDictationRef.current = startDictation({
      lang: side === "patient" ? language : "en",
      onInterim: setInterim,
      onFinal: (text) => {
        setInterim("");
        void send(side, text);
      },
      onError: (message) => toast.error(message),
      onEnd: () => {
        setListening(null);
        setInterim("");
      },
    });
  }

  return (
    <div className="min-h-screen">
      <WorkspaceHeader
        eyebrow="Translate / Live consultation"
        title="Speak clearly. Care confidently."
        description="A live bilingual room for patient–doctor conversations. Type or use your microphone; JOJI keeps both sides in sync."
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setHistoryOpen(true)}>
              <History className="size-4" /> History
            </Button>
            <Button onClick={() => setNewChatOpen(true)}>
              <Plus className="size-4" /> New chat
            </Button>
          </div>
        }
      />

      <div className="space-y-6 px-5 py-6 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-secondary text-teal">
              <Languages className="size-4" />
            </span>
            <div>
              <p className="label-mono text-muted-foreground">Active language pair</p>
              <p className="font-medium">
                {patientName} <ArrowRight className="mx-1 inline size-3.5 text-teal" /> English
              </p>
            </div>
          </div>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PATIENT_LANGUAGES.map((item) => (
                <SelectItem key={item.code} value={item.code}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {messages.some((message) => detectEmergency(message.originalText)) && (
          <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
            <Siren className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">Possible emergency detected</p>
              <p className="mt-1 text-sm">
                This may be an emergency. Please call 112 or seek immediate care.
              </p>
            </div>
          </div>
        )}

        {activeConversation ? (
          <div className={cn("grid gap-5", layout === "split" && "xl:grid-cols-2")}>
            {(layout === "split" || layout === "patient") && (
              <ConversationPanel
                side="patient"
                language={patientName}
                messages={messages}
                draft={patientDraft}
                setDraft={setPatientDraft}
                busy={busy === "patient"}
                listening={listening === "patient"}
                interim={interim}
                disabled={false}
                maximized={layout === "patient"}
                onSend={() => void send("patient")}
                onMic={() => toggleDictation("patient")}
                onMaximize={() => setLayout("patient")}
                onRestore={() => setLayout("split")}
              />
            )}
            {(layout === "split" || layout === "doctor") && (
              <ConversationPanel
                side="doctor"
                language="English"
                messages={messages}
                draft={doctorDraft}
                setDraft={setDoctorDraft}
                busy={busy === "doctor"}
                listening={listening === "doctor"}
                interim={interim}
                disabled={false}
                maximized={layout === "doctor"}
                onSend={() => void send("doctor")}
                onMic={() => toggleDictation("doctor")}
                onMaximize={() => setLayout("doctor")}
                onRestore={() => setLayout("split")}
              />
            )}
          </div>
        ) : (
          <div className="surface flex min-h-[34rem] flex-col items-center justify-center gap-4 p-10 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-secondary text-teal">
              <MessageSquareQuote className="size-6" />
            </span>
            <div>
              <h2 className="text-xl font-semibold">No chat open</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Start a new chat or open one from your history.
              </p>
            </div>
            <Button onClick={() => setNewChatOpen(true)}>
              <Plus className="size-4" /> New chat
            </Button>
          </div>
        )}
        <p className="label-mono text-center text-muted-foreground">
          AI-assisted translation · Review clinical meaning before acting
        </p>
      </div>

      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a new chat</DialogTitle>
            <DialogDescription>
              Give this consultation a patient name or reference so you can find it again.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateChat} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="chat-title">Patient name or reference</Label>
              <Input id="chat-title" name="title" required placeholder="e.g. Mrs. Adebayo" />
            </div>
            <Button type="submit" className="w-full" disabled={creatingChat}>
              {creatingChat && <Loader2 className="size-4 animate-spin" />} Start chat
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="left" className="flex w-full flex-col sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Chat history</SheetTitle>
            <SheetDescription>Conversations saved by your organisation.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
            {conversationsLoading && (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
            {!conversationsLoading && conversations.length === 0 && (
              <p className="text-sm text-muted-foreground">No saved chats yet.</p>
            )}
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={cn(
                  "group flex items-center justify-between gap-2 rounded-xl border border-border p-3 hover:bg-secondary/60",
                  activeConversation?.id === conversation.id && "border-teal bg-secondary/60",
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-pointer text-left"
                  onClick={() => void openConversation(conversation)}
                >
                  <p className="truncate text-sm font-medium">{conversation.title}</p>
                  <p className="label-mono text-muted-foreground">
                    {formatDateTime(conversation.updatedAt)}
                  </p>
                </button>
                {conversation.createdBy === user?.id && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100"
                        aria-label="Delete chat"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
                        <AlertDialogDescription>
                          &quot;{conversation.title}&quot; and its messages will be permanently
                          deleted.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => void handleDeleteConversation(conversation.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ConversationPanel({
  side,
  language,
  messages,
  draft,
  setDraft,
  busy,
  listening,
  interim,
  disabled,
  maximized,
  onSend,
  onMic,
  onMaximize,
  onRestore,
}: {
  side: "patient" | "doctor";
  language: string;
  messages: ConversationMessage[];
  draft: string;
  setDraft: (value: string) => void;
  busy: boolean;
  listening: boolean;
  interim: string;
  disabled: boolean;
  maximized: boolean;
  onSend: () => void;
  onMic: () => void;
  onMaximize: () => void;
  onRestore: () => void;
}) {
  const isPatient = side === "patient";
  return (
    <section className="surface flex min-h-[34rem] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-secondary/45 px-5 py-4">
        <div>
          <p className="label-mono text-muted-foreground">
            {isPatient ? "Patient side" : "Doctor side"}
          </p>
          <h2 className="mt-1 text-lg font-semibold">{language}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            {isPatient ? "Input language" : "Locked language"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={maximized ? onRestore : onMaximize}
            aria-label={maximized ? "Restore split view" : `Maximize ${side} side`}
          >
            {maximized ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </Button>
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto bg-paper-soft/35 p-5">
        {messages.map((message) => {
          const visible = message.side === side ? message.originalText : message.translatedText;
          if (!visible) return null;
          return (
            <MessageBubble
              key={`${message.id}-${side}`}
              text={visible}
              mine={message.side === side}
              lang={message.side === side ? message.lang : isPatient ? "yo" : "en"}
            />
          );
        })}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Translating securely…
          </div>
        )}
        {listening && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <span className="size-2 animate-pulse rounded-full bg-destructive" /> Listening
            {interim ? ` — ${interim}` : "…"}
          </div>
        )}
      </div>
      <div className="border-t border-border p-4">
        <div className="flex gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder={
              disabled
                ? "Start a new chat to begin…"
                : isPatient
                  ? `Type in ${language}…`
                  : "Type in English…"
            }
            className="min-h-12 resize-none"
            aria-label={`${language} message`}
            disabled={disabled}
          />
          <div className="flex flex-col gap-2">
            <Button
              size="icon"
              variant={listening ? "destructive" : "outline"}
              onClick={onMic}
              disabled={disabled}
              aria-label={listening ? "Stop listening" : "Start voice input"}
            >
              {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </Button>
            <Button
              size="icon"
              onClick={onSend}
              disabled={disabled || busy || !draft.trim()}
              aria-label="Send message"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Press Enter to send · Microphone uses your browser's speech recognition
        </p>
      </div>
    </section>
  );
}

function MessageBubble({ text, mine, lang }: { text: string; mine: boolean; lang: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }
  return (
    <div className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-2xl p-3.5 ${mine ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm border border-border bg-card"}`}
      >
        <p
          className={`label-mono ${mine ? "text-primary-foreground/65" : "text-muted-foreground"}`}
        >
          {LANGUAGE_NAMES[lang] ?? lang}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed">{text}</p>
        <div className={`mt-2 flex gap-1 ${mine ? "justify-end" : "justify-start"}`}>
          <Button
            variant="ghost"
            size="icon"
            className={`size-7 ${mine ? "text-primary-foreground/75 hover:bg-primary-foreground/10 hover:text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => speak(text, lang)}
            aria-label="Read message aloud"
          >
            <Volume2 className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`size-7 ${mine ? "text-primary-foreground/75 hover:bg-primary-foreground/10 hover:text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => void copy()}
            aria-label="Copy message"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Format, typecheck, lint, build**

```bash
npx prettier --write src/components/joji/translate-page.tsx
npx tsc --noEmit -p .
npx eslint src/components/joji/translate-page.tsx
npm run build
```

Expected: clean build. This is the first full build since Task 5 started — if anything else is broken, it surfaces here.

- [ ] **Step 3: Commit**

```bash
git add src/components/joji/translate-page.tsx
git commit -m "Persist translate conversations with history, new chat, realtime sync, and panel maximize/restore"
```

---

## Task 10: `campaign-page.tsx` — history, auto-save, delete

**Files:**
- Modify: `src/components/joji/campaign-page.tsx` (full replacement)

**Interfaces:**
- Consumes: `listCampaigns`, `saveCampaign`, `deleteCampaign`, `SavedCampaign` from `src/lib/campaigns.ts` (Task 7); `formatDateTime` from `src/lib/joji.ts` (Task 6); `useAuth()` (Task 5).

- [ ] **Step 1: Replace `src/components/joji/campaign-page.tsx`**

```tsx
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import {
  Copy,
  FileText,
  History,
  Loader2,
  Megaphone,
  Upload,
  Download,
  Check,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { generateCampaign } from "@/lib/ai.functions";
import type { CampaignKit } from "@/lib/ai.types";
import { deleteCampaign, listCampaigns, saveCampaign, type SavedCampaign } from "@/lib/campaigns";
import { useAuth } from "@/lib/auth";
import { formatDateTime, ORG_TYPES } from "@/lib/joji";
import { cn } from "@/lib/utils";
import { WorkspaceHeader } from "./workspace-header";

export function CampaignPage() {
  const { user } = useAuth();
  const generate = useServerFn(generateCampaign);
  const [text, setText] = useState("");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [kit, setKit] = useState<CampaignKit | null>(null);
  const [busy, setBusy] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadSaved, setLeadSaved] = useState(false);
  const [fileName, setFileName] = useState("");
  const [campaigns, setCampaigns] = useState<SavedCampaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    let active = true;
    listCampaigns()
      .then((rows) => {
        if (active) setCampaigns(rows);
      })
      .catch((error: unknown) => {
        if (active)
          toast.error(error instanceof Error ? error.message : "Could not load campaigns.");
      })
      .finally(() => {
        if (active) setCampaignsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function requestGeneration() {
    if (text.trim().length < 20) {
      toast.error("Add at least 20 characters of campaign text first.");
      return;
    }
    try {
      if (!localStorage.getItem("joji.campaign.lead")) {
        setLeadOpen(true);
        return;
      }
    } catch {
      /* continue */
    }
    void runGeneration();
  }

  async function runGeneration() {
    if (!user) return;
    setBusy(true);
    try {
      const generated = await generate({
        data: { text, topic: topic || undefined, audience: audience || undefined },
      });
      setKit(generated);
      setActiveCampaignId(null);
      toast.success("Campaign kit ready for review");
      try {
        const saved = await saveCampaign({
          sourceText: text,
          topic: topic || undefined,
          audience: audience || undefined,
          kit: generated,
          createdBy: user.id,
        });
        setCampaigns((current) => [saved, ...current]);
        setActiveCampaignId(saved.id);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Generated, but could not save to history.",
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Campaign generation failed.");
    } finally {
      setBusy(false);
    }
  }

  function openCampaign(campaign: SavedCampaign) {
    setKit(campaign.kit);
    setText(campaign.sourceText);
    setTopic(campaign.topic ?? "");
    setAudience(campaign.audience ?? "");
    setActiveCampaignId(campaign.id);
    setHistoryOpen(false);
  }

  async function handleDeleteCampaign(id: string) {
    try {
      await deleteCampaign(id);
      setCampaigns((current) => current.filter((campaign) => campaign.id !== id));
      if (activeCampaignId === id) {
        setActiveCampaignId(null);
      }
      toast.success("Campaign deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete this campaign.");
    }
  }

  function saveLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      localStorage.setItem("joji.campaign.lead", JSON.stringify(Object.fromEntries(form)));
    } catch {
      /* best effort */
    }
    setLeadSaved(true);
    window.setTimeout(() => {
      setLeadOpen(false);
      setLeadSaved(false);
      void runGeneration();
    }, 350);
  }

  async function parseFile(file: File) {
    setFileName(file.name);
    try {
      if (file.name.toLowerCase().endsWith(".txt")) setText(await file.text());
      else if (file.name.toLowerCase().endsWith(".docx")) {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        setText(result.value);
      } else toast.error("Upload a .docx or .txt file.");
    } catch {
      toast.error("Could not read that document.");
    }
  }

  async function downloadPdf() {
    if (!kit) return;
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF();
    let y = 18;
    pdf.setFontSize(20);
    pdf.text("JOJI Campaign Kit", 16, y);
    y += 12;
    pdf.setFontSize(9);
    pdf.text("AI-generated draft · Review with a native speaker before publishing.", 16, y);
    y += 10;
    const sections = [
      ...kit.leaflets.map((item) => `${item.language} leaflet\n${item.body}`),
      `Radio script\n${kit.radioScript}`,
      `WhatsApp\n${kit.whatsapp}`,
      `SMS\n${kit.sms}`,
      `Facebook\n${kit.facebook}`,
      `Community health worker script\n${kit.chwScript}`,
    ];
    pdf.setFontSize(11);
    for (const section of sections) {
      const lines = pdf.splitTextToSize(section, 178);
      if (y + lines.length * 5 > 280) {
        pdf.addPage();
        y = 18;
      }
      pdf.text(lines, 16, y);
      y += lines.length * 5 + 7;
    }
    pdf.save("joji-campaign-kit.pdf");
  }

  return (
    <div className="min-h-screen">
      <WorkspaceHeader
        eyebrow="Campaign Studio / Draft to distribution"
        title="One source. Every community."
        description="Create a complete campaign kit from one source document, then review each channel and language before it reaches the public."
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setHistoryOpen(true)}>
              <History className="size-4" /> Past campaigns
            </Button>
            {kit && (
              <Button variant="outline" onClick={() => void downloadPdf()}>
                <Download className="size-4" /> Download PDF
              </Button>
            )}
          </div>
        }
      />
      <div className="space-y-8 px-5 py-6 sm:px-8 lg:px-10">
        <section className="surface p-5 sm:p-7">
          <div className="grid gap-5 lg:grid-cols-[1fr_0.7fr]">
            <div>
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-secondary text-teal">
                  <Megaphone className="size-5" />
                </span>
                <div>
                  <p className="label-mono text-muted-foreground">Source material</p>
                  <h2 className="text-lg font-semibold">What should this campaign say?</h2>
                </div>
              </div>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste a health announcement, education note, or programme brief here…"
                className="mt-5 min-h-52"
              />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-secondary">
                  <Upload className="size-3.5" /> {fileName || "Upload .docx or .txt"}
                  <input
                    className="sr-only"
                    type="file"
                    accept=".docx,.txt"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void parseFile(file);
                    }}
                  />
                </label>
                {fileName && (
                  <span className="text-xs text-muted-foreground">Imported successfully</span>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Topic (optional)</Label>
                <Input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Childhood immunisation"
                />
              </div>
              <div className="space-y-2">
                <Label>Audience (optional)</Label>
                <Input
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="e.g. Parents in rural communities"
                />
              </div>
              <div className="rounded-xl bg-secondary/70 p-4 text-sm text-muted-foreground">
                <FileText className="mb-2 size-4 text-teal" />
                <p>
                  JOJI will prepare four language leaflets plus radio, WhatsApp, SMS, Facebook and
                  community worker versions.
                </p>
              </div>
              <Button className="w-full" onClick={requestGeneration} disabled={busy}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Megaphone className="size-4" />
                )}{" "}
                Generate campaign kit
              </Button>
            </div>
          </div>
        </section>
        {busy && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="surface h-40 animate-pulse bg-secondary/50" />
            ))}
          </div>
        )}
        {kit && !busy && <CampaignResults kit={kit} />}
        <p className="label-mono rounded-xl border border-border bg-secondary/45 px-4 py-3 text-muted-foreground">
          AI-generated draft. Review with a native speaker before publishing.
        </p>
      </div>
      <Dialog open={leadOpen} onOpenChange={setLeadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tell us where JOJI is helping</DialogTitle>
            <DialogDescription>
              Save your details once to unlock campaign generation.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveLead} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input name="name" required placeholder="Dr. Amina Bello" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input name="email" required type="email" placeholder="you@hospital.org" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input name="phone" required placeholder="+234 800 000 0000" />
            </div>
            <div className="space-y-2">
              <Label>Organisation type</Label>
              <Select name="orgType" defaultValue="Hospital">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORG_TYPES.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" type="submit">
              {leadSaved ? <Check className="size-4" /> : null} Continue to generation
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="left" className="flex w-full flex-col sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Past campaigns</SheetTitle>
            <SheetDescription>Campaign kits saved by your organisation.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
            {campaignsLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!campaignsLoading && campaigns.length === 0 && (
              <p className="text-sm text-muted-foreground">No saved campaigns yet.</p>
            )}
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className={cn(
                  "group flex items-center justify-between gap-2 rounded-xl border border-border p-3 hover:bg-secondary/60",
                  activeCampaignId === campaign.id && "border-teal bg-secondary/60",
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-pointer text-left"
                  onClick={() => openCampaign(campaign)}
                >
                  <p className="truncate text-sm font-medium">{campaign.title}</p>
                  <p className="label-mono text-muted-foreground">
                    {formatDateTime(campaign.createdAt)}
                  </p>
                </button>
                {campaign.createdBy === user?.id && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100"
                        aria-label="Delete campaign"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this campaign?</AlertDialogTitle>
                        <AlertDialogDescription>
                          &quot;{campaign.title}&quot; will be permanently deleted.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => void handleDeleteCampaign(campaign.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CampaignResults({ kit }: { kit: CampaignKit }) {
  const cards = [
    ...kit.leaflets.map((item) => ({ title: `${item.language} leaflet`, body: item.body })),
    { title: "Radio script", body: kit.radioScript },
    { title: "WhatsApp message", body: kit.whatsapp },
    { title: "SMS message", body: kit.sms },
    { title: "Facebook post", body: kit.facebook },
    { title: "Community health worker script", body: kit.chwScript },
  ];
  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="label-mono text-teal">Your kit</p>
          <h2 className="mt-1 text-2xl font-semibold">Ready for human review</h2>
        </div>
        <span className="label-mono text-muted-foreground">{cards.length} deliverables</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <OutputCard key={card.title} {...card} />
        ))}
      </div>
    </section>
  );
}

function OutputCard({ title, body }: { title: string; body: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard?.writeText(body);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }
  return (
    <article className="surface flex min-h-52 flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <Button
          variant="outline"
          size="icon"
          onClick={() => void copy()}
          aria-label={`Copy ${title}`}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </div>
      <p className="mt-4 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
    </article>
  );
}
```

- [ ] **Step 2: Format, typecheck, lint, build**

```bash
npx prettier --write src/components/joji/campaign-page.tsx
npx tsc --noEmit -p .
npx eslint src/components/joji/campaign-page.tsx
npm run build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/joji/campaign-page.tsx
git commit -m "Persist campaigns with history, auto-save, and delete"
```

---

## Task 11: Full verification, deploy, and Playwright pass against the live app

**Files:** none (verification + deploy only)

**Interfaces:** none — this task exercises everything built in Tasks 1–10 end to end.

- [ ] **Step 1: Full local verification**

```bash
npx tsc --noEmit -p .
npx eslint .
npm run build
```

Expected: the only remaining errors/warnings are the pre-existing, unrelated `src/lib/speech.ts` type errors and the `createServerFn().inputValidator()` deprecation notices already present before this plan — confirm nothing else appears. If ESLint reports CRLF/prettier issues on files this plan touched, run `npx prettier --write <file>` and re-check.

- [ ] **Step 2: Push and deploy**

```bash
git push origin main
```

Wait for the Vercel git-integration deploy to complete (poll `mcp__plugin_vercel_vercel__get_deployment` or `vercel inspect` on project `mednova/joji`, team `team_CooDr3F4j4LdLGzg2Rm5OB9t`). Expected: `readyState: "READY"`.

- [ ] **Step 3: Post-deploy error scan**

Use `mcp__plugin_vercel_vercel__get_runtime_errors` (projectId `prj_gzIN391uKNqlWIDPt3HKHtPGMwDl`) for the last 10 minutes. Expected: no errors.

- [ ] **Step 4: Playwright pass against the deployed app**

Invoke the `claude-in-chrome` skill (or the Playwright MCP tools if that's what's available in-session) against `https://joji-seven.vercel.app` and drive, in order:

1. Sign up a fresh test account (use a disposable custom-domain-look-alike or just a `+timestamp` gmail-style address — either is fine since this is a UI smoke test, not another org-matching test; that was already covered in Task 4).
2. Confirm the account (email confirmation is on by default — if this blocks the flow in a headless run, note it and sign in with an account you've confirmed manually instead of failing the task).
3. Go to Translate, click "New chat", enter a patient reference, submit.
4. Type a message on the patient side, send it; type a message on the doctor side, send it. Confirm both translations appear.
5. Click "History", confirm the new chat is listed with the entered title.
6. Open a second browser tab/session logged in as the same account, open the same chat, send a message from the first tab, and confirm it appears in the second tab within a couple seconds (realtime check).
7. Click the maximize icon on the patient panel, confirm the doctor panel disappears and the patient panel fills the width; click restore, confirm split view returns.
8. Delete the chat from history, confirm it's removed from the list.
9. Go to Campaign Studio, generate a kit (or skip generation and just verify the "Past campaigns" panel opens without error if generation would consume API quota unnecessarily), confirm the "Past campaigns" list and delete flow work the same way.
10. Toggle the mic button in Translate (if the test environment's browser exposes `SpeechRecognition` — Chrome-based Playwright sessions typically do), confirm it does not auto-stop after a short pause the way the old `continuous: false` behavior did (this is hard to assert definitively from a scripted test without real audio input; at minimum confirm the mic button stays in "listening" state and doesn't flip back within a few seconds of silence).

Record what passed and what didn't. Fix any real bugs found (this may mean returning to Tasks 6–10), then re-run the affected checks. Do not consider the plan complete until steps 3–8 above pass cleanly against the deployed app.

- [ ] **Step 5: Commit any fixes found during Playwright verification, then final push**

If Step 4 required code changes, repeat Steps 1–4 for the affected files, then:

```bash
git add -A
git commit -m "Fix issues found in end-to-end verification"
git push origin main
```

No further commit needed if Step 4 passed without requiring changes.
