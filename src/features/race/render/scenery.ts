import { HILLS, LAKE, SKY } from "./palette";

interface HillLayer {
  readonly color: string;
  readonly parallax: number;
  /** Baseline as a fraction of screen height. */
  readonly baseline: number;
  readonly waves: ReadonlyArray<readonly [frequency: number, amplitude: number, phase: number]>;
}

const HILL_LAYERS: readonly HillLayer[] = [
  {
    color: HILLS.far,
    parallax: 0.12,
    baseline: 0.62,
    waves: [
      [0.0035, 70, 0],
      [0.0011, 90, 1.7],
      [0.009, 14, 0.3],
    ],
  },
  {
    color: HILLS.middle,
    parallax: 0.28,
    baseline: 0.74,
    waves: [
      [0.005, 42, 2],
      [0.0019, 55, 0.4],
      [0.013, 8, 1],
    ],
  },
  {
    color: HILLS.near,
    parallax: 0.5,
    baseline: 0.86,
    waves: [
      [0.0068, 34, 1.1],
      [0.0027, 40, 2.6],
    ],
  },
];

const CLOUDS: ReadonlyArray<readonly [x: number, y: number, size: number]> = [
  [80, 0.12, 1.1],
  [520, 0.22, 0.8],
  [900, 0.09, 1.3],
  [1350, 0.18, 0.9],
  [1800, 0.27, 0.7],
  [2200, 0.11, 1.2],
];
const CLOUD_WRAP = 2400;
const HILL_STEP_PX = 10;

/** Everything behind the course, drawn in screen space with parallax. */
export function drawBackdrop(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  focusX: number,
  focusY: number,
  seconds: number,
): void {
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, SKY.top);
  sky.addColorStop(0.55, SKY.middle);
  sky.addColorStop(1, SKY.horizon);
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  drawSun(context, width * 0.74 - focusX * 0.01, height * 0.26);
  for (const [index, cloud] of CLOUDS.entries()) {
    const drift = seconds * (8 + index * 2) - focusX * 0.08;
    const x = ((((cloud[0] + drift) % CLOUD_WRAP) + CLOUD_WRAP) % CLOUD_WRAP) - 200;
    drawCloud(context, (x / CLOUD_WRAP) * (width + 400), height * cloud[1], cloud[2]);
  }
  const verticalShift = -(focusY - 450) * 0.08;
  for (const layer of HILL_LAYERS) drawHills(context, layer, width, height, focusX, verticalShift);
}

function drawSun(context: CanvasRenderingContext2D, x: number, y: number): void {
  const glow = context.createRadialGradient(x, y, 20, x, y, 190);
  glow.addColorStop(0, SKY.sunGlow);
  glow.addColorStop(1, "rgba(255, 236, 170, 0)");
  context.fillStyle = glow;
  context.fillRect(x - 200, y - 200, 400, 400);
  context.fillStyle = SKY.sun;
  context.beginPath();
  context.arc(x, y, 64, 0, Math.PI * 2);
  context.fill();
}

function drawCloud(context: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  context.fillStyle = "rgba(255, 255, 255, 0.85)";
  context.beginPath();
  for (const [dx, dy, radius] of [
    [0, 0, 26],
    [28, -12, 32],
    [62, -2, 24],
    [34, 8, 26],
  ] as const) {
    context.moveTo(x + dx * size + radius * size, y + dy * size);
    context.arc(x + dx * size, y + dy * size, radius * size, 0, Math.PI * 2);
  }
  context.fill();
}

function drawHills(
  context: CanvasRenderingContext2D,
  layer: HillLayer,
  width: number,
  height: number,
  focusX: number,
  verticalShift: number,
): void {
  const baseline = height * layer.baseline + verticalShift * layer.parallax * 3;
  context.fillStyle = layer.color;
  context.beginPath();
  context.moveTo(0, height);
  for (let x = 0; x <= width + HILL_STEP_PX; x += HILL_STEP_PX) {
    const u = x + focusX * layer.parallax;
    const rise = layer.waves.reduce(
      (sum, [frequency, amplitude, phase]) => sum + Math.sin(u * frequency + phase) * amplitude,
      0,
    );
    context.lineTo(x, baseline - rise);
  }
  context.lineTo(width, height);
  context.closePath();
  context.fill();
}

/** The jelly lake under the course, drawn in world space. */
export function drawLake(
  context: CanvasRenderingContext2D,
  surfaceY: number,
  left: number,
  right: number,
  bottom: number,
  seconds: number,
): void {
  const depth = Math.max(80, bottom - surfaceY + 40);
  const fill = context.createLinearGradient(0, surfaceY, 0, surfaceY + depth);
  fill.addColorStop(0, LAKE.surface);
  fill.addColorStop(1, LAKE.deep);
  context.fillStyle = fill;
  context.beginPath();
  context.moveTo(left, surfaceY + depth);
  for (let x = left; x <= right + 20; x += 20) context.lineTo(x, waveY(x, surfaceY, seconds));
  context.lineTo(right + 20, surfaceY + depth);
  context.closePath();
  context.globalAlpha = 0.94;
  context.fill();
  context.globalAlpha = 1;

  context.strokeStyle = LAKE.shine;
  context.lineWidth = 4;
  context.lineCap = "round";
  const firstShine = Math.floor(left / 160) * 160;
  for (let x = firstShine; x < right; x += 160) {
    const y = waveY(x, surfaceY, seconds) + 18 + Math.sin(x) * 6;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 34, y);
    context.stroke();
  }
}

function waveY(x: number, surfaceY: number, seconds: number): number {
  return surfaceY + Math.sin(x * 0.018 + seconds * 2.2) * 5 + Math.sin(x * 0.006 - seconds) * 4;
}
