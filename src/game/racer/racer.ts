import { z } from "zod";
import { edgeOf, nodeOf, outgoingOf, routeInfoSchema, type Level, type LevelEdge } from "../level/types";
import type { RacerEvent } from "./events";
import { flowForStreak, RISKY_TYPO_LIMIT } from "./rules";

export const routeTakenSchema = z.object({ route: routeInfoSchema, fell: z.boolean() });
export type RouteTaken = z.infer<typeof routeTakenSchema>;

export interface RacerStats {
  readonly keystrokes: number;
  readonly correct: number;
  readonly typos: number;
  readonly falls: number;
}

/**
 * The logical state of one racer. It depends only on the sequence of keys typed, never on
 * time, so the server and a predicting client always agree given the same keystrokes.
 */
export interface RacerProgress {
  readonly nodeId: string;
  /** The word being typed, or null while standing at a fork that hasn't been chosen yet. */
  readonly edgeId: string | null;
  readonly typed: number;
  readonly cracks: number;
  readonly streak: number;
  readonly wordClean: boolean;
  readonly checkpointId: string;
  readonly finished: boolean;
  readonly stats: RacerStats;
  readonly routes: readonly RouteTaken[];
}

export interface KeyOutcome {
  readonly progress: RacerProgress;
  readonly events: readonly RacerEvent[];
}

const NO_STATS: RacerStats = { keystrokes: 0, correct: 0, typos: 0, falls: 0 };

export function startProgress(level: Level): RacerProgress {
  return {
    nodeId: level.startNodeId,
    edgeId: autoSelectedEdge(level, level.startNodeId),
    typed: 0,
    cracks: 0,
    streak: 0,
    wordClean: true,
    checkpointId: level.startNodeId,
    finished: false,
    stats: NO_STATS,
    routes: [],
  };
}

/** Choices a racer can make right now: the committed word, or every branch at a fork. */
export function availableEdges(level: Level, progress: RacerProgress): readonly LevelEdge[] {
  if (progress.finished) return [];
  if (progress.edgeId) return [edgeOf(level, progress.edgeId)];
  return outgoingOf(level, progress.nodeId);
}

export function applyKey(level: Level, progress: RacerProgress, char: string): KeyOutcome {
  if (progress.finished) return { progress, events: [] };
  const edge = progress.edgeId ? edgeOf(level, progress.edgeId) : chooseBranch(level, progress.nodeId, char);
  if (!edge) return missedFork(progress);

  const chosen = progress.edgeId ? progress : commitToBranch(progress, edge);
  if (edge.word[chosen.typed] !== char) return mistype(chosen, edge);
  return typeCorrectly(level, chosen, edge);
}

function chooseBranch(level: Level, nodeId: string, char: string): LevelEdge | undefined {
  return outgoingOf(level, nodeId).find((edge) => edge.word.startsWith(char));
}

function commitToBranch(progress: RacerProgress, edge: LevelEdge): RacerProgress {
  const routes = edge.route ? [...progress.routes, { route: edge.route, fell: false }] : progress.routes;
  return { ...progress, edgeId: edge.id, routes };
}

function missedFork(progress: RacerProgress): KeyOutcome {
  return {
    progress: { ...progress, streak: 0, stats: countKey(progress.stats, false) },
    events: [{ kind: "typo" }],
  };
}

function mistype(progress: RacerProgress, edge: LevelEdge): KeyOutcome {
  const stats = countKey(progress.stats, false);
  const cracks = edge.risky ? progress.cracks + 1 : progress.cracks;
  if (cracks >= RISKY_TYPO_LIMIT) return fall(progress, edge, stats);

  const progressAfter = { ...progress, streak: 0, wordClean: false, cracks, stats };
  const event: RacerEvent = edge.risky ? { kind: "crack", edgeId: edge.id } : { kind: "typo" };
  return { progress: progressAfter, events: [event] };
}

function fall(progress: RacerProgress, edge: LevelEdge, stats: RacerStats): KeyOutcome {
  const routes = progress.routes.map((taken, index) =>
    index === progress.routes.length - 1 ? { ...taken, fell: true } : taken,
  );
  return {
    progress: {
      ...progress,
      nodeId: progress.checkpointId,
      edgeId: null,
      typed: 0,
      cracks: 0,
      streak: 0,
      wordClean: true,
      stats: { ...stats, falls: stats.falls + 1 },
      routes,
    },
    events: [{ kind: "fall", edgeId: edge.id, checkpointId: progress.checkpointId }],
  };
}

function typeCorrectly(level: Level, progress: RacerProgress, edge: LevelEdge): KeyOutcome {
  const typed = progress.typed + 1;
  const stats = countKey(progress.stats, true);
  if (typed < edge.word.length) return { progress: { ...progress, typed, stats }, events: [] };

  const streak = progress.wordClean ? progress.streak + 1 : 0;
  const arrived = nodeOf(level, edge.to);
  return {
    progress: {
      ...progress,
      nodeId: arrived.id,
      edgeId: autoSelectedEdge(level, arrived.id),
      typed: 0,
      cracks: 0,
      streak,
      wordClean: true,
      checkpointId: arrived.checkpoint ? arrived.id : progress.checkpointId,
      finished: arrived.id === level.finishNodeId,
      stats,
    },
    events: [{ kind: "advance", edgeId: edge.id, flow: flowForStreak(streak) }],
  };
}

/** A node with a single way forward commits to it immediately, so risky words crack from the first key. */
function autoSelectedEdge(level: Level, nodeId: string): string | null {
  const options = outgoingOf(level, nodeId);
  return options.length === 1 && options[0] ? options[0].id : null;
}

function countKey(stats: RacerStats, correct: boolean): RacerStats {
  return {
    ...stats,
    keystrokes: stats.keystrokes + 1,
    correct: correct ? stats.correct + 1 : stats.correct,
    typos: correct ? stats.typos : stats.typos + 1,
  };
}
