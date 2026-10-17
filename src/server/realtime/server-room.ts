import { randomInt } from "node:crypto";
import { BOT_ROSTER, BotDriver } from "@/game/bots/bot";
import { JELLYBEAN_PEAKS } from "@/game/level/jellybean-peaks";
import type { ServerMessage } from "@/game/protocol/messages";
import { pickFreeColor, type RacerColor } from "@/game/racer/colors";
import { createRng } from "@/game/random";
import { RaceRoom, ROOM_CAPACITY, type RoomEvent } from "@/game/room/room";
import type { RacerSummary } from "@/game/room/standings";
import { logger } from "../logger";
import type { Connection } from "./connection";

const TICK_MS = 50;
/** Quick races wait this long for more humans before bots fill the grid. */
const QUICK_LOBBY_MS = 6000;
/** Every race has at least this many racers, topped up with bots. */
const MIN_RACERS = 4;
/** Finished quick rooms close after this long; players start a fresh match. */
const FINISHED_ROOM_TTL_MS = 60_000;

interface Member {
  readonly connection: Connection;
  readonly summary: RacerSummary;
}

interface ServerRoomOptions {
  readonly code: string | null;
  readonly now: () => number;
  readonly onClosed: (room: ServerRoom) => void;
}

/** A network-facing room: owns members, a ticking clock, and the current RaceRoom. */
export class ServerRoom {
  readonly code: string | null;
  private readonly members = new Map<string, Member>();
  private race: RaceRoom;
  private hostId: string | null = null;
  private autoStartAtMs: number | null = null;
  private finishedAtMs: number | null = null;
  private readonly ticker: NodeJS.Timeout;
  private closed = false;

  constructor(private readonly options: ServerRoomOptions) {
    this.code = options.code;
    this.race = this.freshRace();
    this.ticker = setInterval(() => this.tick(), TICK_MS);
  }

  get isPrivate(): boolean {
    return this.code !== null;
  }

  /** Why a newcomer can't join right now, or null if they can. */
  get joinBlocker(): "room-full" | "race-in-progress" | null {
    if (this.members.size >= ROOM_CAPACITY) return "room-full";
    const between = this.race.phase === "lobby" || (this.isPrivate && this.race.phase === "finished");
    return between ? null : "race-in-progress";
  }

  join(connection: Connection, name: string, color: RacerColor): void {
    const taken = new Set([...this.members.values()].map((member) => member.summary.color));
    const summary: RacerSummary = {
      id: connection.id,
      name,
      color: pickFreeColor(color, taken),
      isBot: false,
    };
    this.members.set(connection.id, { connection, summary });
    this.hostId ??= connection.id;
    if (this.race.phase === "lobby") this.race.addRacer(summary);
    if (!this.isPrivate) this.autoStartAtMs ??= this.options.now() + QUICK_LOBBY_MS;

    connection.send({ type: "welcome", youId: connection.id, code: this.code, isPrivate: this.isPrivate });
    this.broadcastLobby();
  }

  leave(connectionId: string): void {
    if (!this.members.delete(connectionId)) return;
    this.race.removeRacer(connectionId);
    if (this.hostId === connectionId) this.hostId = this.members.keys().next().value ?? null;
    if (this.members.size === 0) {
      this.close();
      return;
    }
    this.broadcast({ type: "racer-left", racerId: connectionId });
    if (this.race.phase === "lobby" || (this.isPrivate && this.race.phase === "finished")) {
      this.broadcastLobby();
    }
  }

  key(connectionId: string, char: string): void {
    this.race.handleKey(connectionId, char, this.options.now());
  }

  /** Hosts start private races, and rematches once a race is over. */
  requestStart(connectionId: string): "not-host" | null {
    if (!this.isPrivate || connectionId !== this.hostId) return "not-host";
    if (this.race.phase === "finished") {
      this.race = this.freshRace();
      for (const member of this.members.values()) this.race.addRacer(member.summary);
    }
    this.startCountdown();
    return null;
  }

  private tick(): void {
    const nowMs = this.options.now();
    if (this.race.phase === "lobby" && this.autoStartAtMs !== null && nowMs >= this.autoStartAtMs) {
      this.startCountdown();
    }
    this.race.tick(nowMs);
    const expired = this.finishedAtMs !== null && nowMs - this.finishedAtMs > FINISHED_ROOM_TTL_MS;
    if (expired && !this.isPrivate) this.close();
  }

  private startCountdown(): void {
    if (this.race.phase !== "lobby") return;
    this.fillWithBots();
    this.finishedAtMs = null;
    this.race.startCountdown(this.options.now());
    logger.info({ room: this.code ?? "quick", racers: this.race.roster.length }, "race starting");
  }

  private fillWithBots(): void {
    const roster = this.race.roster;
    const usedNames = new Set(roster.map((racer) => racer.name));
    const candidates = BOT_ROSTER.filter((profile) => !usedNames.has(profile.name));
    for (let botIndex = 0; this.race.roster.length < MIN_RACERS; botIndex += 1) {
      const profile = candidates.splice(randomInt(candidates.length), 1)[0];
      if (!profile) return;
      const taken = new Set(this.race.roster.map((racer) => racer.color));
      const summary: RacerSummary = {
        id: `bot-${botIndex}`,
        name: profile.name,
        color: pickFreeColor("pink", taken),
        isBot: true,
      };
      this.race.addRacer(summary, new BotDriver(profile, createRng(randomInt(2 ** 31))));
    }
  }

  private freshRace(): RaceRoom {
    return new RaceRoom(JELLYBEAN_PEAKS, (event) => this.relay(event));
  }

  private relay(event: RoomEvent): void {
    switch (event.kind) {
      case "countdown":
        this.broadcast({
          type: "countdown",
          racers: this.race.roster,
          startsInMs: event.startAtMs - this.options.now(),
        });
        return;
      case "racer-event":
        this.broadcast({
          type: "racer-event",
          racerId: event.racerId,
          raceMs: event.raceMs,
          event: event.event,
        });
        return;
      case "racer-finished":
        this.broadcast({ type: "racer-finished", racerId: event.racerId, finishMs: event.finishMs });
        return;
      case "race-over":
        this.finishedAtMs = this.options.now();
        this.broadcast({ type: "race-over", results: [...event.results] });
        if (this.isPrivate) this.broadcastLobby();
        return;
    }
  }

  private broadcastLobby(): void {
    const autoStartInMs =
      this.autoStartAtMs === null ? null : Math.max(0, this.autoStartAtMs - this.options.now());
    this.broadcast({
      type: "lobby",
      racers: [...this.members.values()].map((member) => member.summary),
      hostId: this.isPrivate ? this.hostId : null,
      autoStartInMs,
    });
  }

  private broadcast(message: ServerMessage): void {
    for (const member of this.members.values()) member.connection.send(message);
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.ticker);
    this.options.onClosed(this);
  }
}
