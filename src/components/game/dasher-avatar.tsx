import { RACER_SWATCHES, type RacerColor } from "@/game/racer/colors";
import { cn } from "@/lib/utils";

interface DasherAvatarProps {
  readonly color: RacerColor;
  readonly className?: string;
}

/** The racer's blob face, matching the in-game character, for menus and scoreboards. */
export function DasherAvatar({ color, className }: DasherAvatarProps) {
  const swatch = RACER_SWATCHES[color];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-block size-8 shrink-0 rounded-full border-2 border-ink/30 shadow-[inset_-4px_-5px_0_rgba(0,0,0,0.15)]",
        className,
      )}
      style={{ backgroundColor: swatch.body }}
    >
      <span className="absolute top-[30%] left-[28%] h-[30%] w-[20%] rounded-full bg-white">
        <span className="absolute top-[30%] right-[10%] size-[55%] rounded-full bg-ink" />
      </span>
      <span className="absolute top-[30%] left-[56%] h-[30%] w-[20%] rounded-full bg-white">
        <span className="absolute top-[30%] right-[10%] size-[55%] rounded-full bg-ink" />
      </span>
    </span>
  );
}
