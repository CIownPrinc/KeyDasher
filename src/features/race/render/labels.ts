import { nodeOf, outgoingOf, type Level, type LevelEdge, type RouteTag } from "@/game/level/types";
import { distance, type Vec } from "@/game/math";
import { movePoint } from "@/game/motion/moves";
import { availableEdges, type RacerProgress } from "@/game/racer/racer";
import { RISKY_TYPO_LIMIT } from "@/game/racer/rules";
import { DANGER, INK, TYPED_GREEN } from "./palette";

export const ROUTE_COLORS: Readonly<Record<RouteTag, string>> = {
  safe: "#22b573",
  risky: DANGER,
  shortcut: "#8a5cff",
};

const ACTIVE_SIZE = 25;
const UPCOMING_SIZE = 18;
const LOOKAHEAD_WORDS = 3;
const LABEL_LIFT = 62;
/** Labels sit this far along their edge, so long edges keep their word close to the racer. */
const LABEL_REACH = 200;
const TYPO_FLASH_MS = 260;
/** Big arcs (springs) would float their word off-screen; keep it near the racer instead. */
const MAX_LABEL_HEIGHT = 170;

interface LabelSpec {
  readonly edge: LevelEdge;
  readonly typed: number;
  readonly active: boolean;
  readonly cracks: number;
  readonly showRoute: boolean;
}

/** Floating words over the course: what the local racer types next, and every choice at a fork. */
export function drawWordLabels(
  context: CanvasRenderingContext2D,
  level: Level,
  progress: RacerProgress,
  fontFamily: string,
  msSinceTypo: number,
): void {
  for (const spec of labelSpecs(level, progress).reverse()) {
    drawLabel(context, level, spec, fontFamily, spec.active ? msSinceTypo : Infinity);
  }
}

function labelSpecs(level: Level, progress: RacerProgress): LabelSpec[] {
  const options = availableEdges(level, progress);
  const atFork = options.length > 1;
  const specs: LabelSpec[] = options.map((edge) => ({
    edge,
    typed: atFork ? 0 : progress.typed,
    active: true,
    cracks: atFork ? 0 : progress.cracks,
    showRoute: atFork,
  }));
  const [only] = options;
  if (atFork || !only) return specs;

  let nodeId = only.to;
  for (let shown = 0; shown < LOOKAHEAD_WORDS; shown += 1) {
    const next = outgoingOf(level, nodeId);
    for (const edge of next) {
      specs.push({ edge, typed: 0, active: false, cracks: 0, showRoute: next.length > 1 });
    }
    const [single] = next;
    if (next.length !== 1 || !single) break;
    nodeId = single.to;
  }
  return specs;
}

/** Where a word floats: a little way along its edge and above it. */
export function anchorFor(level: Level, edge: LevelEdge): Vec {
  const from = nodeOf(level, edge.from);
  const to = nodeOf(level, edge.to);
  if (edge.move === "climb") return { x: from.x - 92, y: (from.y + to.y) / 2 - 24 };
  const reach = Math.min(0.5, LABEL_REACH / Math.max(1, distance(from, to)));
  const point = movePoint(edge.move, from, to, reach);
  const extraLift = edge.move === "unlock" ? 96 : 0;
  const highest = from.y - MAX_LABEL_HEIGHT;
  return { x: point.x, y: Math.max(highest, Math.min(point.y, from.y)) - LABEL_LIFT - extraLift };
}

function drawLabel(
  context: CanvasRenderingContext2D,
  level: Level,
  spec: LabelSpec,
  fontFamily: string,
  msSinceTypo: number,
): void {
  const { edge } = spec;
  const size = spec.active ? ACTIVE_SIZE : UPCOMING_SIZE;
  const flashing = msSinceTypo < TYPO_FLASH_MS;
  const anchor = anchorFor(level, edge);
  const shake = flashing ? Math.sin(msSinceTypo / 18) * 5 * (1 - msSinceTypo / TYPO_FLASH_MS) : 0;

  context.save();
  context.translate(anchor.x + shake, anchor.y);
  context.globalAlpha = spec.active ? 1 : 0.62;
  context.font = `700 ${size}px ${fontFamily}`;
  context.textBaseline = "middle";

  const typedText = edge.word.slice(0, spec.typed);
  const restText = edge.word.slice(spec.typed);
  const typedWidth = context.measureText(typedText).width;
  const totalWidth = context.measureText(edge.word).width;
  const padX = size * 0.6;
  const height = size * 1.7;
  const left = -totalWidth / 2 - padX;

  context.fillStyle = flashing ? "#ffe3e8" : "rgba(255, 255, 255, 0.96)";
  context.strokeStyle = edge.risky ? DANGER : flashing ? DANGER : INK;
  context.lineWidth = spec.active ? 3 : 2;
  context.beginPath();
  context.roundRect(left, -height / 2, totalWidth + padX * 2, height, height / 2);
  context.fill();
  context.stroke();
  drawPointer(context, height, edge.risky ? DANGER : INK);

  const textLeft = -totalWidth / 2;
  context.textAlign = "left";
  context.fillStyle = TYPED_GREEN;
  context.fillText(typedText, textLeft, 1);
  context.fillStyle = INK;
  context.fillText(restText, textLeft + typedWidth, 1);
  if (spec.active && restText.length > 0) {
    const nextWidth = context.measureText(restText[0] ?? "").width;
    context.fillStyle = flashing ? DANGER : TYPED_GREEN;
    context.fillRect(textLeft + typedWidth, size * 0.52, Math.max(nextWidth, size * 0.3), 3);
  }

  if (spec.showRoute && edge.route) drawRouteTag(context, edge, -height / 2 - 8, fontFamily);
  if (edge.risky && spec.active) drawCrackMeter(context, spec.cracks, height / 2 + 12);
  context.restore();
}

function drawPointer(context: CanvasRenderingContext2D, height: number, color: string): void {
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(-7, height / 2);
  context.lineTo(7, height / 2);
  context.lineTo(0, height / 2 + 9);
  context.closePath();
  context.fill();
}

function drawRouteTag(
  context: CanvasRenderingContext2D,
  edge: LevelEdge,
  bottom: number,
  fontFamily: string,
): void {
  const route = edge.route;
  if (!route) return;
  const text = `${route.tag.toUpperCase()} · ${route.name}`;
  context.font = `700 14px ${fontFamily}`;
  const width = context.measureText(text).width + 20;
  context.fillStyle = ROUTE_COLORS[route.tag];
  context.beginPath();
  context.roundRect(-width / 2, bottom - 22, width, 22, 11);
  context.fill();
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.fillText(text, 0, bottom - 10);
}

function drawCrackMeter(context: CanvasRenderingContext2D, cracks: number, top: number): void {
  for (let slip = 0; slip < RISKY_TYPO_LIMIT; slip += 1) {
    const x = (slip - (RISKY_TYPO_LIMIT - 1) / 2) * 16;
    context.beginPath();
    context.arc(x, top + 6, 5, 0, Math.PI * 2);
    context.fillStyle = slip < cracks ? DANGER : "rgba(255,255,255,0.9)";
    context.strokeStyle = DANGER;
    context.lineWidth = 2;
    context.fill();
    context.stroke();
  }
}
