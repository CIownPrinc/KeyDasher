import type { MoveKind } from "../level/types";
import { clamp, distance, easeInOutSine, lerp, lerpVec, quadraticBezier, type Vec } from "../math";

interface MoveTiming {
  readonly baseMs: number;
  readonly unitsPerSecond: number;
}

/** How long each kind of move takes at flow 1. Tuned so the course reads well at a glance. */
const MOVE_TIMING: Readonly<Record<MoveKind, MoveTiming>> = {
  run: { baseMs: 40, unitsPerSecond: 560 },
  hop: { baseMs: 220, unitsPerSecond: 1100 },
  leap: { baseMs: 300, unitsPerSecond: 1000 },
  bounce: { baseMs: 550, unitsPerSecond: 1600 },
  climb: { baseMs: 150, unitsPerSecond: 300 },
  zip: { baseMs: 200, unitsPerSecond: 1050 },
  slide: { baseMs: 150, unitsPerSecond: 900 },
  lift: { baseMs: 350, unitsPerSecond: 650 },
  unlock: { baseMs: 550, unitsPerSecond: 500 },
};

const ARC_HEIGHT: Readonly<Partial<Record<MoveKind, number>>> = { hop: 46, leap: 90, bounce: 150 };
const ARC_CLIMB_FACTOR = 0.65;

/** Feet hang this far below a zipline cable. */
export const ZIP_HANG = 50;
const ZIP_GRAB_END = 0.12;
const ZIP_DROP_START = 0.9;
/** Unlocking spends the first part of the move turning the key. */
export const UNLOCK_TURN_SHARE = 0.55;

export function moveDurationMs(kind: MoveKind, from: Vec, to: Vec, flow: number): number {
  const timing = MOVE_TIMING[kind];
  return (timing.baseMs + (distance(from, to) / timing.unitsPerSecond) * 1000) / flow;
}

export function isAirborneMove(kind: MoveKind): boolean {
  return ARC_HEIGHT[kind] !== undefined;
}

export interface Cable {
  readonly start: Vec;
  readonly end: Vec;
}

export function zipCable(from: Vec, to: Vec): Cable {
  return { start: { x: from.x + 30, y: from.y - 150 }, end: { x: to.x - 30, y: to.y - 120 } };
}

export function slideControlPoint(from: Vec, to: Vec): Vec {
  return { x: lerp(from.x, to.x, 0.52), y: to.y - 120 };
}

/** Where a racer's feet are, `progress` of the way through a move. */
export function movePoint(kind: MoveKind, from: Vec, to: Vec, progress: number): Vec {
  const p = clamp(progress, 0, 1);
  switch (kind) {
    case "run":
      return lerpVec(from, to, p);
    case "hop":
    case "leap":
    case "bounce":
      return arcPoint(ARC_HEIGHT[kind] ?? 0, from, to, p);
    case "climb":
      return { x: lerp(from.x, to.x, p * p * p), y: lerp(from.y, to.y, easeInOutSine(p)) };
    case "zip":
      return zipPoint(from, to, p);
    case "slide":
      return quadraticBezier(from, slideControlPoint(from, to), to, accelerate(p));
    case "lift":
      return { x: from.x, y: lerp(from.y, to.y, easeInOutSine(p)) };
    case "unlock":
      return lerpVec(from, to, clamp((p - UNLOCK_TURN_SHARE) / (1 - UNLOCK_TURN_SHARE), 0, 1));
  }
}

function arcPoint(baseHeight: number, from: Vec, to: Vec, p: number): Vec {
  const height = baseHeight + Math.max(0, from.y - to.y) * ARC_CLIMB_FACTOR;
  return { x: lerp(from.x, to.x, p), y: lerp(from.y, to.y, p) - 4 * height * p * (1 - p) };
}

function zipPoint(from: Vec, to: Vec, p: number): Vec {
  const cable = zipCable(from, to);
  const grabbed = { x: cable.start.x, y: cable.start.y + ZIP_HANG };
  const released = { x: cable.end.x, y: cable.end.y + ZIP_HANG };
  if (p < ZIP_GRAB_END) return arcPoint(30, from, grabbed, p / ZIP_GRAB_END);
  if (p > ZIP_DROP_START) return lerpVec(released, to, (p - ZIP_DROP_START) / (1 - ZIP_DROP_START));
  const ride = (p - ZIP_GRAB_END) / (ZIP_DROP_START - ZIP_GRAB_END);
  return lerpVec(grabbed, released, accelerate(ride));
}

/** Starts slow and picks up speed, like gravity on a rope or a chute. */
function accelerate(t: number): number {
  return 0.35 * t + 0.65 * t * t;
}
