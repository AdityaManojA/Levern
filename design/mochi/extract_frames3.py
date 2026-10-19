"""Cut Mochi's third animation sheet (design/mochi frames3.png): 13 animations, 11-14 frames each.

Cards are found from their frame numbers, like extract_frames2.py: each band of cards has a row of
small grey-blue numbers along its top edge. A band holds one or two animations side by side; the
numbers are split at the given x and any number the cutter could not read is filled in from the
card pitch. Shapes are cut with extract_frames2.cut (nearest card centre owns a shape), and the
little mouse-cursor icons are removed because the real pointer or finger plays that part.

  python extract_frames3.py   -> design/mochi/frames/<name>/01.png ... and frames3-preview.png
"""
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

import extract_frames2 as x2

HERE = os.path.dirname(os.path.abspath(__file__))
SHEET = os.path.join(HERE, '..', 'mochi frames3.png')
OUT = os.path.join(HERE, 'frames')

# bands of cards, top to bottom: (number row y, [(name, frames, x from, x to), ...])
BANDS = [
    (49, [('yawn', 12, 0, 760), ('loaf', 12, 760, 1536)]),
    (203, [('pounce', 12, 0, 760), ('cursor-chase', 12, 760, 1536)]),
    (359, [('bonk', 12, 0, 760), ('sprint', 12, 760, 1536)]),
    (512, [('balance', 12, 0, 760), ('cry', 12, 760, 1536)]),
    (664, [('suspicious', 12, 0, 760), ('stomp', 12, 760, 1536)]),
    (811, [('notify', 11, 0, 680), ('button', 12, 680, 1536)]),
    (949, [('wipe', 14, 0, 1536)]),
]


def number_glyphs(a):
    lum = a.mean(axis=2)
    sat = a.max(axis=2) - a.min(axis=2)
    glyph = (lum > 80) & (lum < 200) & (a[..., 2] - a[..., 0] > 4) & (sat < 70)
    lab, _ = ndimage.label(glyph)
    out = []
    for i, o in enumerate(ndimage.find_objects(lab), 1):
        h = o[0].stop - o[0].start; w = o[1].stop - o[1].start
        if 5 <= h <= 16 and 2 <= w <= 12 and 6 <= (lab[o] == i).sum() <= 120:
            out.append((o[0].start, o[1].start))
    return out


def card_bottom(a, top, x):
    """First tinted pixel below the white card, scanning down near its left edge."""
    sat = a.max(axis=2) - a.min(axis=2)
    lum = a.mean(axis=2)
    for y in range(top + 50, min(a.shape[0], top + 140)):
        if sat[y, x] > 7 and lum[y, x] > 200:
            return y
    return min(a.shape[0] - 1, top + 104)


def find_panels(a):
    glyphs = number_glyphs(a)
    panels = []
    for gy, anims in BANDS:
        row = sorted(x for y, x in glyphs if abs(y - gy) <= 3)
        for name, n, xa, xb in anims:
            xs = []
            for x in row:
                if xa <= x < xb and not (xs and x - xs[-1] < 14):   # "10": keep the first digit only
                    xs.append(x)
            pitch = float(np.median(np.diff(xs)))
            # a number hidden behind art: fill the gap from the pitch
            filled = [xs[0]]
            for x in xs[1:]:
                while x - filled[-1] > pitch * 1.5:
                    filled.append(round(filled[-1] + pitch))
                filled.append(x)
            if len(filled) != n:
                raise SystemExit(f'{name}: found {len(filled)} cards, expected {n}: {filled}')
            top = gy - 7
            cards = []
            for j, gx in enumerate(filled):
                left = gx - 9
                right = (filled[j + 1] - 9 - 3) if j + 1 < n else round(left + pitch - 3)
                cards.append([left, top, right, 0])
            bottom = max(card_bottom(a, top, c[0] + 4) for c in cards)
            for c in cards:
                c[3] = bottom
            panels.append((name, cards))
    return panels


def drop_cursors(f):
    """Remove mouse-cursor icons: small separate shapes that are mostly white with a dark outline."""
    rgba = np.asarray(f).copy()
    solid = rgba[..., 3] > 24
    lab, n = ndimage.label(solid)
    for i in range(1, n + 1):
        m = lab == i
        ys, xs = np.nonzero(m)
        h, w = ys.max() - ys.min() + 1, xs.max() - xs.min() + 1
        px = rgba[m][:, :3].astype(int)
        white = (px.min(axis=1) > 215).mean()
        dark = (px.max(axis=1) < 80).mean()
        if m.sum() < 500 and 8 <= h <= 26 and 6 <= w <= 22 and white > 0.25 and dark > 0.2:
            rgba[m, 3] = 0
    return Image.fromarray(rgba, 'RGBA')


def drop_above_head(f):
    """Keep the cat and whatever touches his height range; drop loose marks floating above his ears."""
    rgba = np.asarray(f).copy()
    solid = rgba[..., 3] > 24
    lab, n = ndimage.label(solid)
    if n < 2:
        return f
    sizes = ndimage.sum(solid, lab, range(1, n + 1))
    cat = int(np.argmax(sizes)) + 1
    top = np.nonzero(lab == cat)[0].min()
    for i in range(1, n + 1):
        ys = np.nonzero(lab == i)[0]
        if i != cat and ys.max() < top + 4:
            rgba[lab == i, 3] = 0
    return Image.fromarray(rgba, 'RGBA')


# frames that need a hand: pounce 9 has a cursor drawn as an outline only (its fill reads as background)
FIXES = {('pounce', 9): drop_above_head}


def main():
    img = Image.open(SHEET).convert('RGB')
    a = np.asarray(img).astype(np.int16)
    panels = find_panels(a)
    prev = img.copy()
    d = ImageDraw.Draw(prev)
    for _, cards in panels:
        for c in cards:
            d.rectangle(c, outline=(230, 40, 40), width=1)
    prev.save(os.path.join(HERE, 'frames3-preview.png'))

    every = [c for _, p in panels for c in p]
    for name, cards in panels:
        centres = [(c[0] + c[2]) / 2 for c in every if abs(c[1] - cards[0][1]) < 12]
        frames = [drop_cursors(x2.cut(a, c, centres)) for c in cards]
        frames = [FIXES.get((name, i), lambda f: f)(f) for i, f in enumerate(frames, 1)]
        # one shared card-relative box for every frame, so the frames stay registered
        boxes = []
        for f, c in zip(frames, cards):
            bb = f.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
            if bb:
                dx = c[0] - max(0, c[0] - x2.PAD)
                boxes.append((bb[0] - dx, bb[1], bb[2] - dx, bb[3]))
        L = min(b[0] for b in boxes) - 2; T = max(0, min(b[1] for b in boxes) - 2)
        R = max(b[2] for b in boxes) + 2; B = max(b[3] for b in boxes) + 2
        os.makedirs(os.path.join(OUT, name), exist_ok=True)
        for old in os.listdir(os.path.join(OUT, name)):
            os.remove(os.path.join(OUT, name, old))
        for i, (f, c) in enumerate(zip(frames, cards), 1):
            dx = c[0] - max(0, c[0] - x2.PAD)
            canvas = f.crop((L + dx, T, R + dx, B))
            canvas.resize((canvas.width * 2, canvas.height * 2), Image.LANCZOS).save(os.path.join(OUT, name, f'{i:02d}.png'))
        print(f'{name:14s} {len(cards)} frames  {R - L}x{B - T}')


if __name__ == '__main__':
    main()
