// Optional sound effects (Roadmap #142): short tones made by the browser's
// Web Audio API — no audio files and no network. Off unless switched on in
// Settings (meta.soundOn); app.js decides when to call playSound.
//
// Sound is only ever extra: if Web Audio is missing, still locked (iPad
// Safari only allows sound after a tap), or throws, nothing is heard and
// nothing else changes. Wrong answers never make a sound (SPEC §8).

let ctx = null;

function audioContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

// Each sound is a list of [frequency Hz, start s, length s] notes.
const SOUNDS = {
  ding: [[1318.5, 0, 0.22]], // one bright E6
  coin: [[987.8, 0, 0.1], [1318.5, 0.09, 0.26]], // B5 then E6
  fanfare: [[523.3, 0, 0.16], [659.3, 0.15, 0.16], [784, 0.3, 0.16], [1046.5, 0.45, 0.6]], // C E G C
};

// The last sound's start time, so a double event can't play two at once.
// -Infinity, not 0: a new AudioContext's clock starts at 0, so 0 would
// throw away the very first sound (the Settings preview included).
let lastStartedAt = -Infinity;

export function playSound(name) {
  const notes = SOUNDS[name];
  if (!notes) return;
  try {
    const ac = audioContext();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    const now = ac.currentTime;
    if (now - lastStartedAt < 0.05) return;
    lastStartedAt = now;
    notes.forEach(([freq, start, length]) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      // Quiet, with a quick fade in and out so there's no click.
      const t0 = now + start;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
      osc.connect(gain).connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + length + 0.05);
    });
  } catch (e) {
    // Stay silent: sound must never get in the way.
  }
}
