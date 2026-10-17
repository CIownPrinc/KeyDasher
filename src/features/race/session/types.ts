import type { Level } from "@/game/level/types";
import type { Timeline } from "@/game/motion/timeline";
import type { RacerColor } from "@/game/racer/colors";
import type { RacerEvent } from "@/game/racer/events";
import type { RacerProgress } from "@/game/racer/racer";
import type { RaceResult, RacerSummary } from "@/game/room/standings";

export type SessionMode =
  | { readonly kind: "practice" }
  | { readonly kind: "quick" }
  | { readonly kind: "create" }
  | { readonly kind: "join"; readonly code: string };

export interface PlayerProfile {
  readonly name: string;
  readonly color: RacerColor;
}

export type SessionPhase = "connecting" | "lobby" | "countdown" | "racing" | "finished" | "error";

/** Coarse, immutable UI state. Replaced (never mutated) whenever anything visible changes. */
export interface SessionSnapshot {
  readonly phase: SessionPhase;
  readonly localId: string;
  readonly roster: readonly RacerSummary[];
  readonly hostId: string | null;
  readonly roomCode: string | null;
  /** performance.now() timestamps, so they can be compared with the local clock. */
  readonly autoStartAtMs: number | null;
  readonly startAtMs: number | null;
  readonly finishTimes: ReadonlyMap<string, number>;
  /** Race time when the local player typed the last key, before queued movement completes. */
  readonly typedFinishMs: number | null;
  /** True once the local racer has visibly crossed the finish line. */
  readonly localCrossed: boolean;
  readonly results: readonly RaceResult[] | null;
  readonly progress: RacerProgress;
  readonly error: string | null;
}

export interface KeyFeedback {
  readonly correct: boolean;
  readonly events: readonly RacerEvent[];
}

/** A race the UI can render and type into, whether it runs locally or on the server. */
export interface RaceSession {
  readonly level: Level;
  /** Opponents are drawn this far in the past so network jitter never makes them stutter. */
  readonly opponentDelayMs: number;
  getSnapshot(): SessionSnapshot;
  subscribe(listener: () => void): () => void;
  onLocalKey(listener: (feedback: KeyFeedback) => void): () => void;
  timelines(): ReadonlyMap<string, Timeline>;
  /** Milliseconds since GO (negative during the countdown), or null before a countdown. */
  raceMs(): number | null;
  type(char: string): void;
  start(): void;
  dispose(): void;
}
