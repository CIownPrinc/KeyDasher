import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { env } from "@/env";
import { isSameOrigin } from "./gateway";

function request(origin: string, host: string): IncomingMessage {
  return { headers: { origin, host } } as IncomingMessage;
}

describe("realtime origin checks", () => {
  it("accepts the configured site origin", () => {
    const configured = new URL(env.SITE_URL);
    expect(isSameOrigin(request(configured.origin, configured.host))).toBe(true);
  });

  it("rejects another scheme or host, even when the host matches", () => {
    const configured = new URL(env.SITE_URL);
    const otherScheme = configured.protocol === "https:" ? "http:" : "https:";
    expect(isSameOrigin(request(`${otherScheme}//${configured.host}`, configured.host))).toBe(false);
    expect(isSameOrigin(request("https://attacker.example", "attacker.example"))).toBe(false);
  });
});
