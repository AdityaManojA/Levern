"""Cut Mochi's poses and parts out of the character sheet (design/mochi design.png).

Each crop box is a region of the sheet. The light background connected to the crop edge is removed
(so the white eyes and leg lines inside the silhouette stay white), edges are anti-aliased against
transparency, and the result is trimmed and saved as a transparent PNG in design/mochi/png/.

  python extract.py            -> writes the PNGs and boxes-preview.png
  python extract.py --boxes    -> only draws the crop boxes on the sheet (for checking)
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SHEET = os.path.join(HERE, '..', 'mochi design.png')
OUT = os.path.join(HERE, 'png')

# name: (left, top, right, bottom) on the 1536 x 1024 sheet
BOXES = {
    # main poses
    'sit':        (20, 104, 165, 282),
    'sitside':    (170, 104, 272, 282),
    'stand':      (286, 108, 470, 282),
    'walk':       (450, 126, 600, 282),
    'lookup':     (620, 106, 726, 282),
    'lookback':   (748, 106, 878, 282),
    # idle & ambient
    'blink':      (40, 428, 160, 588),
    'twitch':     (166, 426, 284, 588),
    'lookaround': (286, 426, 382, 588),
    'track':      (404, 422, 522, 588),
    'melt':       (522, 450, 680, 588),
    # touch interactions
    'boop':       (722, 436, 862, 588),
    'squish':     (858, 480, 1002, 584),
    'pickup':     (1036, 404, 1152, 588),
    # functional feedback
    'celebrate':  (1192, 422, 1364, 586),
    'grumpy':     (1386, 422, 1500, 586),
    # UI integration examples (Mochi only, cut from the phone mockups)
    'stretch':    (104, 762, 236, 926),
    'chase':      (418, 786, 560, 892),
    'box':        (712, 784, 840, 924),
    'helper':     (1116, 834, 1187, 924),
    'toast-success': (1278, 782, 1338, 852),
    'toast-error':   (1272, 880, 1338, 950),
    # separate assets for rigging
    'part-head':        (930, 70, 1048, 180),
    'part-eyes-1':      (1078, 76, 1152, 114),
    'part-eyes-2':      (1166, 76, 1244, 114),
    'part-eyes-3':      (1078, 128, 1152, 168),
    'part-eyes-closed': (1166, 128, 1244, 168),
    'part-ears':        (1280, 70, 1400, 158),
    'part-tail':        (1402, 80, 1510, 264),
    'part-front-legs':  (940, 220, 1030, 292),
    'part-back-legs':   (1074, 220, 1226, 292),
    'part-paw':         (1248, 222, 1314, 284),
}

# neighbouring art that pokes into a box, erased before cutting (sheet coordinates)
ERASE = {
    'stand': [(448, 150, 470, 282)],   # tip of the walking cat's tail
    'walk': [(450, 126, 474, 158)],    # tip of the standing cat's tail
    'helper': [(1116, 834, 1152, 874)],  # the speech bubble
}
# light-grey phone details (the notch) to drop, keeping only the dark cat inside these bands
ERASE_GREY = {
    'stretch': [(104, 756, 236, 776)],
}


def is_light(a):
    # background panels, cards and shadows are all light and low in colour (every channel > 200)
    return (a[..., 0] > 200) & (a[..., 1] > 200) & (a[..., 2] > 200)


def cut(img, box, erase=(), grey=()):
    a = np.asarray(img.crop(box)).astype(np.float32)
    for l, t, r, b in grey:
        band = a[max(0, t - box[1]):max(0, b - box[1]), max(0, l - box[0]):max(0, r - box[0])]
        band[band.min(axis=2) > 90] = 248
    for l, t, r, b in erase:
        a[max(0, t - box[1]):max(0, b - box[1]), max(0, l - box[0]):max(0, r - box[0])] = 248
    h, w = a.shape[:2]
    light = is_light(a)
    labels, _ = ndimage.label(light)
    edge = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    bg = np.isin(labels, list(edge))

    # estimate the local background colour for anti-aliasing
    bg_col = a[bg].mean(axis=0) if bg.any() else np.array([245, 245, 245], np.float32)
    bg_lum = float(bg_col.mean())

    rgba = np.zeros((h, w, 4), np.float32)
    rgba[..., :3] = a
    rgba[..., 3] = 255
    rgba[bg, 3] = 0

    # soften the edge: grey pixels touching the background become semi-transparent black
    ring = ndimage.binary_dilation(bg, iterations=2) & ~bg
    lum = a.mean(axis=2)
    sat = a.max(axis=2) - a.min(axis=2)
    grey_edge = ring & (sat < 40) & (lum > 40)
    alpha = np.clip(1 - (lum - 22) / max(bg_lum - 22, 1), 0, 1)
    rgba[grey_edge, 0:3] = 20
    rgba[grey_edge, 3] = alpha[grey_edge] * 255

    # drop specks left over from neighbouring art (tiny islands of colour)
    solid = rgba[..., 3] > 24
    lab, n = ndimage.label(solid)
    if n:
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        for i, sz in enumerate(sizes, 1):
            if sz < 25:
                rgba[lab == i, 3] = 0

    out = Image.fromarray(rgba.astype(np.uint8), 'RGBA')
    bbox = out.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    if bbox:
        l, t, r, b = bbox
        out = out.crop((max(0, l - 2), max(0, t - 2), min(w, r + 2), min(h, b + 2)))
    return out


def main():
    img = Image.open(SHEET).convert('RGB')
    prev = img.copy()
    d = ImageDraw.Draw(prev)
    for name, box in BOXES.items():
        d.rectangle(box, outline=(230, 40, 40), width=2)
        d.text((box[0] + 3, box[1] + 2), name, fill=(230, 40, 40))
    prev.save(os.path.join(HERE, 'boxes-preview.png'))
    if '--boxes' in sys.argv:
        return
    os.makedirs(OUT, exist_ok=True)
    for name, box in BOXES.items():
        im = cut(img, box, ERASE.get(name, ()), ERASE_GREY.get(name, ()))
        # 2x so the art stays crisp on high-density screens
        im2 = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
        im2.save(os.path.join(OUT, f'{name}.png'))
        print(f'{name:18s} {im.width}x{im.height}')


if __name__ == '__main__':
    main()
