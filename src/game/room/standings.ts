import { z } from "zod";
import { RACER_COLORS } from "../racer/colors";
import { routeTakenSchema } from "../racer/racer";

export const racerSummarySchema = z.object({
  id: z.string().max(40),
  name: z.string().max(24),
  color: z.enum(RACER_COLORS),
  isBot: z.boolean(),
});
export type RacerSummary = z.infer<typeof racerSummarySchema>;

export const raceResultSchema = racerSummarySchema.extend({
  place: z.number().int().min(1),
  finishMs: z.number().nullable(),
  wordsPerMinute: z.number().min(0),
  accuracy: z.number().min(0).max(1),
  falls: z.number().int().min(0),
  courseProgress: z.number().min(0).max(1),
  routes: z.array(routeTakenSchema).max(16),
});
export type RaceResult = z.infer<typeof raceResultSchema>;

export interface StandingEntry {
  readonly id: string;
  /** When the racer crosses the line, known as soon as the final word is typed. */
  readonly finishMs: number | null;
  readonly courseProgress: number;
}

/** Finished racers by time (once they have visibly crossed), then everyone else by distance. */
export function rankRacers<T extends StandingEntry>(entries: readonly T[], raceMs: number): T[] {
  const crossed = (entry: T) => entry.finishMs !== null && entry.finishMs <= raceMs;
  return [...entries].sort((a, b) => {
    if (crossed(a) && crossed(b)) return (a.finishMs ?? 0) - (b.finishMs ?? 0);
    if (crossed(a) !== crossed(b)) return crossed(a) ? -1 : 1;
    return b.courseProgress - a.courseProgress;
  });
}

const CHARS_PER_WORD = 5;

export function wordsPerMinute(correctKeys: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return correctKeys / CHARS_PER_WORD / (elapsedMs / 60_000);
}
