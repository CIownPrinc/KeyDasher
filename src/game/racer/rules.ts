/** Consecutive clean words build flow; each step makes every move faster. */
export const FLOW_STEP = 0.08;
export const FLOW_MAX_STREAK = 6;

/** Typos allowed on a risky word before it gives way. */
export const RISKY_TYPO_LIMIT = 2;

export function flowForStreak(streak: number): number {
  return 1 + FLOW_STEP * Math.min(streak, FLOW_MAX_STREAK);
}

/** Phone keyboards love "smart" punctuation; treat it as the plain ASCII the course uses. */
export function normalizeTypedChar(char: string): string {
  switch (char) {
    case "‘":
    case "’":
      return "'";
    case "“":
    case "”":
      return '"';
    default:
      return char;
  }
}
