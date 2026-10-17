"use client";

import { AlertTriangle, Shield, Sparkles } from "lucide-react";
import { summarizeRoute } from "@/game/level/routes";
import { outgoingOf, type Level, type LevelEdge, type RouteTag } from "@/game/level/types";
import { availableEdges, type RacerProgress } from "@/game/racer/racer";
import { RISKY_TYPO_LIMIT } from "@/game/racer/rules";
import { cn } from "@/lib/utils";

const PREVIEW_WORDS = 4;

const ROUTE_STYLE: Readonly<Record<RouteTag, { icon: typeof Shield; badge: string; border: string }>> = {
  safe: { icon: Shield, badge: "bg-route-safe", border: "border-route-safe" },
  risky: { icon: AlertTriangle, badge: "bg-route-risky", border: "border-route-risky" },
  shortcut: { icon: Sparkles, badge: "bg-route-shortcut", border: "border-route-shortcut" },
};

interface TypingPanelProps {
  readonly level: Level;
  readonly progress: RacerProgress;
  /** Changes on every typo, replaying the shake animation. */
  readonly typoCount: number;
  readonly onFocusRequest: () => void;
}

/** The big, readable version of what to type next. The canvas shows the same words in the world. */
export function TypingPanel({ level, progress, typoCount, onFocusRequest }: TypingPanelProps) {
  const options = availableEdges(level, progress);
  const [current] = options;
  if (!current) return null;
  const atFork = options.length > 1;

  return (
    <section
      aria-label="What to type"
      onPointerDown={onFocusRequest}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex justify-center px-2 pb-3 sm:px-4 sm:pb-6"
    >
      <div className="max-h-[55dvh] w-full max-w-3xl overflow-y-auto rounded-[1.75rem] border-4 border-ink bg-white/95 p-3 shadow-[0_6px_0_#3a2459] backdrop-blur sm:p-4">
        {atFork ? (
          <ForkChoices level={level} options={options} />
        ) : (
          <CurrentWord level={level} edge={current} progress={progress} typoCount={typoCount} />
        )}
      </div>
    </section>
  );
}

function ForkChoices({ level, options }: { readonly level: Level; readonly options: readonly LevelEdge[] }) {
  return (
    <div>
      <p className="mb-2 text-center text-sm font-bold text-ink sm:text-base" aria-live="polite">
        Fork! Type the <span className="text-candy-pink">first letter</span> of your route.
      </p>
      <ul className={cn("grid gap-2", options.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {options.map((edge) => {
          const route = edge.route;
          if (!route) return null;
          const style = ROUTE_STYLE[route.tag];
          const Icon = style.icon;
          const summary = summarizeRoute(level, edge);
          return (
            <li key={edge.id} className={cn("rounded-2xl border-3 bg-white p-2.5", style.border)}>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold text-white uppercase",
                    style.badge,
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {route.tag}
                </span>
                <span className="truncate text-sm font-bold text-ink">{route.name}</span>
              </div>
              <p className="mt-1.5 text-2xl font-bold text-ink sm:text-3xl">
                <span className="rounded-lg bg-candy-lemon px-1 text-candy-pink underline decoration-4 underline-offset-4">
                  {edge.word[0]}
                </span>
                {edge.word.slice(1)}
              </p>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                {summary.words} {summary.words === 1 ? "move" : "moves"} · {summary.letters} keys
                {summary.riskyWords > 0 && (
                  <span className="text-route-risky">
                    {" · "}
                    {summary.riskyWords} crumbly {summary.riskyWords === 1 ? "move" : "moves"}
                  </span>
                )}
              </p>
              <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{route.blurb}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface CurrentWordProps {
  readonly level: Level;
  readonly edge: LevelEdge;
  readonly progress: RacerProgress;
  readonly typoCount: number;
}

function CurrentWord({ level, edge, progress, typoCount }: CurrentWordProps) {
  const typed = edge.word.slice(0, progress.typed);
  const next = edge.word[progress.typed] ?? "";
  const rest = edge.word.slice(progress.typed + 1);
  const upcoming = upcomingWords(level, edge);

  return (
    <div className="flex flex-col items-center gap-1.5">
      {progress.stats.correct === 0 && (
        <p className="text-center text-sm font-bold text-ink">Type the highlighted letter to move.</p>
      )}
      {edge.risky && (
        <p className="flex items-center gap-1.5 rounded-full bg-route-risky px-3 py-0.5 text-xs font-bold text-white sm:text-sm">
          <AlertTriangle className="size-4" aria-hidden="true" />
          Crumbly! {RISKY_TYPO_LIMIT} slips and you fall
          <span
            className="ml-1 flex gap-1"
            aria-label={`${progress.cracks} of ${RISKY_TYPO_LIMIT} slips used`}
          >
            {Array.from({ length: RISKY_TYPO_LIMIT }, (_, index) => (
              <span
                key={index}
                className={cn(
                  "size-2.5 rounded-full border-2 border-white",
                  index < progress.cracks && "bg-white",
                )}
              />
            ))}
          </span>
        </p>
      )}
      <p
        key={typoCount}
        className={cn(
          "max-w-full overflow-x-auto text-[clamp(1.75rem,8vw,3rem)] font-bold tracking-wide whitespace-pre text-ink",
          typoCount > 0 && "animate-shake",
        )}
        aria-live="polite"
        aria-label={`Type: ${edge.word}`}
      >
        <span className="text-typed">{typed}</span>
        <span className="rounded-md bg-candy-lemon underline decoration-candy-pink decoration-4 underline-offset-6">
          {next === " " ? "␣" : next}
        </span>
        <span>{rest}</span>
      </p>
      {next === " " && <p className="text-xs font-bold text-candy-grape">Press Space for ␣.</p>}
      {upcoming.length > 0 && (
        <p className="truncate text-base font-semibold text-muted-foreground sm:text-lg" aria-hidden="true">
          {upcoming.join("  ·  ")}
        </p>
      )}
      <p className="text-xs font-semibold text-muted-foreground sm:hidden">Tap here to open your keyboard</p>
    </div>
  );
}

function upcomingWords(level: Level, edge: LevelEdge): string[] {
  const words: string[] = [];
  let nodeId = edge.to;
  while (words.length < PREVIEW_WORDS) {
    const next = outgoingOf(level, nodeId);
    if (next.length > 1) {
      words.push("fork ahead!");
      break;
    }
    const [single] = next;
    if (!single) break;
    words.push(single.word);
    nodeId = single.to;
  }
  return words;
}
