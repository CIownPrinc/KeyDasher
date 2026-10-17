"use client";

import { useSearchParams } from "next/navigation";
import { roomCodeSchema } from "@/game/protocol/messages";
import { HomeScreen } from "./home-screen";

/** Reads an invite (`/?room=ABCD`) from the URL so a shared link lands on a ready Join button. */
export function HomeRoute() {
  const room = useSearchParams().get("room");
  const code = room === null ? null : roomCodeSchema.safeParse(room);
  return <HomeScreen inviteCode={code?.success ? code.data : null} />;
}
