"""Builds TaskFlow's sound set into app/sounds/ (short mono MP3s, 2-3 versions of anything that repeats).

  python scripts/build-sounds.py [path/to/"new sounds" folder]

Sources:
  - design/sounds/new sounds (the user's picks: two UI clips and three Mixkit meows), copied read-only to
    assets/sounds-src/ so the build can be re-run from the repo
  - the user's own key-click recording and the coin chime already in the app
  - everything else is synthesised here (Mochi's "mrrp" chirps, soft paw steps, a landing pat, the reminder chime)
Licences: app/sounds/CREDITS.md.
"""
import os, sys, shutil, subprocess, tempfile
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'sounds-src')
OUT = os.path.join(ROOT, 'app', 'sounds')
SR = 44100
rng = np.random.default_rng(7)

def copy_sources(new_sounds):
    os.makedirs(SRC, exist_ok=True)
    if new_sounds and os.path.isdir(new_sounds):
        for rel in ['changing tabs.wav', 'simple click.wav', 'mochi sounds/mixkit-angry-cartoon-kitty-meow-94.wav',
                    'mochi sounds/mixkit-little-cat-attention-meow-86.wav', 'mochi sounds/mixkit-sweet-kitty-meow-93.wav',
                    'mochi sounds/angrykitten.wav', 'mochi sounds/cat-being-picked-up.mp3', 'mochi sounds/meow1.wav',
                    'mochi sounds/meow2.flac']:
            shutil.copyfile(os.path.join(new_sounds, rel), os.path.join(SRC, os.path.basename(rel)))
    for name in ['click.wav', 'coin.wav']:   # the key-click recording and coin already in the app
        p = os.path.join(OUT, name)
        if os.path.exists(p) and not os.path.exists(os.path.join(SRC, 'app-' + name)):
            shutil.copyfile(p, os.path.join(SRC, 'app-' + name))

def ff(args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *args], check=True)

# trim silence, mono, gentle fade out, optional pitch/speed change (rate) and filter, then MP3
def derive(src, out, rate=1.0, extra='', gain_db=0.0, max_s=None):
    chain = ['aformat=channel_layouts=mono', 'silenceremove=start_periods=1:start_threshold=-50dB']
    if rate != 1.0: chain += [f'asetrate={int(SR * rate)}', f'aresample={SR}']
    if extra: chain.append(extra)
    chain.append('areverse,silenceremove=start_periods=1:start_threshold=-55dB,areverse')
    if max_s: chain.append(f'atrim=0:{max_s}')
    chain.append('areverse,afade=t=in:d=0.012,areverse')   # short fade at the end so nothing clicks
    chain.append(f'volume={gain_db}dB')
    ff(['-i', src, '-af', ','.join(chain), '-ac', '1', '-ar', str(SR), '-c:a', 'libmp3lame', '-b:a', '96k', out])

def write_mp3(samples, out, gain=0.9):
    s = samples / (np.max(np.abs(samples)) + 1e-9) * gain
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t: tmp = t.name
    wavfile.write(tmp, SR, (s * 32767).astype(np.int16))
    ff(['-i', tmp, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '96k', out])
    os.remove(tmp)

def env(n, attack, release):
    e = np.ones(n); a = int(attack * SR); r = int(release * SR)
    if a: e[:a] = np.linspace(0, 1, a) ** 2
    if r: e[-r:] = np.linspace(1, 0, r) ** 2
    return e
def bandpass(x, lo, hi, order=2): return sosfilt(butter(order, [lo, hi], btype='band', fs=SR, output='sos'), x)
def lowpass(x, f, order=2): return sosfilt(butter(order, f, btype='low', fs=SR, output='sos'), x)

# Mochi's signature chirp: a short voiced "mrrp" – pitch rises then dips, with a soft rolled-r trill
def mrrp(f0=620, f1=980, dur=0.24, trill=34, bright=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; k = t / dur
    contour = f0 + (f1 - f0) * np.sin(np.pi * np.clip(k * 1.15, 0, 1)) ** 0.8 - 90 * np.clip(k - 0.7, 0, 1)
    phase = 2 * np.pi * np.cumsum(contour) / SR
    voice = sum((0.62 ** h) * np.sin(h * phase) for h in range(1, 9))
    roll = 1 - 0.55 * (0.5 + 0.5 * np.sin(2 * np.pi * trill * t)) * np.clip(1.4 - k * 2.2, 0, 1)   # the "rr" fades out into the "p"
    x = voice * roll
    x = 0.55 * bandpass(x, 700, 1500) + 0.35 * bandpass(x, 1900, 3200) * bright + 0.25 * lowpass(x, 900)
    x += 0.012 * rng.standard_normal(n) * env(n, 0.002, dur * 0.9)   # a little breath
    return x * env(n, 0.012, 0.06)

# a soft paw pat: filtered noise thump, very short
def pat(dur=0.05, lo=180, hi=900):
    n = int(dur * SR)
    x = bandpass(rng.standard_normal(n), lo, hi) * np.exp(-np.arange(n) / (SR * 0.012))
    return x * env(n, 0.002, 0.02)

# reminder chime: two soft bell partials, a third apart
def chime(notes=(880, 1108.7), dur=0.7):
    n = int(dur * SR); t = np.arange(n) / SR; x = np.zeros(n)
    for i, f in enumerate(notes):
        start = int(i * 0.11 * SR); tt = t[: n - start]
        tone = (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * f * 2.76 * tt) * np.exp(-tt * 9)) * np.exp(-tt * 5.5)
        x[start:] += tone * (0.9 if i else 1.0)
    return x * env(n, 0.004, 0.08)

def main():
    copy_sources(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '..', 'TaskFlow', 'design', 'sounds', 'new sounds'))
    os.makedirs(OUT, exist_ok=True)
    s = lambda n: os.path.join(SRC, n)
    o = lambda n: os.path.join(OUT, n)
    # UI: buttons and toggles (the user's "simple click"), three slightly different versions
    derive(s('simple click.wav'), o('tap-1.mp3'), 1.00, gain_db=-2)
    derive(s('simple click.wav'), o('tap-2.mp3'), 1.06, 'lowpass=f=9000', gain_db=-3)
    derive(s('simple click.wav'), o('tap-3.mp3'), 0.95, 'highpass=f=250', gain_db=-3)
    # UI: switching tabs (the user's "changing tabs")
    derive(s('changing tabs.wav'), o('tab-1.mp3'), 1.00, gain_db=-3, max_s=0.3)
    derive(s('changing tabs.wav'), o('tab-2.mp3'), 0.96, 'lowpass=f=8000', gain_db=-4, max_s=0.3)
    # ticking a quest off: the user's own key-click recording
    derive(s('app-click.wav'), o('tick-1.mp3'), 1.00, max_s=0.25)
    derive(s('app-click.wav'), o('tick-2.mp3'), 1.05, max_s=0.25)
    derive(s('app-click.wav'), o('tick-3.mp3'), 0.95, max_s=0.25)
    # rewards: the coin chime (daily target, focus done)
    derive(s('app-coin.wav'), o('coin.mp3'), 1.00, max_s=1.2)
    # Mochi's voice: the Mixkit meows
    derive(s('mixkit-sweet-kitty-meow-93.wav'), o('meow-sweet-1.mp3'), 1.00, gain_db=-4)
    derive(s('mixkit-sweet-kitty-meow-93.wav'), o('meow-sweet-2.mp3'), 1.07, gain_db=-5)
    derive(s('mixkit-little-cat-attention-meow-86.wav'), o('meow-hey-1.mp3'), 1.00, gain_db=-4)
    derive(s('mixkit-little-cat-attention-meow-86.wav'), o('meow-hey-2.mp3'), 1.06, gain_db=-5)
    derive(s('mixkit-angry-cartoon-kitty-meow-94.wav'), o('meow-grumpy-1.mp3'), 1.00, gain_db=-5)
    derive(s('mixkit-angry-cartoon-kitty-meow-94.wav'), o('meow-grumpy-2.mp3'), 0.94, gain_db=-6)
    # Mochi's newer picks: two plain meows, being picked up, and a proper angry yowl for when he's had enough
    derive(s('meow1.wav'), o('meow-1.mp3'), 1.00, gain_db=-4)
    derive(s('meow2.flac'), o('meow-2.mp3'), 1.00, gain_db=-4)
    derive(s('meow1.wav'), o('meow-3.mp3'), 1.06, gain_db=-5)
    derive(s('cat-being-picked-up.mp3'), o('pickup-1.mp3'), 1.00, gain_db=-3)
    derive(s('cat-being-picked-up.mp3'), o('pickup-2.mp3'), 1.05, gain_db=-4)
    derive(s('angrykitten.wav'), o('angry-1.mp3'), 1.00, gain_db=-5, max_s=1.3)
    derive(s('angrykitten.wav'), o('angry-2.mp3'), 0.95, gain_db=-6, max_s=1.3)
    # Mochi's signature "mrrp!" (synthesised): three versions, happy / curious / content
    write_mp3(mrrp(620, 1000, 0.24, 34), o('mrrp-1.mp3'), 0.8)
    write_mp3(mrrp(680, 1120, 0.20, 40, 1.15), o('mrrp-2.mp3'), 0.8)
    write_mp3(mrrp(560, 900, 0.28, 30, 0.85), o('mrrp-3.mp3'), 0.8)
    # soft paw steps (synthesised), only for purposeful walks, and a landing pat
    write_mp3(pat(0.045, 200, 900), o('step-1.mp3'), 0.5)
    write_mp3(pat(0.05, 160, 750), o('step-2.mp3'), 0.5)
    write_mp3(pat(0.04, 230, 1000), o('step-3.mp3'), 0.5)
    write_mp3(pat(0.09, 90, 500), o('land.mp3'), 0.7)
    # reminder chime (synthesised), two versions
    write_mp3(chime((880, 1108.7)), o('chime-1.mp3'), 0.6)
    write_mp3(chime((830.6, 1046.5)), o('chime-2.mp3'), 0.6)
    # old WAVs are replaced by the MP3s
    for old in ['click.wav', 'coin.wav', 'mew.wav']:
        if os.path.exists(o(old)): os.remove(o(old))
    total = sum(os.path.getsize(o(f)) for f in os.listdir(OUT) if f.endswith('.mp3'))
    print(f'{len([f for f in os.listdir(OUT) if f.endswith(".mp3")])} sounds, {total / 1024:.0f} KB')

if __name__ == '__main__':
    main()
