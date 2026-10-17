import type { BotDriver } from "../bots/bot";
import { courseProgress, nodeOf, type Level } from "../level/types";
import type { Vec } from "../math";
import { Timeline } from "../motion/timeline";
import type { RacerEvent } from "../racer/events";
import { applyKey, startProgress, type RacerProgress } from "../racer/racer";
import { rankRacers, wordsPerMinute, type RaceResult, type RacerSummary } from "./standings";

export const COUNTDOWN_MS = 3000;
export const MAX_RACE_MS = 150_000;
/** Once every human is across the line, give the bots this long before calling it. */
export const HUMANS_DONE_GRACE_MS = 15_000;
/** Keys that arrive a hair before GO (clock skew) count as typed at GO. */
export const EARLY_KEY_GRACE_MS = 400;
export const ROOM_CAPACITY = 5;
const LANE_SPACING = 34;

/** Racers line up behind the start line in join order. */
export function startPositionForLane(level: Level, lane: number): Vec {
  const start = nodeOf(level, level.startNodeId);
  return { x: start.x - lane * LANE_SPACING, y: start.y };
}

export type RoomPhase = "lobby" | "countdown" | "racing" | "finished";

export type RoomEvent =
  | { readonly kind: "countdown"; readonly startAtMs: number }
  | {
      readonly kind: "racer-event";
      readonly racerId: string;
      readonly raceMs: number;
      readonly event: RacerEvent;
    }
  | { readonly kind: "racer-finished"; readonly racerId: string; readonly finishMs: number }
  | { readonly kind: "race-over"; readonly results: readonly RaceResult[] };

interface RoomRacer {
  readonly summary: RacerSummary;
  readonly timeline: Timeline;
  readonly bot: BotDriver | null;
  progress: RacerProgress;
  typedFinishMs: number | null;
  finishMs: number | null;
}

/**
 * One race, from lobby to results. Pure game logic with no clock or network of its own:
 * callers pass the current time in, and listen for events to broadcast or render.
 * Runs unchanged on the server for online races and in the browser for practice.
 */
export class RaceRoom {
  private phaseValue: RoomPhase = "lobby";
  private startAtMs: number | null = null;
  private readonly racers = new Map<string, RoomRacer>();
  private finalResults: readonly RaceResult[] | null = null;

  constructor(
    readonly level: Level,
    private readonly emit: (event: RoomEvent) => void,
  ) {}

  get phase(): RoomPhase {
    return this.phaseValue;
  }

  get startsAtMs(): number | null {
    return this.startAtMs;
  }

  get roster(): RacerSummary[] {
    return [...this.racers.values()].map((racer) => racer.summary);
  }

  get isFull(): boolean {
    return this.racers.size >= ROOM_CAPACITY;
  }

  /** Lane order is join order; each racer starts a little behind the previous one. */
  addRacer(summary: RacerSummary, bot: BotDriver | null = null): void {
    if (this.phaseValue !== "lobby") throw new Error("Racers can only join in the lobby");
    if (this.isFull) throw new Error("Room is full");
    const timeline = new Timeline(this.level, startPositionForLane(this.level, this.racers.size));
    this.racers.set(summary.id, {
      summary,
      timeline,
      bot,
      progress: startProgress(this.level),
      typedFinishMs: null,
      finishMs: null,
    });
  }

  removeRacer(racerId: string): void {
    this.racers.delete(racerId);
  }

  startCountdown(nowMs: number): void {
    if (this.phaseValue !== "lobby") return;
    this.phaseValue = "countdown";
    this.startAtMs = nowMs + COUNTDOWN_MS;
    this.emit({ kind: "countdown", startAtMs: this.startAtMs });
  }

  /** Returns false when the key arrived outside the race and was ignored. */
  handleKey(racerId: string, char: string, nowMs: number): boolean {
    this.tick(nowMs);
    const racer = this.racers.get(racerId);
    const raceMs = this.raceMsAt(nowMs);
    if (!racer || racer.bot || racer.progress.finished || raceMs === null) return false;
    const acceptsKeys =
      this.phaseValue === "racing" || (this.phaseValue === "countdown" && raceMs >= -EARLY_KEY_GRACE_MS);
    if (!acceptsKeys) return false;
    this.applyKeystroke(racer, char, Math.max(0, raceMs));
    return true;
  }

  tick(nowMs: number): void {
    const raceMs = this.raceMsAt(nowMs);
    if (raceMs === null) return;
    if (this.phaseValue === "countdown" && raceMs >= 0) this.phaseValue = "racing";
    if (this.phaseValue !== "racing") return;
    this.driveBots(raceMs);
    if (this.raceIsOver(raceMs)) this.finish(raceMs);
  }

  timelineOf(racerId: string): Timeline | undefined {
    return this.racers.get(racerId)?.timeline;
  }

  progressOf(racerId: string): RacerProgress | undefined {
    return this.racers.get(racerId)?.progress;
  }

  finishMsOf(racerId: string): number | null {
    return this.racers.get(racerId)?.finishMs ?? null;
  }

  get results(): readonly RaceResult[] | null {
    return this.finalResults;
  }

  private raceMsAt(nowMs: number): number | null {
    return this.startAtMs === null ? null : nowMs - this.startAtMs;
  }

  private driveBots(raceMs: number): void {
    for (const racer of this.racers.values()) {
      if (!racer.bot) continue;
      for (
        let key = racer.bot.nextKeystroke(this.level, racer.progress, raceMs);
        key;
        key = racer.bot.nextKeystroke(this.level, racer.progress, raceMs)
      ) {
        this.applyKeystroke(racer, key.char, key.atMs);
      }
    }
  }

  private applyKeystroke(racer: RoomRacer, char: string, raceMs: number): void {
    const outcome = applyKey(this.level, racer.progress, char);
    racer.progress = outcome.progress;
    for (const event of outcome.events) {
      racer.timeline.apply(event, raceMs);
      this.emit({ kind: "racer-event", racerId: racer.summary.id, raceMs, event });
    }
    if (racer.progress.finished && racer.finishMs === null) {
      racer.typedFinishMs = raceMs;
      racer.finishMs = racer.timeline.endMs;
      this.emit({ kind: "racer-finished", racerId: racer.summary.id, finishMs: racer.finishMs });
    }
  }

  private raceIsOver(raceMs: number): boolean {
    if (raceMs >= MAX_RACE_MS) return true;
    const everyone = [...this.racers.values()];
    if (everyone.length === 0) return true;
    if (everyone.every((racer) => racer.finishMs !== null && racer.finishMs <= raceMs)) return true;
    const humans = everyone.filter((racer) => !racer.bot);
    if (humans.length === 0 || humans.some((racer) => racer.finishMs === null)) return false;
    const lastHumanMs = Math.max(...humans.map((racer) => racer.finishMs ?? 0));
    return raceMs >= lastHumanMs + HUMANS_DONE_GRACE_MS;
  }

  private finish(raceMs: number): void {
    this.phaseValue = "finished";
    this.finalResults = this.rank(raceMs);
    this.emit({ kind: "race-over", results: this.finalResults });
  }

  private rank(raceMs: number): RaceResult[] {
    const entries = [...this.racers.values()].map((racer) => ({
      id: racer.summary.id,
      racer,
      finishMs: racer.finishMs,
      courseProgress: courseProgress(this.level, racer.timeline.poseAt(raceMs).x),
    }));
    return rankRacers(entries, raceMs).map((entry, index) => {
      const { stats, routes } = entry.racer.progress;
      const crossed = entry.finishMs !== null && entry.finishMs <= raceMs;
      return {
        ...entry.racer.summary,
        place: index + 1,
        finishMs: crossed ? entry.finishMs : null,
        wordsPerMinute: wordsPerMinute(
          stats.correct,
          crossed ? (entry.racer.typedFinishMs ?? raceMs) : raceMs,
        ),
        accuracy: stats.keystrokes === 0 ? 0 : stats.correct / stats.keystrokes,
        falls: stats.falls,
        courseProgress: crossed ? 1 : entry.courseProgress,
        routes: [...routes],
      };
    });
  }
}
