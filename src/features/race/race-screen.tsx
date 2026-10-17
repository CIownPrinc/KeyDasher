"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ensureRaceableProfile } from "../home/profile";
import { RaceAudio } from "./audio/sfx";
import { GameCanvas } from "./game-canvas";
import { CountdownOverlay, LobbyOverlay, MessageOverlay, ResultsOverlay } from "./hud/overlays";
import { RaceHud } from "./hud/race-hud";
import { TypingPanel } from "./hud/typing-panel";
import { NetworkSession } from "./session/network-session";
import { PracticeSession } from "./session/practice-session";
import type { RaceSession, SessionMode } from "./session/types";
import { TypingCapture } from "./typing-capture";
import { computeStandings, useRaceClock, useSnapshot } from "./use-race";

const CLOCK_STEP_MS = 100;
/** Keep "GO!" on screen briefly after the start. */
const GO_BANNER_MS = 700;

function createSession(mode: SessionMode): RaceSession {
  const profile = ensureRaceableProfile();
  return mode.kind === "practice" ? new PracticeSession(profile) : new NetworkSession(mode, profile);
}

/** Holds the live session so React can subscribe to it; the session itself is an external resource. */
class SessionSlot {
  private session: RaceSession | null = null;
  private readonly listeners = new Set<() => void>();

  readonly get = (): RaceSession | null => this.session;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  replace(session: RaceSession | null): void {
    this.session = session;
    for (const listener of this.listeners) listener();
  }
}

/** Owns the session for one race URL; "race again" swaps in a fresh session. */
export function RaceScreen({ mode }: { readonly mode: SessionMode }) {
  const [attempt, setAttempt] = useState(0);
  const [slot] = useState(() => new SessionSlot());
  const session = useSyncExternalStore(slot.subscribe, slot.get, () => null);

  useEffect(() => {
    const created = createSession(mode);
    slot.replace(created);
    return () => {
      slot.replace(null);
      created.dispose();
    };
  }, [slot, mode, attempt]);

  if (!session) return <main className="h-dvh bg-[#6b5cff]" />;
  return (
    <RaceView
      key={attempt}
      session={session}
      mode={mode}
      onNewSession={() => setAttempt((count) => count + 1)}
    />
  );
}

interface RaceViewProps {
  readonly session: RaceSession;
  readonly mode: SessionMode;
  readonly onNewSession: () => void;
}

function RaceView({ session, mode, onNewSession }: RaceViewProps) {
  const snapshot = useSnapshot(session);
  const raceMs = useRaceClock(session, CLOCK_STEP_MS);
  const [audio] = useState(() => new RaceAudio());
  const [muted, setMuted] = useState(false);
  const [typoCount, setTypoCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastCountRef = useRef<number | null>(null);

  useEffect(() => audio.setMuted(muted), [audio, muted]);

  useEffect(
    () =>
      session.onLocalKey((feedback) => {
        if (!feedback.correct) {
          setTypoCount((count) => count + 1);
          audio.typo();
        } else {
          audio.key(session.getSnapshot().progress.typed);
        }
        for (const event of feedback.events) {
          if (event.kind === "advance") audio.word(event.flow);
          if (event.kind === "crack") audio.crack();
        }
      }),
    [session, audio],
  );

  useEffect(() => {
    if (raceMs === null || raceMs > GO_BANNER_MS) return;
    const count = raceMs < 0 ? Math.ceil(-raceMs / 1000) : 0;
    if (count === lastCountRef.current) return;
    lastCountRef.current = count;
    audio.countdown(count === 0);
  }, [raceMs, audio]);

  const clockMs = raceMs ?? 0;
  const standings = useMemo(() => computeStandings(session, snapshot, clockMs), [session, snapshot, clockMs]);
  const { phase } = snapshot;
  const typingLive = (phase === "countdown" || phase === "racing") && !snapshot.localCrossed;
  const showCountdown = phase === "countdown" || (phase === "racing" && clockMs < GO_BANNER_MS);
  const showResults = snapshot.localCrossed || phase === "finished";
  const raceAgain = raceAgainAction(
    mode,
    snapshot.hostId === snapshot.localId,
    phase === "finished",
    session,
    onNewSession,
  );

  return (
    <main className="relative h-dvh overflow-hidden bg-[#6b5cff] select-none">
      <h1 className="sr-only">KeyDasher race on {session.level.name}</h1>
      <GameCanvas session={session} audio={audio} />
      <TypingCapture session={session} audio={audio} inputRef={inputRef} active={typingLive} />
      <RaceHud
        session={session}
        snapshot={snapshot}
        standings={standings}
        raceMs={clockMs}
        muted={muted}
        onToggleMute={() => setMuted((value) => !value)}
      />
      {typingLive && (
        <TypingPanel
          level={session.level}
          progress={snapshot.progress}
          typoCount={typoCount}
          onFocusRequest={() => inputRef.current?.focus()}
        />
      )}

      {phase === "connecting" && <MessageOverlay title="Connecting…" message="Warming up the jelly." busy />}
      {phase === "error" && (
        <MessageOverlay
          title="Uh oh!"
          message={snapshot.error ?? "Something went wrong."}
          onRetry={onNewSession}
        />
      )}
      {phase === "lobby" && mode.kind !== "practice" && (
        <LobbyOverlay snapshot={snapshot} onStart={() => session.start()} />
      )}
      {showCountdown && raceMs !== null && <CountdownOverlay raceMs={raceMs} />}
      {showResults && (
        <ResultsOverlay
          snapshot={snapshot}
          standings={standings}
          onRaceAgain={raceAgain.action}
          raceAgainLabel={raceAgain.label}
        />
      )}
    </main>
  );
}

function raceAgainAction(
  mode: SessionMode,
  isHost: boolean,
  raceFinished: boolean,
  session: RaceSession,
  onNewSession: () => void,
): { readonly action: (() => void) | null; readonly label: string } {
  const isPrivateRoom = mode.kind === "create" || mode.kind === "join";
  if (!isPrivateRoom) return { action: onNewSession, label: "Race again" };
  if (!raceFinished) return { action: null, label: "Waiting for the race to finish…" };
  if (isHost) return { action: () => session.start(), label: "Rematch" };
  return { action: null, label: "Waiting for the host to start a rematch…" };
}
