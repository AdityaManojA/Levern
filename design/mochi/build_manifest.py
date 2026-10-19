"""Write the animation list in design/prototype/mochi.js from the cut frames in design/mochi/frames/.

Every animation is placed by Mochi's body, never by its frame box, so switching between animations
and stepping through frames never jumps:
  axs      the centre line of his body on every frame. The prototype puts that line on his position,
           so the body holds still even where the cards on the sheet were cut a few px apart (the art
           and the cutter's card edges are not perfectly regular: blink alone wandered 16px).
  gy, gy2  the line his feet stand on, on the first and last frame. One-shot animations slide from one
           to the other (sitting down sinks 4px); loops keep gy.
The body line is measured on the cat himself (the largest shape), so props, tears and marks never move it.
Walk cycles are registered too: their 4px sway read as a shuffle while he moves.

Size: one scale per sheet (the artist kept each sheet consistent), normalised so the sitting cat is
SIT_PX tall on every sheet. Per-animation sizing made the walk chain shrink and grow, so it is not used.
  python build_manifest.py
"""
import json
import os
import re

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
FRAMES = os.path.join(HERE, 'frames')
TARGET = os.path.join(HERE, '..', 'prototype', 'mochi.js')
SIT_PX = 64

SHEET1 = {'blink', 'twitch', 'lookaround', 'track', 'melt', 'boop', 'squish', 'pickup', 'celebrate', 'grumpy'}
HOVER = {'look-lr', 'look-rl', 'eyes-lr', 'eyes-rl', 'tilt'}
SHEET3 = {'yawn', 'loaf', 'pounce', 'cursor-chase', 'bonk', 'sprint', 'balance', 'cry', 'suspicious', 'stomp',
          'notify', 'button', 'wipe'}
# a sitting reference per sheet, used for the sheet's scale
REFERENCE = {'sheet1': 'blink', 'sheet2': 'breathe', 'hover': 'eyes-lr', 'sheet3': 'yawn'}
# the frame he is "at home" on: the hover strips are entered on their middle (looking straight ahead)
HOME = {'eyes-lr': 5, 'eyes-rl': 6, 'look-lr': 5, 'look-rl': 6}
# loops keep one feet line (sliding it would make them creep)
FIXED = {'walk', 'stormoff', 'breathe', 'helper-idle', 'sulk', 'ptr-hang', 'chase', 'boxpop', 'ptr-stretch',
         'toast-celebrate', 'toast-grumpy'} | HOVER - {'tilt'}
# not registered frame by frame: the little loops drawn outside Mochi (loading, toasts, pull to refresh)
NO_REGISTER = {'chase', 'boxpop', 'ptr-stretch', 'ptr-hang', 'ptr-snap',
               'toast-celebrate', 'toast-grumpy'}
# the post he balances on is part of the art: his feet line is the bottom of the post
GROUND_ALL = {'balance', 'button'}
FACE = {'walk': 'R', 'sitdown': 'R', 'standup': 'R', 'hop': 'R', 'stormoff': 'R', 'chase': 'R',
        'pounce': 'R', 'cursor-chase': 'R', 'sprint': 'R', 'wipe': 'R'}


def alpha(path):
    return np.asarray(Image.open(path).getchannel('A')) > 24


def cat_mask(mask):
    lab, n = ndimage.label(mask)
    if n < 2:
        return mask
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    return lab == int(np.argmax(sizes)) + 1


def box(mask):
    ys, xs = np.nonzero(mask)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def anchor(mask, ground_all=False):
    """Torso centre (x) and feet line (y) in the image's own pixels, measured on the cat himself."""
    cat = cat_mask(mask)
    l, t, r, b = box(cat)
    h = b - t
    # per row, the centre of the widest solid run is the body's cross-section (the tail is a thinner,
    # separate run); the median over the torso rows is the body's centre line
    centres = []
    for row in cat[t + int(h * 0.45):t + int(h * 0.8), :]:
        xs = np.nonzero(row)[0]
        if not len(xs):
            continue
        runs = np.split(xs, np.nonzero(np.diff(xs) > 1)[0] + 1)
        run = max(runs, key=len)
        centres.append((run[0] + run[-1]) / 2)
    ax = float(np.median(centres)) if centres else (l + r) / 2
    gy = box(mask)[3] if ground_all else b
    return float(ax), float(gy)


def meta_of(name):
    p = os.path.join(FRAMES, name, 'meta.json')
    return json.load(open(p)) if os.path.exists(p) else {}


def sheet_of(name):
    if meta_of(name).get('sheet') == 'grid':
        return 'grid'
    if name in SHEET1:
        return 'sheet1'
    if name in HOVER:
        return 'hover'
    if name in SHEET3:
        return 'sheet3'
    return 'sheet2'


def files_of(name):
    d = os.path.join(FRAMES, name)
    return [os.path.join(d, f) for f in sorted(os.listdir(d)) if f.endswith('.png')]


def sit_height(path):
    l, t, r, b = box(cat_mask(alpha(path)))
    return b - t


def main():
    sheet_k = {s: SIT_PX / sit_height(files_of(ref)[0]) for s, ref in REFERENCE.items()}
    # sheets made from kit/template-8.png are cut by extract_grid.py at a fixed scale (sitting cat = 128px)
    sheet_k['grid'] = SIT_PX / 128
    out = {}
    jitter = {}
    for name in sorted(os.listdir(FRAMES)):
        if not os.path.isdir(os.path.join(FRAMES, name)):
            continue
        files = files_of(name)
        k = sheet_k[sheet_of(name)]
        w, h = Image.open(files[0]).size
        ga = name in GROUND_ALL
        anchors = [anchor(alpha(f), ga) for f in files]
        hx, hy = anchors[HOME.get(name, 1) - 1]
        a = {'w': round(w * k, 1), 'h': round(h * k, 1), 'frames': len(files),
             'face': meta_of(name).get('face') or FACE.get(name, 'L' if name in SHEET1 else 'C'),
             'ax': round(hx * k, 1), 'gy': round(hy * k, 1)}
        if name not in NO_REGISTER:
            a['axs'] = [round(x * k, 1) for x, _ in anchors]
            jitter[name] = round(max(x for x, _ in anchors) * k - min(x for x, _ in anchors) * k, 1)
        if name not in FIXED and len(files) > 1:
            a['gy2'] = round(anchors[-1][1] * k, 1)
            a['gy'] = round(anchors[0][1] * k, 1)
        out[name] = a
    s = open(TARGET, encoding='utf-8').read()
    start = s.index('  const ANIMS = ') + len('  const ANIMS = ')
    end = s.index(';\n  for (const [name, a] of Object.entries(ANIMS))')
    body = json.dumps(out, indent=2)
    # keep each per-frame list on one line
    body = re.sub(r'\[\s*([-\d.,\s]+?)\s*\]', lambda m: '[' + ', '.join(v.strip() for v in m.group(1).split(',')) + ']', body)
    s = s[:start] + body.replace('\n', '\n  ') + s[end:]
    open(TARGET, 'w', encoding='utf-8').write(s)
    print('sheet scale', {k: round(float(v), 3) for k, v in sheet_k.items()})
    print('body wander removed per animation (display px):', jitter)


if __name__ == '__main__':
    main()
