import { describe, expect, it } from "vitest";
import { JELLYBEAN_PEAKS as level } from "./jellybean-peaks";
import { outgoingOf, type LevelEdge, type LevelNode } from "./types";

const nodes = [...level.nodes.values()];
const edges = [...level.edges.values()];

function platformUnder(node: LevelNode) {
  return level.platforms.find(
    (platform) => platform.top === node.y && platform.left <= node.x && node.x <= platform.right,
  );
}

function incoming(node: LevelNode): LevelEdge[] {
  return edges.filter((edge) => edge.to === node.id);
}

/** Racers may hang on a vine or ride the lift instead of standing on a platform. */
function isSupportedByMove(node: LevelNode): boolean {
  const moves = [...incoming(node), ...outgoingOf(level, node.id)].map((edge) => edge.move);
  const climbing = moves.every((move) => move === "climb");
  const lifted = incoming(node).some((edge) => edge.move === "lift");
  return climbing || lifted;
}

function reachableFrom(startId: string): Set<string> {
  const seen = new Set([startId]);
  const queue = [startId];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const edge of outgoingOf(level, id)) {
      if (seen.has(edge.to)) continue;
      seen.add(edge.to);
      queue.push(edge.to);
    }
  }
  return seen;
}

describe("Jellybean Peaks", () => {
  it("lets every node reach the finish line", () => {
    for (const node of nodes) expect(reachableFrom(node.id), node.id).toContain(level.finishNodeId);
  });

  it("reaches every node from the start", () => {
    expect(reachableFrom(level.startNodeId).size).toBe(nodes.length);
  });

  it("stands every node on a platform unless it is climbing or lifted", () => {
    const floating = nodes.filter((node) => !platformUnder(node) && !isSupportedByMove(node));
    expect(floating.map((node) => node.id)).toEqual([]);
  });

  it("keeps every run on a single platform", () => {
    const brokenRuns = edges.filter((edge) => {
      if (edge.move !== "run") return false;
      const from = level.nodes.get(edge.from);
      const to = level.nodes.get(edge.to);
      return !from || !to || platformUnder(from) !== platformUnder(to);
    });
    expect(brokenRuns.map((edge) => edge.word)).toEqual([]);
  });

  it("gives every fork branch a distinct first letter and a named route", () => {
    for (const node of nodes) {
      const branches = outgoingOf(level, node.id);
      if (branches.length < 2) continue;
      const firstLetters = branches.map((edge) => edge.word[0]?.toLowerCase());
      expect(new Set(firstLetters).size, node.id).toBe(branches.length);
      for (const branch of branches) expect(branch.route !== null, branch.word).toBe(true);
    }
  });

  it("makes every fork a checkpoint so a fall lets you choose again", () => {
    const forks = nodes.filter((node) => outgoingOf(level, node.id).length > 1);
    expect(forks.length).toBe(3);
    for (const fork of forks) expect(fork.checkpoint, fork.id).toBe(true);
  });

  it("only makes words risky where something can give way", () => {
    for (const edge of edges.filter((candidate) => candidate.risky)) {
      const from = level.nodes.get(edge.from);
      const standingOnBiscuit = from ? platformUnder(from)?.style === "crumble" : false;
      expect(standingOnBiscuit || edge.move === "zip", edge.word).toBe(true);
    }
  });

  it("uses only characters a standard keyboard can type", () => {
    for (const edge of edges) expect(edge.word, edge.word).toMatch(/^[A-Za-z0-9 !',.?-]+$/);
  });
});
