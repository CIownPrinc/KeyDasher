"use client";

import { Home, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { DasherAvatar } from "@/components/game/dasher-avatar";
import { Button } from "@/components/ui/button";
import { courseProgress, outgoingOf } from "@/game/level/types";
import { FLOW_MAX_STREAK, flowForStreak } from "@/game/racer/rules";
import { cn } from "@/lib/utils";
import type { RaceSession, SessionSnapshot } from "../session/types";
import { formatRaceTime, ordinal, type Standing } from "../use-race";

interface RaceHudProps {
  readonly session: RaceSession;
  readonly snapshot: SessionSnapshot;
  readonly standings: readonly Standing[];
  readonly raceMs: number;
  readonly muted: boolean;
  readonly onToggleMute: () => void;
}

export function RaceHud({ session, snapshot, standings, raceMs, muted, onToggleMute }: RaceHudProps) {
  const local = standings.find((standing) => standing.racer.id === snapshot.localId);
  const localFinish = snapshot.finishTimes.get(snapshot.localId);
  const shownTime = snapshot.localCrossed && localFinish !== undefined ? localFinish : raceMs;
  const forkMarks = [...session.level.nodes.values()]
    .filter((node) => outgoingOf(session.level, node.id).length > 1)
    .map((node) => courseProgress(session.level, node.x));

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 p-2 sm:gap-3 sm:p-4">
      <Button
        nativeButton={false}
        render={<Link href="/" />}
        size="icon-lg"
        variant="secondary"
        className="pointer-events-auto border-ink/20"
        aria-label="Leave race"
      >
        <Home aria-hidden="true" />
      </Button>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-2xl bg-white/85 px-3 py-2 shadow-[0_4px_0_rgba(58,36,89,0.35)] backdrop-blur">
        <div className="relative h-3 rounded-full bg-ink/10" aria-hidden="true">
          {forkMarks.map((mark) => (
            <span
              key={mark}
              className="absolute top-0 h-3 w-1 rounded-full bg-ink/25"
              style={{ left: `${mark * 100}%` }}
            />
          ))}
          <span className="absolute -top-1 right-0 h-5 w-1.5 rounded-full bg-ink" />
          {standings.map(({ racer, courseProgress: progress }) => (
            <span
              key={racer.id}
              className={cn(
                "absolute -top-2.5 -translate-x-1/2 transition-[left] duration-200 ease-linear",
                racer.id === snapshot.localId && "z-10",
              )}
              style={{ left: `${progress * 100}%` }}
            >
              <DasherAvatar
                color={racer.color}
                className={cn("size-6", racer.id === snapshot.localId && "size-7 ring-3 ring-white")}
              />
            </span>
          ))}
        </div>
        <FlowMeter streak={snapshot.progress.streak} />
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1 rounded-2xl bg-ink px-3 py-1.5 text-white shadow-[0_4px_0_rgba(0,0,0,0.25)]">
        <p
          className="text-2xl leading-none font-bold sm:text-3xl"
          aria-label={local ? `Position ${ordinal(local.place)}` : undefined}
        >
          {local ? ordinal(local.place) : "–"}
          <span className="text-sm font-semibold text-white/60"> / {standings.length}</span>
        </p>
        <p className="font-mono text-sm font-semibold text-candy-mint tabular-nums">
          {formatRaceTime(shownTime)}
        </p>
      </div>

      <Button
        size="icon-lg"
        variant="secondary"
        className="pointer-events-auto border-ink/20"
        onClick={onToggleMute}
        aria-label={muted ? "Unmute sound" : "Mute sound"}
        aria-pressed={muted}
      >
        {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
      </Button>
    </header>
  );
}

function FlowMeter({ streak }: { readonly streak: number }) {
  const filled = Math.min(streak, FLOW_MAX_STREAK);
  return (
    <div className="flex items-center gap-2 text-xs font-bold text-ink">
      <span className="uppercase">Flow</span>
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: FLOW_MAX_STREAK }, (_, index) => (
          <span
            key={index}
            className={cn(
              "h-2 w-4 rounded-full bg-ink/15 transition-colors sm:w-6",
              index < filled && (filled === FLOW_MAX_STREAK ? "bg-candy-pink" : "bg-route-safe"),
            )}
          />
        ))}
      </div>
      <span className="tabular-nums">x{flowForStreak(streak).toFixed(2)}</span>
    </div>
  );
}
