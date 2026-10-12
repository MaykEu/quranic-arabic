# Letter audio — credits

## Current clips (what the app plays)

| letters | source | license |
|---|---|---|
| 27 letters (all except ظ) | GitHub: [razunatmohammed88-cyber/arabic-alphabet-audio](https://github.com/razunatmohammed88-cyber/arabic-alphabet-audio) | MIT |
| ظ (`zaa.mp3`) | GitHub: [kholmatov/alfathon](https://github.com/kholmatov/alfathon) | MIT |

Processing: loudness-normalized to −16 LUFS with ffmpeg `loudnorm` (true peak −1.5 dB), MP3 96 kbps.
File names are our app's positional ids (`alif.mp3` … `ya.mp3`).

Notes
- The razun source names letters in its own transliteration; mappings used:
  `haa'.mp3` → our `ha.mp3` (ح) and `haa.mp3` → our `haa.mp3` (ه), following the set's
  convention that an apostrophe marks the emphatic letter (`taa'` = ط, `thaa'` = ظ). Verify by ear if ever in doubt.
- `alfathon` supplies ظ (`zaa.mp3`) because the razun set has no unambiguous ظ file.
- Superseded 2015 recordings removed after listening test (clipped peaks at 0 dBFS, strong high-frequency roll-off).

## Alternate sets — kept for reference / future swaps (`audition/`)

| folder | source | license | notes |
|---|---|---|---|
| `audition/current/` | Wikimedia Commons, "Category:Arabic pronunciation", uploaded 2015 by User:Ruaa GHAREEB | CC BY-SA 4.0 | the original set (superseded — clipped & muffled) |
| `audition/speller/` | GitHub: [elsanussi-s-mneina/arabic-alphabet-audio-speller-html-js](https://github.com/elsanussi-s-mneina/arabic-alphabet-audio-speller-html-js) | MIT | recorded 2022 by the repo author; letter names with tanwiin endings ("alifun") |
| `audition/razun/` | see above | MIT | full set; `thaa'.mp3` is very likely ظ (unused, unverified) |
| `audition/alfathon/` | see above | MIT | missing ز |

All clips in `audition/` are loudness-normalized (−16 LUFS) so comparisons are fair.

## Old alternate takes (kept in this folder)

`*-alt.mp3` files (`alif-alt`, `ha-alt`, `dad-alt`, `zaa-alt`, `ayn-alt`, `lam-alt`, `haa-alt`)
come from the 2015 Wikimedia set — kept for reference only; the app does not use them.
