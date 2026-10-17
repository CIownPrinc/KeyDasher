export interface Vec {
  readonly x: number;
  readonly y: number;
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

export function lerpVec(from: Vec, to: Vec, t: number): Vec {
  return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

export function easeInQuad(t: number): number {
  return t * t;
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function quadraticBezier(p0: Vec, control: Vec, p2: Vec, t: number): Vec {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * p0.x + 2 * inverse * t * control.x + t * t * p2.x,
    y: inverse * inverse * p0.y + 2 * inverse * t * control.y + t * t * p2.y,
  };
}
