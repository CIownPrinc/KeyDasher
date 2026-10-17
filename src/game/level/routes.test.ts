import { describe, expect, it } from "vitest";
import { JELLYBEAN_PEAKS as level } from "./jellybean-peaks";
import { summarizeRoute } from "./routes";
import { outgoingOf } from "./types";

function branch(forkId: string, routeName: string) {
  const edge = outgoingOf(level, forkId).find((candidate) => candidate.route?.name === routeName);
  if (!edge) throw new Error(`No ${routeName} at ${forkId}`);
  return edge;
}

describe("route summaries", () => {
  it("counts a branch up to where it rejoins the main path", () => {
    expect(summarizeRoute(level, branch("fork-split", "Meadow Loop"))).toEqual({
      words: 9,
      letters: 46,
      riskyWords: 0,
    });
  });

  it("counts risky words", () => {
    expect(summarizeRoute(level, branch("fork-split", "Biscuit Bridge"))).toMatchObject({
      words: 5,
      riskyWords: 4,
    });
  });

  it("treats a single edge that lands on the merge as a one-word route", () => {
    expect(summarizeRoute(level, branch("fork-summit", "Zipline"))).toEqual({
      words: 1,
      letters: "Hold on tight!".length,
      riskyWords: 1,
    });
  });
});
