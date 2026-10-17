import { clamp, type Vec } from "@/game/math";
import type { Pose } from "@/game/motion/timeline";
import { RACER_SWATCHES, type RacerColor } from "@/game/racer/colors";
import { INK } from "./palette";

export const DASHER_RADIUS = 20;
const SCARF_LINKS = 7;
const SCARF_LINK_LENGTH = 6;
const LAND_SQUASH = 0.32;
const SQUASH_RECOVERY_RATE = 10;

/** Per-racer animation memory: everything the pose alone can't tell us. */
export class DasherLook {
  private squash = 0;
  private scarf: Vec[] = [];
  private lastPose: Vec | null = null;
  private velocity: Vec = { x: 0, y: 0 };
  private footPhase = 0;
  private blinkTimer = 2 + Math.random() * 3;

  constructor(readonly color: RacerColor) {}

  land(strength = 1): void {
    this.squash = Math.max(this.squash, LAND_SQUASH * strength);
  }

  get speed(): Vec {
    return this.velocity;
  }

  update(pose: Pose, deltaSeconds: number): void {
    if (this.lastPose && deltaSeconds > 0) {
      const vx = (pose.x - this.lastPose.x) / deltaSeconds;
      const vy = (pose.y - this.lastPose.y) / deltaSeconds;
      const blend = 1 - Math.exp(-20 * deltaSeconds);
      this.velocity = {
        x: this.velocity.x + (vx - this.velocity.x) * blend,
        y: this.velocity.y + (vy - this.velocity.y) * blend,
      };
    }
    this.lastPose = pose;
    this.squash *= Math.exp(-SQUASH_RECOVERY_RATE * deltaSeconds);
    this.footPhase += Math.abs(this.velocity.x) * deltaSeconds * 0.09;
    this.blinkTimer -= deltaSeconds;
    if (this.blinkTimer < -0.12) this.blinkTimer = 2 + Math.random() * 3;
    this.updateScarf(pose, deltaSeconds);
  }

  /** `charge` 0..1 crouches the racer while a word is being typed. */
  draw(context: CanvasRenderingContext2D, pose: Pose, alpha: number, charge: number): void {
    const swatch = RACER_SWATCHES[this.color];
    const airborne = Math.abs(this.velocity.y) > 60 && pose.action !== "climb" && pose.action !== "lift";
    const stretch = airborne ? clamp(Math.abs(this.velocity.y) / 3000, 0, 0.22) : 0;
    const crouch = pose.action === "idle" ? charge * 0.12 : 0;
    const scaleY = 1 - this.squash - crouch + stretch;
    const scaleX = 1 + this.squash * 0.8 + crouch * 0.7 - stretch * 0.6;

    context.save();
    context.globalAlpha = alpha * appearAlpha(pose);
    context.translate(pose.x, pose.y);
    this.drawScarfAt(context, pose, swatch.shade);
    context.rotate(tiltFor(pose, this.velocity));
    const appear = appearScale(pose);
    context.scale(scaleX * appear, scaleY * appear);

    drawFeet(context, pose, this.footPhase, swatch.shade);
    const bodyY = -DASHER_RADIUS;
    const body = context.createRadialGradient(-6, bodyY - 8, 4, 0, bodyY, DASHER_RADIUS + 2);
    body.addColorStop(0, lighten(swatch.body));
    body.addColorStop(0.7, swatch.body);
    body.addColorStop(1, swatch.shade);
    context.fillStyle = body;
    context.beginPath();
    context.arc(0, bodyY, DASHER_RADIUS, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "rgba(58, 36, 89, 0.35)";
    context.lineWidth = 2;
    context.stroke();

    this.drawFace(context, pose, bodyY);
    if (pose.action === "zip") drawHandle(context, bodyY);
    context.restore();
  }

  private drawFace(context: CanvasRenderingContext2D, pose: Pose, bodyY: number): void {
    const look = clamp(this.velocity.x / 600, -1, 1);
    const lookY = clamp(this.velocity.y / 900, -1, 1);
    const blinking = this.blinkTimer < 0;
    const dizzy = pose.action === "stumble" || pose.action === "fall";
    for (const side of [-1, 1]) {
      const eyeX = side * 7 + 3;
      const eyeY = bodyY - 4;
      context.fillStyle = "#ffffff";
      context.beginPath();
      context.ellipse(eyeX, eyeY, 5.5, blinking ? 1 : 7, 0, 0, Math.PI * 2);
      context.fill();
      if (blinking) continue;
      context.fillStyle = INK;
      if (dizzy) {
        context.font = "bold 10px sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText("x", eyeX, eyeY);
      } else {
        context.beginPath();
        context.arc(eyeX + look * 2 + 1, eyeY + lookY * 2.5, 3, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.fillStyle = "rgba(255, 120, 160, 0.55)";
    for (const side of [-1, 1]) {
      context.beginPath();
      context.ellipse(side * 12 + 3, bodyY + 5, 3.5, 2.2, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.strokeStyle = INK;
    context.lineWidth = 2;
    context.beginPath();
    if (pose.action === "fall") context.arc(4, bodyY + 9, 3.5, 0, Math.PI * 2);
    else context.arc(4, bodyY + 5, 4, 0.2, Math.PI - 0.2);
    context.stroke();
  }

  private updateScarf(pose: Pose, deltaSeconds: number): void {
    const anchor = { x: pose.x - 12, y: pose.y - DASHER_RADIUS * 1.55 };
    if (this.scarf.length === 0) {
      this.scarf = Array.from({ length: SCARF_LINKS }, (_, index) => ({
        x: anchor.x - index * 5,
        y: anchor.y,
      }));
      return;
    }
    const sway = Math.sin(performance.now() / 160) * 18;
    this.scarf[0] = anchor;
    for (let index = 1; index < this.scarf.length; index += 1) {
      const previous = this.scarf[index - 1] ?? anchor;
      const current = this.scarf[index] ?? previous;
      const drifted = { x: current.x - 30 * deltaSeconds, y: current.y + (40 + sway) * deltaSeconds };
      const dx = drifted.x - previous.x;
      const dy = drifted.y - previous.y;
      const length = Math.hypot(dx, dy) || 1;
      this.scarf[index] = {
        x: previous.x + (dx / length) * SCARF_LINK_LENGTH,
        y: previous.y + (dy / length) * SCARF_LINK_LENGTH,
      };
    }
  }

  private drawScarfAt(context: CanvasRenderingContext2D, pose: Pose, color: string): void {
    if (this.scarf.length === 0 || appearScale(pose) < 1) return;
    context.save();
    context.translate(-pose.x, -pose.y);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#ffffff";
    context.lineWidth = 7;
    tracePolyline(context, this.scarf);
    context.stroke();
    context.strokeStyle = color;
    context.lineWidth = 3;
    tracePolyline(context, this.scarf);
    context.stroke();
    context.restore();
  }
}

function tracePolyline(context: CanvasRenderingContext2D, points: readonly Vec[]): void {
  context.beginPath();
  for (const [index, point] of points.entries()) {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
}

function tiltFor(pose: Pose, velocity: Vec): number {
  switch (pose.action) {
    case "stumble":
      return Math.sin(pose.progress * Math.PI * 4) * 0.35;
    case "fall":
      return pose.progress * Math.PI * 3;
    case "zip":
    case "slide":
      return -0.18 + Math.sin(performance.now() / 120) * 0.05;
    case "climb":
      return Math.sin(pose.progress * Math.PI * 2) * 0.1;
    default:
      return clamp(velocity.x / 4000, -0.15, 0.15);
  }
}

function appearScale(pose: Pose): number {
  return pose.action === "respawn" ? Math.min(1, pose.progress * 1.6) : 1;
}

function appearAlpha(pose: Pose): number {
  if (pose.action === "respawn") return Math.min(1, pose.progress * 2);
  return 1;
}

function drawFeet(context: CanvasRenderingContext2D, pose: Pose, phase: number, color: string): void {
  context.fillStyle = color;
  const running = pose.action === "run" || pose.action === "unlock";
  for (const side of [-1, 1]) {
    const stride = running ? Math.sin(phase + (side > 0 ? Math.PI : 0)) * 6 : 0;
    const lift = running ? Math.max(0, Math.cos(phase + (side > 0 ? Math.PI : 0))) * 4 : 0;
    const tuck = pose.action === "climb" ? -6 : 0;
    context.beginPath();
    context.ellipse(side * 8 + stride, -3 - lift + tuck, 7, 4.5, 0, 0, Math.PI * 2);
    context.fill();
  }
}

function drawHandle(context: CanvasRenderingContext2D, bodyY: number): void {
  context.strokeStyle = INK;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(-6, bodyY - DASHER_RADIUS + 2);
  context.lineTo(-2, bodyY - DASHER_RADIUS - 26);
  context.moveTo(8, bodyY - DASHER_RADIUS + 2);
  context.lineTo(4, bodyY - DASHER_RADIUS - 26);
  context.stroke();
}

function lighten(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.min(255, ((value >> shift) & 0xff) + 60);
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}
