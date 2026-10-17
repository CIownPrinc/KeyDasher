import { useCallback, useSyncExternalStore } from "react";
import { courseProgress } from "@/game/level/types";
import { rankRacers, type RacerSummary } from "@/game/room/standings";
import type { RaceSession, SessionSnapshot } from "./session/types";

export function useSnapshot(session: RaceSession): SessionSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
}

/** The race clock, re-rendering every `stepMs`. Null before a countdown has been scheduled. */
export function useRaceClock(session: RaceSession, stepMs: number): number | null {
  const subscribe = useCallback(
    (listener: () => void) => {
      const timer = setInterval(listener, stepMs);
      return () => clearInterval(timer);
    },
    [stepMs],
  );
  const read = useCallback(() => {
    const raceMs = session.raceMs();
    return raceMs === null ? null : Math.floor(raceMs / stepMs) * stepMs;
  }, [session, stepMs]);
  return useSyncExternalStore(subscribe, read, read);
}

/** The local clock (performance.now), re-rendering every `stepMs`. */
export function useNow(stepMs: number): number {
  const subscribe = useCallback(
    (listener: () => void) => {
      const timer = setInterval(listener, stepMs);
      return () => clearInterval(timer);
    },
    [stepMs],
  );
  const read = useCallback(() => Math.floor(performance.now() / stepMs) * stepMs, [stepMs]);
  return useSyncExternalStore(subscribe, read, () => 0);
}

export interface Standing {
  readonly racer: RacerSummary;
  readonly place: number;
  readonly finishMs: number | null;
  readonly courseProgress: number;
}

/** Live order: finished racers by time, then everyone else by how far along they are. */
export function computeStandings(
  session: RaceSession,
  snapshot: SessionSnapshot,
  raceMs: number,
): Standing[] {
  const timelines = session.timelines();
  const entries = snapshot.roster.map((racer) => {
    const timeline = timelines.get(racer.id);
    const delay = racer.id === snapshot.localId ? 0 : session.opponentDelayMs;
    const x = timeline ? timeline.poseAt(raceMs - delay).x : 0;
    const finishMs = snapshot.finishTimes.get(racer.id) ?? null;
    const crossed = finishMs !== null && finishMs <= raceMs;
    return {
      id: racer.id,
      racer,
      finishMs: crossed ? finishMs : null,
      courseProgress: crossed ? 1 : courseProgress(session.level, x),
    };
  });
  return rankRacers(entries, raceMs).map((entry, index) => ({
    racer: entry.racer,
    place: index + 1,
    finishMs: entry.finishMs,
    courseProgress: entry.courseProgress,
  }));
}

export function ordinal(place: number): string {
  const suffixes: Record<string, string> = { one: "st", two: "nd", few: "rd", other: "th" };
  return `${place}${suffixes[new Intl.PluralRules("en", { type: "ordinal" }).select(place)] ?? "th"}`;
}

export function formatRaceTime(ms: number): string {
  const clamped = Math.max(0, ms);
  const minutes = Math.floor(clamped / 60_000);
  const seconds = ((clamped % 60_000) / 1000).toFixed(1).padStart(4, "0");
  return `${minutes}:${seconds}`;
}
