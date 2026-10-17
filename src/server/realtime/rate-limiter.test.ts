import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limiter";

describe("rate limiter", () => {
  it("allows a burst up to capacity, then refuses", () => {
    const limiter = new RateLimiter(3, 1, 0);
    expect([1, 2, 3, 4].map(() => limiter.tryTake(0))).toEqual([true, true, true, false]);
  });

  it("refills over time", () => {
    const limiter = new RateLimiter(1, 2, 0);
    limiter.tryTake(0);
    expect(limiter.tryTake(400)).toBe(false);
    expect(limiter.tryTake(500)).toBe(true);
  });
});
