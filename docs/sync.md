# Cloud sync — data contract & merge rules

Optional cloud sync so the same progress follows a learner across devices.
The app stays **local-first**: everything works offline; sync reconciles when it can.
Code: `js/lib/sync.js` · connection values: `js/lib/sync-config.js` · tests: `tests/sync.test.js`.

## Doc shape

One document per account in Supabase (`progress` table, `doc` jsonb):

```json
{
  "v": 1,
  "updatedAt": 1728820000000,
  "resetAt": 1728800000000,
  "data": { "progress": {…}, "srs": {…}, "practice": {…}, "prefs": {…}, "brush": 8, "_meta": {…} },
  "tombstones": { "memorised:2:255": 1728810000000 }
}
```

## What syncs — and what stays on the device

| Syncs | Stays local (never in the doc) |
|---|---|
| `progress` (letters, words, verses, memorised, days) | `theme` — each device picks its own look |
| `srs` — review boxes | `lastBackupAt` — local bookkeeping |
| `practice` — daily counters | `sync.session` — the login token (and it is excluded from backup files too) |
| `prefs`, `brush`, `lastRead`, `_meta` stamps | `sync.lastSync` |
| `tombstones`, `sync.resetAt` | |

## Merge rules (latest action wins, progress never regresses)

- **Buckets** (`letters`/`words`/`verses`/`memorised`): union. An entry present on
  both sides keeps the **earliest** `at` (when learning started).
- **Un-marking** writes a tombstone (`tomb` → `doc.tombstones`). A tombstone removes an
  entry unless the entry was re-marked **after** it — so "un-mark on the phone" is not
  resurrected by "still marked on the laptop", and vice versa.
- **SRS cards**: the most recent review (`at`) wins; on an exact tie, the higher box wins
  (never lose progress). Cards are never deleted by merge.
- **Practice counters**: per day, `max` of the two counts (all practice counts).
- **Days**: union, sorted.
- **Reset**: `resetAt` is stamped when a user resets. Entries (and practice days /
  day-strings) older than the reset are dropped on **both** sides; anything done after
  the reset survives. So a reset really resets, even with sync on.
- **Everything else** (`prefs`, `brush`, `lastRead`, …): newest write wins, using the
  per-key change stamp in `_meta` (written by `store.js` on every save) and falling back
  to the doc's `updatedAt` for data from before sessions existed.

## Flow

`syncNow()` → refresh session if needed → `fetchRemote` → `mergeDocs(local, remote)`
→ `applyDoc(merged)` → `pushRemote(merged)` → stamp `sync.lastSync`.
Writes schedule a debounced (4 s) background sync via the `qa:store` event; failures
are silent and retried on the next write. Nothing throws into the UI.

## Supabase setup (once)

1. Create a free project at supabase.com (his account; no card).
2. SQL editor → run:

```sql
create table public.progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  doc jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.progress enable row level security;
create policy "own row" on public.progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

3. Authentication → Providers → Google: paste Client ID + Secret from a Google Cloud
   OAuth client (Web application). Authorized redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Authentication → URL configuration: Site URL = `https://maykeu.github.io/quranic-arabic/`,
   plus `http://localhost:8080/` for local development.
5. Paste `url` + publishable key into `js/lib/sync-config.js`.

The **publishable/anon key is safe to commit** (public repo): Row-Level Security limits
every signed-in user to their own row. The `service_role` key must never be used here.

## Free-tier notes (verified 2026-10-13)

- Supabase free: 2 projects, 500 MB database, 50k monthly active users — plenty.
- Free projects **pause after ~7 days with no requests**; any request wakes nothing by
  itself but a few requests/day prevents pausing. Data survives a pause; restore is a
  dashboard click (multi-minute).
- Google sign-in via Supabase requests only basic identity scopes, so there is no Google
  verification review, no test-user allowlist, and no 7-day refresh-token expiry.
