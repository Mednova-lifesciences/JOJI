# Chat & campaign persistence, org sharing, realtime sync, mic + layout

## Context

The Translate and Campaign Studio pages currently hold everything in
local React state: translate starts from two hardcoded seed messages
and forgets them on refresh; campaign generation produces one kit with
no history. Neither page has any concept of "my past conversations" or
"my past campaigns." Auth (`src/lib/auth.tsx`) and the `profiles` table
already exist (see the earlier Supabase Auth work); this spec builds
persistence, sharing, and realtime sync on top of that foundation.

No production users exist yet (`profiles` count is 0), so schema
changes here do not need a data-preserving migration path — the
`organization`/`org_type` columns on `profiles` are dropped and
replaced outright.

## Goals

1. Conversations (the doctor/patient translate sessions) are saved,
   listable, openable, and deletable — like Claude's chat history.
2. A conversation's patient-side and doctor-side panels are always two
   views of *one* saved chat. "New chat" blanks both panels; opening a
   saved chat populates both from history.
3. Conversations and campaigns are shared with everyone in the same
   organization, where "organization" is inferred from a verified work
   email domain, not a free-text field a user can type.
4. If the same login is open on two devices viewing the same
   conversation, new messages sent from either device appear on the
   other within about a second, without a manual refresh.
5. The mic keeps listening until the user manually stops it.
6. Each translate panel (patient/doctor) can be independently
   maximized/restored, so two people on two devices can each see their
   own side full-screen.
7. Campaigns get the same save/list/delete treatment (no realtime
   requirement).

## Non-goals

- Inviting a specific person to an org, or any admin/approval flow.
- Realtime updates to the *list* of conversations/campaigns (only the
  currently-open conversation's messages are realtime).
- Editing or deleting individual messages.
- Any change to who can join an org after the fact (e.g. leaving,
  merging orgs).

## Data model

### `organizations`

| column        | type        | notes                                    |
|---------------|-------------|-------------------------------------------|
| id            | uuid pk     | default `gen_random_uuid()`               |
| name          | text        | display name, from first signup's input   |
| org_type      | text        | e.g. "Hospital"; from first signup's input|
| email_domain  | text        | null for solo/private orgs; unique when set |
| created_at    | timestamptz | default `now()`                           |

Unique index on `email_domain` **where `email_domain is not null`**
(so multiple solo orgs with null domain don't collide).

### `profiles` (altered)

Drop `organization`, `org_type`. Add:

| column           | type    | notes                                |
|------------------|---------|----------------------------------------|
| organization_id  | uuid    | not null, references `organizations(id)` |

### `conversations`

| column           | type        | notes                              |
|------------------|-------------|-------------------------------------|
| id               | uuid pk     |                                      |
| organization_id  | uuid        | not null, references `organizations` |
| created_by       | uuid        | not null, references `auth.users`   |
| title            | text        | patient name/reference, entered at chat start |
| patient_language | text        | language code selected for this chat |
| created_at       | timestamptz | default `now()`                     |
| updated_at       | timestamptz | default `now()`; bumped on new message, drives history sort order |

### `messages`

| column           | type        | notes                                |
|------------------|-------------|----------------------------------------|
| id               | uuid pk     |                                        |
| conversation_id  | uuid        | not null, references `conversations` on delete cascade |
| organization_id  | uuid        | not null; denormalized copy of the parent conversation's org, so RLS never needs a join |
| side             | text        | `'patient'` \| `'doctor'`, checked    |
| original_text    | text        | not null                              |
| translated_text  | text        | nullable; filled in after the AI call returns |
| lang             | text        | not null                              |
| created_by       | uuid        | not null, references `auth.users`     |
| created_at       | timestamptz | default `now()`                       |

### `campaigns`

| column           | type        | notes                                 |
|------------------|-------------|------------------------------------------|
| id               | uuid pk     |                                           |
| organization_id  | uuid        | not null, references `organizations`     |
| created_by       | uuid        | not null, references `auth.users`        |
| title            | text        | `topic` if provided, else first ~60 chars of `source_text` |
| source_text      | text        | not null                                 |
| topic            | text        | nullable                                 |
| audience         | text        | nullable                                 |
| kit              | jsonb       | not null; the full generated `CampaignKit` |
| created_at       | timestamptz | default `now()`                          |

## RLS design

Helper function (SECURITY DEFINER, avoids RLS-recursion pitfalls):

```sql
create function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid()
$$;
```

- **`organizations`**: SELECT only (to authenticated, own org via
  `id = current_organization_id()`). No client-side insert/update —
  only the signup trigger creates rows.
- **`profiles`**: existing owner-only UPDATE stays. Add a second
  SELECT policy so org-mates can see each other's names:
  `organization_id = current_organization_id()`.
- **`conversations`**: SELECT/INSERT to authenticated, org-scoped
  (`organization_id = current_organization_id()`); INSERT also checks
  `created_by = auth.uid()`. UPDATE org-scoped — used only by the
  `bump_conversation_updated_at` trigger below, never called directly
  by the client. DELETE org-scoped **and** `created_by = auth.uid()`.
- **`messages`**: SELECT/INSERT/UPDATE to authenticated, org-scoped
  the same way (UPDATE needed so the client can patch in
  `translated_text` after the AI call resolves). No DELETE policy —
  messages are immutable once sent.
- **`campaigns`**: SELECT/INSERT org-scoped (INSERT also checks
  `created_by = auth.uid()`). DELETE org-scoped **and**
  `created_by = auth.uid()`. No UPDATE — a campaign kit is written
  once at generation time.

## Signup trigger changes

`handle_new_user()` is rewritten to:

1. Read `new.email`, lower-case it, take the substring after `@` as
   `domain`.
2. If `domain` is null/empty or in a hardcoded blocklist of free
   providers (`gmail.com`, `googlemail.com`, `yahoo.com`, `yahoo.co.uk`,
   `outlook.com`, `hotmail.com`, `live.com`, `icloud.com`, `me.com`,
   `aol.com`, `protonmail.com`, `proton.me`, `mail.com`, `gmx.com`,
   `yandex.com`, `zoho.com`) → insert a new `organizations` row with
   `email_domain = null`, `name`/`org_type` from
   `raw_user_meta_data`.
3. Else → look up an `organizations` row with that `email_domain`. If
   found, use its `id` (ignore this signup's typed name/org_type —
   the org's existing values win). If not found, insert a new row with
   that `email_domain` and this signup's typed name/org_type.
4. Insert the `profiles` row with `organization_id` set from step 2/3,
   plus `full_name`/`phone`/`preferred_language` as before.

A trigger, `bump_conversation_updated_at`, runs `AFTER INSERT ON
messages` and sets `conversations.updated_at = now()` for the parent
row. It runs with the inserting client's own privileges (default
`SECURITY INVOKER`, no elevation needed) — the client just inserted a
message into that conversation, so it's already provably a member of
that conversation's org, and the `conversations` UPDATE policy above
allows the bump.

## Realtime

`messages` is added to the `supabase_realtime` publication. The open
conversation's client subscribes to `postgres_changes` (INSERT and
UPDATE) filtered by `conversation_id=eq.<id>`. RLS applies to realtime
delivery, so a client only receives rows its org can already see. The
conversation *list* is not realtime — fetched on mount/navigation only.

## Frontend changes

### `src/lib/speech.ts`

`recognition.continuous = false` → `true`. No other logic changes;
`onEnd` already resets `listening` state cleanly if the browser ends
recognition on its own (long-silence auto-end is a browser quirk, not
something the code controls).

### `src/components/joji/translate-page.tsx`

- Local `messages` state is replaced by data fetched from
  `conversations`/`messages`, plus the realtime subscription described
  above.
- A conversation history surface (sidebar or equivalent) lists this
  org's conversations (title, relative date, creator), with "New chat"
  and per-row delete (delete button only shown/enabled for
  `created_by === current user`).
- "New chat" opens a small dialog for the patient name/reference (used
  as `title`) plus the existing language selector, then inserts a
  `conversations` row and clears both panels.
- Sending a message: insert into `messages` (`translated_text = null`)
  → UI updates from that insert (locally optimistic or via the
  realtime echo) → call the existing `translateText` server function →
  `UPDATE` the row with `translated_text` on success.
- Each `ConversationPanel` gets a maximize/restore icon button. Layout
  state (`"split" | "patient" | "doctor"`) is local component state,
  not persisted or synced.

### `src/components/joji/campaign-page.tsx`

- A "Past campaigns" list (title, date, creator) fetched on load.
- Generating a kit auto-saves it to `campaigns` immediately on success
  (no separate save action).
- Selecting a past entry loads its stored `kit`/`source_text`/`topic`/
  `audience` into the same read-only display already used for a fresh
  result (existing copy/PDF actions keep working unchanged).
- Delete button shown only for `created_by === current user`.

## Error handling

- Realtime channel drop → lightweight "reconnecting…" toast; Supabase
  client auto-reconnects the channel.
- Message insert/update failure → toast error, local draft/panel
  content is preserved (not cleared).
- Free-provider domain list lives inline in the migration SQL;
  extending it later is a small follow-up migration.

## Verification plan

- **Database**: CLI/SQL smoke tests before wiring any UI —
  (a) two signups on the same custom domain land in one org,
  (b) a `gmail.com` signup gets a solo org,
  (c) an org-A user's `SELECT` on org-B's `messages`/`conversations`/
  `campaigns` returns zero rows,
  (d) the realtime publication includes `messages`.
- **Frontend** (Playwright against the deployed Vercel app once
  built): sign up/log in, start a new chat, send messages on both
  sides, confirm translations arrive, confirm a second session
  (simulating a second device) receives new messages via realtime,
  open history and re-open a past chat, delete a chat, repeat the
  save/list/delete flow for campaigns, verify continuous mic toggle
  behavior as far as a headless browser allows, verify panel
  maximize/restore.
- Typecheck, lint, and `npm run build` must stay clean throughout, per
  existing project conventions.

## Process note

This spec was approved interactively, section by section, by the
project owner. They then granted full autonomy to make remaining
implementation-level decisions and proceed without further per-section
sign-off, since they stepped away. No separate written-spec review
gate was applied for that reason.
