import { BOT_ROSTER, BotDriver } from "@/game/bots/bot";
import { JELLYBEAN_PEAKS } from "@/game/level/jellybean-peaks";
import type { Timeline } from "@/game/motion/timeline";
import { pickFreeColor } from "@/game/racer/colors";
import { normalizeTypedChar } from "@/game/racer/rules";
import { startProgress } from "@/game/racer/racer";
import { createRng } from "@/game/random";
import { RaceRoom, type RoomEvent } from "@/game/room/room";
import type { RacerSummary } from "@/game/room/standings";
import { Emitter, SnapshotStore } from "./snapshot-store";
import type { KeyFeedback, PlayerProfile, RaceSession, SessionSnapshot } from "./types";

const LOCAL_ID = "you";
const PRACTICE_BOTS = 4;
const PULSE_MS = 33;
/** A beat to get your hands on the keys before the countdown starts. */
const PRE_COUNTDOWN_MS = 600;

/** Single-player against bots, running the same RaceRoom the server uses, entirely in the browser. */
export class PracticeSession implements RaceSession {
  readonly level = JELLYBEAN_PEAKS;
  readonly opponentDelayMs = 0;
  private readonly room: RaceRoom;
  private readonly store: SnapshotStore<SessionSnapshot>;
  private readonly keys = new Emitter<KeyFeedback>();
  private readonly timelineMap = new Map<string, Timeline>();
  private readonly pulse: ReturnType<typeof setInterval>;
  private pendingFeedback: KeyFeedback["events"][number][] = [];

  constructor(profile: PlayerProfile) {
    this.room = new RaceRoom(this.level, (event) => this.onRoomEvent(event));
    const roster = this.seatRacers(profile);
    for (const racer of roster) {
      const timeline = this.room.timelineOf(racer.id);
      if (timeline) this.timelineMap.set(racer.id, timeline);
    }
    this.store = new SnapshotStore<SessionSnapshot>({
      phase: "lobby",
      localId: LOCAL_ID,
      roster,
      hostId: null,
      roomCode: null,
      autoStartAtMs: null,
      startAtMs: null,
      finishTimes: new Map(),
      typedFinishMs: null,
      localCrossed: false,
      results: null,
      progress: startProgress(this.level),
      error: null,
    });
    const countdownAt = performance.now() + PRE_COUNTDOWN_MS;
    this.pulse = setInterval(() => this.onPulse(countdownAt), PULSE_MS);
  }

  getSnapshot = (): SessionSnapshot => this.store.current;

  subscribe = (listener: () => void): (() => void) => this.store.subscribe(listener);

  onLocalKey(listener: (feedback: KeyFeedback) => void): () => void {
    return this.keys.subscribe(listener);
  }

  timelines(): ReadonlyMap<string, Timeline> {
    return this.timelineMap;
  }

  raceMs(): number | null {
    const startAt = this.room.startsAtMs;
    return startAt === null ? null : performance.now() - startAt;
  }

  type(rawChar: string): void {
    const before = this.room.progressOf(LOCAL_ID);
    this.pendingFeedback = [];
    const nowMs = performance.now();
    const accepted = this.room.handleKey(LOCAL_ID, normalizeTypedChar(rawChar), nowMs);
    const after = this.room.progressOf(LOCAL_ID);
    if (!accepted || !before || !after) return;
    this.store.update({
      progress: after,
      typedFinishMs: after.finished && !before.finished ? this.raceMs() : this.store.current.typedFinishMs,
    });
    this.keys.emit({ correct: after.stats.correct > before.stats.correct, events: this.pendingFeedback });
  }

  start(): void {
    // Practice races start on their own.
  }

  dispose(): void {
    clearInterval(this.pulse);
  }

  private seatRacers(profile: PlayerProfile): RacerSummary[] {
    const you: RacerSummary = { id: LOCAL_ID, name: profile.name, color: profile.color, isBot: false };
    this.room.addRacer(you);
    const rng = createRng(Math.floor(Math.random() * 2 ** 31));
    const pool = [...BOT_ROSTER];
    for (let index = 0; index < PRACTICE_BOTS && pool.length > 0; index += 1) {
      const [profileForBot] = pool.splice(Math.floor(rng() * pool.length), 1);
      if (!profileForBot) break;
      const taken = new Set(this.room.roster.map((racer) => racer.color));
      this.room.addRacer(
        { id: `bot-${index}`, name: profileForBot.name, color: pickFreeColor("pink", taken), isBot: true },
        new BotDriver(profileForBot, createRng(Math.floor(rng() * 2 ** 31))),
      );
    }
    return this.room.roster;
  }

  private onPulse(countdownAt: number): void {
    const nowMs = performance.now();
    if (this.room.phase === "lobby" && nowMs >= countdownAt) this.room.startCountdown(nowMs);
    this.room.tick(nowMs);
    const snapshot = this.store.current;
    const raceMs = this.raceMs();
    const localFinish = this.room.finishMsOf(LOCAL_ID);
    const localCrossed = localFinish !== null && raceMs !== null && raceMs >= localFinish;
    if (snapshot.phase !== this.room.phase || snapshot.localCrossed !== localCrossed) {
      this.store.update({ phase: this.room.phase, localCrossed });
    }
  }

  private onRoomEvent(event: RoomEvent): void {
    const snapshot = this.store.current;
    switch (event.kind) {
      case "countdown":
        this.store.update({ phase: "countdown", startAtMs: event.startAtMs });
        return;
      case "racer-event":
        if (event.racerId === LOCAL_ID) this.pendingFeedback.push(event.event);
        return;
      case "racer-finished": {
        const finishTimes = new Map(snapshot.finishTimes).set(event.racerId, event.finishMs);
        this.store.update({ finishTimes });
        return;
      }
      case "race-over":
        this.store.update({ phase: "finished", results: event.results });
        return;
    }
  }
}
