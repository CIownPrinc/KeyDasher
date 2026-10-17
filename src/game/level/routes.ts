import { outgoingOf, type Level, type LevelEdge } from "./types";

export interface RouteSummary {
  readonly words: number;
  readonly letters: number;
  readonly riskyWords: number;
}

/** Counts what a branch asks of you, from its first word up to where branches rejoin. */
export function summarizeRoute(level: Level, firstEdge: LevelEdge): RouteSummary {
  const merges = mergeNodes(level);
  let words = 0;
  let letters = 0;
  let riskyWords = 0;
  for (let edge: LevelEdge | undefined = firstEdge; edge;) {
    words += 1;
    letters += edge.word.length;
    if (edge.risky) riskyWords += 1;
    if (merges.has(edge.to)) break;
    const next = outgoingOf(level, edge.to);
    edge = next.length === 1 ? next[0] : undefined;
  }
  return { words, letters, riskyWords };
}

function mergeNodes(level: Level): Set<string> {
  const incoming = new Map<string, number>();
  for (const edge of level.edges.values()) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  return new Set([...incoming].filter(([, count]) => count > 1).map(([nodeId]) => nodeId));
}
