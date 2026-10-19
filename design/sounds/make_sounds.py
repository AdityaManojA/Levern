# Synthesises the TaskFlow UI sounds with the standard library only.
import math, random, struct, wave, os

RATE = 44100
OUT = os.path.dirname(os.path.abspath(__file__))

def write(name, samples, level=0.8):
    # level = peak amplitude as a fraction of full scale (0.8 by default; lower = quieter)
    peak = max(1e-9, max(abs(s) for s in samples))
    data = b"".join(struct.pack("<h", int(s / peak * level * 32767)) for s in samples)
    with wave.open(os.path.join(OUT, name), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(data)
    print("wrote", name)

def env(t, decay):
    return math.exp(-t * decay)

# 1. Brown-switch keyboard click (v3): high-passed noise transient (the "tk" of bottom-out),
#    a bright switch clack, and a short plate/case resonance. Brown switches = less clacky than blue.
def key_click():
    # v4: layered "thock" - a tiny tick, a low body that drops in pitch (the satisfying part),
    # and a soft plate ring with a short airy tail.
    random.seed(11)
    n = int(RATE * 0.16)
    out = []
    prev = 0.0
    phase = 0.0
    for i in range(n):
        t = i / RATE
        w = random.random() * 2 - 1
        hp = w - prev
        prev = w
        tick = hp * env(t, 1400) * 0.7
        f = 150 + 130 * env(t, 90)              # pitch drops fast -> thud with weight
        phase += 2 * math.pi * f / RATE
        thock = math.sin(phase) * env(t, 38) * 0.95
        plate = math.sin(2 * math.pi * 1250 * t) * env(t, 70) * 0.22
        air = w * env(t, 45) * 0.05
        out.append(tick + thock + plate + air)
    write("key_click_brown.wav", out)

# 2. Coin chime for questline complete: two bright bell notes (E6 -> B6), gentle shimmer
def coin():
    n = int(RATE * 0.55)
    out = []
    for i in range(n):
        t = i / RATE
        s = 0.0
        # first note, E6 (1318 Hz), starts at 0
        if t >= 0:
            s += math.sin(2 * math.pi * 1318.5 * t) * env(t, 9) * 0.6
            s += math.sin(2 * math.pi * 2637 * t) * env(t, 16) * 0.15
        # second note, B6 (1975 Hz), starts at 0.09 s
        t2 = t - 0.09
        if t2 >= 0:
            s += math.sin(2 * math.pi * 1975.5 * t2) * env(t2, 7) * 0.7
            s += math.sin(2 * math.pi * 3951 * t2) * env(t2, 14) * 0.12
        out.append(s)
    write("coin_questline_complete.wav", out)

# 3. Mascot "boing-boop" (v3): a squishy upward pitch bend with a soft attack,
#    then a tiny bright sparkle on the way down. Phase is accumulated so there are no clicks.
def pop():
    # v7: a tiny cat "mrp". Short (0.2 s) and nearly flat in pitch, so it doesn't sweep like a siren.
    # A quick upward nudge, a bright voiced body, and a soft "p" puff at the end.
    n = int(RATE * 0.2)
    out = []
    phase = 0.0
    random.seed(3)
    for i in range(n):
        t = i / RATE
        f = 640 + 90 * min(1.0, t / 0.05) - 40 * max(0.0, (t - 0.05) / 0.15)   # small nudge up, settle
        phase += 2 * math.pi * f / RATE
        voice = math.sin(phase) + 0.35 * math.sin(2 * phase) + 0.15 * math.sin(3 * phase)
        shape = min(1.0, t / 0.004) * env(t, 16)                       # snappy, short decay
        puff = (random.random() * 2 - 1) * env(t - 0.12, 60) * 0.25 if t >= 0.12 else 0.0
        out.append(voice * shape * 0.8 + puff)
    write("mascot_pop.wav", out, level=0.3)   # quieter than the other UI sounds

# key_click() is not run: key_click_brown.wav is the user's own recording (keyclick.mp3).
# To regenerate the synthesized version, call key_click() explicitly and write to another name.
coin(); pop()
