import { edgeOf, nodeOf, type Level, type MoveKind } from "../level/types";
import { lerp, type Vec } from "../math";
import type { RacerEvent } from "../racer/events";
import { moveDurationMs, movePoint } from "./moves";

export type SegmentKind = MoveKind | "stumble" | "fall" | "respawn";

export interface Segment {
  readonly kind: SegmentKind;
  readonly startMs: number;
  readonly durationMs: number;
  readonly from: Vec;
  readonly to: Vec;
  readonly flow: number;
  readonly edgeId: string | null;
}

export interface Pose extends Vec {
  readonly action: SegmentKind | "idle";
  /** 0..1 through the current segment; 1 while idle. */
  readonly progress: number;
  readonly flow: number;
  readonly edgeId: string | null;
  /** Changes whenever a new segment begins, so renderers can fire one-shot effects. */
  readonly segmentIndex: number;
}

export const STUMBLE_MS = 220;
export const FALL_MS = 900;
export const RESPAWN_MS = 650;
const FALL_DEPTH_BELOW_LAKE = 80;

/**
 * Turns a racer's logical events into motion over time. Moves queue behind each other, so a
 * fast typist can finish the next word mid-jump and chain moves without a pause.
 */
export class Timeline {
  private readonly segments: Segment[] = [];

  constructor(
    private readonly level: Level,
    private readonly startPosition: Vec,
  ) {}

  get endMs(): number {
    const last = this.segments.at(-1);
    return last ? last.startMs + last.durationMs : 0;
  }

  private get tail(): Vec {
    return this.segments.at(-1)?.to ?? this.startPosition;
  }

  apply(event: RacerEvent, timeMs: number): void {
    const startMs = Math.max(timeMs, this.endMs);
    switch (event.kind) {
      case "advance":
        this.pushMove(event.edgeId, event.flow, startMs);
        return;
      case "typo":
      case "crack":
        this.push("stumble", startMs, STUMBLE_MS, this.tail, this.tail, 1, null);
        return;
      case "fall":
        this.pushFall(event.edgeId, event.checkpointId, startMs);
        return;
    }
  }

  poseAt(timeMs: number): Pose {
    const index = this.segmentIndexAt(timeMs);
    const segment = this.segments[index];
    if (!segment) return idlePose(this.startPosition, -1);
    const progress = (timeMs - segment.startMs) / segment.durationMs;
    if (progress >= 1) return idlePose(segment.to, index);
    return {
      ...segmentPoint(segment, progress),
      action: segment.kind,
      progress,
      flow: segment.flow,
      edgeId: segment.edgeId,
      segmentIndex: index,
    };
  }

  segmentAt(index: number): Segment | undefined {
    return this.segments[index];
  }

  private pushMove(edgeId: string, flow: number, startMs: number): void {
    const edge = edgeOf(this.level, edgeId);
    const from = this.tail;
    const node = nodeOf(this.level, edge.to);
    const to = { x: node.x, y: node.y };
    const durationMs = moveDurationMs(edge.move, from, to, flow);
    this.push(edge.move, startMs, durationMs, from, to, flow, edgeId);
  }

  private pushFall(edgeId: string, checkpointId: string, startMs: number): void {
    const from = this.tail;
    const splash = { x: from.x + 30, y: this.level.lakeY + FALL_DEPTH_BELOW_LAKE };
    this.push("fall", startMs, FALL_MS, from, splash, 1, edgeId);
    const checkpoint = nodeOf(this.level, checkpointId);
    const respawnAt = { x: checkpoint.x, y: checkpoint.y };
    this.push("respawn", startMs + FALL_MS, RESPAWN_MS, respawnAt, respawnAt, 1, null);
  }

  private push(
    kind: SegmentKind,
    startMs: number,
    durationMs: number,
    from: Vec,
    to: Vec,
    flow: number,
    edgeId: string | null,
  ): void {
    this.segments.push({ kind, startMs, durationMs, from, to, flow, edgeId });
  }

  /** Index of the last segment that has started by `timeMs`, or -1. */
  private segmentIndexAt(timeMs: number): number {
    let low = 0;
    let high = this.segments.length - 1;
    let found = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const segment = this.segments[middle];
      if (segment && segment.startMs <= timeMs) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return found;
  }
}

function idlePose(at: Vec, segmentIndex: number): Pose {
  return { x: at.x, y: at.y, action: "idle", progress: 1, flow: 1, edgeId: null, segmentIndex };
}

function segmentPoint(segment: Segment, progress: number): Vec {
  switch (segment.kind) {
    case "stumble":
    case "respawn":
      return segment.from;
    case "fall":
      return fallPoint(segment.from, segment.to, progress);
    default:
      return movePoint(segment.kind, segment.from, segment.to, progress);
  }
}

/** A little hop of surprise, then gravity wins. */
function fallPoint(from: Vec, to: Vec, progress: number): Vec {
  return {
    x: lerp(from.x, to.x, progress),
    y: lerp(from.y, to.y, progress * progress) - 60 * Math.sin(Math.PI * progress) * (1 - progress),
  };
}
