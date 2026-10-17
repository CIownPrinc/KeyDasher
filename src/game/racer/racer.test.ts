import { describe, expect, it } from "vitest";
import { JELLYBEAN_PEAKS as level } from "../level/jellybean-peaks";
import { outgoingOf } from "../level/types";
import { applyKey, availableEdges, startProgress, type RacerProgress } from "./racer";
import type { RacerEvent } from "./events";
import { flowForStreak } from "./rules";

function typeText(progress: RacerProgress, text: string) {
  const events: RacerEvent[] = [];
  let current = progress;
  for (const char of text) {
    const outcome = applyKey(level, current, char);
    current = outcome.progress;
    events.push(...outcome.events);
  }
  return { progress: current, events };
}

const WARM_UP = "godashhopsprintleapjellybeanzoom";

describe("racer typing", () => {
  it("starts committed to the first word", () => {
    const progress = startProgress(level);
    expect(availableEdges(level, progress).map((edge) => edge.word)).toEqual(["go"]);
  });

  it("advances one edge per completed word", () => {
    const { progress, events } = typeText(startProgress(level), "godash");
    expect(events.map((event) => event.kind)).toEqual(["advance", "advance"]);
    expect(availableEdges(level, progress).map((edge) => edge.word)).toEqual(["hop"]);
  });

  it("builds flow with consecutive clean words", () => {
    const { events } = typeText(startProgress(level), "godash");
    expect(events.at(-1)).toMatchObject({ kind: "advance", flow: flowForStreak(2) });
  });

  it("resets flow and keeps the typed letters after a typo", () => {
    const { progress, events } = typeText(startProgress(level), "goxdash");
    expect(events.map((event) => event.kind)).toEqual(["advance", "typo", "advance"]);
    expect(events.at(-1)).toMatchObject({ flow: flowForStreak(0) });
    expect(progress.stats).toMatchObject({ keystrokes: 7, correct: 6, typos: 1 });
  });

  it("waits at a fork until a branch's first letter is typed", () => {
    const { progress } = typeText(startProgress(level), WARM_UP);
    expect(progress.nodeId).toBe("fork-split");
    expect(progress.edgeId).toBeNull();
    expect(progress.checkpointId).toBe("fork-split");
    expect(availableEdges(level, progress)).toHaveLength(2);
  });

  it("treats an unmatched letter at a fork as a typo", () => {
    const { progress, events } = typeText(startProgress(level), `${WARM_UP}q`);
    expect(events.at(-1)).toEqual({ kind: "typo" });
    expect(progress.edgeId).toBeNull();
  });

  it("commits to a branch and records the route on its first letter", () => {
    const { progress } = typeText(startProgress(level), `${WARM_UP}m`);
    expect(progress.typed).toBe(1);
    expect(progress.routes.map((taken) => taken.route.name)).toEqual(["Meadow Loop"]);
  });

  it("cracks a risky word on the first slip and drops the racer on the second", () => {
    const onBiscuits = typeText(startProgress(level), `${WARM_UP}brave`).progress;
    const cracked = typeText(onBiscuits, "Bx");
    expect(cracked.events.at(-1)).toMatchObject({ kind: "crack" });

    const fallen = typeText(cracked.progress, "x");
    expect(fallen.events.at(-1)).toMatchObject({ kind: "fall", checkpointId: "fork-split" });
    expect(fallen.progress.nodeId).toBe("fork-split");
    expect(fallen.progress.edgeId).toBeNull();
    expect(fallen.progress.stats.falls).toBe(1);
    expect(fallen.progress.routes.at(-1)).toMatchObject({ fell: true });
  });

  it("forgives a single slip per risky word", () => {
    const onBiscuits = typeText(startProgress(level), `${WARM_UP}brave`).progress;
    const { progress } = typeText(onBiscuits, "Bxiscuitwxobble");
    expect(progress.stats.falls).toBe(0);
    expect(availableEdges(level, progress).map((edge) => edge.word)).toEqual(["Don't look"]);
  });

  it("finishes at the finish line and then ignores keys", () => {
    let progress = startProgress(level);
    while (!progress.finished) {
      const [edge] = availableEdges(level, progress);
      if (!edge) throw new Error(`Stuck at ${progress.nodeId}`);
      progress = typeText(progress, edge.word.slice(progress.typed)).progress;
    }
    expect(progress.nodeId).toBe(level.finishNodeId);
    expect(outgoingOf(level, progress.nodeId)).toHaveLength(0);
    expect(applyKey(level, progress, "a").events).toEqual([]);
  });
});
