"use client";

import { useEffect, useRef } from "react";
import type { RaceAudio } from "./audio/sfx";
import { GameRenderer } from "./render/renderer";
import type { RaceSession } from "./session/types";

interface GameCanvasProps {
  readonly session: RaceSession;
  readonly audio: RaceAudio;
}

export function GameCanvas({ session, audio }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new GameRenderer(canvas, session, (cue) => audio.motion(cue));
    return () => renderer.dispose();
  }, [session, audio]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`${session.level.name}: racers running through a candy obstacle course`}
      className="absolute inset-0 size-full touch-none"
    />
  );
}
