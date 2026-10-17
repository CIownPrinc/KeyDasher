import type { Vec } from "@/game/math";

/** World units visible top-to-bottom on a wide screen. */
const VIEW_HEIGHT = 640;
/** Never show less than this much course ahead and behind. */
const MIN_VIEW_WIDTH = 820;
/** Where the followed racer sits on screen, as a fraction of width and height. */
const ANCHOR_X = 0.36;
const ANCHOR_Y = 0.44;
const FOLLOW_X_RATE = 5;
const FOLLOW_Y_RATE = 3;
const SHAKE_DECAY_RATE = 9;

/** Smoothly follows a target and converts between world and screen space. */
export class Camera {
  private position: Vec | null = null;
  private shakeStrength = 0;
  private shakeOffset: Vec = { x: 0, y: 0 };
  scale = 1;
  width = 1;
  height = 1;

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.scale = Math.min(height / VIEW_HEIGHT, width / MIN_VIEW_WIDTH);
  }

  follow(target: Vec, deltaSeconds: number): void {
    if (!this.position) {
      this.position = target;
      return;
    }
    const blendX = 1 - Math.exp(-FOLLOW_X_RATE * deltaSeconds);
    const blendY = 1 - Math.exp(-FOLLOW_Y_RATE * deltaSeconds);
    this.position = {
      x: this.position.x + (target.x - this.position.x) * blendX,
      y: this.position.y + (target.y - this.position.y) * blendY,
    };
    this.shakeStrength *= Math.exp(-SHAKE_DECAY_RATE * deltaSeconds);
    const angle = Math.random() * Math.PI * 2;
    this.shakeOffset = {
      x: Math.cos(angle) * this.shakeStrength,
      y: Math.sin(angle) * this.shakeStrength,
    };
  }

  shake(strength: number): void {
    this.shakeStrength = Math.max(this.shakeStrength, strength);
  }

  /** World x at the screen's anchor point; parallax layers scroll relative to this. */
  get focusX(): number {
    return this.position?.x ?? 0;
  }

  get focusY(): number {
    return this.position?.y ?? 0;
  }

  /** Maps world units to CSS pixels: screen = world * scale + offset. */
  transform(): { readonly scale: number; readonly offsetX: number; readonly offsetY: number } {
    const focus = this.position ?? { x: 0, y: 0 };
    return {
      scale: this.scale,
      offsetX: this.width * ANCHOR_X - (focus.x + this.shakeOffset.x) * this.scale,
      offsetY: this.height * ANCHOR_Y - (focus.y + this.shakeOffset.y) * this.scale,
    };
  }

  /** The world-space rectangle currently on screen. */
  visibleWorld(): { left: number; right: number; top: number; bottom: number } {
    const focus = this.position ?? { x: 0, y: 0 };
    const left = focus.x - (this.width * ANCHOR_X) / this.scale;
    const top = focus.y - (this.height * ANCHOR_Y) / this.scale;
    return {
      left,
      right: left + this.width / this.scale,
      top,
      bottom: top + this.height / this.scale,
    };
  }
}
