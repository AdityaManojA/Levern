// Mochi sprites, cut straight from design/mochi design.png by design/mochi/extract.py.
// Generated; re-run the extractor and this list after changing the sheet.
// Every sprite shares one scale so Mochi is the same size in every pose. face = which way it looks.
(function () {
  const SPRITES = {
    "blink": {
      "w": 41.9,
      "h": 54.5,
      "face": "L"
    },
    "boop": {
      "w": 47.6,
      "h": 51.8,
      "face": "L"
    },
    "box": {
      "w": 45.7,
      "h": 51.8,
      "face": "R"
    },
    "celebrate": {
      "w": 59.8,
      "h": 54.1,
      "face": "C"
    },
    "chase": {
      "w": 48.8,
      "h": 37.3,
      "face": "R"
    },
    "grumpy": {
      "w": 38.5,
      "h": 57.5,
      "face": "R"
    },
    "helper": {
      "w": 25.5,
      "h": 33.1,
      "face": "C"
    },
    "lookaround": {
      "w": 33.9,
      "h": 56.4,
      "face": "L"
    },
    "lookback": {
      "w": 43.0,
      "h": 63.2,
      "face": "R"
    },
    "lookup": {
      "w": 37.3,
      "h": 63.2,
      "face": "C"
    },
    "melt": {
      "w": 56.4,
      "h": 44.6,
      "face": "C"
    },
    "part-back-legs": {
      "w": 52.6,
      "h": 25.1,
      "face": "C"
    },
    "part-ears": {
      "w": 40.8,
      "h": 30.1,
      "face": "C"
    },
    "part-eyes-1": {
      "w": 24.0,
      "h": 11.4,
      "face": "C"
    },
    "part-eyes-2": {
      "w": 24.4,
      "h": 12.2,
      "face": "C"
    },
    "part-eyes-3": {
      "w": 24.0,
      "h": 11.4,
      "face": "C"
    },
    "part-eyes-closed": {
      "w": 24.4,
      "h": 8.4,
      "face": "C"
    },
    "part-front-legs": {
      "w": 29.0,
      "h": 25.1,
      "face": "C"
    },
    "part-head": {
      "w": 42.3,
      "h": 38.5,
      "face": "C"
    },
    "part-paw": {
      "w": 21.3,
      "h": 21.7,
      "face": "C"
    },
    "part-tail": {
      "w": 38.5,
      "h": 67.8,
      "face": "C"
    },
    "pickup": {
      "w": 40.0,
      "h": 64.8,
      "face": "C"
    },
    "sit": {
      "w": 53.7,
      "h": 64.0,
      "face": "L"
    },
    "sitside": {
      "w": 32.0,
      "h": 63.2,
      "face": "L"
    },
    "squish": {
      "w": 53.7,
      "h": 34.3,
      "face": "C"
    },
    "stand": {
      "w": 67.8,
      "h": 61.3,
      "face": "L"
    },
    "stretch": {
      "w": 46.9,
      "h": 62.1,
      "face": "C"
    },
    "toast-error": {
      "w": 22.9,
      "h": 25.1,
      "face": "C"
    },
    "toast-success": {
      "w": 21.7,
      "h": 25.1,
      "face": "C"
    },
    "track": {
      "w": 38.9,
      "h": 58.3,
      "face": "C"
    },
    "twitch": {
      "w": 41.9,
      "h": 54.9,
      "face": "C"
    },
    "walk": {
      "w": 54.5,
      "h": 54.5,
      "face": "R"
    }
  };
  const P = {};
  for (const [name, s] of Object.entries(SPRITES)) {
    P[name] = Object.assign({}, s, {
      src: `../mochi/png/${name}.png`,
      svg: `<img src="../mochi/png/${name}.png" alt="" draggable="false" style="width:100%;height:100%;display:block">`,
    });
  }

  // Frame animations cut from design/mochi animations.webp by design/mochi/extract_frames.py.
  // Every frame of an animation shares one box, so frames stay registered. All animations share
  // one scale: the resting cat (blink frame 1) shows 64px tall.
  const ANIMS = {
    "balance": {
      "w": 53.8,
      "h": 83.5,
      "frames": 12,
      "face": "C",
      "ax": 20.9,
      "gy": 81.6,
      "axs": [20.9, 23.9, 26.9, 28.1, 25.3, 22.5, 20.4, 24.8, 25.3, 26.7, 26.0, 24.3],
      "gy2": 82.1
    },
    "blink": {
      "w": 62.9,
      "h": 68.1,
      "frames": 10,
      "face": "L",
      "ax": 20.5,
      "gy": 67.0,
      "axs": [20.5, 19.2, 33.0, 19.4, 32.4, 21.8, 23.9, 35.0, 33.5, 18.7],
      "gy2": 67.0
    },
    "bonk": {
      "w": 59.4,
      "h": 72.3,
      "frames": 12,
      "face": "C",
      "ax": 26.0,
      "gy": 70.0,
      "axs": [26.0, 23.9, 24.2, 26.3, 36.9, 31.1, 30.5, 30.6, 31.5, 29.0, 28.1, 26.2],
      "gy2": 70.0
    },
    "boop": {
      "w": 62.9,
      "h": 74.7,
      "frames": 10,
      "face": "L",
      "ax": 33.5,
      "gy": 73.2,
      "axs": [33.5, 22.0, 21.6, 20.5, 19.8, 21.3, 34.6, 34.8, 35.1, 33.3],
      "gy2": 73.6
    },
    "boxpop": {
      "w": 58.7,
      "h": 68.5,
      "frames": 8,
      "face": "C",
      "ax": 28.7,
      "gy": 62.8
    },
    "breathe": {
      "w": 53.0,
      "h": 66.9,
      "frames": 6,
      "face": "C",
      "ax": 19.2,
      "gy": 65.2,
      "axs": [19.2, 22.8, 21.0, 22.2, 22.0, 23.0]
    },
    "button": {
      "w": 74.2,
      "h": 64.0,
      "frames": 12,
      "face": "C",
      "ax": 27.4,
      "gy": 60.8,
      "axs": [27.4, 27.1, 30.1, 37.3, 41.4, 37.0, 35.9, 31.1, 26.9, 29.4, 31.2, 42.9],
      "gy2": 60.8
    },
    "celebrate": {
      "w": 62.2,
      "h": 79.9,
      "frames": 10,
      "face": "L",
      "ax": 30.5,
      "gy": 79.9,
      "axs": [30.5, 31.3, 33.1, 23.7, 26.3, 27.7, 34.6, 33.8, 31.6, 30.2],
      "gy2": 79.9
    },
    "chase": {
      "w": 59.5,
      "h": 67.7,
      "frames": 8,
      "face": "R",
      "ax": 22.4,
      "gy": 66.4
    },
    "cry": {
      "w": 61.2,
      "h": 67.7,
      "frames": 12,
      "face": "C",
      "ax": 28.1,
      "gy": 65.9,
      "axs": [28.1, 31.2, 30.4, 28.5, 37.2, 35.2, 34.8, 32.2, 29.6, 28.3, 31.5, 27.8],
      "gy2": 65.4
    },
    "cursor-chase": {
      "w": 62.1,
      "h": 71.4,
      "frames": 12,
      "face": "R",
      "ax": 32.3,
      "gy": 69.1,
      "axs": [32.3, 31.5, 33.4, 29.2, 31.8, 28.3, 34.6, 32.7, 32.3, 32.0, 35.9, 33.6],
      "gy2": 67.2
    },
    "eyes-lr": {
      "w": 39.5,
      "h": 66.1,
      "frames": 10,
      "face": "C",
      "ax": 20.5,
      "gy": 65.3,
      "axs": [18.3, 18.8, 18.4, 20.1, 20.5, 20.1, 20.0, 21.6, 20.7, 20.5]
    },
    "eyes-rl": {
      "w": 38.9,
      "h": 66.7,
      "frames": 10,
      "face": "C",
      "ax": 19.6,
      "gy": 65.6,
      "axs": [18.1, 18.0, 17.2, 20.0, 20.4, 19.6, 19.5, 21.2, 20.3, 20.1]
    },
    "grumpy": {
      "w": 62.2,
      "h": 79.2,
      "frames": 10,
      "face": "L",
      "ax": 33.8,
      "gy": 79.2,
      "axs": [33.8, 32.7, 30.3, 26.8, 30.1, 20.2, 30.7, 31.3, 29.8, 27.9],
      "gy2": 79.2
    },
    "helper-idle": {
      "w": 48.9,
      "h": 54.6,
      "frames": 4,
      "face": "C",
      "ax": 18.8,
      "gy": 52.6,
      "axs": [18.8, 20.6, 18.5, 21.0]
    },
    "hop": {
      "w": 91.3,
      "h": 76.6,
      "frames": 7,
      "face": "R",
      "ax": 57.9,
      "gy": 75.4,
      "axs": [57.9, 38.1, 52.1, 55.6, 55.4, 58.2, 61.4],
      "gy2": 75.0
    },
    "loaf": {
      "w": 62.1,
      "h": 68.6,
      "frames": 12,
      "face": "C",
      "ax": 26.8,
      "gy": 67.2,
      "axs": [26.8, 33.9, 26.2, 29.3, 29.7, 31.2, 31.5, 29.2, 27.6, 24.8, 33.6, 29.2],
      "gy2": 66.3
    },
    "look-lr": {
      "w": 53.9,
      "h": 61.9,
      "frames": 10,
      "face": "C",
      "ax": 28.0,
      "gy": 61.1,
      "axs": [30.2, 30.3, 28.4, 29.7, 28.0, 26.5, 25.9, 26.1, 24.4, 23.6]
    },
    "look-rl": {
      "w": 57.1,
      "h": 65.1,
      "frames": 10,
      "face": "C",
      "ax": 28.3,
      "gy": 64.0,
      "axs": [23.3, 25.7, 24.5, 26.5, 28.5, 28.3, 32.1, 33.5, 31.6, 33.3]
    },
    "lookaround": {
      "w": 64.4,
      "h": 71.8,
      "frames": 10,
      "face": "L",
      "ax": 22.4,
      "gy": 70.7,
      "axs": [22.4, 23.7, 21.6, 22.9, 34.2, 22.0, 36.1, 29.1, 22.6, 18.7],
      "gy2": 70.3
    },
    "melt": {
      "w": 57.7,
      "h": 67.3,
      "frames": 10,
      "face": "L",
      "ax": 26.8,
      "gy": 65.5,
      "axs": [26.8, 24.3, 22.8, 21.4, 23.1, 24.8, 26.2, 27.0, 28.1, 28.3],
      "gy2": 65.8
    },
    "notify": {
      "w": 51.9,
      "h": 85.3,
      "frames": 11,
      "face": "C",
      "ax": 22.3,
      "gy": 83.0,
      "axs": [22.3, 35.9, 32.5, 32.2, 28.8, 31.9, 26.2, 27.6, 24.5, 22.5, 21.6],
      "gy2": 83.0
    },
    "peek-duck": {
      "w": 62.0,
      "h": 35.9,
      "frames": 5,
      "face": "C",
      "ax": 30.0,
      "gy": 31.4,
      "axs": [30.0, 28.6, 41.6, 35.2, 33.2],
      "gy2": 34.2
    },
    "peek-rise": {
      "w": 35.9,
      "h": 39.1,
      "frames": 5,
      "face": "C",
      "ax": 19.8,
      "gy": 36.7,
      "axs": [19.8, 17.1, 18.0, 17.7, 20.0],
      "gy2": 34.6
    },
    "pickup": {
      "w": 54.8,
      "h": 94.0,
      "frames": 10,
      "face": "L",
      "ax": 22.4,
      "gy": 92.9,
      "axs": [22.4, 16.6, 17.2, 16.6, 18.7, 19.7, 23.5, 25.5, 24.0, 22.9],
      "gy2": 91.0
    },
    "pounce": {
      "w": 59.4,
      "h": 71.4,
      "frames": 12,
      "face": "R",
      "ax": 28.5,
      "gy": 68.6,
      "axs": [28.5, 31.3, 30.4, 29.4, 33.5, 35.0, 26.9, 27.1, 30.0, 34.4, 30.3, 28.1],
      "gy2": 69.1
    },
    "ptr-hang": {
      "w": 53.0,
      "h": 89.7,
      "frames": 2,
      "face": "C",
      "ax": 26.9,
      "gy": 88.5
    },
    "ptr-snap": {
      "w": 39.9,
      "h": 73.4,
      "frames": 8,
      "face": "C",
      "ax": 19.2,
      "gy": 72.2,
      "gy2": 71.7
    },
    "ptr-stretch": {
      "w": 41.6,
      "h": 84.0,
      "frames": 6,
      "face": "C",
      "ax": 22.0,
      "gy": 76.2
    },
    "sitdown": {
      "w": 67.7,
      "h": 66.9,
      "frames": 6,
      "face": "R",
      "ax": 31.2,
      "gy": 61.6,
      "axs": [31.2, 31.8, 34.1, 31.1, 34.4, 31.3],
      "gy2": 65.2
    },
    "sprint": {
      "w": 69.6,
      "h": 64.9,
      "frames": 12,
      "face": "R",
      "ax": 31.3,
      "gy": 63.1,
      "axs": [31.3, 32.1, 31.1, 33.9, 30.6, 32.7, 36.4, 41.3, 38.3, 31.2, 32.7, 28.1],
      "gy2": 63.5
    },
    "squish": {
      "w": 56.2,
      "h": 72.5,
      "frames": 10,
      "face": "L",
      "ax": 25.2,
      "gy": 71.4,
      "axs": [25.2, 23.5, 25.9, 27.4, 28.3, 28.1, 28.5, 29.4, 26.6, 21.6],
      "gy2": 70.7
    },
    "standup": {
      "w": 64.4,
      "h": 64.4,
      "frames": 6,
      "face": "R",
      "ax": 32.9,
      "gy": 62.8,
      "axs": [32.9, 28.7, 31.8, 30.4, 28.8, 28.1],
      "gy2": 62.4
    },
    "stomp": {
      "w": 64.9,
      "h": 79.8,
      "frames": 12,
      "face": "C",
      "ax": 29.7,
      "gy": 78.4,
      "axs": [29.7, 29.4, 28.3, 26.6, 21.2, 25.3, 24.3, 28.3, 32.2, 33.2, 32.5, 30.4],
      "gy2": 78.4
    },
    "stormoff": {
      "w": 59.5,
      "h": 66.9,
      "frames": 8,
      "face": "R",
      "ax": 29.4,
      "gy": 62.0,
      "axs": [29.4, 27.9, 29.1, 30.0, 30.6, 28.9, 30.8, 31.4]
    },
    "sulk": {
      "w": 47.3,
      "h": 65.2,
      "frames": 6,
      "face": "C",
      "ax": 19.6,
      "gy": 57.5,
      "axs": [19.6, 23.4, 24.9, 22.0, 22.2, 24.7]
    },
    "suspicious": {
      "w": 53.8,
      "h": 85.3,
      "frames": 12,
      "face": "C",
      "ax": 22.3,
      "gy": 83.0,
      "axs": [22.3, 26.7, 28.3, 28.8, 29.6, 31.3, 29.0, 29.0, 29.4, 29.0, 27.1, 19.2],
      "gy2": 83.9
    },
    "tilt": {
      "w": 54.9,
      "h": 66.7,
      "frames": 10,
      "face": "C",
      "ax": 26.4,
      "gy": 65.9,
      "axs": [26.4, 25.5, 27.1, 29.5, 28.7, 25.2, 24.7, 24.7, 27.2, 26.3],
      "gy2": 65.9
    },
    "toast-celebrate": {
      "w": 75.8,
      "h": 75.8,
      "frames": 6,
      "face": "C",
      "ax": 32.5,
      "gy": 73.8
    },
    "toast-grumpy": {
      "w": 70.9,
      "h": 73.4,
      "frames": 6,
      "face": "C",
      "ax": 28.6,
      "gy": 71.3
    },
    "track": {
      "w": 62.9,
      "h": 74.7,
      "frames": 10,
      "face": "L",
      "ax": 33.1,
      "gy": 70.3,
      "axs": [33.1, 31.2, 31.6, 30.2, 31.4, 19.6, 19.8, 20.5, 27.0, 30.5],
      "gy2": 71.0
    },
    "turn": {
      "w": 57.9,
      "h": 65.2,
      "frames": 6,
      "face": "C",
      "ax": 35.3,
      "gy": 62.4,
      "axs": [35.3, 33.8, 33.2, 21.6, 22.7, 26.9],
      "gy2": 64.0
    },
    "turnback": {
      "w": 62.0,
      "h": 66.0,
      "frames": 6,
      "face": "C",
      "ax": 27.5,
      "gy": 63.2,
      "axs": [27.5, 32.1, 31.8, 32.2, 31.4, 29.1],
      "gy2": 62.4
    },
    "twitch": {
      "w": 62.2,
      "h": 76.2,
      "frames": 10,
      "face": "L",
      "ax": 30.2,
      "gy": 75.1,
      "axs": [30.2, 17.6, 18.9, 18.3, 31.3, 30.9, 32.6, 30.2, 29.8, 28.4],
      "gy2": 75.1
    },
    "walk": {
      "w": 66.0,
      "h": 61.1,
      "frames": 8,
      "face": "R",
      "ax": 30.0,
      "gy": 58.3,
      "axs": [30.0, 31.1, 32.0, 33.2, 32.4, 34.0, 32.4, 32.4]
    },
    "wipe": {
      "w": 109.4,
      "h": 55.7,
      "frames": 14,
      "face": "R",
      "ax": 32.5,
      "gy": 53.8,
      "axs": [32.5, 35.0, 32.0, 34.8, 53.6, 53.2, 50.3, 54.5, 49.3, 71.0, 58.2, 63.1, 64.5, 49.2],
      "gy2": 53.8
    },
    "yawn": {
      "w": 58.4,
      "h": 72.3,
      "frames": 12,
      "face": "C",
      "ax": 20.6,
      "gy": 71.0,
      "axs": [20.6, 24.3, 25.3, 26.4, 26.2, 28.3, 25.3, 24.8, 22.5, 21.8, 24.3, 23.8],
      "gy2": 71.0
    }
  };
  for (const [name, a] of Object.entries(ANIMS)) {
    a.src = i => `../mochi/frames/${name}/${String(i).padStart(2, '0')}.png`;
    a.face = a.face || 'L';
  }
  // resting pose = first frame of the blink loop, so every animation starts and ends on it
  P.idle = Object.assign({}, ANIMS.blink, { face: 'L', src: ANIMS.blink.src(1) });
  P.idle.svg = `<img src="${P.idle.src}" alt="" draggable="false" style="width:100%;height:100%;display:block">`;
  const root = typeof window !== 'undefined' ? window : globalThis;
  root.MOCHI = P;
  root.MOCHI_ANIMS = ANIMS;
  if (typeof module !== 'undefined') module.exports = P;
})();
