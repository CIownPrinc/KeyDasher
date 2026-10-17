import { describe, expect, it } from "vitest";
import { JELLYBEAN_PEAKS as level } from "../level/jellybean-peaks";
import { edgeOf, nodeOf, outgoingOf } from "../level/types";
import { FALL_MS, RESPAWN_MS, STUMBLE_MS, Timeline } from "./timeline";

const start = nodeOf(level, level.startNodeId);
const [firstEdge] = outgoingOf(level, level.startNodeId);
if (!firstEdge) throw new Error("Level has no first edge");
const secondNode = nodeOf(level, firstEdge.to);

describe("timeline", () => {
  it("idles at the start position before any move", () => {
    const pose = new Timeline(level, start).poseAt(500);
    expect(pose).toMatchObject({ x: start.x, y: start.y, action: "idle" });
  });

  it("moves along an edge and rests at its end", () => {
    const timeline = new Timeline(level, start);
    timeline.apply({ kind: "advance", edgeId: firstEdge.id, flow: 1 }, 100);
    expect(timeline.poseAt(100 + 1).action).toBe(firstEdge.move);
    expect(timeline.poseAt(timeline.endMs + 1)).toMatchObject({ x: secondNode.x, action: "idle" });
  });

  it("queues a move typed mid-jump right behind the current one", () => {
    const timeline = new Timeline(level, start);
    timeline.apply({ kind: "advance", edgeId: firstEdge.id, flow: 1 }, 0);
    const firstEndMs = timeline.endMs;
    const [nextEdge] = outgoingOf(level, firstEdge.to);
    if (!nextEdge) throw new Error("Level has no second edge");
    timeline.apply({ kind: "advance", edgeId: nextEdge.id, flow: 1 }, firstEndMs / 2);
    expect(timeline.poseAt(firstEndMs + 1).edgeId).toBe(nextEdge.id);
  });

  it("moves faster with more flow", () => {
    const calm = new Timeline(level, start);
    const flowing = new Timeline(level, start);
    calm.apply({ kind: "advance", edgeId: firstEdge.id, flow: 1 }, 0);
    flowing.apply({ kind: "advance", edgeId: firstEdge.id, flow: 1.4 }, 0);
    expect(flowing.endMs).toBeLessThan(calm.endMs);
  });

  it("stumbles in place on a typo", () => {
    const timeline = new Timeline(level, start);
    timeline.apply({ kind: "typo" }, 50);
    expect(timeline.endMs).toBe(50 + STUMBLE_MS);
    expect(timeline.poseAt(60)).toMatchObject({ x: start.x, action: "stumble" });
  });

  it("falls into the lake and respawns at the checkpoint", () => {
    const timeline = new Timeline(level, start);
    const edge = edgeOf(level, firstEdge.id);
    timeline.apply({ kind: "fall", edgeId: edge.id, checkpointId: level.startNodeId }, 0);
    expect(timeline.poseAt(FALL_MS - 1).y).toBeGreaterThan(level.lakeY);
    expect(timeline.poseAt(FALL_MS + 1)).toMatchObject({ action: "respawn", x: start.x });
    expect(timeline.endMs).toBe(FALL_MS + RESPAWN_MS);
  });
});
