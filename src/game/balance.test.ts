import { describe, expect, it } from "vitest";
import { keystrokeEffort } from "./bots/bot";
import { JELLYBEAN_PEAKS as level } from "./level/jellybean-peaks";
import { nodeOf, outgoingOf, type RouteTag } from "./level/types";
import { Timeline } from "./motion/timeline";
import { applyKey, availableEdges, startProgress } from "./racer/racer";

type RoutePlan = (forkId: string) => RouteTag;

/** Finish time for a flawless typist following `plan` at every fork. */
function flawlessFinishMs(wordsPerMinute: number, plan: RoutePlan): number {
  const msPerChar = 60_000 / (wordsPerMinute * 5);
  const timeline = new Timeline(level, nodeOf(level, level.startNodeId));
  let progress = startProgress(level);
  let clockMs = 0;
  while (!progress.finished) {
    const options = availableEdges(level, progress);
    const wanted = plan(progress.nodeId);
    const edge = options.length === 1 ? options[0] : options.find((o) => o.route?.tag === wanted);
    if (!edge) throw new Error(`No ${wanted} route at ${progress.nodeId}`);
    const char = edge.word[progress.typed];
    if (char === undefined) throw new Error("Overran word");
    clockMs += msPerChar * keystrokeEffort(char);
    const outcome = applyKey(level, progress, char);
    progress = outcome.progress;
    for (const event of outcome.events) timeline.apply(event, clockMs);
  }
  return timeline.endMs;
}

const allSafe: RoutePlan = () => "safe";
const forks = [...level.nodes.values()].filter((node) => outgoingOf(level, node.id).length > 1);

describe("route balance", () => {
  for (const wordsPerMinute of [35, 60, 90, 120]) {
    for (const fork of forks) {
      const gambles = outgoingOf(level, fork.id).filter((edge) => edge.route?.tag !== "safe");
      for (const gamble of gambles) {
        it(`${gamble.route?.name} beats the safe road for a flawless ${wordsPerMinute} WPM typist`, () => {
          const tag = gamble.route?.tag ?? "safe";
          const gambling: RoutePlan = (forkId) => (forkId === fork.id ? tag : "safe");
          const savedMs =
            flawlessFinishMs(wordsPerMinute, allSafe) - flawlessFinishMs(wordsPerMinute, gambling);
          expect(savedMs).toBeGreaterThan(400);
        });
      }
    }
  }

  it("lasts about a minute for an average typist on the safe road", () => {
    const seconds = flawlessFinishMs(45, allSafe) / 1000;
    expect(seconds).toBeGreaterThan(40);
    expect(seconds).toBeLessThan(90);
  });
});
