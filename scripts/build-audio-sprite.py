import os, json, subprocess
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOUNDS_DIR = os.path.join(ROOT, 'app', 'sounds')
OUT_MP3 = os.path.join(SOUNDS_DIR, 'sprite.mp3')
OUT_JSON = os.path.join(SOUNDS_DIR, 'sounds.json')
SR = 44100

SOUND_NAMES = [
  'tap-1', 'tap-2', 'tap-3',
  'tab-1', 'tab-2',
  'tick-1', 'tick-2', 'tick-3',
  'coin',
  'chime-1', 'chime-2',
  'mrrp-1', 'mrrp-2', 'mrrp-3',
  'meow-sweet-1', 'meow-sweet-2',
  'meow-hey-1', 'meow-hey-2',
  'meow-grumpy-1', 'meow-grumpy-2',
  'step-1', 'step-2', 'step-3',
  'land',
  'meow-1', 'meow-2', 'meow-3',
  'pickup-1', 'pickup-2',
  'angry-1', 'angry-2',
]

def load_audio(path):
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), 'pipe:1']
    res = subprocess.run(cmd, stdout=subprocess.PIPE, check=True)
    return np.frombuffer(res.stdout, dtype=np.float32)

def main():
    combined = []
    sound_map = {}
    current_sample = 0
    pad_samples = int(SR * 0.05) # 50ms silence between sounds
    pad = np.zeros(pad_samples, dtype=np.float32)

    for name in SOUND_NAMES:
        p = os.path.join(SOUNDS_DIR, f'{name}.mp3')
        if not os.path.exists(p):
            print(f'Warning: {p} does not exist')
            continue
        audio = load_audio(p)
        dur_samples = len(audio)
        start_sec = round(current_sample / SR, 4)
        dur_sec = round(dur_samples / SR, 4)
        sound_map[name] = [start_sec, dur_sec]

        combined.append(audio)
        combined.append(pad)
        current_sample += dur_samples + pad_samples

    all_audio = np.concatenate(combined)
    print(f'Combined audio length: {len(all_audio) / SR:.2f}s, total sounds: {len(sound_map)}')

    # Encode to sprite.mp3
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', 'pipe:0',
           '-c:a', 'libmp3lame', '-b:a', '96k', OUT_MP3]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    proc.communicate(input=all_audio.tobytes())
    if proc.returncode != 0:
        raise RuntimeError('ffmpeg failed to encode sprite.mp3')

    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(sound_map, f, indent=2)

    print(f'Generated {OUT_MP3} ({os.path.getsize(OUT_MP3)} bytes) and {OUT_JSON}')

if __name__ == '__main__':
    main()
