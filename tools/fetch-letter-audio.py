#!/usr/bin/env python3
"""Letter-audio fetch + convert for the Quranic Arabic site.

SOURCE (also documented in assets/audio/letters/CREDITS.md):
  Wikimedia Commons, 'Category:Arabic pronunciation' —
  files uploaded 2015 by User:Ruaa GHAREEB, license CC BY-SA 4.0
  (https://creativecommons.org/licenses/by-sa/4.0/).

WHAT IT DOES:
  1. Resolves download URLs for the 35 selected clips (28 letters + 7 alternates)
     via one Commons API call.
  2. Downloads originals (.wav) into cache/letters_raw/ (polite: 2 s between
     downloads, retries on 429/503).
  3. Converts to mono MP3 96 kbps with ffmpeg into assets/audio/letters/<id>.mp3.
  4. Writes assets/audio/letters/CREDITS.md (attribution table).
  5. Regenerates tests/letters-audition.html for manual review by Mayk.

Idempotent — existing files are reused. Usage (from anywhere):
    python tools/fetch-letter-audio.py
"""
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = 'https://commons.wikimedia.org/w/api.php'
UA = {'User-Agent': 'QuranicArabic-site/1.0 (contact: maykeu.github.io; educational assets)'}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'audio', 'letters')
RAW = os.path.join(ROOT, 'cache', 'letters_raw')

# local id -> Commons file title
PLAN = [
    ('alif', 'File:Alif A.wav'), ('alif-alt', 'File:Alifp.wav'),
    ('ba', 'File:Baaudio.wav'), ('ta', 'File:Taaudio.wav'), ('tha', 'File:Thaaudio.wav'),
    ('jim', 'File:Jeemaudio.wav'),
    ('ha', 'File:Haaaudio.wav'), ('ha-alt', 'File:Hap.wav'),
    ('kha', 'File:Khaaudio.wav'), ('dal', 'File:Dalaudio.wav'), ('dhal', 'File:Dzalaudio.wav'),
    ('ra', 'File:RAAUDIO.wav'), ('zay', 'File:ZaiAUDIO.wav'),
    ('sin', 'File:Senaudio.wav'), ('shin', 'File:Shenaudio.wav'), ('sad', 'File:Sadaudio.wav'),
    ('dad', 'File:Ddadaudio.wav'), ('dad-alt', 'File:Ddapro.wav'),
    ('tta', 'File:Ttaaudio.wav'),
    ('zaa', 'File:Dddaudio.wav'), ('zaa-alt', 'File:Dddp.wav'),
    ('ayn', 'File:Aaaudio.wav'), ('ayn-alt', 'File:Aap.wav'),
    ('ghayn', 'File:Ghaudio.wav'), ('fa', 'File:Faaudio.wav'),
    ('qaf', 'File:Qafaudio.wav'), ('kaf', 'File:Kafaudio.wav'),
    ('lam', 'File:Lamudio.wav'), ('lam-alt', 'File:Lampronn.wav'),
    ('mim', 'File:Maudio.wav'), ('nun', 'File:Naudio.wav'),
    ('haa', 'File:Haaudio.wav'), ('haa-alt', 'File:Hpron.wav'),
    ('waw', 'File:Wawaudio.wav'), ('ya', 'File:Yaaudio.wav'),
]

# canonical display order for the audition page: (id, glyph, name)
LETTERS = [
    ('alif', 'ا', 'alif'), ('ba', 'ب', 'bāʾ'), ('ta', 'ت', 'tāʾ'), ('tha', 'ث', 'thāʾ'),
    ('jim', 'ج', 'jīm'), ('ha', 'ح', 'ḥāʾ'), ('kha', 'خ', 'khāʾ'), ('dal', 'د', 'dāl'),
    ('dhal', 'ذ', 'dhāl'), ('ra', 'ر', 'rāʾ'), ('zay', 'ز', 'zāy'), ('sin', 'س', 'sīn'),
    ('shin', 'ش', 'shīn'), ('sad', 'ص', 'ṣād'), ('dad', 'ض', 'ḍād'), ('tta', 'ط', 'ṭāʾ'),
    ('zaa', 'ظ', 'ẓāʾ'), ('ayn', 'ع', 'ʿayn'), ('ghayn', 'غ', 'ghayn'), ('fa', 'ف', 'fāʾ'),
    ('qaf', 'ق', 'qāf'), ('kaf', 'ك', 'kāf'), ('lam', 'ل', 'lām'), ('mim', 'م', 'mīm'),
    ('nun', 'ن', 'nūn'), ('haa', 'ه', 'hāʾ'), ('waw', 'و', 'wāw'), ('ya', 'ي', 'yāʾ'),
]


def api(params):
    url = BASE + '?' + urllib.parse.urlencode(params)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
        return json.load(r)


def fetch(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and i < tries - 1:
                wait = 6 * (i + 1)
                print(f'    http {e.code}; retry in {wait}s')
                time.sleep(wait)
                continue
            raise


def find_ffmpeg():
    candidates = [
        'ffmpeg',
        r'C:\Users\sofia\AppData\Local\hermes\tools\ffmpeg-9.0.1-win32-x64\bin\ffmpeg.exe',
    ]
    for c in candidates:
        if shutil.which(c) or os.path.exists(c):
            return c
    return None


def write_credits():
    lines = [
        '# Letter audio - credits', '',
        'Source: Wikimedia Commons ("Category:Arabic pronunciation"), files uploaded 2015 by User:Ruaa GHAREEB.',
        'License: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/) - applies to every file in this folder.',
        'Processing: original .wav -> mono MP3 96 kbps (ffmpeg), no other edits.',
        'Local file names are positional (assigned by our app); original Commons names listed below.', '',
        '| local file | source page | source file |', '|---|---|---|',
    ]
    for tid, title in PLAN:
        page = 'https://commons.wikimedia.org/wiki/File:' + title.replace('File:', '').replace(' ', '_')
        lines.append(f'| `{tid}.mp3` | [Commons]({page}) | `{title}` |')
    with open(os.path.join(OUT, 'CREDITS.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')


def write_audition_page():
    clipmap = {}
    for tid, _ in PLAN:
        clipmap.setdefault(tid.replace('-alt', ''), []).append(tid)
    rows = []
    for lid, glyph, name in LETTERS:
        clips = ''.join(
            f'<audio controls preload="none" src="../assets/audio/letters/{c}.mp3"></audio> '
            for c in clipmap.get(lid, [])
        )
        rows.append('<div class="row"><div class="g">' + glyph + '</div><div class="name">' + name
                    + '</div><div class="clips">' + clips + '</div></div>')
    tpl = '''<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Letter audio audition - Quranic Arabic</title>
<style>
@font-face { font-family:'Amiri'; src: url('../assets/fonts/amiri-arabic-400.woff2') format('woff2'); }
body { font-family: system-ui, sans-serif; margin:16px; background:#FAF6EC; color:#1D2A26; }
h1 { font-size:20px; }
.note { background:#FFF8E1; border:1px solid #E4DCCB; border-radius:10px; padding:10px 14px; margin:0 0 14px; max-width:680px; line-height:1.5 }
.row { display:flex; align-items:center; gap:14px; padding:8px 10px; border-bottom:1px solid #E4DCCB; }
.g { font-family:'Amiri', serif; font-size:42px; min-width:64px; text-align:center; }
.name { width:90px; color:#5C6B64; font-size:14px; }
audio { height:34px; max-width:260px; }
</style></head><body>
<h1>Letter audio audition</h1>
<div class="note"><b>Mayk:</b> play every clip and check it matches the letter shown.
Rows with <b>two clips</b>: pick the better one (or say both are bad).
Please double-check the <b>ha</b> pair (ح/ه) and the <b>dad / zaa</b> pair (ض/ظ) - I may have them swapped.
Reply with anything that sounds wrong.</div>
__ROWS__
</body></html>'''
    with open(os.path.join(ROOT, 'tests', 'letters-audition.html'), 'w', encoding='utf-8') as f:
        f.write(tpl.replace('__ROWS__', '\n'.join(rows)))


def main():
    os.makedirs(RAW, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        print('ERROR: ffmpeg not found')
        return 1

    d = api(dict(action='query', titles='|'.join(t for _, t in PLAN),
                 prop='imageinfo', iiprop='url|size', format='json', formatversion='2'))
    urls = {}
    for p in d.get('query', {}).get('pages', []):
        ii = (p.get('imageinfo') or [{}])[0]
        urls[p.get('title')] = ii.get('url')

    ok, fails = [], []
    for tid, title in PLAN:
        url = urls.get(title)
        fname = title.replace('File:', '')
        rawpath = os.path.join(RAW, fname)
        mp3path = os.path.join(OUT, tid + '.mp3')
        try:
            if not url:
                raise RuntimeError('no URL resolved')
            if not os.path.exists(rawpath) or os.path.getsize(rawpath) == 0:
                with open(rawpath, 'wb') as f:
                    f.write(fetch(url))
                time.sleep(2.0)  # be polite to upload.wikimedia.org
            if not os.path.exists(mp3path) or os.path.getsize(mp3path) == 0:
                r = subprocess.run(
                    [ffmpeg, '-y', '-hide_banner', '-loglevel', 'error', '-i', rawpath,
                     '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '96k', mp3path],
                    capture_output=True, text=True)
                if r.returncode != 0:
                    raise RuntimeError('ffmpeg: ' + (r.stderr or '')[:200])
            ok.append(tid)
            print(f'{tid:9s} ok  {os.path.getsize(mp3path):7d} bytes  ({title})')
        except Exception as e:
            fails.append((tid, title, repr(e)))
            print(f'{tid:9s} FAIL  {title}  {e}')

    write_credits()
    write_audition_page()
    total = sum(os.path.getsize(os.path.join(OUT, t + '.mp3')) for t in ok)
    print(f'\nDONE ok={len(ok)} fail={len(fails)} total_mp3={total // 1024} KB')
    for f in fails:
        print('  FAILED:', f)
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
