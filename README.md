# Quranic Arabic

A personal, mobile-first web app for learning **reading, writing and understanding Qur'anic Arabic** —
the Arabic script, letter tracing, the 500 most frequent words (150 core + 350 more), and verse study word by word with audio.

Plain HTML/CSS/JS (ES modules) — no build step, no runtime dependencies. Installable as a PWA and
works offline once loaded.

## Run locally

Double-click **`start-server.cmd`** — it starts a small local server and opens your
browser at http://localhost:8080/. Close its window to stop the server.

Manual alternative (any static server works):

```bash
python tools/serve.py     # or: python -m http.server 8080
# then open http://localhost:8080/
```

Serve over HTTP — ES modules and fetch don't work from `file://` (the pages detect
this and explain). On localhost the service worker is disabled and files are served
with `no-store`, so every reload always shows the latest files from disk.

## Deploy

GitHub Pages, from the `main` branch (root). Push to `main` to deploy.

## Structure

- Pages: `index.html`, `letters.html`, `words.html`, `verses.html`, `practice.html`, `progress.html`, `about.html`
- `css/styles.css` — design tokens + all styles (light/dark)
- `js/lib/` — store, audio URLs, data loader, progress, SRS · `js/ui/` — chrome, player, toast, tracing · `js/pages/` — one module per page
- `data/` — generated dataset: full Qur'an (114 surahs, word-by-word transliteration/gloss/audio), top-500 vocabulary, letters, harakat, reciters, grammar notes
- `assets/` — self-hosted Amiri font, icons, letter audio
- `tools/` — regeneration scripts (Node + Python) · `tests/` — unit tests + browser smoke tests

## Verification

```bash
node --test tests/*.test.js     # unit tests
node tools/validate-data.mjs    # dataset audit (114 surahs / 6236 ayahs)
```

## Sources & licensing

- Qur'an text, word-by-word audio: [quran.com](https://quran.com) / QuranCDN · verse recitations: cdn.islamic.network (Alafasy, Husary, Minshawi, Abdul Basit)
- Letter audio clips: Wikimedia Commons, **CC BY-SA 4.0** — attribution included with the audio files
- Font: [Amiri](https://github.com/aliftype/amiri), **SIL OFL**
- Translations: **Pickthall** (public domain) and **Saheeh International** (© its publisher; distributed via quran.com) — included here for personal study. For public redistribution, prefer an openly-licensed translation.

## Version history

- **v1.1 — checkpoint 4** (2026-10-14): the **letters drills** release (entry below) plus a full **re-verification pass** at qa-v35 — 98/98 unit tests, static audit clean (213 files), all local references resolve, 540/540 audio clips, **20/20 QA batteries**, browser sweep **0 failures** (10 pages, 138 controls, 20/20 routes), persistence incl. the new `L:` letter SRS, sync merge rules + RLS (anon read `[]`, insert 401), live service worker activated with **all 10 pages offline-capable**, and live-vs-local byte parity. Zip: `Quranic-Arabic-v1.1-checkpoint-4-2026-10-14.zip`.
- **letters drills** (2026-10-13): the Letters page finally lets you **test yourself** — `Browse · Quiz · Recall` tabs. **Quiz**: *Letters* (hear the name → pick the glyph) · *Forms* (a positional form as it appears **inside a word** → which letter is it?) · *Vowels* (a mark → which harakah?). **Recall**: *Say it* (see the glyph → say the sound and name **out loud** → honest self-grade; no fake speech scoring) and *Trace it* (hear the name → write from memory with the guide **hidden**, then compare). The design choice that matters: **distractors always come from the letter's confusable family** (`data/letter-groups.json` — ب ت ث ن ي · ح ج خ · د ذ ر ز · س ش ص ض · ط ظ ع غ · ف ق و · ك ل م · ا ل · ه), so every question is a choice between look-alikes; that discrimination is what reading actually demands. Letters and vowels get **their own spaced-repetition boxes** (`L:` / `M:` ids, same 1·3·7·14·30 days as words), so they appear in the due counts, the daily goal and the Progress drills table (new *Letters* / *Vowels* rows). The browse grid is now **shaded by strength** (fresh → getting there → solid) with a legend, and the drills show the same dots + missed-recap as the words quiz. Deep links: `letters.html#quiz/forms`, `#quiz/vowels`, `#recall/trace`. **Fix**: a queued “advance to the next question” timer could yank you back into a drill you had already left — now cancelled on navigation (same guard added to the practice tracer). SW qa-v35.
- **full audit update** (2026-10-13): a complete multi-phase audit (static integrity, data verifiers, unit + property tests, a browser sweep of every page and every control, persistence/sync/RLS, live PWA offline pass) with the fixes it produced: **a real sync bug** — a stale older mark on one device could delete the other device's legitimate re-mark (and the stored doc then flickered between merges); the tombstone test now runs per entry, proven by randomised merge property tests (symmetry, idempotence, absorption, non-destruction, non-invention) and a dedicated regression test; **`letter-grid`/`letter-cell` were two different components sharing one name** across two stylesheets (renamed the Progress page's to `ltr-grid`/`ltr-chip`); three stale QA batteries that the tab split / the removed Sync button / an over-strict regex had silently broken (sync-qa, memorise-qa, sound-qa) are fixed and now run automatically. New tools: `tools/audit-static.mjs`, `tools/sweep.mjs` (every page, every control, overflow at 3 widths, both themes, all hash routes), `tools/qa-run.mjs` (all 20 batteries in one command), `tools/live-check.mjs` (service worker + offline pass against the deployed site). SW qa-v34.
- **account menu + progress tabs** (2026-10-13): the Progress page is split into four hash-routed tabs so it reads by **intent** instead of one endless scroll — **Overview** (Today/goal, tiles, Qur'an coverage, due reviews), **Stats** (words by strength, 30-day forecast, drills table, letters, 12-week heatmap, listening & reading), **Memorised**, and **Data** (cloud sync, backup import/export, reset). The header avatar is now a real **account menu**: email + sync status, then stacked destination rows carrying **live hints** (Progress “24/30 reps today”, Memorised “6 verses · 1 surah”, Backup & data “last backup yesterday”) with **Sign out at the bottom** — the same rows show when signed out, since the app works fully offline. Home’s “Details →” opens Overview; the menu deep-links to `progress.html#stats|#memorised|#data`. **Fix**: the segmented-control styles lived only in stylesheets the Progress page doesn’t link, so the tabs first shipped unstyled — canonical `.seg` rules now live in `styles.css` and the QA asserts the tab bar is actually styled. New tool: `tools/cdp.mjs` (real-time Edge-over-CDP driver for QA pages that can’t run under virtual time, plus full-page screenshots). SW qa-v33.
- **stats + goal update** (2026-10-13): the Progress page now answers *how much of the Qur'an you actually understand*, not just how many words you met. New: **Qur'an coverage meter** (the share of the Qur'an's 77,429 word occurrences your known words account for, with the research-backed 95–98% comprehension band drawn as milestones), **words by strength** (new · learning · young · mature — each tappable straight into a review of just that group, via `words.html#review/b12` style links), a **30-day review forecast** bar chart, a **per-drill table** (Read it / Understand it rounds + best + accuracy, Trace passes, Listen reps, Recall accuracy), a **28-letter grid**, a **12-week activity heatmap**, and **listening & reading volume** counted from audio that actually played and reader time. New **daily goal** (15/30/60 reps, "Done for today" state) and **days used** — deliberately **no streaks**. All of it is driven by a new `activity` day-log that syncs (per-day per-field max) and backs up with everything else. SW qa-v32.
- **quiz split + coverage update** (2026-10-13): the Quiz tab's two modes are now **"Read it"** (hear → pick the written word) and **"Understand it"** (hear → pick the English meaning) — two **separate quizzes**, each with its own round, score, dots and recap (switching modes keeps each one's progress; "Write it" was a misnomer and collided with the Trace drill). **Understand-it coverage is now 500/500 words** — particles ("from", "in", "what"…) get fair options through a function-word distinctness rule. **Trace and Listen pools extended**: Listen drills all 526 words (build + vocabulary, deduped); Trace covers 504 (every word of ≤6 bare letters plus the curated 40). SW qa-v31.
- **quiz + fixes update** (2026-10-13): **Quiz rebuilt** — nothing plays until you press "🔊 Hear the word", but the four options are now **visible from the start** and every next question arrives with its options; a **row of progress dots** (green/red) tracks the round; the round ends with a **recap of the missed words** (tap one to hear it again); and a new **"Meaning" mode** drills *sound → English gloss* with distractors guaranteed not to share a meaning word with the answer. **Fixes**: the Listen drill's daily counter now lives as a per-day map (`practice.listens`) — the cloud merge previously corrupted its old `{day, count}` shape after signing in (which is why the counter appeared to reset on its own); it also resets at local midnight now. Quiz option boxes got the vertical room tall tashkeel needs (verified by measuring all 500 words in both modes). The Practice nav icon is a target, not a microphone. SW qa-v30.
- **polish update** (2026-10-13): **Verses memorised counts whole surahs properly** — marking a surah adds all of its verses to the number (Al-Fatihah 7 + Al-Ikhlas 4 + An-Nas 6 = 17). **The memorised state is visible**: the same 3px brand edge used on memorised verses now marks memorised surah rows in the browser list, the surah header, and the whole-surah rows on the Progress card, plus a filled ✓ badge instead of the old thin glyph. **Practice fixes**: switching the Recall tabs only switches tabs (the verse picker opens from a "Choose a verse" button, never automatically), and Listen/Quiz no longer play the word when you open the tab — Quiz keeps its four options hidden until you press "🔊 Hear the word". SW qa-v26.
- **home + account + surah tracker update** (2026-10-13): **Home redesigned** around one action — continue where you left off (or start with the letters), your numbers, then Letters/Words/Verses/Practice as tappable tiles; the old Welcome/Start-here/Build-words cards are gone. **Account in the header** (top-right, beside the theme toggle): sign in with Google, avatar + sync status dot (green = synced, amber = stale), Sync now / Sign out in the dropdown — actually just Sign out: sync is fully automatic; the Progress sync card folded into “Your data”. **Whole-surah memorisation** — a ✓ toggle in the surah header marks an entire surah (its per-verse ✓ buttons then disable); “Surahs memorised” is the third stat tile and whole surahs list above the verse chips (data kept underneath). **Persistence audit** — `tests/persistence-qa.html` proves every feature's writes reach localStorage, the cloud doc and backup files. SW qa-v24.
- **v0.2 — checkpoint 2** (2026-10-13):
  - **Word-audio mapping fixed** — all 27,963 shifted word-by-word references corrected (STT-verified; the CDN files are contiguous by word position — quran.com's `audio_url` counts pause-mark slots and drifts +1 per pause). Validator now enforces it.
  - **Practice · verse selection** — surah + ayah picker on Read aloud and Recall, deep links (`practice.html#read/2:255`), next-verse walk, "Practice this verse" on every verse.
  - **Learning guidance** — Home shows a *Today* card (Review → Learn → Read → Practice, composed from real progress) with a Focus override; new **How to learn** guide page (the path in order, daily template, evidence, FAQ). Nothing is locked — soft guidance at any level.
  - Practice page audited: all 190 app clips content-verified — full STT sweep + context-based re-check for short words (10/10 confirmed correct).
- **post-checkpoint-2 update** (2026-10-13):
  - **Home simplified** — the staged "Today" plan (auto phases) was replaced by a single clean card: one line + **Open the learning guide**. No fake phases; preview showed a beginner being told to "read with recall" before knowing letters.
  - **New page: How Arabic works** — three optional explanations where the writing system confuses beginners: (1) letters join into a ribbon (4 forms + tap-to-join demo + non-connectors), (2) the marks are the vowels (8 harakat with readable sounds + long vowels), (3) how words are made (root ك-ت-ب family with audio). Linked *contextually* from Letters, Harakat, Build and the Guide — never forced.
  - Guide updated for true beginners (reading comes after letters + marks + words, with links into the explainers).
- **progress update** (2026-10-13): **Progress page built** (it was still a stub — found during the full audit) — letters/words/verses stats, 7-day activity strip, due reviews, and **backup export/import**: download your progress as one JSON file, restore it on any device (or after clearing the browser); plus a two-step full reset. Guide FAQ updated.
- **tier-2 update** (2026-10-13):
  - **Vocabulary expanded to the top 500 words** — 56% Qur'an coverage (core 150 byte-identical, separate divider); Browse shows the core with "show 350 more"; all new clips sampled & verified on the CDN.
  - **Quiz drill** (Practice) — hear a word, pick it from four; grades the same SRS; neutral player label so the answer never shows.
  - **Word roots page** — 24 curated families, 75 corpus-verified words with real audio/gloss/verse refs; English + Arabic filter; `tools/build-roots.mjs` fails loudly on any member not in the corpus.
- **trace-scorer v2** (2026-10-13): writing check rebuilt around the **dashed contour**: coverage ≥ 85% along the line, ink discipline ≥ 88% (zigzags, filling the area, overshoots and sloppy clouds now fail), and **every stroke must be traced — the dots count**. Brush-size slider (3–18px, remembered). Verified with a 17-case battery drawing deliberate good/bad traces (`tests/trace-check.html`) — all verdicts correct. SW qa-v17.
- **memorisation + playback update** (2026-10-13): **Verse memorisation tracker** — the ✓ button on any verse marks it memorised (self-reported; fills the button and accents the card, surah header counts them). Progress page gains a "Verses memorised" tile and a per-surah chip list (tap a chip to open the verse, ✕ to remove); rides along in backup export/import. **Verse playback fixed** — the ▶ on each verse now plays *from that verse*: backwards or forwards, it switches instantly mid-playback (before, every ▶ was just a global pause/resume). The playing verse shows ⏸ and toggles pause/resume, a new **⟲ Restart verse** button replays the current verse, word-by-word mode follows the same rules, and manual scrolling no longer fights the auto-follow. SW qa-v19.
- **v0.1 — checkpoint 1** (2026-10-13): letters (+ tracing), 150-word vocabulary with spaced repetition, Build mode (assemble words from letter tiles), full Qur'an reader (114 surahs, word-by-word audio, 4 reciters, translations, grammar notes), Practice drills (read-aloud, tracing, listen & repeat, recall).
