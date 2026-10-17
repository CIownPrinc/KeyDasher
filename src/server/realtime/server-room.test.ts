import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@/game/protocol/messages";
import { COUNTDOWN_MS, MAX_RACE_MS } from "@/game/room/room";
import type { Connection } from "./connection";
import { ServerRoom } from "./server-room";

afterEach(() => vi.useRealTimers());

function member(id: string): { connection: Connection; messages: ServerMessage[] } {
  const messages: ServerMessage[] = [];
  return { connection: { id, send: (message) => messages.push(message) }, messages };
}

describe("private room rematches", () => {
  it("gives a remaining player the host role when the host leaves after a race", () => {
    vi.useFakeTimers();
    let nowMs = 0;
    const room = new ServerRoom({ code: "ABCD", now: () => nowMs, onClosed: () => undefined });
    const first = member("first");
    const second = member("second");
    room.join(first.connection, "First", "pink");
    room.join(second.connection, "Second", "sky");
    expect(room.requestStart("first")).toBeNull();

    nowMs = COUNTDOWN_MS + MAX_RACE_MS + 50;
    vi.advanceTimersByTime(50);
    expect(second.messages.some((message) => message.type === "race-over")).toBe(true);

    room.leave("first");
    const latestLobby = second.messages.filter((message) => message.type === "lobby").at(-1);
    expect(latestLobby).toMatchObject({ hostId: "second" });
    expect(room.requestStart("second")).toBeNull();
    expect(second.messages.at(-1)?.type).toBe("countdown");
    room.leave("second");
  });

  it("announces a new host at race end when the original host left mid-race", () => {
    vi.useFakeTimers();
    let nowMs = 0;
    const room = new ServerRoom({ code: "ABCD", now: () => nowMs, onClosed: () => undefined });
    const first = member("first");
    const second = member("second");
    room.join(first.connection, "First", "pink");
    room.join(second.connection, "Second", "sky");
    room.requestStart("first");
    room.leave("first");

    nowMs = COUNTDOWN_MS + MAX_RACE_MS + 50;
    vi.advanceTimersByTime(50);
    const latestLobby = second.messages.filter((message) => message.type === "lobby").at(-1);
    expect(latestLobby).toMatchObject({ hostId: "second" });
    expect(room.requestStart("second")).toBeNull();
    room.leave("second");
  });
});
