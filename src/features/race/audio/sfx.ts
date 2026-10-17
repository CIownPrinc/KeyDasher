import type { MotionCue } from "../render/renderer";

type Wave = OscillatorType;

interface Tone {
  readonly wave: Wave;
  readonly from: number;
  readonly to: number;
  readonly seconds: number;
  readonly volume: number;
  readonly delay?: number;
}

const MOTION_TONES: Readonly<Record<MotionCue, readonly Tone[]>> = {
  jump: [{ wave: "square", from: 300, to: 620, seconds: 0.12, volume: 0.05 }],
  bounce: [{ wave: "sine", from: 180, to: 900, seconds: 0.35, volume: 0.12 }],
  land: [{ wave: "triangle", from: 160, to: 70, seconds: 0.08, volume: 0.1 }],
  zip: [{ wave: "sawtooth", from: 500, to: 1300, seconds: 1.0, volume: 0.035 }],
  slide: [{ wave: "triangle", from: 900, to: 300, seconds: 0.9, volume: 0.07 }],
  lift: [{ wave: "square", from: 120, to: 420, seconds: 0.8, volume: 0.04 }],
  unlock: [
    { wave: "square", from: 880, to: 880, seconds: 0.06, volume: 0.06 },
    { wave: "square", from: 1320, to: 1320, seconds: 0.1, volume: 0.06, delay: 0.08 },
  ],
  fall: [{ wave: "sine", from: 700, to: 120, seconds: 0.8, volume: 0.12 }],
  splash: [{ wave: "triangle", from: 240, to: 60, seconds: 0.35, volume: 0.15 }],
  respawn: [{ wave: "sine", from: 400, to: 1000, seconds: 0.3, volume: 0.08 }],
  checkpoint: [
    { wave: "triangle", from: 784, to: 784, seconds: 0.12, volume: 0.1 },
    { wave: "triangle", from: 1046, to: 1046, seconds: 0.25, volume: 0.1, delay: 0.1 },
  ],
  finish: [523, 659, 784, 1046].map((frequency, index) => ({
    wave: "triangle" as const,
    from: frequency,
    to: frequency,
    seconds: index === 3 ? 0.6 : 0.14,
    volume: 0.12,
    delay: index * 0.12,
  })),
};

/** Tiny synthesized sound effects; no audio files to load. */
export class RaceAudio {
  private context: AudioContext | null = null;
  private muted = false;

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  /** Browsers only allow audio after a user gesture, so call this from one. */
  unlock(): void {
    if (this.context) {
      void this.context.resume();
      return;
    }
    try {
      this.context = new AudioContext();
    } catch {
      this.context = null;
    }
  }

  key(positionInWord: number): void {
    const pitch = 520 + Math.min(positionInWord, 12) * 28;
    this.play([{ wave: "triangle", from: pitch, to: pitch * 1.04, seconds: 0.045, volume: 0.05 }]);
  }

  typo(): void {
    this.play([{ wave: "square", from: 140, to: 110, seconds: 0.12, volume: 0.06 }]);
  }

  crack(): void {
    this.play([
      { wave: "sawtooth", from: 220, to: 90, seconds: 0.14, volume: 0.09 },
      { wave: "square", from: 160, to: 60, seconds: 0.12, volume: 0.06, delay: 0.06 },
    ]);
  }

  word(flow: number): void {
    const base = 660 * flow;
    this.play([
      { wave: "triangle", from: base, to: base, seconds: 0.07, volume: 0.07 },
      { wave: "triangle", from: base * 1.5, to: base * 1.5, seconds: 0.1, volume: 0.07, delay: 0.05 },
    ]);
  }

  countdown(isGo: boolean): void {
    const pitch = isGo ? 1046 : 523;
    this.play([{ wave: "square", from: pitch, to: pitch, seconds: isGo ? 0.4 : 0.15, volume: 0.07 }]);
  }

  motion(cue: MotionCue): void {
    this.play(MOTION_TONES[cue]);
  }

  private play(tones: readonly Tone[]): void {
    const context = this.context;
    if (!context || this.muted || context.state !== "running") return;
    for (const tone of tones) {
      const start = context.currentTime + (tone.delay ?? 0);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = tone.wave;
      oscillator.frequency.setValueAtTime(tone.from, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, tone.to), start + tone.seconds);
      gain.gain.setValueAtTime(tone.volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.seconds);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + tone.seconds + 0.02);
    }
  }
}
