"""Make the files you attach to ChatGPT when asking for new Mochi frames.

  template-8.png  1536x1024, a 4 x 2 grid of 384 x 512 cells. Each cell has a green ground line (where his
                  feet go) and a green centre line (where the middle of his body goes). Cell 1 already
                  holds the master pose, at the size every frame must use. ChatGPT draws frames 2-8 into
                  the same grid, so every frame comes back on the same axis, scale and ground line.
  master.png      the master sitting pose on its own, large, on white (the character reference).

The green guides are a colour Mochi never uses, so extract_grid.py can wipe them out of the result.
  python make_kit.py
"""
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'png', 'sit.png')      # cut from design/mochi design.png by extract.py

W, H, COLS, ROWS = 1536, 1024, 4, 2
CW, CH = W // COLS, H // ROWS
BASE_Y = 470          # ground line inside a cell
SIT_H = 300           # the sitting cat is this tall (ear tips to paws)
GUIDE = (120, 220, 120)
BORDER = (215, 215, 215)


def cat_only(im):
    a = np.asarray(im.getchannel('A')) > 24
    lab, n = ndimage.label(a)
    sizes = ndimage.sum(a, lab, range(1, n + 1))
    return lab == int(np.argmax(sizes)) + 1


def body_line(mask):
    ys, xs = np.nonzero(mask)
    t, b = ys.min(), ys.max() + 1
    centres = []
    for row in mask[t + int((b - t) * 0.45):t + int((b - t) * 0.8)]:
        x = np.nonzero(row)[0]
        if len(x):
            runs = np.split(x, np.nonzero(np.diff(x) > 1)[0] + 1)
            r = max(runs, key=len)
            centres.append((r[0] + r[-1]) / 2)
    return float(np.median(centres)), t, b


def master():
    im = Image.open(SRC).convert('RGBA')
    m = cat_only(im)
    _, t, b = body_line(m)
    k = SIT_H / (b - t)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    m = cat_only(im)
    cx, t, b = body_line(m)
    return im, cx, b


def main():
    im, cx, feet = master()

    sheet = Image.new('RGB', (W, H), (255, 255, 255))
    d = ImageDraw.Draw(sheet)
    for r in range(ROWS):
        for c in range(COLS):
            x0, y0 = c * CW, r * CH
            d.rectangle((x0, y0, x0 + CW - 1, y0 + CH - 1), outline=BORDER, width=2)
            mid = x0 + CW // 2
            for y in range(y0 + 40, y0 + CH - 20, 14):          # dashed centre line
                d.line((mid, y, mid, y + 7), fill=GUIDE, width=2)
            d.line((x0 + 24, y0 + BASE_Y, x0 + CW - 24, y0 + BASE_Y), fill=GUIDE, width=3)
    # cell 1: the master pose, body on the centre line, paws on the ground line
    px, py = round(CW / 2 - cx), round(BASE_Y - feet)
    sheet.paste(im, (px, py), im)
    sheet.save(os.path.join(HERE, 'template-8.png'))

    ref = Image.new('RGB', (im.width + 160, im.height + 160), (255, 255, 255))
    ref.paste(im, (80, 80), im)
    ref.save(os.path.join(HERE, 'master.png'))
    print('template-8.png', sheet.size, ' master.png', ref.size, f' body line x={CW // 2}, ground y={BASE_Y}, sit height={SIT_H}')


if __name__ == '__main__':
    main()
