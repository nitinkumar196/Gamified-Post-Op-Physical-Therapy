// Voice coach: speaks short cues and shows them in the on-screen speech bubble.
// Cues are throttled per key so the patient isn't nagged every frame.

export class Coach {
  constructor({ onCue = () => {}, enabled = true } = {}) {
    this.onCue = onCue;
    this.enabled = enabled;
    this.last = new Map();
    this.voice = null;
    if ('speechSynthesis' in window) {
      const pick = () => {
        const voices = speechSynthesis.getVoices();
        this.voice = voices.find((v) => v.lang === 'en-IN') ||
                     voices.find((v) => v.lang?.startsWith('en-GB')) ||
                     voices.find((v) => v.lang?.startsWith('en')) || null;
      };
      pick();
      speechSynthesis.addEventListener?.('voiceschanged', pick);
    }
  }

  /** Returns true if the cue was delivered (not throttled). */
  say(text, { key = text, gap = 3000, speak = true } = {}) {
    const now = performance.now();
    if (now - (this.last.get(key) ?? -Infinity) < gap) return false;
    this.last.set(key, now);
    this.onCue(text);
    if (this.enabled && speak && 'speechSynthesis' in window) {
      speechSynthesis.cancel(); // latest cue wins: feedback must be timely
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.rate = 0.95;
      speechSynthesis.speak(u);
    }
    return true;
  }

  stop() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
}

const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen'];
export const countWord = (n) => WORDS[n] ?? String(n);
