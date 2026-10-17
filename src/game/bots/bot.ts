import type { Level, LevelEdge, RouteTag } from "../level/types";
import { randomBetween, type Rng } from "../random";
import { availableEdges, type RacerProgress } from "../racer/racer";

export interface BotProfile {
  readonly name: string;
  readonly wordsPerMinute: number;
  /** Chance that any single keystroke is correct. */
  readonly accuracy: number;
  /** 0 always takes the safe road, 1 takes every gamble. */
  readonly daring: number;
}

const CHARS_PER_WORD = 5;
const REACTION_MS: readonly [number, number] = [350, 650];
const NOTICE_TYPO_MS: readonly [number, number] = [180, 380];
const BETWEEN_WORDS_MS: readonly [number, number] = [40, 160];
const FORK_THINK_MS: readonly [number, number] = [250, 650];
const RHYTHM_JITTER: readonly [number, number] = [0.65, 1.35];
/** After falling, bots get cautious, just like people. */
const DARING_AFTER_FALL = 0.5;
const TYPO_ALPHABET = "abcdefghijklmnopqrstuvwxyz";

/** Shifted letters and punctuation slow everyone down. */
export function keystrokeEffort(char: string): number {
  if (/[A-Z]/.test(char)) return 1.5;
  if (/[a-z ]/.test(char)) return 1;
  return 1.4;
}

export interface BotKeystroke {
  readonly char: string;
  readonly atMs: number;
}

/** Plays one racer by producing human-ish keystrokes on a schedule. */
export class BotDriver {
  private nextKeyAtMs: number;
  private correctingTypo = false;
  private daring: number;
  private decision: { readonly nodeId: string; readonly edgeId: string } | null = null;
  private fallsSeen = 0;

  constructor(
    readonly profile: BotProfile,
    private readonly rng: Rng,
  ) {
    this.daring = profile.daring;
    this.nextKeyAtMs = randomBetween(rng, ...REACTION_MS);
  }

  /** The next keystroke if it is due by `raceMs`; the caller applies it and asks again. */
  nextKeystroke(level: Level, progress: RacerProgress, raceMs: number): BotKeystroke | null {
    if (progress.finished || this.nextKeyAtMs > raceMs) return null;
    this.reactToFalls(progress);
    const edge = this.targetEdge(level, progress);
    const expected = edge.word[progress.typed];
    if (expected === undefined) throw new Error(`Bot overran word "${edge.word}"`);

    const atMs = this.nextKeyAtMs;
    if (!this.correctingTypo && this.rng() > this.profile.accuracy) {
      this.correctingTypo = true;
      this.nextKeyAtMs = atMs + randomBetween(this.rng, ...NOTICE_TYPO_MS);
      return { char: this.typoFor(expected), atMs };
    }

    this.correctingTypo = false;
    this.nextKeyAtMs = atMs + this.delayAfter(level, progress, edge, expected);
    return { char: expected, atMs };
  }

  private reactToFalls(progress: RacerProgress): void {
    if (progress.stats.falls === this.fallsSeen) return;
    this.fallsSeen = progress.stats.falls;
    this.daring *= DARING_AFTER_FALL;
  }

  private targetEdge(level: Level, progress: RacerProgress): LevelEdge {
    const options = availableEdges(level, progress);
    const committed = options.length === 1 ? options[0] : undefined;
    if (committed) return committed;
    if (this.decision?.nodeId !== progress.nodeId) {
      this.decision = { nodeId: progress.nodeId, edgeId: this.chooseRoute(options).id };
    }
    const decided = options.find((edge) => edge.id === this.decision?.edgeId);
    if (!decided) throw new Error(`Bot decided on an unavailable edge at ${progress.nodeId}`);
    return decided;
  }

  private chooseRoute(options: readonly LevelEdge[]): LevelEdge {
    const weighted = options.map((edge) => ({ edge, weight: this.routeAppeal(edge.route?.tag) }));
    const total = weighted.reduce((sum, option) => sum + option.weight, 0);
    let roll = this.rng() * total;
    for (const option of weighted) {
      roll -= option.weight;
      if (roll <= 0) return option.edge;
    }
    const fallback = options[0];
    if (!fallback) throw new Error("Bot asked to choose between no routes");
    return fallback;
  }

  private routeAppeal(tag: RouteTag | undefined): number {
    const skill = Math.min(1, this.profile.wordsPerMinute / 90);
    switch (tag) {
      case "risky":
        return 0.05 + this.daring * Math.max(0, (this.profile.accuracy - 0.9) * 10);
      case "shortcut":
        return 0.15 + skill * 0.9 + this.daring * 0.3;
      case "safe":
      case undefined:
        return 0.6 + (1 - this.daring) * 0.6;
    }
  }

  private delayAfter(level: Level, progress: RacerProgress, edge: LevelEdge, typed: string): number {
    const msPerChar = 60_000 / (this.profile.wordsPerMinute * CHARS_PER_WORD);
    const base = msPerChar * keystrokeEffort(typed) * randomBetween(this.rng, ...RHYTHM_JITTER);
    const finishesWord = progress.typed + 1 === edge.word.length;
    if (!finishesWord) return base;
    const arrivesAtFork = (level.outgoing.get(edge.to)?.length ?? 0) > 1;
    const pause = arrivesAtFork ? FORK_THINK_MS : BETWEEN_WORDS_MS;
    return base + randomBetween(this.rng, ...pause);
  }

  private typoFor(expected: string): string {
    const candidates = TYPO_ALPHABET.replace(expected.toLowerCase(), "");
    return candidates[Math.floor(this.rng() * candidates.length)] ?? "x";
  }
}

/** Effective speeds land around 80% of the nominal figure once pauses and shifted keys count. */
export const BOT_ROSTER: readonly BotProfile[] = [
  { name: "Gumdrop", wordsPerMinute: 38, accuracy: 0.95, daring: 0.2 },
  { name: "Turbo Toast", wordsPerMinute: 55, accuracy: 0.965, daring: 0.6 },
  { name: "Mochi", wordsPerMinute: 66, accuracy: 0.975, daring: 0.45 },
  { name: "Sir Sprinkle", wordsPerMinute: 88, accuracy: 0.98, daring: 0.8 },
  { name: "Pickle Pop", wordsPerMinute: 48, accuracy: 0.96, daring: 0.9 },
  { name: "Waffles", wordsPerMinute: 74, accuracy: 0.97, daring: 0.3 },
];
