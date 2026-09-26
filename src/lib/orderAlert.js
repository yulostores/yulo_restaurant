// The new-order chime for the owner portal, and the owner's on/off choice for it.
//
// Generated with the Web Audio API rather than shipped as a file: no asset to host, and it
// can't 404. Browsers only let a page make sound after the user has interacted with it;
// on a portal the owner has clicked into that is already true, and if it isn't the call
// simply fails silently — the on-screen alert still shows, which is what matters.

const SOUND_KEY = "yulo_owner_order_sound";

export function isOrderSoundOn() {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setOrderSoundOn(on) {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Storage blocked (private mode) — the choice just won't persist.
  }
}

let audioContext = null;

function ensureContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioContext ??= new Ctx();
  if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
  return audioContext;
}

// Browsers keep an AudioContext suspended until the page has had a user gesture. A
// counter tablet that reloads (crash, deploy) and is never touched would otherwise chime
// silently forever — so the context is created/resumed on the very first tap or key press
// anywhere in the portal, after which chimes from background polls can play.
let unlockInstalled = false;
export function installAudioUnlock() {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const unlock = () => {
    try {
      ensureContext();
    } catch {
      // No audio — nothing to unlock.
    }
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
}

// Two short rising tones — distinct from a notification "ding", hard to miss in a kitchen.
export function playNewOrderChime() {
  if (!isOrderSoundOn()) return;
  try {
    if (!ensureContext()) return;

    const start = audioContext.currentTime;
    [880, 1175].forEach((frequency, i) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      const t = start + i * 0.22;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.connect(gain).connect(audioContext.destination);
      osc.start(t);
      osc.stop(t + 0.21);
    });
  } catch {
    // No audio available — the visual alert carries it.
  }
}
