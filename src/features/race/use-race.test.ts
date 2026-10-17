import { describe, expect, it } from "vitest";
import { formatRaceTime, ordinal } from "./use-race";

describe("race formatting", () => {
  it("names places in English", () => {
    expect([1, 2, 3, 4, 11, 22].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "22nd"]);
  });

  it("formats race times as minutes and tenths", () => {
    expect(formatRaceTime(0)).toBe("0:00.0");
    expect(formatRaceTime(65_432)).toBe("1:05.4");
  });
});
