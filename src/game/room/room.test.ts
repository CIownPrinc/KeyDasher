import { describe, expect, it } from "vitest";
import { BOT_ROSTER, BotDriver } from "../bots/bot";
import { JELLYBEAN_PEAKS as level } from "../level/jellybean-peaks";
import { availableEdges } from "../racer/racer";
import { createRng } from "../random";
import { COUNTDOWN_MS, MAX_RACE_MS, RaceRoom, type RoomEvent } from "./room";
import { wordsPerMinute } from "./standings";

function roomWithBots(botCount: number, seed = 7) {
  const events: RoomEvent[] = [];
  const room = new RaceRoom(level, (event) => events.push(event));
  BOT_ROSTER.slice(0, botCount).forEach((profile, index) => {
    room.addRacer(
      { id: `bot-${index}`, name: profile.name, color: "pink", isBot: true },
      new BotDriver(profile, createRng(seed + index)),
    );
  });
  return { room, events };
}

function runUntilOver(room: RaceRoom, fromMs = 0) {
  for (let nowMs = fromMs; room.phase !== "finished" && nowMs < MAX_RACE_MS * 2; nowMs += 50) {
    room.tick(nowMs);
  }
}

describe("race room", () => {
  it("counts down before racing", () => {
    const { room, events } = roomWithBots(1);
    room.startCountdown(1000);
    expect(events).toEqual([{ kind: "countdown", startAtMs: 1000 + COUNTDOWN_MS }]);
    room.tick(1000 + COUNTDOWN_MS - 1);
    expect(room.phase).toBe("countdown");
    room.tick(1000 + COUNTDOWN_MS);
    expect(room.phase).toBe("racing");
  });

  it("lets bots race to the finish and ranks them by time", () => {
    const { room } = roomWithBots(4);
    room.startCountdown(0);
    runUntilOver(room);
    const results = room.results ?? [];
    expect(results).toHaveLength(4);
    expect(results.every((result) => result.finishMs !== null)).toBe(true);
    const times = results.map((result) => result.finishMs ?? 0);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(results.map((result) => result.place)).toEqual([1, 2, 3, 4]);
  });

  it("is deterministic for the same seed", () => {
    const first = roomWithBots(3, 42);
    const second = roomWithBots(3, 42);
    for (const { room } of [first, second]) {
      room.startCountdown(0);
      runUntilOver(room);
    }
    expect(first.room.results).toEqual(second.room.results);
  });

  it("ignores human keys before the countdown ends and accepts them after", () => {
    const room = new RaceRoom(level, () => undefined);
    room.addRacer({ id: "me", name: "Me", color: "sky", isBot: false });
    room.startCountdown(0);
    expect(room.handleKey("me", "g", 1000)).toBe(false);
    expect(room.handleKey("me", "g", COUNTDOWN_MS + 10)).toBe(true);
    expect(room.progressOf("me")?.typed).toBe(1);
  });

  it("refuses keys typed for a bot", () => {
    const { room } = roomWithBots(1);
    room.startCountdown(0);
    expect(room.handleKey("bot-0", "g", COUNTDOWN_MS + 10)).toBe(false);
  });

  it("ignores keys after a human has typed the finish word", () => {
    const room = new RaceRoom(level, () => undefined);
    room.addRacer({ id: "me", name: "Me", color: "sky", isBot: false });
    room.startCountdown(0);
    const nowMs = COUNTDOWN_MS + 10;
    while (!room.progressOf("me")?.finished) {
      const progress = room.progressOf("me");
      if (!progress) throw new Error("Missing racer");
      const [edge] = availableEdges(level, progress);
      if (!edge) throw new Error(`No route from ${progress.nodeId}`);
      for (const char of edge.word.slice(progress.typed)) room.handleKey("me", char, nowMs);
    }
    const before = room.progressOf("me");
    expect(room.handleKey("me", "x", nowMs)).toBe(false);
    expect(room.progressOf("me")).toBe(before);
  });

  it("measures WPM through the last keystroke, not queued finish movement", () => {
    const room = new RaceRoom(level, () => undefined);
    room.addRacer({ id: "me", name: "Me", color: "sky", isBot: false });
    room.startCountdown(0);
    let nowMs = COUNTDOWN_MS;
    while (!room.progressOf("me")?.finished) {
      const progress = room.progressOf("me");
      if (!progress) throw new Error("Missing racer");
      const [edge] = availableEdges(level, progress);
      if (!edge) throw new Error(`No route from ${progress.nodeId}`);
      for (const char of edge.word.slice(progress.typed)) {
        nowMs += 100;
        room.handleKey("me", char, nowMs);
      }
    }
    room.tick(COUNTDOWN_MS + MAX_RACE_MS);
    const result = room.results?.find((entry) => entry.id === "me");
    const progress = room.progressOf("me");
    expect(result?.finishMs).toBeGreaterThan(nowMs - COUNTDOWN_MS);
    expect(result?.wordsPerMinute).toBeCloseTo(
      wordsPerMinute(progress?.stats.correct ?? 0, nowMs - COUNTDOWN_MS),
    );
  });

  it("ends at the time limit when a human never finishes", () => {
    const { room, events } = roomWithBots(1);
    room.addRacer({ id: "me", name: "Me", color: "sky", isBot: false });
    room.startCountdown(0);
    runUntilOver(room, 0);
    expect(room.phase).toBe("finished");
    expect(events.at(-1)?.kind).toBe("race-over");
    const me = room.results?.find((result) => result.id === "me");
    expect(me).toMatchObject({ finishMs: null, place: 2 });
  });
});
