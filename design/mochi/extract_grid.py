"""Cut a sheet made with kit/template-8.png (a 4 x 2 grid, one animation per sheet) into frames.

  python extract_grid.py "<sheet.png>" <name> [--frames N] [--face L|R|C] [--append] [--skip-first]

Cells are found from the grid itself (the emptiest columns and rows near the expected cell edges), so a
sheet that comes back slightly off-grid still cuts cleanly. In every cell the white background and the
green guide lines are removed, and the cat plus any small effects drawn near him (tears, hearts, Zzz) are
kept. Every frame is stored at the same scale (a 300px sitting cat in a 512px-tall cell becomes 128px),
so all sheets made from the template share one size. --append adds the frames after existing ones (for
animations longer than 8 frames: make a second sheet whose first cell repeats the last frame).
Then run build_manifest.py, and jitter_report.py <name> to check the result.
"""
import argparse
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'frames')
COLS, ROWS = 4, 2
CELL_H = 512          # template cell height
SIT_H = 300           # sitting cat height in the template
STORE_SIT = 128       # stored sitting height (2x the 64px display size)


def masks(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = a.mean(axis=2)
    sat = a.max(axis=2) - a.min(axis=2)
    guide = (g - r > 35) & (g - b > 35)                       # green guides: Mochi never uses green
    paper = ((lum > 228) & (sat < 26)) | guide | ((sat < 10) & (lum > 195))   # white, guides, grey cell borders
    return paper, guide


def split(ink, n, axis):
    """Positions of the n-1 cuts: the emptiest line within +-8% of each expected cell edge."""
    prof = ink.sum(axis=axis).astype(float)
    size = len(prof)
    cuts = [0]
    for k in range(1, n):
        e = round(size * k / n)
        w = max(4, round(size * 0.08))
        lo, hi = max(1, e - w), min(size - 1, e + w)
        win = prof[lo:hi]
        best = np.nonzero(win == win.min())[0]
        cuts.append(lo + int(best[np.argmin(np.abs(best + lo - e))]))
    cuts.append(size)
    return cuts


def cut_cell(cell, paper, guide):
    h, w = paper.shape
    lab, _ = ndimage.label(paper)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge)) | guide
    rgba = np.dstack([cell, np.full((h, w), 255)]).astype(np.float32)
    rgba[bg, 3] = 0
    # soft edge: light pixels next to the background become partly transparent dark ink
    ring = ndimage.binary_dilation(bg, iterations=2) & ~bg
    lum = cell.mean(axis=2)
    sat = cell.max(axis=2) - cell.min(axis=2)
    grey = ring & (sat < 40) & (lum > 40)
    rgba[grey, :3] = 20
    rgba[grey, 3] = np.clip(1 - (lum[grey] - 22) / (250 - 22), 0, 1) * 255
    solid = rgba[..., 3] > 24
    lab, n = ndimage.label(solid)
    if not n:
        return None
    sizes = ndimage.sum(solid, lab, range(1, n + 1))
    cat = int(np.argmax(sizes)) + 1
    ys, xs = np.nonzero(lab == cat)
    l, t, r, b = xs.min() - 60, ys.min() - 80, xs.max() + 60, ys.max() + 30
    for i in range(1, n + 1):
        if i == cat:
            continue
        iy, ix = np.nonzero(lab == i)
        near = l <= ix.mean() <= r and t <= iy.mean() <= b
        if sizes[i - 1] < 12 or not near:                     # specks, and marks that belong to a neighbour
            rgba[lab == i, 3] = 0
    # long thin straight lines are grid borders or guides the background pass missed (never part of Mochi)
    lab, n = ndimage.label(rgba[..., 3] > 24)
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        hh, ww = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if (ww <= 6 and hh > h * 0.25) or (hh <= 6 and ww > w * 0.25):
            rgba[lab == i, 3] = 0
    # the same lines where they touch his paws or tail: thin rows/columns that run the full cell
    a = rgba[..., 3] > 24
    for x in range(w):
        if a[:, x].sum() > h * 0.6:
            rgba[:, x, 3] = 0
    for y in range(h):
        run = a[y]
        if run.sum() > w * 0.6 and (a[max(0, y - 3)].sum() < w * 0.3 or a[min(h - 1, y + 3)].sum() < w * 0.3):
            rgba[y, :, 3] = 0
    return Image.fromarray(rgba.astype(np.uint8), 'RGBA')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sheet')
    ap.add_argument('name')
    ap.add_argument('--frames', type=int, default=0, help='how many cells to use (default: every cell with a drawing)')
    ap.add_argument('--face', default='C', choices='LRC', help='which way side-on art faces (walks: R)')
    ap.add_argument('--append', action='store_true')
    ap.add_argument('--skip-first', action='store_true', help='cell 1 is only the size reference (walk and run sheets)')
    args = ap.parse_args()

    a = np.asarray(Image.open(args.sheet).convert('RGB')).astype(np.int16)
    paper, guide = masks(a)
    ink = ~paper
    xs, ys = split(ink, COLS, 0), split(ink, ROWS, 1)
    k = STORE_SIT / SIT_H * CELL_H / (a.shape[0] / ROWS)       # same scale whatever size the sheet comes back
    cw, ch = a.shape[1] / COLS, a.shape[0] / ROWS
    frames = []
    for r in range(ROWS):
        for c in range(COLS):
            # cut inside the detected cell (so nothing from a neighbour comes along), but place the result
            # in a canvas at the template's own cell position: every frame of every sheet then shares one
            # coordinate system, with the ground line at the same height
            y0, y1, x0, x1 = ys[r] + 3, ys[r + 1] - 3, xs[c] + 3, xs[c + 1] - 3
            f = cut_cell(a[y0:y1, x0:x1].astype(np.uint8), paper[y0:y1, x0:x1], guide[y0:y1, x0:x1])
            if f is None or (np.asarray(f.getchannel('A')) > 24).sum() < 400:
                continue
            canvas = Image.new('RGBA', (round(cw), round(ch)), (0, 0, 0, 0))
            canvas.alpha_composite(f, (round(x0 - c * cw), round(y0 - r * ch)))
            frames.append(canvas)
    if args.skip_first:
        frames = frames[1:]
    if args.frames:
        frames = frames[:args.frames]
    d = os.path.join(OUT, args.name)
    os.makedirs(d, exist_ok=True)
    start = 0
    if args.append:
        start = len([f for f in os.listdir(d) if f.endswith('.png')])
        frames = frames[1:]                                    # cell 1 repeats the last frame of the first sheet
    else:
        for old in os.listdir(d):
            os.remove(os.path.join(d, old))
    # one fixed box for every grid sheet (the whole cell minus a little sky), so sizes always match
    box = (0, round(ch * 0.06), round(cw), round(ch * 0.97))
    for i, f in enumerate(frames, start + 1):
        c = f.crop(box)
        c.resize((round(c.width * k), round(c.height * k)), Image.LANCZOS).save(os.path.join(d, f'{i:02d}.png'))
    json.dump({'sheet': 'grid', 'face': args.face, 'source': os.path.basename(args.sheet)}, open(os.path.join(d, 'meta.json'), 'w'))
    print(f'{args.name}: {len(frames)} frames from {args.sheet} (cells at x {xs}, y {ys})')


if __name__ == '__main__':
    main()
