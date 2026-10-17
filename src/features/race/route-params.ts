import { roomCodeSchema } from "@/game/protocol/messages";
import type { SessionMode } from "./session/types";

/** Race URLs are the source of truth for which race to join, so a refresh rejoins the same way. */
export function sessionModeFromParams(params: URLSearchParams): SessionMode | null {
  const room = params.get("room");
  if (room !== null) {
    const code = roomCodeSchema.safeParse(room);
    return code.success ? { kind: "join", code: code.data } : null;
  }
  switch (params.get("mode")) {
    case "practice":
      return { kind: "practice" };
    case "quick":
      return { kind: "quick" };
    case "create":
      return { kind: "create" };
    default:
      return null;
  }
}

export function raceHref(mode: SessionMode): string {
  return mode.kind === "join" ? `/race?room=${mode.code}` : `/race?mode=${mode.kind}`;
}
