import { z } from "zod";
import type { Vec } from "../math";

export const MOVE_KINDS = [
  "run",
  "hop",
  "leap",
  "bounce",
  "climb",
  "zip",
  "slide",
  "lift",
  "unlock",
] as const;
export type MoveKind = (typeof MOVE_KINDS)[number];

export const ROUTE_TAGS = ["safe", "risky", "shortcut"] as const;
export type RouteTag = (typeof ROUTE_TAGS)[number];

/** Attached to the first edge of a branch so players can see what they are choosing. */
export const routeInfoSchema = z.object({
  name: z.string().max(40),
  tag: z.enum(ROUTE_TAGS),
  blurb: z.string().max(120),
});
export type RouteInfo = z.infer<typeof routeInfoSchema>;

export interface LevelNode extends Vec {
  readonly id: string;
  readonly checkpoint: boolean;
}

/** One typed word moves a racer along one edge. */
export interface LevelEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly word: string;
  readonly move: MoveKind;
  /** Two typos while typing a risky word drop the racer back to their last checkpoint. */
  readonly risky: boolean;
  readonly route: RouteInfo | null;
}

export type PlatformStyle = "ground" | "island" | "crumble";

export interface Platform {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly style: PlatformStyle;
}

export interface Level {
  readonly id: string;
  readonly name: string;
  readonly nodes: ReadonlyMap<string, LevelNode>;
  readonly edges: ReadonlyMap<string, LevelEdge>;
  readonly outgoing: ReadonlyMap<string, readonly LevelEdge[]>;
  readonly startNodeId: string;
  readonly finishNodeId: string;
  readonly platforms: readonly Platform[];
  /** World y of the jelly lake surface that racers fall into. */
  readonly lakeY: number;
}

export function nodeOf(level: Level, nodeId: string): LevelNode {
  const node = level.nodes.get(nodeId);
  if (!node) throw new Error(`Level ${level.id} has no node "${nodeId}"`);
  return node;
}

export function edgeOf(level: Level, edgeId: string): LevelEdge {
  const edge = level.edges.get(edgeId);
  if (!edge) throw new Error(`Level ${level.id} has no edge "${edgeId}"`);
  return edge;
}

const NO_EDGES: readonly LevelEdge[] = [];

export function outgoingOf(level: Level, nodeId: string): readonly LevelEdge[] {
  return level.outgoing.get(nodeId) ?? NO_EDGES;
}

/** 0 at the start line, 1 at the finish line, measured horizontally. */
export function courseProgress(level: Level, x: number): number {
  const startX = nodeOf(level, level.startNodeId).x;
  const finishX = nodeOf(level, level.finishNodeId).x;
  return Math.min(1, Math.max(0, (x - startX) / (finishX - startX)));
}
