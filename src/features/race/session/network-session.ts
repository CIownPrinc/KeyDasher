import { JELLYBEAN_PEAKS } from "@/game/level/jellybean-peaks";
import { Timeline } from "@/game/motion/timeline";
import { REALTIME_PATH } from "@/game/protocol/endpoint";
import { serverMessageSchema, type ClientMessage, type ServerMessage } from "@/game/protocol/messages";
import { applyKey, startProgress } from "@/game/racer/racer";
import { normalizeTypedChar } from "@/game/racer/rules";
import { startPositionForLane } from "@/game/room/room";
import type { RacerSummary } from "@/game/room/standings";
import { Emitter, SnapshotStore } from "./snapshot-store";
import type { KeyFeedback, PlayerProfile, RaceSession, SessionMode, SessionSnapshot } from "./types";

const PING_INTERVAL_MS = 2000;
const PULSE_MS = 50;
/** Weight of each new round-trip sample in the smoothed estimate. */
const RTT_SMOOTHING = 0.3;
const NON_FATAL_ERRORS = new Set(["not-host"]);

/**
 * An online race. The server is the authority; this client predicts its own racer from its
 * own keystrokes (racer logic depends only on the key sequence, so prediction never drifts)
 * and replays everyone else's moves from the events the server relays.
 */
export class NetworkSession implements RaceSession {
  readonly level = JELLYBEAN_PEAKS;
  readonly opponentDelayMs = 120;
  private readonly socket: WebSocket;
  private readonly store: SnapshotStore<SessionSnapshot>;
  private readonly keys = new Emitter<KeyFeedback>();
  private timelineMap = new Map<string, Timeline>();
  private roundTripMs = 80;
  private readonly timers: ReturnType<typeof setInterval>[] = [];
  private disposed = false;

  constructor(
    private readonly mode: Exclude<SessionMode, { kind: "practice" }>,
    private readonly profile: PlayerProfile,
  ) {
    this.store = new SnapshotStore<SessionSnapshot>({
      phase: "connecting",
      localId: "",
      roster: [],
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
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.socket = new WebSocket(`${protocol}//${window.location.host}${REALTIME_PATH}`);
    this.socket.addEventListener("open", () => this.onOpen());
    this.socket.addEventListener("message", (event) => this.onMessage(event));
    this.socket.addEventListener("close", () => this.onClose());
    this.timers.push(setInterval(() => this.onPulse(), PULSE_MS));
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
    const { startAtMs } = this.store.current;
    return startAtMs === null ? null : performance.now() - startAtMs;
  }

  type(rawChar: string): void {
    const snapshot = this.store.current;
    const raceMs = this.raceMs();
    const racing = snapshot.phase === "racing" || snapshot.phase === "countdown";
    if (!racing || raceMs === null || raceMs < 0 || snapshot.progress.finished) return;

    const char = normalizeTypedChar(rawChar);
    const outcome = applyKey(this.level, snapshot.progress, char);
    const timeline = this.timelineMap.get(snapshot.localId);
    for (const event of outcome.events) timeline?.apply(event, raceMs);
    this.send({ type: "key", char });

    const finishTimes =
      outcome.progress.finished && timeline
        ? new Map(snapshot.finishTimes).set(snapshot.localId, timeline.endMs)
        : snapshot.finishTimes;
    this.store.update({
      progress: outcome.progress,
      finishTimes,
      typedFinishMs: outcome.progress.finished ? raceMs : snapshot.typedFinishMs,
    });
    const correct = outcome.progress.stats.correct > snapshot.progress.stats.correct;
    this.keys.emit({ correct, events: outcome.events });
  }

  start(): void {
    this.send({ type: "start" });
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.timers) clearInterval(timer);
    this.socket.close();
  }

  private onOpen(): void {
    const code = this.mode.kind === "join" ? this.mode.code : undefined;
    this.send({ type: "join", mode: this.mode.kind, code, ...this.profile });
    this.timers.push(
      setInterval(() => this.send({ type: "ping", sentAt: performance.now() }), PING_INTERVAL_MS),
    );
    this.send({ type: "ping", sentAt: performance.now() });
  }

  private onMessage(event: MessageEvent): void {
    const parsed = typeof event.data === "string" ? safeParse(event.data) : null;
    if (!parsed) {
      this.fail("The server sent something this version of the game doesn't understand. Refresh to update.");
      return;
    }
    this.handle(parsed);
  }

  private handle(message: ServerMessage): void {
    const snapshot = this.store.current;
    switch (message.type) {
      case "welcome":
        this.store.update({ localId: message.youId, roomCode: message.code });
        return;
      case "lobby":
        this.store.update({
          phase: snapshot.phase === "finished" ? "finished" : "lobby",
          roster: message.racers,
          hostId: message.hostId,
          autoStartAtMs: message.autoStartInMs === null ? null : performance.now() + message.autoStartInMs,
        });
        return;
      case "countdown":
        this.beginCountdown(message.racers, message.startsInMs);
        return;
      case "racer-event":
        if (message.racerId !== snapshot.localId) {
          this.timelineMap.get(message.racerId)?.apply(message.event, message.raceMs);
        }
        return;
      case "racer-finished":
        this.store.update({
          finishTimes: new Map(snapshot.finishTimes).set(message.racerId, message.finishMs),
        });
        return;
      case "racer-left":
        this.store.update({ roster: snapshot.roster.filter((racer) => racer.id !== message.racerId) });
        return;
      case "race-over":
        this.store.update({ phase: "finished", results: message.results });
        return;
      case "pong": {
        const sample = performance.now() - message.sentAt;
        this.roundTripMs += (sample - this.roundTripMs) * RTT_SMOOTHING;
        return;
      }
      case "error":
        if (!NON_FATAL_ERRORS.has(message.code)) this.fail(message.message);
        return;
    }
  }

  private beginCountdown(racers: readonly RacerSummary[], startsInMs: number): void {
    this.timelineMap = new Map(
      racers.map((racer, lane) => [
        racer.id,
        new Timeline(this.level, startPositionForLane(this.level, lane)),
      ]),
    );
    this.store.update({
      phase: "countdown",
      roster: racers,
      startAtMs: performance.now() + startsInMs - this.roundTripMs / 2,
      finishTimes: new Map(),
      typedFinishMs: null,
      localCrossed: false,
      results: null,
      progress: startProgress(this.level),
    });
  }

  private onPulse(): void {
    const snapshot = this.store.current;
    const raceMs = this.raceMs();
    if (snapshot.phase === "countdown" && raceMs !== null && raceMs >= 0) {
      this.store.update({ phase: "racing" });
    }
    const localFinish = snapshot.finishTimes.get(snapshot.localId);
    const crossed = localFinish !== undefined && raceMs !== null && raceMs >= localFinish;
    if (crossed !== snapshot.localCrossed) this.store.update({ localCrossed: crossed });
  }

  private onClose(): void {
    if (this.disposed) return;
    const { phase } = this.store.current;
    if (phase !== "error")
      this.fail("Lost connection to the race server. Check your connection and try again.");
  }

  private fail(message: string): void {
    for (const timer of this.timers) clearInterval(timer);
    this.store.update({ phase: "error", error: message });
  }

  private send(message: ClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
}

function safeParse(data: string): ServerMessage | null {
  try {
    const result = serverMessageSchema.safeParse(JSON.parse(data));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
