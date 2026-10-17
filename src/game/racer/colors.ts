export const RACER_COLORS = ["pink", "amber", "sky", "lime", "violet", "coral"] as const;
export type RacerColor = (typeof RACER_COLORS)[number];

interface ColorSwatch {
  readonly body: string;
  readonly shade: string;
  readonly label: string;
}

export const RACER_SWATCHES: Readonly<Record<RacerColor, ColorSwatch>> = {
  pink: { body: "#ff5fa2", shade: "#d93d82", label: "Bubblegum" },
  amber: { body: "#ffb627", shade: "#e08e00", label: "Honey" },
  sky: { body: "#3ec1ff", shade: "#1597d6", label: "Sky" },
  lime: { body: "#7cdb5b", shade: "#4fb23a", label: "Lime" },
  violet: { body: "#a77bff", shade: "#7e52e0", label: "Grape" },
  coral: { body: "#ff7b54", shade: "#e2552f", label: "Coral" },
};

/** Prefer the requested color, but avoid duplicates while any color is still free. */
export function pickFreeColor(wanted: RacerColor, taken: ReadonlySet<RacerColor>): RacerColor {
  if (!taken.has(wanted)) return wanted;
  return RACER_COLORS.find((color) => !taken.has(color)) ?? wanted;
}
