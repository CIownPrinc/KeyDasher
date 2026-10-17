"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { MessageOverlay } from "./hud/overlays";
import { RaceScreen } from "./race-screen";
import { sessionModeFromParams } from "./route-params";

export function RaceRoute() {
  const params = useSearchParams();
  const query = params.toString();
  const mode = useMemo(() => sessionModeFromParams(new URLSearchParams(query)), [query]);
  if (!mode) {
    return (
      <main className="relative h-dvh bg-[#6b5cff]">
        <MessageOverlay
          title="Hmm, that link is off"
          message="This race link isn't valid. Head home and pick a race."
        />
      </main>
    );
  }
  return <RaceScreen mode={mode} />;
}
