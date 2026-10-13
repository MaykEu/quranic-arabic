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
  "data": { "progress": {…}, "srs": {…}, "activity": {…}, "practice": {…}, "prefs": {…}, "brush": 8, "_meta": {…} },
  "tombstones": { "memorised:2:255": 1728810000000 }
}
```

## What syncs — and what stays on the device

| Syncs | Stays local (never in the doc) |
|---|---|
| `progress` (letters, words, verses, memorised, days) | `theme` — each device picks its own look |
| `srs` — review boxes | `lastBackupAt` — local bookkeeping |
| `activity` — the day log (reps, drills, seconds) | — |
| `practice` — daily counters | `sync.session` — the login token (and it is excluded from backup files too) |
| `prefs`, `brush`, `lastRead`, `_meta` stamps | `sync.lastSync` |
| `tombstones`, `sync.resetAt` | |

## Merge rules (latest action wins, progress never regresses)

- **Buckets** (`letters`/`words`/`verses`/`memorised`): union. An entry present on
  both sides keeps the **earliest** `at` (when learning started).
- **Un-marking** writes a tombstone (`tomb` → `doc.tombstones`). A tombstone removes an
  entry unless the entry was re-marked **after** it — so "un-mark on the phone" is not
  resurrected by "still marked on the laptop", and vice versa. The test runs **per entry**:
  an entry newer than its tombstone survives even when the other device still carries the
  stale older mark (testing only the kept "earliest" value let a stale mark delete a valid
  re-mark on one merge and resurrect it on the next — fixed in the qa-v34 audit).
- **SRS cards**: the most recent review (`at`) wins; on an exact tie, the higher box wins
  (never lose progress). Cards are never deleted by merge.
- **Practice counters**: per day, `max` of the two counts (all practice counts).
- **Activity log**: days are unioned; inside a day, **every field takes the max** (two devices finishing the same day must never double-count), and an all-time best record takes the max too. Days older than a deliberate reset are dropped — the reset floor is the **local** day it happened (a reset is a local moment; the practice/day counters use the UTC day, so the two can differ by a few hours at a boundary).
- **Days**: union, sorted.
- **Reset**: `resetAt` is stamped when a user resets. Entries (and practice days /
  day-strings) older than the reset are dropped on **both** sides; anything done after
  the reset survives. So a reset really resets, even with sync on.
- **Everything else** (`prefs`, `brush`, `lastRead`, …): newest write wins, using the
  per-key change stamp in `_meta` (written by `store.js` on every save) and falling back
  to the doc's `updatedAt` for data from before sessions existed.

## Persistence matrix (what's saved where)

Verified end-to-end by `tests/persistence-qa.html`, which drives **every** write path
(letters trace, build-word success, verse word-tap, verse ✓, surah ✓, SRS review/quiz/recall,
practice counter, brush, prefs, lastRead, unmark/tombstone, reset) and then checks the value
in localStorage, in the sync doc and in a backup file:

| Key | Written by | In sync doc | In backup |
|---|---|---|---|
| `progress` (letters / words / verses / memorised / surahs / days) | Letters, Words, Verses reader (word tap, ✓, surah ✓) | ✔ union + earliest `at` | ✔ |
| `srs` | Words review, Quiz, Recall | ✔ latest review wins | ✔ |
| `practice` | Listen & repeat selections (`recallSingle`, `readVerse`, …); legacy listen map rides along | ✔ per-day max + LWW | ✔ |
| `activity` | Goal card, drills, trace checks, quiz answers, listen reps, audio/reading seconds, daily visits | ✔ days unioned, per-field max | ✔ |
| `prefs`, `brush`, `lastRead` | Verses reader, trace slider | ✔ newest write wins | ✔ |
| `_meta` | every save (change stamps) | ✔ | ✔ |
| `tomb` | every unmark | ✔ (as `doc.tombstones`) | ✔ |
| `sync.resetAt` | Progress → Reset all | ✔ (both sides drop older data) | ✔ |
| `theme` | header toggle | ✖ device-local by design | ✔ |
| `lastBackupAt` | backup export | ✖ device-local by design | ✔ |
| `sync.session`, `sync.lastSync` | sign-in / sync runs | ✖ never synced | ✖ **never exported** (token) |

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
