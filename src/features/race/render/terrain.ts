import { nodeOf, type Level, type LevelEdge, type LevelNode, type Platform } from "@/game/level/types";
import { quadraticBezier, type Vec } from "@/game/math";
import { slideControlPoint, zipCable } from "@/game/motion/moves";
import { createRng, pickOne } from "@/game/random";
import { BISCUIT, CAKE, GOLD, INK, SPRINKLES } from "./palette";

/** Per-frame facts about the world that change how static scenery looks. */
export interface WorldState {
  readonly seconds: number;
  /** Local racer's cracks on the biscuit under each node. */
  readonly crackedNodes: ReadonlyMap<string, number>;
  /** 0..1 how far a broken biscuit has fallen. */
  readonly fallingNodes: ReadonlyMap<string, number>;
  readonly reachedCheckpoints: ReadonlySet<string>;
  readonly openDoors: ReadonlySet<string>;
  /** Feet positions of racers currently riding or parked on a lift. */
  readonly liftRiders: readonly Vec[];
  /** 0..1 compression of the spring under each node. */
  readonly springPress: ReadonlyMap<string, number>;
}

type DecorKind = "lollipop" | "gumdrop" | "mushroom" | "cane";

interface Decor {
  readonly kind: DecorKind;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly color: string;
}

interface PlatformLook {
  readonly platform: Platform;
  readonly frosting: string;
  readonly drips: readonly (readonly [x: number, length: number])[];
  readonly sprinkles: readonly (readonly [x: number, y: number, angle: number, color: string])[];
}

const GROUND_CORNER = 18;
const ISLAND_THICKNESS = 46;
const BISCUIT_THICKNESS = 24;
const FROSTING_DEPTH = 13;

/** Precomputed, seeded scenery so the course looks identical every frame and every race. */
export class Terrain {
  private readonly looks: readonly PlatformLook[];
  private readonly decor: readonly Decor[];
  private readonly nodeOnPlatform: ReadonlyMap<Platform, LevelNode>;

  constructor(private readonly level: Level) {
    const rng = createRng(20_261_016);
    this.looks = level.platforms.map((platform, index) => describePlatform(platform, index, rng));
    this.decor = level.platforms.flatMap((platform) => scatterDecor(platform, level, rng));
    this.nodeOnPlatform = new Map(
      level.platforms.flatMap((platform) => {
        const node = [...level.nodes.values()].find(
          (candidate) =>
            candidate.y === platform.top && candidate.x >= platform.left && candidate.x <= platform.right,
        );
        return node ? [[platform, node] as const] : [];
      }),
    );
  }

  drawBehindRacers(context: CanvasRenderingContext2D, bottom: number, state: WorldState): void {
    for (const decor of this.decor) drawDecor(context, decor);
    for (const edge of this.level.edges.values()) this.drawEdgeProp(context, edge, state);
    for (const look of this.looks) this.drawPlatform(context, look, bottom, state);
    this.drawStartLine(context);
    for (const node of this.level.nodes.values()) {
      if (node.checkpoint) drawFlag(context, node, state.reachedCheckpoints.has(node.id), state.seconds);
    }
    for (const rider of state.liftRiders) drawLiftDisc(context, rider);
  }

  drawInFrontOfRacers(context: CanvasRenderingContext2D, fontFamily: string): void {
    drawFinishArch(context, nodeOf(this.level, this.level.finishNodeId), fontFamily);
  }

  private drawPlatform(
    context: CanvasRenderingContext2D,
    look: PlatformLook,
    bottom: number,
    state: WorldState,
  ): void {
    const { platform } = look;
    switch (platform.style) {
      case "ground":
        drawCake(context, look, bottom - platform.top);
        return;
      case "island":
        drawCake(context, look, ISLAND_THICKNESS);
        return;
      case "crumble": {
        const node = this.nodeOnPlatform.get(platform);
        const cracks = node ? (state.crackedNodes.get(node.id) ?? 0) : 0;
        const falling = node ? (state.fallingNodes.get(node.id) ?? 0) : 0;
        drawBiscuit(context, platform, cracks, falling);
        return;
      }
    }
  }

  private drawEdgeProp(context: CanvasRenderingContext2D, edge: LevelEdge, state: WorldState): void {
    const from = nodeOf(this.level, edge.from);
    const to = nodeOf(this.level, edge.to);
    switch (edge.move) {
      case "bounce":
        drawSpring(context, from, state.springPress.get(from.id) ?? 0);
        return;
      case "climb":
        drawVine(context, from, to, state.seconds);
        return;
      case "lift":
        drawLiftRig(context, from, to, state.liftRiders.length === 0);
        return;
      case "zip":
        drawZipline(context, from, to);
        return;
      case "slide":
        drawChute(context, from, to);
        return;
      case "unlock":
        drawDoor(context, to, state.openDoors.has(to.id));
        return;
      case "run":
      case "hop":
      case "leap":
        return;
    }
  }

  private drawStartLine(context: CanvasRenderingContext2D): void {
    const start = nodeOf(this.level, this.level.startNodeId);
    const size = 10;
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        context.fillStyle = (row + column) % 2 === 0 ? "#ffffff" : INK;
        context.fillRect(start.x + 30 + column * size, start.y + row * size, size, size);
      }
    }
  }
}

function describePlatform(platform: Platform, index: number, rng: () => number): PlatformLook {
  const width = platform.right - platform.left;
  const drips: (readonly [number, number])[] = [];
  for (let x = platform.left + 14 + rng() * 20; x < platform.right - 14; x += 26 + rng() * 34) {
    drips.push([x, 6 + rng() * 14]);
  }
  const sprinkles = Array.from({ length: Math.floor(width / 26) }, () => {
    return [
      platform.left + 8 + rng() * (width - 16),
      platform.top + 3 + rng() * (FROSTING_DEPTH - 4),
      rng() * Math.PI,
      pickOne(rng, SPRINKLES),
    ] as const;
  });
  const frosting = CAKE.frostings[index % CAKE.frostings.length] ?? CAKE.frostings[0];
  return { platform, frosting, drips, sprinkles };
}

function scatterDecor(platform: Platform, level: Level, rng: () => number): Decor[] {
  if (platform.style !== "ground" || platform.top !== 600 || platform.right - platform.left < 220) return [];
  const finishX = nodeOf(level, level.finishNodeId).x;
  const decor: Decor[] = [];
  for (let x = platform.left + 50 + rng() * 60; x < platform.right - 40; x += 120 + rng() * 160) {
    if (Math.abs(x - finishX) < 120) continue;
    decor.push({
      kind: pickOne(rng, ["lollipop", "gumdrop", "mushroom", "cane"] as const),
      x,
      y: platform.top,
      scale: 0.75 + rng() * 0.5,
      color: pickOne(rng, SPRINKLES.slice(0, 4)),
    });
  }
  return decor;
}

function drawCake(context: CanvasRenderingContext2D, look: PlatformLook, thickness: number): void {
  const { platform } = look;
  const width = platform.right - platform.left;
  const body = context.createLinearGradient(0, platform.top, 0, platform.top + Math.min(thickness, 320));
  body.addColorStop(0, CAKE.body);
  body.addColorStop(1, CAKE.bodyDeep);
  context.fillStyle = body;
  context.strokeStyle = CAKE.outline;
  context.lineWidth = 3;
  context.beginPath();
  const isIsland = platform.style === "island";
  const bottomRadius = isIsland ? ISLAND_THICKNESS / 2 : 0;
  context.roundRect(platform.left, platform.top, width, thickness, [
    GROUND_CORNER,
    GROUND_CORNER,
    bottomRadius,
    bottomRadius,
  ]);
  context.fill();
  context.stroke();

  context.strokeStyle = CAKE.layer;
  context.lineWidth = 6;
  for (let layerY = platform.top + 62; layerY < platform.top + thickness - 20; layerY += 78) {
    context.beginPath();
    for (let x = platform.left + 6; x <= platform.right - 6; x += 12) {
      const y = layerY + Math.sin(x * 0.08) * 2;
      if (x === platform.left + 6) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
  drawFrosting(context, look);
}

function drawFrosting(context: CanvasRenderingContext2D, look: PlatformLook): void {
  const { platform } = look;
  context.fillStyle = look.frosting;
  context.beginPath();
  context.roundRect(
    platform.left - 3,
    platform.top - 3,
    platform.right - platform.left + 6,
    FROSTING_DEPTH + 3,
    [GROUND_CORNER, GROUND_CORNER, 6, 6],
  );
  context.fill();
  for (const [x, length] of look.drips) {
    context.beginPath();
    context.roundRect(x - 5, platform.top + FROSTING_DEPTH - 4, 10, length, 5);
    context.fill();
  }
  context.fillStyle = "rgba(255, 255, 255, 0.45)";
  context.beginPath();
  context.roundRect(platform.left + 10, platform.top, platform.right - platform.left - 20, 4, 2);
  context.fill();
  for (const [x, y, angle, color] of look.sprinkles) {
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.fillStyle = color;
    context.fillRect(-3, -1, 6, 2.4);
    context.restore();
  }
}

function drawBiscuit(
  context: CanvasRenderingContext2D,
  platform: Platform,
  cracks: number,
  falling: number,
): void {
  const width = platform.right - platform.left;
  context.save();
  context.translate(platform.left + width / 2, platform.top + falling * falling * 520);
  context.rotate(falling * 0.6);
  context.globalAlpha = 1 - falling;
  const wobble = cracks > 0 ? Math.sin(performance.now() / 40) * 1.5 : 0;
  context.translate(wobble, 0);
  context.fillStyle = BISCUIT.body;
  context.strokeStyle = BISCUIT.edge;
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(-width / 2, 0, width, BISCUIT_THICKNESS, 8);
  context.fill();
  context.stroke();
  context.fillStyle = BISCUIT.dots;
  for (let x = -width / 2 + 14; x < width / 2 - 8; x += 18) {
    for (const y of [8, 16]) {
      context.beginPath();
      context.arc(x + (y === 16 ? 9 : 0), y, 2, 0, Math.PI * 2);
      context.fill();
    }
  }
  if (cracks > 0) {
    context.strokeStyle = BISCUIT.crack;
    context.lineWidth = 2.5;
    context.beginPath();
    context.moveTo(-6, 0);
    context.lineTo(2, 8);
    context.lineTo(-4, 14);
    context.lineTo(4, BISCUIT_THICKNESS);
    context.moveTo(2, 8);
    context.lineTo(16, 12);
    context.stroke();
  }
  context.restore();
}

function drawSpring(context: CanvasRenderingContext2D, at: Vec, press: number): void {
  const height = 26 - press * 14;
  context.strokeStyle = "#8a8fa8";
  context.lineWidth = 4;
  context.beginPath();
  for (let coil = 0; coil <= 6; coil += 1) {
    const y = at.y - (coil / 6) * height;
    context.lineTo(at.x + (coil % 2 === 0 ? -12 : 12), y);
  }
  context.stroke();
  context.fillStyle = "#ff4d6d";
  context.beginPath();
  context.roundRect(at.x - 22, at.y - height - 8, 44, 9, 4);
  context.fill();
}

function drawVine(context: CanvasRenderingContext2D, from: Vec, to: Vec, seconds: number): void {
  const x = Math.min(from.x, to.x) + 26;
  const top = Math.min(from.y, to.y) - 4;
  const bottom = Math.max(from.y, to.y);
  context.strokeStyle = "#3fae6a";
  context.lineWidth = 5;
  context.beginPath();
  for (let y = top; y <= bottom; y += 8) {
    const sway = Math.sin(y * 0.06 + seconds * 1.5) * 4;
    if (y === top) context.moveTo(x + sway, y);
    else context.lineTo(x + sway, y);
  }
  context.stroke();
  context.fillStyle = "#62d68a";
  for (let y = top + 10; y < bottom; y += 22) {
    const side = Math.round(y / 22) % 2 === 0 ? 1 : -1;
    context.beginPath();
    context.ellipse(x + side * 7, y, 7, 4, side * 0.6, 0, Math.PI * 2);
    context.fill();
  }
}

function drawLiftRig(context: CanvasRenderingContext2D, from: Vec, to: Vec, showParkedDisc: boolean): void {
  context.strokeStyle = "#7b6cff";
  context.lineWidth = 6;
  for (const offset of [-38, 38]) {
    context.beginPath();
    context.moveTo(from.x + offset, from.y);
    context.lineTo(from.x + offset, to.y - 78);
    context.stroke();
  }
  context.fillStyle = "#ffc93c";
  context.beginPath();
  context.roundRect(from.x - 46, to.y - 88, 92, 12, 6);
  context.fill();

  const leverX = from.x - 66;
  context.strokeStyle = INK;
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(leverX, from.y);
  context.lineTo(leverX + 12, from.y - 34);
  context.stroke();
  context.fillStyle = "#ff4d6d";
  context.beginPath();
  context.arc(leverX + 12, from.y - 36, 7, 0, Math.PI * 2);
  context.fill();
  if (showParkedDisc) drawLiftDisc(context, from);
}

function drawLiftDisc(context: CanvasRenderingContext2D, feet: Vec): void {
  context.fillStyle = "#ffc93c";
  context.strokeStyle = "#d99a00";
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(feet.x - 36, feet.y, 72, 14, 7);
  context.fill();
  context.stroke();
}

function drawZipline(context: CanvasRenderingContext2D, from: Vec, to: Vec): void {
  const cable = zipCable(from, to);
  context.strokeStyle = "#8d5a3b";
  context.lineWidth = 8;
  context.beginPath();
  context.moveTo(cable.start.x, from.y);
  context.lineTo(cable.start.x, cable.start.y - 14);
  context.moveTo(cable.end.x, to.y);
  context.lineTo(cable.end.x, cable.end.y - 14);
  context.stroke();
  context.strokeStyle = INK;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(cable.start.x, cable.start.y);
  context.lineTo(cable.end.x, cable.end.y);
  context.stroke();
}

function drawChute(context: CanvasRenderingContext2D, from: Vec, to: Vec): void {
  const control = slideControlPoint(from, to);
  const points = Array.from({ length: 33 }, (_, index) => quadraticBezier(from, control, to, index / 32));
  context.strokeStyle = "#c08cff";
  context.lineWidth = 6;
  for (const point of points.filter((_, index) => index % 6 === 3)) {
    context.beginPath();
    context.moveTo(point.x, point.y + 12);
    context.lineTo(point.x, point.y + 900);
    context.stroke();
  }
  const trace = () => {
    context.beginPath();
    for (const [index, point] of points.entries()) {
      if (index === 0) context.moveTo(point.x, point.y + 8);
      else context.lineTo(point.x, point.y + 8);
    }
  };
  context.lineCap = "round";
  context.strokeStyle = "#ff5fa2";
  context.lineWidth = 20;
  trace();
  context.stroke();
  context.strokeStyle = "#ffffff";
  context.lineWidth = 8;
  context.setLineDash([16, 18]);
  trace();
  context.stroke();
  context.setLineDash([]);
}

function drawDoor(context: CanvasRenderingContext2D, at: Vec, open: boolean): void {
  context.fillStyle = "#9b7bd8";
  context.beginPath();
  context.roundRect(at.x - 18, at.y - 122, 84, 122, [42, 42, 0, 0]);
  context.fill();
  context.fillStyle = open ? "#2c1a46" : "#ff9ed2";
  context.beginPath();
  context.roundRect(at.x - 2, at.y - 96, 52, 96, [26, 26, 0, 0]);
  context.fill();
  if (open) return;
  context.strokeStyle = "#d9589b";
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = INK;
  context.beginPath();
  context.arc(at.x + 24, at.y - 48, 5, 0, Math.PI * 2);
  context.fill();
  context.fillRect(at.x + 22, at.y - 48, 4, 12);
}

function drawFlag(
  context: CanvasRenderingContext2D,
  node: LevelNode,
  reached: boolean,
  seconds: number,
): void {
  const poleX = node.x - 34;
  context.strokeStyle = "#ffffff";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(poleX, node.y);
  context.lineTo(poleX, node.y - 82);
  context.stroke();
  context.fillStyle = reached ? GOLD : "#ffffff";
  context.beginPath();
  context.moveTo(poleX, node.y - 82);
  for (let step = 0; step <= 6; step += 1) {
    const x = poleX + step * 6;
    context.lineTo(x, node.y - 82 + step * 2.6 + Math.sin(seconds * 6 + step) * 2);
  }
  context.lineTo(poleX, node.y - 56);
  context.closePath();
  context.fill();
  context.strokeStyle = reached ? "#e0a000" : "#c9b8ea";
  context.lineWidth = 2;
  context.stroke();
}

function drawFinishArch(context: CanvasRenderingContext2D, finish: Vec, fontFamily: string): void {
  const left = finish.x - 90;
  const right = finish.x + 90;
  const top = finish.y - 190;
  for (const x of [left, right]) {
    context.fillStyle = "#ffffff";
    context.fillRect(x - 7, top, 14, finish.y - top);
    context.fillStyle = "#ff4d6d";
    for (let y = top; y < finish.y; y += 24) context.fillRect(x - 7, y, 14, 12);
  }
  context.fillStyle = INK;
  context.beginPath();
  context.roundRect(left - 16, top - 22, right - left + 32, 44, 12);
  context.fill();
  const size = 11;
  for (let column = 0; column < (right - left + 20) / size; column += 1) {
    context.fillStyle = column % 2 === 0 ? "#ffffff" : "#ffc93c";
    context.fillRect(left - 10 + column * size, top + 14, size, 4);
  }
  context.fillStyle = "#ffffff";
  context.font = `700 26px ${fontFamily}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("FINISH", finish.x, top - 3);
}

function drawDecor(context: CanvasRenderingContext2D, decor: Decor): void {
  context.save();
  context.translate(decor.x, decor.y);
  context.scale(decor.scale, decor.scale);
  switch (decor.kind) {
    case "lollipop":
      context.fillStyle = "#fff6e8";
      context.fillRect(-3, -70, 6, 70);
      context.fillStyle = decor.color;
      context.beginPath();
      context.arc(0, -84, 24, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "rgba(255,255,255,0.7)";
      context.lineWidth = 5;
      context.beginPath();
      context.arc(0, -84, 13, 0.4, Math.PI * 1.7);
      context.stroke();
      break;
    case "gumdrop":
      context.fillStyle = decor.color;
      context.beginPath();
      context.ellipse(0, 0, 26, 30, 0, Math.PI, 0);
      context.fill();
      context.fillStyle = "rgba(255,255,255,0.4)";
      context.beginPath();
      context.ellipse(-9, -18, 5, 8, -0.4, 0, Math.PI * 2);
      context.fill();
      break;
    case "mushroom":
      context.fillStyle = "#fff1dc";
      context.fillRect(-7, -26, 14, 26);
      context.fillStyle = "#ff5f7e";
      context.beginPath();
      context.ellipse(0, -26, 26, 18, 0, Math.PI, 0);
      context.fill();
      context.fillStyle = "#ffffff";
      for (const [dx, dy] of [
        [-10, -34],
        [8, -38],
        [14, -28],
      ] as const) {
        context.beginPath();
        context.arc(dx, dy, 3.5, 0, Math.PI * 2);
        context.fill();
      }
      break;
    case "cane":
      context.lineCap = "round";
      context.lineWidth = 10;
      context.strokeStyle = "#ffffff";
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(0, -56);
      context.arc(12, -56, 12, Math.PI, 0);
      context.stroke();
      context.strokeStyle = "#ff4d6d";
      context.lineWidth = 10;
      context.setLineDash([7, 9]);
      context.stroke();
      context.setLineDash([]);
      break;
  }
  context.restore();
}
