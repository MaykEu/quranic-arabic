#!/usr/bin/env python3
"""Generate app icons for the Quranic Arabic site with Pillow (no browser needed).

Uses assets/fonts/Amiri-Regular.ttf. Outputs into assets/icons/:
  icon-512.png, icon-192.png, icon-512-maskable.png, apple-touch-icon.png, favicon.ico
Design: dark-teal rounded square + cream qaf (ق). The maskable variant is
full-bleed (no rounded corners) with a smaller centred glyph for Android.

Run: python tools/make_icons.py
"""
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, 'assets', 'fonts', 'Amiri-Regular.ttf')
OUT = os.path.join(ROOT, 'assets', 'icons')
BRAND = (20, 85, 90, 255)     # dark teal (--brand2)
CREAM = (250, 246, 236, 255)  # cream (--bg)
QAF = '\u0642'                # ق


def draw_glyph(img, font_px, y_shift=0.0):
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT, font_px)
    b = d.textbbox((0, 0), QAF, font=f)
    w, h = b[2] - b[0], b[3] - b[1]
    x = (img.width - w) / 2 - b[0]
    y = (img.height - h) / 2 - b[1] + y_shift * img.height
    d.text((x, y), QAF, font=f, fill=CREAM)


def make(size, font_px, out, radius_ratio=0.20, ico=False):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if radius_ratio:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=BRAND)
    else:
        d.rectangle([0, 0, size - 1, size - 1], fill=BRAND)
    draw_glyph(img, font_px)
    if ico:
        img.save(out, sizes=[(32, 32), (48, 48)])
    else:
        img.save(out)
    print(f'{os.path.basename(out)}  {size}x{size}')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    make(512, 300, os.path.join(OUT, 'icon-512.png'))
    make(192, 112, os.path.join(OUT, 'icon-192.png'))
    make(512, 230, os.path.join(OUT, 'icon-512-maskable.png'), radius_ratio=0)  # full bleed, safe zone
    make(180, 106, os.path.join(OUT, 'apple-touch-icon.png'))
    make(256, 150, os.path.join(OUT, 'favicon.ico'), ico=True)
