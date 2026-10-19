"""Cut Mochi's second animation sheet (design/mochi animations 2.webp): 19 animations, 2-8 frames each.

The layout is irregular, so cards are detected: each frame card is a pure-white box, found as a
white region of card size. Cards are read in order (row by row, left to right), split into panels
at the wider gaps between panels, and matched to the animations below with a frame-count check.
Cutting works like extract_frames.py: a wider window per card (art can overhang its card), each
shape is kept by the card whose centre it is closest to, frame numbers and borders are removed.
All frames of an animation share one box so they stay registered.

  python extract_frames2.py   -> design/mochi/frames/<name>/01.png ... and frames2-preview.png
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SHEETS = {
    'sheet2': os.path.join(HERE, '..', 'mochi animations 2.webp'),
    'hover': os.path.join(HERE, '..', 'mochi hover.webp'),
}
SHEET = SHEETS['sheet2']
OUT = os.path.join(HERE, 'frames')
PAD = 40            # leaps and stretches overhang their cards a lot on this sheet

# reading order on the sheet: (name, frames)
ANIMS = [
    ('walk', 8), ('turn', 6), ('breathe', 6),
    ('sitdown', 6), ('standup', 6), ('hop', 8),
    ('stormoff', 8), ('sulk', 6), ('turnback', 6),
    ('ptr-stretch', 6), ('ptr-hang', 2), ('ptr-snap', 8), ('chase', 8),
    ('boxpop', 8), ('peek-rise', 5), ('peek-duck', 5), ('helper-idle', 4),
    ('toast-celebrate', 6), ('toast-grumpy', 6),
]
SPECS = {
    'sheet2': ANIMS,
    # design/mochi hover.webp: following the mouse
    'hover': [('look-lr', 10), ('look-rl', 10), ('eyes-lr', 10), ('eyes-rl', 10), ('tilt', 10)],
}


def find_cards(a):
    """Cards on this sheet touch each other (white on white), so they are found from their frame
    numbers instead: each card has a small grey-blue number in its top-left corner. A row of numbers
    gives the card left edges; the next number gives the right edge; the bottom is where the white
    card meets the pastel panel below it. Numbers are split into panels using the frame counts."""
    lum = a.mean(axis=2)
    sat = a.max(axis=2) - a.min(axis=2)
    glyph = (lum > 95) & (lum < 200) & (a[..., 2] - a[..., 0] > 4) & (sat < 70)
    lab, _ = ndimage.label(glyph)
    cands = []
    for i, o in enumerate(ndimage.find_objects(lab), 1):
        h = o[0].stop - o[0].start; w = o[1].stop - o[1].start
        area = (lab[o] == i).sum()
        if 6 <= h <= 18 and 2 <= w <= 13 and 8 <= area <= 140:
            cands.append((o[0].start, o[1].start))
    cands.sort()
    rows = []
    for c in cands:
        if rows and abs(rows[-1][-1][0] - c[0]) < 8:
            rows[-1].append(c)
        else:
            rows.append([c])
    counts = iter([n for _, n in ANIMS])
    want = next(counts)
    panels = []
    for row in rows:
        row.sort(key=lambda c: c[1])
        # a two-digit number ("10") is two glyphs side by side: keep only the first digit
        merged_row = []
        for c in row:
            if merged_row and c[1] - merged_row[-1][1] < 14:
                continue
            merged_row.append(c)
        row = merged_row
        xs = [c[1] for c in row]
        # real number rows sit just under the top edge of the cards: the pastel panel is a few px above
        above = [sat[max(0, c[0] - 14), c[1]] > 8 or sat[max(0, c[0] - 11), c[1]] > 8 for c in row]
        # ...and the white card is right below (header text has pastel below it instead)
        below = [sat[min(a.shape[0] - 1, c[0] + 18), c[1]] <= 6 and lum[min(a.shape[0] - 1, c[0] + 18), c[1]] > 236 for c in row]
        if sum(above) < 0.6 * len(row) or sum(below) < 0.6 * len(row):
            continue
        total = 0
        # only rows whose length is an exact sum of the next panels' frame counts are card rows
        plan, k, tmp = [], want, list(ANIMS[len(panels):])
        acc = 0
        for _, n in tmp:
            acc += n
            plan.append(n)
            if acc >= len(xs):
                break
        if acc != len(xs):
            continue
        y = min(c[0] for c in row) - 7
        i = 0
        for n in plan:
            group = xs[i:i + n]
            pitch = np.median(np.diff(group)) if n > 1 else 74
            cards = []
            for j, gx in enumerate(group):
                left = gx - 9
                right = (group[j + 1] - 9 - 3) if j + 1 < n else round(left + pitch - 3)
                # bottom: first pastel pixel below the card, scanning down its left side
                x = left + 4
                bottom = y + 100
                for yy in range(y + 40, min(a.shape[0], y + 160)):
                    if sat[yy, x] > 8 and lum[yy, x] > 200:
                        bottom = yy
                        break
                cards.append([left, y, right, bottom])
            panels.append(cards)
            i += n
        row_cards = [c for p in panels[-len(plan):] for c in p]
        low = max(c[3] for c in row_cards)
        for c in row_cards:
            c[3] = low
    # a faint tint near a card's bottom edge can stop the scan early: if a row's cards come out much
    # shorter than the other rows', use the typical card height instead
    heights = sorted({p[0][3] - p[0][1] for p in panels})
    typical = heights[len(heights) // 2]
    for p in panels:
        if p[0][3] - p[0][1] < typical * 0.85:
            for c in p:
                c[3] = min(a.shape[0] - 1, c[1] + typical)
    return panels


def cut(a, card, centres, drop_bottom_marks=False, keep=None):
    l, t, r, b = card
    x0, x1 = max(0, l - PAD), min(a.shape[1], r + PAD)
    win = a[t:b, x0:x1].astype(np.float32).copy()
    win[:24, l - x0:l - x0 + 30] = 255                  # frame number
    h, w = win.shape[:2]
    sat = win.max(axis=2) - win.min(axis=2)
    light = (win.min(axis=2) > 196) & (sat < 26)        # white card, grey shadow / sheet blocks
    labels, _ = ndimage.label(light)
    edge = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    bg = np.isin(labels, list(edge))
    rgba = np.dstack([win, np.full((h, w), 255, np.float32)])
    rgba[bg, 3] = 0
    if keep is not None:
        rgba[~keep[t:b, x0:x1], 3] = 0
    if drop_bottom_marks:
        blue = (win[..., 2] - win[..., 0] > 10) & (win.mean(axis=2) > 60)
        blue = ndimage.binary_dilation(blue, iterations=1)
        rgba[blue, 3] = 0
    ring = ndimage.binary_dilation(bg, iterations=2) & ~bg
    lum = win.mean(axis=2)
    grey = ring & (sat < 40) & (lum > 40)
    rgba[grey, :3] = 20
    rgba[grey, 3] = np.clip(1 - (lum[grey] - 22) / (250 - 22), 0, 1) * 255

    solid = rgba[..., 3] > 24
    lab, n = ndimage.label(solid)
    own = (l + r) / 2
    if n:
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        coms = ndimage.center_of_mass(solid, lab, range(1, n + 1))
        for i, (sz, (cy, cx)) in enumerate(zip(sizes, coms), 1):
            m = lab == i
            ys, xs = np.nonzero(m)
            nearest = own if keep is not None else min(centres, key=lambda c: abs(c - (x0 + cx)))
            px = win[ys, xs]
            mean_lum = px.mean()
            psat = (px.max(axis=1) - px.min(axis=1)).mean()
            drop = (
                sz < 12 or nearest != own
                # frame numbers: grey-blue glyphs near the top
                or (ys.max() < 30 and psat < 60 and 80 < mean_lum < 200)
                # panel border lines
                or (xs.max() - xs.min() <= 4 and ys.max() - ys.min() > 30 and (xs.min() <= 2 or xs.max() >= w - 3))
                # UI props drawn under the cat (the + button in the hop): not black, low in the frame
                or (drop_bottom_marks and mean_lum > 70 and cy > h * 0.62)
            )
            if drop:
                rgba[m, 3] = 0
    return Image.fromarray(rgba.astype(np.uint8), 'RGBA')


def cut_by_order(a, cards):
    """One cat per frame, but the leap overhangs into the next card: take the big dark shapes in the
    panel, sort them left to right, and give the n-th one (plus small marks near it) to frame n."""
    t, b = cards[0][1], cards[0][3]
    x0, x1 = max(0, cards[0][0] - PAD), min(a.shape[1], cards[-1][2] + PAD)
    dark = a[t:b, x0:x1].min(axis=2) < 90
    lab, n = ndimage.label(dark)
    sizes = ndimage.sum(dark, lab, range(1, n + 1))
    coms = ndimage.center_of_mass(dark, lab, range(1, n + 1))
    big = sorted([i + 1 for i in range(n) if sizes[i] > 250], key=lambda i: coms[i - 1][1])
    if len(big) != len(cards):
        print('hop: expected', len(cards), 'cats, found', len(big))
        return [cut(a, c, [(c[0] + c[2]) / 2], drop_bottom_marks=True) for c in cards]
    frames = []
    for k, (c, i) in enumerate(zip(cards, big)):
        m = ndimage.binary_dilation(lab == i, iterations=6)
        keep = np.zeros(a.shape[:2], bool)
        keep[t:b, x0:x1] = m
        frames.append(cut(a, c, None, drop_bottom_marks=True, keep=keep))
    return frames


def main():
    global ANIMS
    spec = sys.argv[1] if len(sys.argv) > 1 else 'sheet2'
    ANIMS = SPECS[spec]
    img = Image.open(SHEETS[spec]).convert('RGB')
    a = np.asarray(img).astype(np.int16)
    panels = find_cards(a)
    counts = [len(p) for p in panels]
    expect = [n for _, n in ANIMS]
    prev = img.copy()
    d = ImageDraw.Draw(prev)
    for p in panels:
        for c in p:
            d.rectangle(c, outline=(230, 40, 40), width=1)
    prev.save(os.path.join(HERE, 'frames2-preview.png'))
    if counts != expect:
        print('card detection does not match the sheet:\n  found ', counts, '\n  expect', expect)
        sys.exit(1)

    every = [c for p in panels for c in p]
    for (name, _), cards in zip(ANIMS, panels):
        # ownership is decided against every card in the same row, not just this panel
        centres = [(c[0] + c[2]) / 2 for c in every if abs(c[1] - cards[0][1]) < 12]
        frames = [cut(a, c, centres, drop_bottom_marks=(name == 'hop')) for c in cards]
        # a card can be empty once UI props are removed (hop card 2 only holds the + button): skip it
        keep_i = [i for i, f in enumerate(frames) if (np.asarray(f.getchannel('A')) > 24).sum() > 150]
        frames = [frames[i] for i in keep_i]
        cards = [cards[i] for i in keep_i]
        # shared box, measured relative to each card's own top-left so frames stay registered
        offs = [(max(0, c[0] - PAD), c[1]) for c in cards]
        boxes = []
        for f, (ox, oy), c in zip(frames, offs, cards):
            bb = f.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
            if bb:
                # express relative to the card's left edge
                dx = c[0] - ox
                boxes.append((bb[0] - dx, bb[1], bb[2] - dx, bb[3]))
        L = min(b[0] for b in boxes) - 2; T = max(0, min(b[1] for b in boxes) - 2)
        R = max(b[2] for b in boxes) + 2; B = max(b[3] for b in boxes) + 2
        os.makedirs(os.path.join(OUT, name), exist_ok=True)
        for old in os.listdir(os.path.join(OUT, name)):
            os.remove(os.path.join(OUT, name, old))
        for i, (f, c) in enumerate(zip(frames, cards), 1):
            dx = c[0] - max(0, c[0] - PAD)
            canvas = f.crop((L + dx, T, R + dx, B))      # same card-relative box for every frame
            canvas.resize((canvas.width * 2, canvas.height * 2), Image.LANCZOS).save(os.path.join(OUT, name, f'{i:02d}.png'))
        print(f'{name:16s} {len(cards)} frames  {R - L}x{B - T}')


if __name__ == '__main__':
    main()
