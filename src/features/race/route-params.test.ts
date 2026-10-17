import { describe, expect, it } from "vitest";
import { raceHref, sessionModeFromParams } from "./route-params";

describe("race route params", () => {
  it("reads a room invite", () => {
    expect(sessionModeFromParams(new URLSearchParams("room=abcd"))).toEqual({ kind: "join", code: "ABCD" });
  });

  it("rejects a malformed room code", () => {
    expect(sessionModeFromParams(new URLSearchParams("room=<script>"))).toBeNull();
  });

  it("reads each race mode", () => {
    for (const kind of ["practice", "quick", "create"] as const) {
      expect(sessionModeFromParams(new URLSearchParams(`mode=${kind}`))).toEqual({ kind });
    }
  });

  it("round-trips through raceHref", () => {
    const href = raceHref({ kind: "join", code: "WXYZ" });
    expect(sessionModeFromParams(new URL(href, "http://x").searchParams)).toEqual({
      kind: "join",
      code: "WXYZ",
    });
  });
});
