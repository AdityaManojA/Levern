"""Grade animations for jitter before they go into the prototype.

  python jitter_report.py [name ...]        (no names: every animation)
  python jitter_report.py --rest breathe    (the resting animation to compare hand-offs against)

For each animation, at display size, with every frame lined up on its body centre line and feet:
  hold   how much of his lower body (haunches and paws) stays the same from one frame to the next.
         When the art is redrawn every frame the outline "boils"; a sitting animation should hold 0.90+.
  start  overlap of frame 1 with the resting pose, and
  end    overlap of the last frame with the resting pose. Low values pop at the hand-off even with the
         crossfade; 0.85+ is a clean hand-off. Only meaningful for animations that start or end sitting.
  wander how far his body moved inside the cut frames (px). The prototype cancels this frame by frame;
         a big number means the art did not keep him on the centre line.
  size   frame 1 height compared with the resting pose (%).
Reads the sizes and scales from design/prototype/mochi.js, so run build_manifest.py first.
"""
import json
import os
import re
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
FRAMES = os.path.join(HERE, 'frames')
MANIFEST = os.path.join(HERE, '..', 'prototype', 'mochi.js')
UP = 4                                  # measure at 4x display size
SITTING = {'breathe', 'blink', 'twitch', 'lookaround', 'track', 'boop', 'grumpy', 'yawn', 'suspicious', 'bonk',
           'cry', 'stomp', 'tilt', 'eyes-lr', 'eyes-rl', 'look-lr', 'look-rl', 'helper-idle', 'celebrate', 'squish'}
# sitting animations whose legs should not move at all: these get the "boils" check
STILL_LEGS = {'breathe', 'blink', 'twitch', 'lookaround', 'track', 'boop', 'suspicious', 'tilt', 'eyes-lr', 'eyes-rl',
              'look-lr', 'look-rl', 'helper-idle', 'grumpy'}


def load_anims():
    s = open(MANIFEST, encoding='utf-8').read()
    return json.loads(re.search(r'const ANIMS = (\{.*?\n  \});', s, re.S).group(1))


def silhouette(path, a):
    im = Image.open(path).convert('RGBA')
    im = im.resize((round(a['w'] * UP), round(a['h'] * UP)), Image.LANCZOS)
    m = np.asarray(im.getchannel('A')) > 100
    lab, n = ndimage.label(m)
    if n > 1:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        m = lab == int(np.argmax(sizes)) + 1
    ys, xs = np.nonzero(m)
    t, b = ys.min(), ys.max() + 1
    centres = []
    for row in m[t + int((b - t) * 0.45):t + int((b - t) * 0.8)]:
        x = np.nonzero(row)[0]
        if len(x):
            runs = np.split(x, np.nonzero(np.diff(x) > 1)[0] + 1)
            r = max(runs, key=len)
            centres.append((r[0] + r[-1]) / 2)
    return m, float(np.median(centres)), b, b - t


def aligned(sil, size=(160 * UP, 120 * UP)):
    """Place a silhouette on a common canvas: body line at the centre, feet on the bottom line."""
    m, cx, feet, _ = sil
    H, W = size
    out = np.zeros(size, bool)
    dy, dx = H - 10 * UP - feet, W // 2 - round(cx)
    ys, xs = np.nonzero(m)
    ys, xs = ys + dy, xs + dx
    ok = (ys >= 0) & (ys < H) & (xs >= 0) & (xs < W)
    out[ys[ok], xs[ok]] = True
    return out


def iou(p, q, lower=False):
    if lower:                           # only the bottom 40% of the cat: haunches and paws
        rows = np.nonzero((p | q).any(axis=1))[0]
        cut = rows.max() - int((rows.max() - rows.min()) * 0.4)
        p, q = p[cut:], q[cut:]
    u = (p | q).sum()
    return (p & q).sum() / u if u else 1.0


def frames_of(name):
    d = os.path.join(FRAMES, name)
    return [os.path.join(d, f) for f in sorted(os.listdir(d)) if f.endswith('.png')]


def main():
    argv = sys.argv[1:]
    rest = 'breathe'
    if '--rest' in argv:
        i = argv.index('--rest'); rest = argv[i + 1]; argv = argv[:i] + argv[i + 2:]
    A = load_anims()
    names = argv or sorted(A)
    rest_sil = silhouette(frames_of(rest)[0], A[rest])
    rest_al = aligned(rest_sil)
    print(f'compared with the resting pose: {rest} frame 1\n')
    print(f'{"animation":16s} {"hold":>5s} {"start":>6s} {"end":>5s} {"wander":>7s} {"size":>6s}   notes')
    for n in names:
        if n not in A:
            print(f'{n:16s} not in the manifest'); continue
        a = A[n]
        sils = [silhouette(f, a) for f in frames_of(n)]
        al = [aligned(s) for s in sils]
        hold = min(iou(al[i], al[i + 1], lower=True) for i in range(len(al) - 1)) if len(al) > 1 else 1
        start, end = iou(al[0], rest_al), iou(al[-1], rest_al)
        wander = (max(s[1] for s in sils) - min(s[1] for s in sils)) / UP
        size = 100 * (sils[0][3] / rest_sil[3] - 1)
        notes = []
        if n in STILL_LEGS and hold < 0.9:
            notes.append('outline boils')
        if n in SITTING and start < 0.85:
            notes.append('pops at start')
        if n in SITTING and end < 0.85:
            notes.append('pops at end')
        if n in SITTING and abs(size) > 6:
            notes.append('size differs')
        print(f'{n:16s} {hold:5.2f} {start:6.2f} {end:5.2f} {wander:6.1f}px {size:+5.0f}%   {", ".join(notes)}')


if __name__ == '__main__':
    main()
