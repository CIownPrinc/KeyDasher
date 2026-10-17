"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { RaceAudio } from "./audio/sfx";
import type { RaceSession } from "./session/types";

interface TypingCaptureProps {
  readonly session: RaceSession;
  readonly audio: RaceAudio;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly active: boolean;
}

const INTERACTIVE = "button, a, input, select, textarea, [role='button']";

/**
 * Captures typing through a real (visually hidden) input, which works with hardware keyboards,
 * phone keyboards, and IMEs alike. Every inserted character goes to the session.
 */
export function TypingCapture({ session, audio, inputRef, active }: TypingCaptureProps) {
  const hasFocusedRef = useRef(false);

  useEffect(() => {
    if (active) inputRef.current?.focus();
    else inputRef.current?.blur();
  }, [active, inputRef]);

  useEffect(() => {
    const refocus = (event: PointerEvent) => {
      if (!active) return;
      if (event.target instanceof Element && event.target.closest(INTERACTIVE)) return;
      audio.unlock();
      inputRef.current?.focus();
    };
    window.addEventListener("pointerdown", refocus);
    return () => window.removeEventListener("pointerdown", refocus);
  }, [active, audio, inputRef]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const onInput = (event: Event) => {
      if (!active) {
        input.value = "";
        return;
      }
      const data = event instanceof InputEvent ? event.data : null;
      input.value = "";
      if (event instanceof InputEvent && /insertFromPaste|insertFromDrop/i.test(event.inputType)) return;
      if (!data) return;
      for (const char of data) session.type(char);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!active) return;
      if (!hasFocusedRef.current) {
        hasFocusedRef.current = true;
        audio.unlock();
      }
      if (event.key === "Enter" || event.key === "Tab") return;
      if (event.key === " ") {
        // Some browsers scroll or skip "input" for a lone space; handle it here instead.
        event.preventDefault();
        session.type(" ");
      }
    };
    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onKeyDown);
    return () => {
      input.removeEventListener("input", onInput);
      input.removeEventListener("keydown", onKeyDown);
    };
  }, [session, audio, inputRef, active]);

  return (
    <input
      ref={inputRef}
      aria-label="Type the words shown to move your racer"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      disabled={!active}
      onPaste={(event) => event.preventDefault()}
      onDrop={(event) => event.preventDefault()}
      enterKeyHint="next"
      className="pointer-events-none absolute bottom-0 left-1/2 size-px opacity-0"
    />
  );
}
