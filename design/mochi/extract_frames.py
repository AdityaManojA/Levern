"""Cut Mochi's animation frames out of design/mochi animations.webp (10 animations x 10 frames).

Each frame card is cut on the sheet's grid, its number is painted out, the white card background
(and soft ground shadow) connected to the edge is removed, so the white eyes and leg lines inside
the silhouette stay. All 10 frames of an animation are then trimmed to one shared box so they stay
registered and play back without jitter. Output: design/mochi/frames/<animation>/01.png ... 10.png

  python extract_frames.py           -> writes the frames and frames-preview.png
"""
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SHEET = os.path.join(HERE, '..', 'mochi animations.webp')
OUT = os.path.join(HERE, 'frames')

STEP = 74.3          # distance between frame cards
CARD_W, CARD_H = 70, 132
PAD = 16            # art can spill past its card (the melt blobs do), so cut a wider window
LEFT_X, RIGHT_X = 18, 783
ROWS_Y = [50, 246, 438, 638, 836]
ANIMS = [('blink', 'twitch'), ('lookaround', 'track'), ('melt', 'boop'), ('squish', 'pickup'), ('celebrate', 'grumpy')]


def detect_lefts(a, y0, xa, xb):
    """Left edge of each of the 10 white frame cards in one half-row. Cards are pure white on a
    pastel panel; sample a few lines near the top of the cards (where there is little art), keep
    edges seen on any line, and fill gaps from the row's own spacing."""
    found = []
    for y in (y0 + 8, y0 + 14, y0 + 22, y0 + 30):
        white = a[y, xa:xb].min(axis=1) > 247
        start = None
        for x, w in enumerate(white):
            if w and start is None:
                start = x
            if (not w or x == len(white) - 1) and start is not None:
                if x - start > 40:
                    found.append(start + xa)
                start = None
    first = min(found)
    slots = {}
    for x in found:                      # cluster by slot index
        i = round((x - first) / STEP)
        if 0 <= i < 10:
            slots.setdefault(i, []).append(x)
    # trust an edge only if two or more sample lines agree (art crossing a line fakes edges)
    lefts = {}
    for i, xs in slots.items():
        xs = sorted(xs)
        for j in range(len(xs) - 1):
            if xs[j + 1] - xs[j] <= 2:
                lefts[i] = xs[j]
                break
    known = sorted(lefts)
    for i in range(10):                  # fill missing slots from the nearest known neighbours
        if i not in lefts:
            lo = max([k for k in known if k < i], default=None)
            hi = min([k for k in known if k > i], default=None)
            if lo is not None and hi is not None:
                lefts[i] = round(lefts[lo] + (lefts[hi] - lefts[lo]) * (i - lo) / (hi - lo))
            elif lo is not None:
                lefts[i] = round(lefts[lo] + STEP * (i - lo))
            else:
                lefts[i] = round(lefts[hi] - STEP * (hi - i))
    return [lefts[i] for i in range(10)]


def card_boxes(img):
    a = np.asarray(img).astype(np.int16)
    for r, (left, right) in enumerate(ANIMS):
        for name, (xa, xb) in ((left, (0, 768)), (right, (768, 1536))):
            lefts = detect_lefts(a, ROWS_Y[r], xa, xb)
            centres = [x + CARD_W / 2 for x in lefts]
            for i, x in enumerate(lefts):
                yield name, i + 1, (x - PAD, ROWS_Y[r], x + CARD_W + PAD, ROWS_Y[r] + CARD_H), centres


def cut(img, box, centres=None):
    a = np.asarray(img.crop(box)).astype(np.float32)
    a[:26, PAD - 2:PAD + 28] = 255                      # the frame number ("10" is wider)
    h, w = a.shape[:2]
    sat = a.max(axis=2) - a.min(axis=2)
    light = (a.min(axis=2) > 200) & (sat < 22)          # white card, grey shadow; keeps skin, hearts, stars
    labels, _ = ndimage.label(light)
    edge = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    bg = np.isin(labels, list(edge))
    rgba = np.dstack([a, np.full((h, w), 255, np.float32)])
    rgba[bg, 3] = 0
    # soft edge: grey pixels touching the background become semi-transparent black
    ring = ndimage.binary_dilation(bg, iterations=2) & ~bg
    lum = a.mean(axis=2)
    grey = ring & (sat < 40) & (lum > 40)
    rgba[grey, :3] = 20
    rgba[grey, 3] = np.clip(1 - (lum[grey] - 22) / (250 - 22), 0, 1) * 255
    # keep only shapes that belong to this card: drop tiny specks and pieces of the neighbouring
    # frames, which poke into the wider window from the sides (their centre lies outside the card)
    solid = rgba[..., 3] > 24
    lab, n = ndimage.label(solid)
    if n:
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        coms = ndimage.center_of_mass(solid, lab, range(1, n + 1))
        for i, (sz, (_, cx)) in enumerate(zip(sizes, coms), 1):
            # a shape belongs to the card whose centre it is closest to (art spills across gaps)
            own = box[0] + PAD + CARD_W / 2
            mine = centres is None or min(centres, key=lambda c: abs(c - (box[0] + cx))) == own
            if sz < 12 or not mine:
                rgba[lab == i, 3] = 0
                continue
            # panel border lines: very thin, tall shapes at the window edge
            ys, xs = np.nonzero(lab == i)
            if xs.max() - xs.min() <= 4 and ys.max() - ys.min() > 30 and (xs.min() <= 2 or xs.max() >= w - 3):
                rgba[lab == i, 3] = 0
                continue
            # frame numbers (grey-blue glyphs near the top), from this card or a neighbour
            ys, xs = np.nonzero(lab == i)
            if ys.max() < 30:
                px = a[ys, xs]
                psat = (px.max(axis=1) - px.min(axis=1)).mean()
                plum = px.mean()
                if psat < 60 and 80 < plum < 200:
                    rgba[lab == i, 3] = 0
    return Image.fromarray(rgba.astype(np.uint8), 'RGBA')


def main():
    img = Image.open(SHEET).convert('RGB')
    prev = img.copy()
    d = ImageDraw.Draw(prev)
    frames = {}
    for name, i, box, centres in card_boxes(img):
        d.rectangle(box, outline=(230, 40, 40), width=1)
        frames.setdefault(name, []).append(cut(img, box, centres))
    prev.save(os.path.join(HERE, 'frames-preview.png'))

    sizes = {}
    for name, fs in frames.items():
        # one shared box per animation keeps the frames registered
        boxes = [f.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox() for f in fs]
        boxes = [b for b in boxes if b]
        l = max(0, min(b[0] for b in boxes) - 2); t = max(0, min(b[1] for b in boxes) - 2)
        r = min(CARD_W + 2 * PAD, max(b[2] for b in boxes) + 2); b_ = min(CARD_H, max(b[3] for b in boxes) + 2)
        os.makedirs(os.path.join(OUT, name), exist_ok=True)
        for i, f in enumerate(fs, 1):
            f = f.crop((l, t, r, b_))
            f.resize((f.width * 2, f.height * 2), Image.LANCZOS).save(os.path.join(OUT, name, f'{i:02d}.png'))
        sizes[name] = (r - l, b_ - t)
        print(f'{name:11s} {r - l}x{b_ - t}')
    return sizes


if __name__ == '__main__':
    main()
