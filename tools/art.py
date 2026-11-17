"""Draws the lobby thumb (thumb.jpg, 960x540) and the app icons from the games' lobby thumbs.

    python tools/art.py        (run after tools/build.py)
"""
import json, os, re, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DRIVE = os.path.splitdrive(ROOT)[0] + os.sep
THUMBS = os.path.join(DRIVE, 'GameHub', 'thumbs')
FONTS = os.path.join(os.environ.get('WINDIR', DRIVE + 'Windows'), 'Fonts')
ACCENT = (251, 146, 60)


def font(names, size):
    for n in names:
        p = os.path.join(FONTS, n)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def disc(size, label=ACCENT):
    s = size * 4
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([0, 0, s - 1, s - 1], fill=(18, 18, 22, 255))
    for i in range(8, 46, 4):
        r = s * i / 100
        d.ellipse([s / 2 - r, s / 2 - r, s / 2 + r, s / 2 + r], outline=(46, 46, 54, 255), width=max(2, s // 160))
    # a light streak
    hl = Image.new('L', (s, s), 0)
    ImageDraw.Draw(hl).pieslice([0, 0, s - 1, s - 1], 200, 235, fill=70)
    hl = hl.filter(ImageFilter.GaussianBlur(s / 40))
    white = Image.new('RGBA', (s, s), (255, 255, 255, 0))
    white.putalpha(hl)
    mask = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, s - 1, s - 1], fill=255)
    im.alpha_composite(Image.composite(white, Image.new('RGBA', (s, s), (0, 0, 0, 0)), mask))
    r = s * 0.17
    d = ImageDraw.Draw(im)
    d.ellipse([s / 2 - r, s / 2 - r, s / 2 + r, s / 2 + r], fill=label + (255,))
    r = s * 0.025
    d.ellipse([s / 2 - r, s / 2 - r, s / 2 + r, s / 2 + r], fill=(18, 18, 22, 255))
    return im.resize((size, size), Image.LANCZOS)


def note(d, x, y, h, fill):
    w = h * 0.36
    d.ellipse([x, y + h - w * 0.8, x + w, y + h], fill=fill)
    d.rectangle([x + w - h * 0.07, y, x + w, y + h - w * 0.4], fill=fill)
    d.polygon([(x + w - h * 0.07, y), (x + w + h * 0.3, y + h * 0.22), (x + w + h * 0.3, y + h * 0.36), (x + w, y + h * 0.14)], fill=fill)


def main():
    src = open(os.path.join(ROOT, 'tracks.js'), encoding='utf-8').read()
    data = json.loads(src[src.index('{'):src.rstrip().rindex('}') + 1])
    files = []
    for g in data['games']:
        if g.get('thumb'):
            p = os.path.join(THUMBS, os.path.basename(g['thumb'].split('?')[0]))
            if os.path.exists(p): files.append(p)
    W, H = 960, 540
    bg = Image.new('RGB', (W, H), (20, 18, 28))
    cols, tw = 6, 176
    th = tw * 9 // 16
    random.seed(7)
    order = files[:]
    i = 0
    for row in range(-1, 6):
        for c in range(cols + 1):
            if not order: break
            im = Image.open(order[i % len(order)]).convert('RGB').resize((tw, th), Image.LANCZOS)
            i += 1
            x = c * (tw + 8) - (row % 2) * 60 - 20
            y = row * (th + 8) + 10
            bg.paste(im, (x, y))
    bg = bg.filter(ImageFilter.GaussianBlur(1.2))
    shade = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    for x in range(W):
        a = int(235 - 150 * (x / W))
        sd.line([(x, 0), (x, H)], fill=(16, 13, 24, max(60, a)))
    out = bg.convert('RGBA')
    out.alpha_composite(shade)
    dsk = disc(430)
    out.alpha_composite(dsk, (W - 330, H // 2 - 215))
    d = ImageDraw.Draw(out)
    big = font(['msjhbd.ttc', 'msyhbd.ttc', 'NotoSansTC-Bold.otf'], 128)
    mid = font(['segoeuib.ttf', 'arialbd.ttf'], 54)
    small = font(['msjh.ttc', 'segoeui.ttf'], 28)
    d.text((62, 112), '音樂館', font=big, fill=(255, 248, 238))
    d.text((66, 270), 'Music Gallery', font=mid, fill=ACCENT)
    n_g, n_t = len(data['games']), len(data['tracks'])
    d.text((68, 352), f'{n_g} 款遊戲 · {n_t} 首配樂', font=small, fill=(225, 218, 235))
    d.text((68, 392), f'{n_t} tracks from {n_g} games', font=small, fill=(190, 182, 205))
    for k, (x, y, h) in enumerate([(520, 70, 64), (580, 400, 46), (470, 450, 34)]):
        note(d, x, y, h, (255, 248, 238, 200))
    out.convert('RGB').save(os.path.join(ROOT, 'thumb.jpg'), quality=88)
    # icons
    for size, name in [(180, 'apple-touch-icon.png'), (192, 'icon-192.png'), (512, 'icon-512.png')]:
        ic = Image.new('RGBA', (size, size), (20, 18, 28, 255))
        dd = disc(int(size * 0.84))
        ic.alpha_composite(dd, ((size - dd.width) // 2, (size - dd.height) // 2))
        note(ImageDraw.Draw(ic), size * 0.40, size * 0.33, size * 0.32, (255, 248, 238, 255))
        ic.convert('RGB').save(os.path.join(ROOT, name))
    print('thumb + icons written from', len(files), 'thumbs')


if __name__ == '__main__':
    main()
