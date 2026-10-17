import { describe, expect, it } from "vitest";
import { clientMessageSchema, racerNameSchema, roomCodeSchema, serverMessageSchema } from "./messages";

describe("client messages", () => {
  it("accepts a single typed character", () => {
    expect(clientMessageSchema.safeParse({ type: "key", char: "A" }).success).toBe(true);
  });

  it("rejects multi-character and control-character keys", () => {
    expect(clientMessageSchema.safeParse({ type: "key", char: "ab" }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ type: "key", char: "\u0007" }).success).toBe(false);
  });

  it("rejects unknown message types", () => {
    expect(clientMessageSchema.safeParse({ type: "teleport" }).success).toBe(false);
  });
});

describe("racer names", () => {
  it("trims, collapses whitespace, and strips control characters", () => {
    expect(racerNameSchema.parse("  Zippy ​  Zoe\n ")).toBe("Zippy Zoe");
  });

  it("rejects empty and overlong names", () => {
    expect(racerNameSchema.safeParse("   ").success).toBe(false);
    expect(racerNameSchema.safeParse("x".repeat(15)).success).toBe(false);
  });
});

describe("room codes", () => {
  it("normalizes case", () => {
    expect(roomCodeSchema.parse("abcd")).toBe("ABCD");
  });

  it("rejects ambiguous characters", () => {
    expect(roomCodeSchema.safeParse("AB0O").success).toBe(false);
  });
});

describe("server messages", () => {
  it("accepts racer ids in the UUID format the server assigns", () => {
    const message = {
      type: "lobby",
      racers: [{ id: crypto.randomUUID(), name: "Zoe", color: "sky", isBot: false }],
      hostId: null,
      autoStartInMs: null,
    };
    expect(serverMessageSchema.safeParse(message).success).toBe(true);
  });
});
