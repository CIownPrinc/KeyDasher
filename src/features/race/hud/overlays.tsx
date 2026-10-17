"use client";

import { Check, Copy, Crown, Home, Loader2, RotateCcw, Trophy } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { DasherAvatar } from "@/components/game/dasher-avatar";
import { Button } from "@/components/ui/button";
import type { RaceResult } from "@/game/room/standings";
import { wordsPerMinute } from "@/game/room/standings";
import { cn } from "@/lib/utils";
import { ROUTE_COLORS } from "../render/labels";
import type { SessionSnapshot } from "../session/types";
import { formatRaceTime, ordinal, useNow, type Standing } from "../use-race";

function OverlayCard({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-[2px]">
      <div
        className={cn(
          "max-h-[calc(100dvh-2rem)] w-full max-w-md animate-pop-in overflow-y-auto rounded-[2rem] border-4 border-ink bg-white p-6 text-ink shadow-[0_8px_0_#3a2459]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function MessageOverlay({
  title,
  message,
  busy = false,
  onRetry,
}: {
  readonly title: string;
  readonly message: string;
  readonly busy?: boolean;
  readonly onRetry?: () => void;
}) {
  return (
    <OverlayCard className="text-center">
      {busy && <Loader2 className="mx-auto mb-3 size-10 animate-spin text-candy-pink" aria-hidden="true" />}
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mt-2 font-medium text-muted-foreground" role={busy ? "status" : "alert"}>
        {message}
      </p>
      {!busy && (
        <div className="mt-5 flex justify-center gap-3">
          {onRetry && (
            <Button size="lg" onClick={onRetry} autoFocus>
              <RotateCcw data-icon="inline-start" aria-hidden="true" />
              Try again
            </Button>
          )}
          <Button
            nativeButton={false}
            render={<Link href="/" />}
            size="lg"
            variant="outline"
            className="border-ink"
          >
            <Home data-icon="inline-start" aria-hidden="true" />
            Home
          </Button>
        </div>
      )}
    </OverlayCard>
  );
}

interface LobbyOverlayProps {
  readonly snapshot: SessionSnapshot;
  readonly onStart: () => void;
}

export function LobbyOverlay({ snapshot, onStart }: LobbyOverlayProps) {
  const nowMs = useNow(250);
  const secondsUntilStart =
    snapshot.autoStartAtMs === null ? 0 : Math.max(0, Math.ceil((snapshot.autoStartAtMs - nowMs) / 1000));
  const isHost = snapshot.hostId !== null && snapshot.hostId === snapshot.localId;
  const isPrivate = snapshot.roomCode !== null;
  return (
    <OverlayCard>
      <h2 className="text-center text-2xl font-bold">{isPrivate ? "Private room" : "Finding racers…"}</h2>
      {isPrivate && snapshot.roomCode && <InviteBox code={snapshot.roomCode} />}
      <ul className="mt-4 flex flex-col gap-2" aria-label="Racers in the lobby">
        {snapshot.roster.map((racer) => (
          <li key={racer.id} className="flex items-center gap-3 rounded-2xl bg-muted px-3 py-2 font-semibold">
            <DasherAvatar color={racer.color} />
            <span className="flex-1 truncate">
              {racer.name}
              {racer.id === snapshot.localId && <span className="text-muted-foreground"> (you)</span>}
            </span>
            {racer.id === snapshot.hostId && <Crown className="size-5 text-[#e0a000]" aria-label="Host" />}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-center text-sm font-semibold text-muted-foreground" role="status">
        {isPrivate
          ? isHost
            ? "Start whenever you're ready. Bots fill any empty spots."
            : "Waiting for the host to start the race…"
          : `Starting in ${secondsUntilStart}s. Bots fill any empty spots.`}
      </p>
      {isHost && (
        <Button size="xl" className="mt-4 w-full" onClick={onStart} autoFocus>
          Start race
        </Button>
      )}
    </OverlayCard>
  );
}

function InviteBox({ code }: { readonly code: string }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/?room=${code}`;
  return (
    <div className="mt-4 flex items-center gap-2 rounded-2xl bg-candy-lemon p-3">
      <div className="flex-1">
        <p className="text-xs font-bold text-ink/70 uppercase">Room code</p>
        <p className="text-3xl font-bold tracking-[0.25em]">{code}</p>
      </div>
      <Button
        size="lg"
        variant="candy"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(link)
            .then(() => setCopied(true))
            .catch(() => setCopied(false));
        }}
      >
        {copied ? (
          <Check data-icon="inline-start" aria-hidden="true" />
        ) : (
          <Copy data-icon="inline-start" aria-hidden="true" />
        )}
        {copied ? "Copied!" : "Copy invite"}
      </Button>
    </div>
  );
}

export function CountdownOverlay({ raceMs }: { readonly raceMs: number }) {
  const showGo = raceMs >= 0;
  const count = Math.ceil(-raceMs / 1000);
  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
      aria-live="assertive"
    >
      <span
        key={showGo ? "go" : count}
        className="animate-count text-[9rem] leading-none font-bold text-candy-lemon drop-shadow-[0_8px_0_#3a2459] [-webkit-text-stroke:4px_#3a2459]"
      >
        {showGo ? "GO!" : count}
      </span>
    </div>
  );
}

interface ResultsOverlayProps {
  readonly snapshot: SessionSnapshot;
  readonly standings: readonly Standing[];
  readonly onRaceAgain: (() => void) | null;
  readonly raceAgainLabel: string;
}

export function ResultsOverlay({ snapshot, standings, onRaceAgain, raceAgainLabel }: ResultsOverlayProps) {
  const final = snapshot.results;
  const mine = final?.find((result) => result.id === snapshot.localId);
  const localStanding = standings.find((standing) => standing.racer.id === snapshot.localId);
  const place = mine?.place ?? localStanding?.place ?? null;
  const finishMs = snapshot.finishTimes.get(snapshot.localId) ?? null;
  const crossed = snapshot.localCrossed;
  const { stats, routes } = snapshot.progress;
  const elapsed = finishMs ?? 0;

  return (
    <OverlayCard className="max-w-lg">
      <div className="flex flex-col items-center text-center">
        <Trophy
          className={cn("size-12", place === 1 ? "text-[#ffc93c]" : "text-candy-grape")}
          aria-hidden="true"
        />
        <h2 className="mt-1 text-3xl font-bold">
          {crossed && place !== null ? `You finished ${ordinal(place)}!` : "Race over"}
        </h2>
        {!final && <p className="text-sm font-semibold text-muted-foreground">Others are still racing…</p>}
      </div>

      {crossed && (
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="Time" value={formatRaceTime(elapsed)} />
          <Stat
            label="WPM"
            value={Math.round(
              mine?.wordsPerMinute ?? wordsPerMinute(stats.correct, snapshot.typedFinishMs ?? elapsed),
            ).toString()}
          />
          <Stat
            label="Accuracy"
            value={`${Math.round((mine?.accuracy ?? (stats.keystrokes ? stats.correct / stats.keystrokes : 0)) * 100)}%`}
          />
        </dl>
      )}

      {routes.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold text-muted-foreground uppercase">Your route</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {routes.map((taken, index) => (
              <li
                key={`${taken.route.name}-${index}`}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-bold text-white",
                  taken.fell && "line-through opacity-70",
                )}
                style={{ backgroundColor: ROUTE_COLORS[taken.route.tag] }}
              >
                {taken.route.name}
                {taken.fell && " (fell)"}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ol className="mt-4 flex flex-col gap-1.5" aria-label="Standings">
        {(final ?? standings).map((entry) => (
          <StandingRow
            key={"id" in entry ? entry.id : entry.racer.id}
            entry={entry}
            localId={snapshot.localId}
          />
        ))}
      </ol>

      <div className="mt-5 flex gap-3">
        {onRaceAgain ? (
          <Button size="xl" className="flex-1" onClick={onRaceAgain} autoFocus>
            <RotateCcw data-icon="inline-start" aria-hidden="true" />
            {raceAgainLabel}
          </Button>
        ) : (
          <p className="flex flex-1 items-center justify-center text-sm font-semibold text-muted-foreground">
            {raceAgainLabel}
          </p>
        )}
        <Button
          nativeButton={false}
          render={<Link href="/" />}
          size="xl"
          variant="outline"
          className="border-ink"
        >
          <Home data-icon="inline-start" aria-hidden="true" />
          Home
        </Button>
      </div>
    </OverlayCard>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-2xl bg-muted px-2 py-2">
      <dt className="text-xs font-bold text-muted-foreground uppercase">{label}</dt>
      <dd className="text-2xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function StandingRow({
  entry,
  localId,
}: {
  readonly entry: RaceResult | Standing;
  readonly localId: string;
}) {
  const racer = "racer" in entry ? entry.racer : entry;
  const finishMs = entry.finishMs;
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-2xl px-3 py-1.5 font-semibold",
        racer.id === localId ? "bg-candy-lemon" : "bg-muted",
      )}
    >
      <span className="w-9 text-sm font-bold text-muted-foreground">{ordinal(entry.place)}</span>
      <DasherAvatar color={racer.color} className="size-7" />
      <span className="flex-1 truncate">
        {racer.name}
        {racer.isBot && <span className="ml-1 text-xs text-muted-foreground">bot</span>}
      </span>
      <span className="text-sm tabular-nums">
        {finishMs !== null ? formatRaceTime(finishMs) : `${Math.round(entry.courseProgress * 100)}%`}
      </span>
    </li>
  );
}
