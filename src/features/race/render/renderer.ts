import { edgeOf, nodeOf, type Level } from "@/game/level/types";
import type { Vec } from "@/game/math";
import { UNLOCK_TURN_SHARE } from "@/game/motion/moves";
import type { Pose, Segment, Timeline } from "@/game/motion/timeline";
import { RACER_SWATCHES } from "@/game/racer/colors";
import { FLOW_MAX_STREAK, flowForStreak } from "@/game/racer/rules";
import type { RacerSummary } from "@/game/room/standings";
import type { KeyFeedback, RaceSession } from "../session/types";
import { Camera } from "./camera";
import { DASHER_RADIUS, DasherLook } from "./dasher";
import { anchorFor, drawWordLabels } from "./labels";
import { DANGER, GOLD, INK, TYPED_GREEN } from "./palette";
import { ParticleSystem } from "./particles";
import { drawBackdrop, drawLake } from "./scenery";
import { Terrain, type WorldState } from "./terrain";

export type MotionCue =
  | "jump"
  | "bounce"
  | "land"
  | "zip"
  | "slide"
  | "lift"
  | "unlock"
  | "fall"
  | "splash"
  | "respawn"
  | "checkpoint"
  | "finish";

const MAX_FRAME_SECONDS = 0.05;
const MAX_PIXEL_RATIO = 2;
const OPPONENT_ALPHA = 0.82;
const HIGH_FLOW = 1.3;
const MAX_FLOW = flowForStreak(FLOW_MAX_STREAK);

interface RacerVisual {
  readonly look: DasherLook;
  lastIndex: number;
  lastDone: boolean;
  pose: Pose | null;
}

/** Draws the race every animation frame. Reads session state; never changes it. */
export class GameRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly camera = new Camera();
  private readonly particles = new ParticleSystem();
  private readonly terrain: Terrain;
  private readonly visuals = new Map<string, RacerVisual>();
  private readonly reachedCheckpoints = new Set<string>();
  private readonly openedDoors = new Set<string>();
  private readonly lifts: readonly { readonly bottom: Vec; readonly top: Vec }[];
  private readonly fontFamily: string;
  private frameRequest = 0;
  private lastFrameMs = performance.now();
  private lastTypoMs = -Infinity;
  private lastFlow = 1;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly session: RaceSession,
    private readonly onLocalMotion: (cue: MotionCue) => void,
  ) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser can't draw the game (no 2D canvas support).");
    this.context = context;
    this.terrain = new Terrain(session.level);
    this.lifts = [...session.level.edges.values()]
      .filter((edge) => edge.move === "lift")
      .map((edge) => ({ bottom: nodeOf(session.level, edge.from), top: nodeOf(session.level, edge.to) }));
    const fontVariable = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim();
    this.fontFamily = fontVariable || "system-ui, sans-serif";
    this.unsubscribe = session.onLocalKey((feedback) => this.onLocalKey(feedback));
    this.frameRequest = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    cancelAnimationFrame(this.frameRequest);
    this.unsubscribe();
  }

  private get level(): Level {
    return this.session.level;
  }

  private readonly frame = (nowMs: number): void => {
    const deltaSeconds = Math.min(MAX_FRAME_SECONDS, (nowMs - this.lastFrameMs) / 1000);
    this.lastFrameMs = nowMs;
    this.resizeToDisplay();
    const snapshot = this.session.getSnapshot();
    const raceMs = Math.max(0, this.session.raceMs() ?? 0);
    const timelines = this.session.timelines();

    for (const racer of snapshot.roster) {
      const timeline = timelines.get(racer.id);
      if (!timeline) continue;
      const isLocal = racer.id === snapshot.localId;
      const atMs = isLocal ? raceMs : raceMs - this.session.opponentDelayMs;
      this.advanceVisual(racer, timeline, atMs, isLocal, deltaSeconds);
    }
    const local = this.visuals.get(snapshot.localId)?.pose;
    if (local) {
      // Hold the camera's height during a fall so the course stays in view.
      const targetY = local.action === "fall" ? this.camera.focusY : local.y - 20;
      this.camera.follow({ x: local.x + 40, y: targetY }, deltaSeconds);
    } else {
      const start = nodeOf(this.level, this.level.startNodeId);
      this.camera.follow({ x: start.x + 40, y: start.y - 20 }, deltaSeconds);
    }
    this.particles.update(deltaSeconds);
    this.draw(snapshot.roster, snapshot.localId, nowMs);
    this.frameRequest = requestAnimationFrame(this.frame);
  };

  private resizeToDisplay(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (
      this.canvas.width !== Math.round(width * ratio) ||
      this.canvas.height !== Math.round(height * ratio)
    ) {
      this.canvas.width = Math.round(width * ratio);
      this.canvas.height = Math.round(height * ratio);
    }
    this.camera.resize(width, height);
  }

  private advanceVisual(
    racer: RacerSummary,
    timeline: Timeline,
    atMs: number,
    isLocal: boolean,
    deltaSeconds: number,
  ): void {
    let visual = this.visuals.get(racer.id);
    if (!visual) {
      visual = { look: new DasherLook(racer.color), lastIndex: -1, lastDone: true, pose: null };
      this.visuals.set(racer.id, visual);
    }
    const pose = timeline.poseAt(atMs);
    const done = pose.action === "idle";
    if (pose.segmentIndex !== visual.lastIndex) {
      const previous = timeline.segmentAt(visual.lastIndex);
      if (previous && !visual.lastDone) this.onSegmentEnd(previous, visual, isLocal);
      const current = timeline.segmentAt(pose.segmentIndex);
      if (current) {
        this.onSegmentStart(current, isLocal);
        if (done) this.onSegmentEnd(current, visual, isLocal);
      }
    } else if (done && !visual.lastDone) {
      const current = timeline.segmentAt(pose.segmentIndex);
      if (current) this.onSegmentEnd(current, visual, isLocal);
    }
    visual.lastIndex = pose.segmentIndex;
    visual.lastDone = done;
    visual.pose = pose;
    visual.look.update(pose, deltaSeconds);
  }

  private onSegmentStart(segment: Segment, isLocal: boolean): void {
    const cue = START_CUES[segment.kind];
    if (segment.kind === "hop" || segment.kind === "leap" || segment.kind === "bounce") {
      this.particles.dust(segment.from, segment.kind === "hop" ? 3 : 6);
    }
    if (segment.kind === "fall" && segment.edgeId) this.onFallStart(segment, isLocal);
    if (segment.kind === "respawn")
      this.particles.sparkle({ x: segment.to.x, y: segment.to.y - DASHER_RADIUS }, 12);
    if (isLocal && cue) this.onLocalMotion(cue);
  }

  private onFallStart(segment: Segment, isLocal: boolean): void {
    if (!segment.edgeId || !isLocal) return;
    const edge = edgeOf(this.level, segment.edgeId);
    this.particles.crumble(nodeOf(this.level, edge.from));
    this.particles.popup({ x: segment.from.x, y: segment.from.y - 70 }, "Whoops!", DANGER);
    this.camera.shake(8);
  }

  private onSegmentEnd(segment: Segment, visual: RacerVisual, isLocal: boolean): void {
    switch (segment.kind) {
      case "hop":
      case "leap":
      case "bounce":
      case "climb":
      case "zip":
      case "slide":
        visual.look.land(segment.kind === "hop" || segment.kind === "climb" ? 0.6 : 1);
        this.particles.dust(segment.to, segment.kind === "hop" ? 4 : 8);
        if (isLocal) this.onLocalMotion("land");
        break;
      case "fall":
        this.particles.splash({ x: segment.to.x, y: this.level.lakeY });
        if (isLocal) this.onLocalMotion("splash");
        return;
      case "unlock":
        if (isLocal && segment.edgeId) this.openedDoors.add(edgeOf(this.level, segment.edgeId).to);
        break;
      default:
        break;
    }
    if (isLocal && segment.edgeId) this.onLocalArrival(segment.edgeId);
  }

  private onLocalArrival(edgeId: string): void {
    const node = nodeOf(this.level, edgeOf(this.level, edgeId).to);
    const above = { x: node.x, y: node.y - 80 };
    if (node.id === this.level.finishNodeId) {
      this.particles.confetti(above, 90);
      this.particles.popup(above, "FINISH!", GOLD);
      this.camera.shake(6);
      this.onLocalMotion("finish");
      return;
    }
    if (node.checkpoint && !this.reachedCheckpoints.has(node.id)) {
      this.reachedCheckpoints.add(node.id);
      this.particles.confetti({ x: node.x - 34, y: node.y - 80 }, 28);
      this.particles.popup(above, "Checkpoint!", GOLD);
      this.onLocalMotion("checkpoint");
    }
  }

  private onLocalKey(feedback: KeyFeedback): void {
    if (!feedback.correct) this.lastTypoMs = performance.now();
    for (const event of feedback.events) {
      switch (event.kind) {
        case "advance": {
          const anchor = anchorFor(this.level, edgeOf(this.level, event.edgeId));
          this.particles.sparkle(anchor, event.flow >= HIGH_FLOW ? 14 : 8);
          const reachedMaxFlow = event.flow === MAX_FLOW && this.lastFlow < MAX_FLOW;
          if (reachedMaxFlow)
            this.particles.popup({ x: anchor.x, y: anchor.y - 30 }, "MAX FLOW!", TYPED_GREEN);
          this.lastFlow = event.flow;
          break;
        }
        case "crack": {
          const edge = edgeOf(this.level, event.edgeId);
          const node = nodeOf(this.level, edge.from);
          this.particles.crumble({ x: node.x, y: node.y + 6 });
          this.particles.popup({ x: node.x, y: node.y - 70 }, "Crack!", DANGER);
          this.camera.shake(5);
          break;
        }
        case "typo":
        case "fall":
          break;
      }
    }
  }

  private draw(roster: readonly RacerSummary[], localId: string, nowMs: number): void {
    const context = this.context;
    const ratio = this.canvas.width / Math.max(1, this.camera.width);
    const seconds = nowMs / 1000;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawBackdrop(
      context,
      this.camera.width,
      this.camera.height,
      this.camera.focusX,
      this.camera.focusY,
      seconds,
    );

    const world = this.camera.transform();
    context.setTransform(
      world.scale * ratio,
      0,
      0,
      world.scale * ratio,
      world.offsetX * ratio,
      world.offsetY * ratio,
    );
    const view = this.camera.visibleWorld();
    this.terrain.drawBehindRacers(context, view.bottom + 40, this.worldState(seconds, localId));

    const ordered = [...roster].sort((a, b) => Number(a.id === localId) - Number(b.id === localId));
    const charge = this.localCharge();
    for (const racer of ordered) this.drawRacer(racer, racer.id === localId, charge, seconds);

    this.terrain.drawInFrontOfRacers(context, this.fontFamily);
    drawLake(context, this.level.lakeY, view.left - 40, view.right + 40, view.bottom, seconds);
    const progress = this.session.getSnapshot().progress;
    if (!progress.finished) {
      drawWordLabels(context, this.level, progress, this.fontFamily, performance.now() - this.lastTypoMs);
    }
    this.particles.draw(context, this.fontFamily);
  }

  private drawRacer(racer: RacerSummary, isLocal: boolean, charge: number, seconds: number): void {
    const visual = this.visuals.get(racer.id);
    if (!visual?.pose) return;
    const { pose, look } = visual;
    if (pose.flow >= HIGH_FLOW && pose.action !== "idle") drawSpeedLines(this.context, pose);
    look.draw(this.context, pose, isLocal ? 1 : OPPONENT_ALPHA, isLocal ? charge : 0);
    if (pose.action === "fall" && pose.progress > 0.5) return;
    if (isLocal) drawYouMarker(this.context, pose, seconds, this.fontFamily);
    else drawNameTag(this.context, pose, racer, this.fontFamily);
  }

  /** How far through the current word the local racer is, for the crouch-before-jump. */
  private localCharge(): number {
    const { progress } = this.session.getSnapshot();
    if (!progress.edgeId) return 0;
    const word = edgeOf(this.level, progress.edgeId).word;
    return progress.typed / word.length;
  }

  private worldState(seconds: number, localId: string): WorldState {
    const poses = [...this.visuals.values()].flatMap((visual) => (visual.pose ? [visual.pose] : []));
    const localPose = this.visuals.get(localId)?.pose ?? null;
    const progress = this.session.getSnapshot().progress;
    const crackedNodes = new Map<string, number>();
    if (progress.edgeId && progress.cracks > 0) {
      crackedNodes.set(edgeOf(this.level, progress.edgeId).from, progress.cracks);
    }
    const fallingNodes = new Map<string, number>();
    if (localPose?.action === "fall" && localPose.edgeId) {
      fallingNodes.set(edgeOf(this.level, localPose.edgeId).from, localPose.progress);
    }
    const openDoors = new Set(this.openedDoors);
    const springPress = new Map<string, number>();
    for (const pose of poses) {
      if (!pose.edgeId) continue;
      const edge = edgeOf(this.level, pose.edgeId);
      if (pose.action === "unlock" && pose.progress > UNLOCK_TURN_SHARE * 0.8) openDoors.add(edge.to);
      if (pose.action === "bounce" && pose.progress < 0.15)
        springPress.set(edge.from, 1 - pose.progress / 0.15);
    }
    return {
      seconds,
      crackedNodes,
      fallingNodes,
      reachedCheckpoints: this.reachedCheckpoints,
      openDoors,
      liftRiders: poses.filter((pose) => this.isOnLift(pose)),
      springPress,
    };
  }

  private isOnLift(pose: Pose): boolean {
    if (pose.action === "lift") return true;
    if (pose.action !== "idle") return false;
    return this.lifts.some((lift) => lift.top.x === pose.x && lift.top.y === pose.y);
  }
}

const START_CUES: Partial<Record<Segment["kind"], MotionCue>> = {
  hop: "jump",
  leap: "jump",
  bounce: "bounce",
  zip: "zip",
  slide: "slide",
  lift: "lift",
  unlock: "unlock",
  fall: "fall",
  respawn: "respawn",
};

function drawSpeedLines(context: CanvasRenderingContext2D, pose: Pose): void {
  context.strokeStyle = "rgba(255, 255, 255, 0.7)";
  context.lineWidth = 3;
  context.lineCap = "round";
  const wobble = (performance.now() / 40) % 12;
  for (const offset of [-30, -18, -6]) {
    context.beginPath();
    context.moveTo(pose.x - 28 - wobble, pose.y + offset);
    context.lineTo(pose.x - 58 - wobble, pose.y + offset);
    context.stroke();
  }
}

function drawNameTag(
  context: CanvasRenderingContext2D,
  pose: Pose,
  racer: RacerSummary,
  fontFamily: string,
): void {
  context.font = `700 13px ${fontFamily}`;
  const width = context.measureText(racer.name).width + 14;
  const top = pose.y - DASHER_RADIUS * 2 - 30;
  context.globalAlpha = 0.9;
  context.fillStyle = RACER_SWATCHES[racer.color].shade;
  context.beginPath();
  context.roundRect(pose.x - width / 2, top, width, 18, 9);
  context.fill();
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(racer.name, pose.x, top + 9.5);
  context.globalAlpha = 1;
}

function drawYouMarker(
  context: CanvasRenderingContext2D,
  pose: Pose,
  seconds: number,
  fontFamily: string,
): void {
  const bob = Math.sin(seconds * 5) * 3;
  const tip = pose.y - DASHER_RADIUS * 2 - 12 + bob;
  context.fillStyle = "#ffffff";
  context.strokeStyle = INK;
  context.lineWidth = 2.5;
  context.beginPath();
  context.moveTo(pose.x - 9, tip - 12);
  context.lineTo(pose.x + 9, tip - 12);
  context.lineTo(pose.x, tip);
  context.closePath();
  context.fill();
  context.stroke();
  context.font = `700 12px ${fontFamily}`;
  context.textAlign = "center";
  context.textBaseline = "bottom";
  context.fillStyle = "#ffffff";
  context.fillText("YOU", pose.x, tip - 14);
}
