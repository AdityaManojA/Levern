# Sound credits

All files are short mono MP3s (96 kbps), made by `scripts/build-sounds.py` from the sources in `assets/sounds-src/`. Files with `-1`/`-2`/`-3` endings are slightly different versions of the same sound (pitch and filter) so repeats don't sound identical. The app adds a small random pitch and volume change on top.

| File(s) | Used for | Source | Author | Licence |
|---|---|---|---|---|
| `tap-1..3.mp3` | Buttons, toggles, chips, filters | "simple click.wav" from `design/sounds/new sounds` | Supplied by the project owner (original source not recorded) | **Confirm before publishing**: the project owner should check where it came from and that its licence allows use in an app |
| `tab-1..2.mp3` | Switching screens from the nav bar | "changing tabs.wav" from `design/sounds/new sounds` | Supplied by the project owner (original source not recorded) | **Confirm before publishing**, as above |
| `tick-1..3.mp3` | Ticking a quest off | `inbounds/keyclick.mp3`, the project owner's own key-click recording | Project owner | Own recording |
| `coin.mp3` | Daily target hit, focus session done, tour finished | `design/sounds/make_sounds.py` (synthesised for this project) | TaskFlow | Part of TaskFlow |
| `meow-sweet-1..2.mp3` | Mochi says hello (coming back to Home), end of the tour | "Sweet kitty meow" (Mixkit #93), https://mixkit.co/free-sound-effects/cat/ | Mixkit | [Mixkit Sound Effects Free License](https://mixkit.co/license/#sfxFree): free for commercial and personal projects, including apps; the files may not be redistributed on their own |
| `meow-hey-1..2.mp3` | Mochi holds up a reminder; surprised or confused taps; double tap | "Little cat attention meow" (Mixkit #86), https://mixkit.co/free-sound-effects/cat/ | Mixkit | Mixkit Sound Effects Free License (as above) |
| `meow-grumpy-1..2.mp3` | Mochi annoyed (tapped past his patience), errors such as saving a quest with no name | "Angry cartoon kitty meow" (Mixkit #94), https://mixkit.co/free-sound-effects/cat/ | Mixkit | Mixkit Sound Effects Free License (as above) |
| `mrrp-1..3.mp3` | Mochi's signature "mrrp!": boops and other happy taps, heart eyes (long press), being picked up | Synthesised in `scripts/build-sounds.py` (voiced chirp with a rolled "rr") | TaskFlow | Part of TaskFlow |
| `step-1..3.mp3` | Soft paw steps, only on purposeful walks (heading to the edge when roaming is off, zoomies), at most 6–8 per walk | Synthesised in `scripts/build-sounds.py` | TaskFlow | Part of TaskFlow |
| `land.mp3` | Mochi landing after you drop him | Synthesised in `scripts/build-sounds.py` | TaskFlow | Part of TaskFlow |
| `chime-1..2.mp3` | A reminder goes off | Synthesised in `scripts/build-sounds.py` | TaskFlow | Part of TaskFlow |

**Deliberately silent:** blinking, breathing, eye and head movements, idle animations, and random wandering.

No sounds were downloaded from Kenney, Freesound or ZapSplat. The Mixkit meows came with the project. Anything new from those sites should be added to this table with its URL and licence. Kenney and Freesound CC0 sounds are free to bundle. ZapSplat's standard licence needs checking before bundling in an app.
