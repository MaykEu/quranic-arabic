# Quranic Arabic

A personal, mobile-first web app for learning **reading, writing and understanding Qur'anic Arabic** —
the Arabic script, letter tracing, the 150 most frequent words, and verse study word by word with audio.

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
- `data/` — generated dataset: full Qur'an (114 surahs, word-by-word transliteration/gloss/audio), top-150 vocabulary, letters, harakat, reciters, grammar notes
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

- **v0.2 — checkpoint 2** (2026-10-13):
  - **Word-audio mapping fixed** — all 27,963 shifted word-by-word references corrected (STT-verified; the CDN files are contiguous by word position — quran.com's `audio_url` counts pause-mark slots and drifts +1 per pause). Validator now enforces it.
  - **Practice · verse selection** — surah + ayah picker on Read aloud and Recall, deep links (`practice.html#read/2:255`), next-verse walk, "Practice this verse" on every verse.
  - **Learning guidance** — Home shows a *Today* card (Review → Learn → Read → Practice, composed from real progress) with a Focus override; new **How to learn** guide page (the path in order, daily template, evidence, FAQ). Nothing is locked — soft guidance at any level.
  - Practice page audited: all 190 app clips content-verified — full STT sweep + context-based re-check for short words (10/10 confirmed correct).
- **v0.1 — checkpoint 1** (2026-10-13): letters (+ tracing), 150-word vocabulary with spaced repetition, Build mode (assemble words from letter tiles), full Qur'an reader (114 surahs, word-by-word audio, 4 reciters, translations, grammar notes), Practice drills (read-aloud, tracing, listen & repeat, recall).
