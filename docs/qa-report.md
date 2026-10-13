# Full audit report — Quranic Arabic (qa-v34)

Audit run on the frozen build `v1.0-checkpoint-3` (qa-v33) → fixes → re-verified as **qa-v34**
(commit `292dd27`, deployed and byte-verified against the live site).

Method: every claim below is a re-runnable command. Nothing is asserted from inspection alone.

---

## 1. What was found and fixed

| # | Finding | Severity | Fix | Proof |
|---|---|---|---|---|
| 1 | **Sync merge could delete a legitimate re-mark.** The merge kept the *earliest* mark per id and then applied the tombstone test to that one value. So a device holding a stale **older** mark could delete the other device's **re-mark** (newer than the un-mark), and because the two sides then disagreed, the stored doc flipped between merges — a verse could vanish on one device and reappear on the other. | **High** (data loss across devices) | `mergeProgress` now tests **every entry** against the tombstone (an entry newer than its tombstone survives), keeping the earliest *surviving* date | `tests/merge-props.test.js` — randomised property tests + a dedicated regression test (stale mark vs re-mark, stability from both sides, and plain un-mark still wins) |
| 2 | **Two different components shared one class name.** `letter-grid`/`letter-cell` were defined in `styles.css` (Letters page) *and* `stats.css` (Progress page). The Progress page links both → silently mixed properties, correct-looking today, broken by any future edit of either. | Medium (trap) | Progress page renamed to `ltr-grid`/`ltr-chip` | `tools/audit-static.mjs` duplicate-class report now lists only the intentional ones; `progress-qa` asserts the new classes |
| 3 | **`sync-qa` battery was stale since qa-v25** — it still clicked the manual "Sync now" button that was deliberately removed, threw a TypeError, and had not been re-run since. It was the only battery covering the sync UI. | Medium (coverage hole) | Drives the Data tab and the *automatic* sync path instead | `tools/qa-run.mjs` → PASS |
| 4 | **`memorise-qa` battery stale** — expected the memorised card on Progress's default view; qa-v33 moved it to its own tab (`#memorised`). | Medium (coverage hole) | Opens Overview for the tile, `#memorised` for the card | PASS |
| 5 | **`sound-qa` over-strict check** — "options must be Latin-only" rejected a gloss containing a curly apostrophe; flagged the app for something that was fine. | Low (false alarm) | Replaced with the meaningful invariant: meaning options contain **no Arabic script** | PASS |
| 6 | **`smoke.html` false failure** — reported the service worker as FAIL on localhost, where it is disabled *by design*. | Low (misleading) | Host-aware: localhost reports "disabled by design", https asserts registration | PASS — "7 checks passed" |
| 7 | **`tests/quiz.test.js` read a data file cwd-relative** — only worked when run from the repo root. | Low (fragility) | Resolves relative to the file's own URL | `verify-links` clean |
| 8 | **My audit tools leaked browser processes** — `child.kill()` kills only the launcher; headless Edge children accumulated (37 measured at peak, several hundred MB each). This is what caused the RAM spike and the PC lag during the audit. | **High** (on the machine) | All four CDP tools now kill the whole tree (`taskkill /PID … /T /F`); verified 0 leftovers after a full sweep | process counts checked before/after each run |
| 9 | **22 stuck `node` processes** from my syntax checks, each **blocked reading stdin** (the source of the repeated "stdin is not a tty" noise). | Medium (on the machine) | Killed (node.exe 24 → 2 = Adobe's); the check pattern no longer leaves a hung process | count verified |
| 10 | **Stuck dev server holding :8080** — the old `tools/serve.py` still listens but stopped responding, which made one sweep report 31 bogus "failed requests". New instance runs on :8081. | Low (environment) | Not fixed yet — needs a decision (kill PID 26680?) | `netstat` + curl |

Reviewed and deliberately **not** changed (by design): `#player-toggle` does nothing when nothing is queued; the basics demo caps at 7 letters; `seg`/`chip`/`ribbon` class names intentionally exist in more than one stylesheet.

---

## 2. What was verified (qa-v34)

| Phase | Check | Result |
|---|---|---|
| Static | Orphan files, debug leftovers (`console.log`/`debugger`), broken internal refs, duplicate class definitions | **0 problems** (`tools/audit-static.mjs`) |
| Static | Every local reference resolves (html/css/js/SW/manifest) | **ALL 334 REFERENCES RESOLVE** (`tools/verify-links.mjs`) |
| Data | 114 surahs / 6,236 āyāt / 28 letters / 8 harakat / 500 words / 24 roots / 4 reciters | **OK** |
| Data | Quran text + translations vs independent sources (sections D/E/F/G) | **0 / 0 / 0 / 0** (residue in A/B/C1/C2 is the documented punctuation/bracket convention) |
| Data | Every build word against the corpus | **40/40** |
| Data | Every playable audio clip on the CDN | **540/540 OK** |
| Unit | Test suite incl. new merge property tests (1,100 random document pairs: symmetric, idempotent, absorbing, non-destructive, non-inventive) | **91/91** |
| Pages | Sweep of all 10 pages: console errors, uncaught exceptions, failed requests, 4xx, horizontal overflow at 360/430/520 px, both themes | **0 failures** |
| Pages | Every safe control clicked (140 distinct buttons/links) — navigation, throw and DOM-effect detection | **0 failures**, 5 reviewed by-design no-ops |
| Routes | All hash routes: `#browse #review #review/b12 #build #1 #2:255 #read #trace #listen #quiz #recall #overview #stats #memorised #data` | **15/15 render their marker** |
| State | Persistence matrix: every write path reaches localStorage, the sync doc and a backup file | **19/19 batteries pass** |
| Sync | Merge rules, user-scoped push, session never in doc or backup, automatic (debounced) sync | **PASS** (`sync-qa`) |
| Sync | Row-Level Security from outside (anonymous key): read / insert / delete | read **200 `[]`**, insert **401 blocked**, delete **no-op** |
| PWA | Service worker registers and activates on the deployment | **activated, controlling** |
| PWA | **All 10 pages load with the network cut** (from the SW cache) | **10/10** |
| PWA | Deployment parity + version card | `About` = `sw.js` = **qa-v34**, files byte-identical |
| Batteries | All 20 QA pages run in one command | **19/19 judged PASS** + `letters-audition` is Mayk's ear-check (manual) |

Commands: `node --test tests/*.test.js` · `node tools/audit-static.mjs` · `node tools/verify-links.mjs` ·
`node tools/validate-data.mjs` · `node tools/verify-text.mjs` · `node tools/verify-build-words.mjs` ·
`node tools/check-audio.mjs` · `node tools/qa-run.mjs` · `node tools/sweep.mjs [base]` · `node tools/live-check.mjs`

---

## 3. What only Mayk can confirm

1. **Real Google sign-in** (I never handle credentials) — sign in once on the laptop.
2. **Two real devices** — mark a verse on the phone, check it appears on the PC (the engine is proven by the property tests + `sync-qa`; the account path is not).
3. **Add to Home Screen** on the phone (real iOS/Android behaviour).
4. **Ear-check** the two open audio items: the ح/ه letter clip mapping, and any word that sounds off.

## 4. Honest limits of this report

- It proves "**no known issue remains, and every check is re-runnable**". It cannot prove the absence of unknown unknowns — no audit can.
- Audio CDN behaviour was verified at check time (540/540); future CDN changes are outside our control.
- A button that "does something wrong" (as opposed to throwing, navigating away or doing nothing) is the one class of defect an automated sweep cannot fully judge; the 5 review items were read by hand.
