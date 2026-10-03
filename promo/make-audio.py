"""Synthesises the promo soundtrack (pure stdlib): 128 bpm beat, bass, arpeggio,
and sound effects timed to the animation. Writes promo/promo-audio.wav."""
import math, random, struct, wave, os
SR = 44100; DUR = 30
buf = [0.0] * (SR * DUR)
random.seed(4)
def add(t0, samples, gain=1.0):
    i0 = int(t0 * SR)
    for i, s in enumerate(samples):
        if i0 + i >= len(buf): break
        buf[i0 + i] += s * gain
def tone(freq, dur, kind='sine', decay=6.0, attack=0.005):
    n = int(dur * SR); out = []
    for i in range(n):
        t = i / SR
        ph = 2 * math.pi * freq * t
        v = math.sin(ph) if kind == 'sine' else (1 if math.sin(ph) > 0 else -1) * 0.5 if kind == 'sq' else 2 * ((freq * t) % 1) - 1
        env = min(1, t / attack) * math.exp(-decay * t)
        out.append(v * env)
    return out
def kick():
    out = []
    for i in range(int(0.22 * SR)):
        t = i / SR; f = 50 + 110 * math.exp(-t * 30)
        out.append(math.sin(2 * math.pi * f * t) * math.exp(-t * 14))
    return out
def hat(open_=False):
    d = 0.18 if open_ else 0.04
    return [(random.random() * 2 - 1) * math.exp(-i / SR * (18 if open_ else 80)) for i in range(int(d * SR))]
def snare():
    return [((random.random() * 2 - 1) * 0.8 + math.sin(2 * math.pi * 190 * i / SR) * 0.4) * math.exp(-i / SR * 20) for i in range(int(0.2 * SR))]
def sweep(dur, f0, f1, decay=0):
    out = []; ph = 0
    for i in range(int(dur * SR)):
        t = i / dur / SR; f = f0 + (f1 - f0) * t; ph += 2 * math.pi * f / SR
        out.append(math.sin(ph) * (t ** 1.5) * (1 - t * 0.2))
    return out
def noise_sweep(dur):
    return [(random.random() * 2 - 1) * (i / (dur * SR)) ** 2 * 0.6 for i in range(int(dur * SR))]
beat = 60 / 128
note = lambda m: 440 * 2 ** ((m - 69) / 12)
prog_ = [57, 53, 60, 55]  # A F C G root notes (bass), one per bar
# music: from 4s (after hook) a beat; hook is just a riser + ticks
for bar in range(int(DUR / (beat * 4)) + 1):
    t0 = bar * beat * 4
    if t0 < 4 - 0.01: continue
    root = prog_[bar % 4]
    for b in range(4):
        tb = t0 + b * beat
        add(tb, kick(), 0.9)
        add(tb + beat / 2, hat(), 0.18)
        add(tb + beat * 0.75, hat(), 0.1)
        if b in (1, 3): add(tb, snare(), 0.45)
    for e in range(8):  # driving 8th bass
        add(t0 + e * beat / 2, tone(note(root - 12), beat / 2, 'saw', 7), 0.22)
    for s in range(16):  # arpeggio
        m = root + [0, 7, 12, 16, 12, 7, 0, 7][s % 8] + 12
        add(t0 + s * beat / 4, tone(note(m), 0.2, 'sq', 12), 0.07)
# hook: ticking countdown + riser
for i, tt in enumerate([2.1, 2.7, 3.3]):
    add(tt, tone(880 if i < 2 else 1320, 0.25, 'sine', 9), 0.5)
add(0.3, sweep(1.6, 200, 900), 0.3)
add(0.1, [x * 0.3 for x in noise_sweep(1.8)])
add(3.4, noise_sweep(0.6), 0.5)
add(4.0, [math.sin(2 * math.pi * 55 * i / SR) * math.exp(-i / SR * 4) for i in range(SR)], 0.9)  # boom on logo
# whooshes on scene cuts
for c in (8, 15, 21, 26):
    add(c - 0.35, noise_sweep(0.35), 0.35)
# correct dings + streak ascending notes
for k, tt in enumerate([9.5, 11.0, 12.6, 14.0]):
    base = 72 + k * 2
    for j, off in enumerate((0, 4, 7)):
        add(tt + j * 0.06, tone(note(base + off + 12), 0.4, 'sine', 5), 0.4)
# chest open, badge pops, avatar pops
add(17.0, sweep(0.5, 300, 1500), 0.3)
for j in range(6): add(17.1 + j * 0.06, tone(note(84 + j * 2), 0.5, 'sine', 5), 0.3)
for i in range(6): add(17.3 + i * 0.18, tone(note(76 + i), 0.15, 'sq', 20), 0.25)
for i in range(4): add(18.5 + i * 0.18, tone(note(79 + i * 2), 0.15, 'sq', 20), 0.25)
# bars filling: rising ticks
for i in range(5): add(21.4 + i * 0.25, sweep(0.5, 400 + i * 80, 900 + i * 120), 0.15)
add(23.4, tone(note(88), 0.6, 'sine', 4), 0.4)
# finale: big chord + confetti sparkle
for m in (57, 60, 64, 69, 72):
    add(26.0, tone(note(m), 1.8, 'saw', 2.2), 0.14)
add(26.0, kick(), 1.0); add(26.0, snare(), 0.7)
for i in range(12): add(26.1 + i * 0.07, tone(note(88 + (i % 5) * 2), 0.2, 'sine', 12), 0.15)
add(27.5, tone(note(81), 0.8, 'saw', 3), 0.18); add(27.5, kick(), 0.9)
# fade out and normalise
peak = max(abs(x) for x in buf) or 1
for i in range(len(buf)):
    f = min(1, (DUR * SR - i) / (1.2 * SR))
    buf[i] = max(-1, min(1, buf[i] / peak * 0.9 * f))
path = os.path.join(os.path.dirname(__file__), 'promo-audio.wav')
with wave.open(path, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<h', int(x * 32767)) for x in buf))
print('wrote', path)
