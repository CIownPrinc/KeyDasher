import { z } from "zod";
import { RACER_COLORS } from "../racer/colors";
import { racerEventSchema } from "../racer/events";
import { raceResultSchema, racerSummarySchema } from "../room/standings";

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 4;
export const NAME_MAX_LENGTH = 14;

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(ROOM_CODE_LENGTH)
  .refine((code) => [...code].every((char) => ROOM_CODE_ALPHABET.includes(char)), {
    message: "Room codes use letters and numbers only",
  });

/** Strips control and formatting characters so names render the same everywhere. */
export const racerNameSchema = z
  .string()
  .transform((name) =>
    name
      .replace(/[\p{C}]/gu, "")
      .replace(/\s+/g, " ")
      .trim(),
  )
  .pipe(z.string().min(1).max(NAME_MAX_LENGTH));

const typedCharSchema = z
  .string()
  .refine((char) => [...char].length === 1 && !/\p{C}/u.test(char), "Expected one printable character");

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("join"),
    mode: z.enum(["quick", "create", "join"]),
    code: roomCodeSchema.optional(),
    name: racerNameSchema,
    color: z.enum(RACER_COLORS),
  }),
  z.object({ type: z.literal("key"), char: typedCharSchema }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("ping"), sentAt: z.number() }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const ERROR_CODES = [
  "bad-message",
  "room-not-found",
  "room-full",
  "race-in-progress",
  "not-host",
  "too-fast",
  "server-busy",
] as const;

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("welcome"),
    youId: z.string(),
    code: z.string().nullable(),
    isPrivate: z.boolean(),
  }),
  z.object({
    type: z.literal("lobby"),
    racers: z.array(racerSummarySchema).max(8),
    hostId: z.string().nullable(),
    /** Quick races start on their own; private rooms wait for the host. */
    autoStartInMs: z.number().nullable(),
  }),
  z.object({
    type: z.literal("countdown"),
    racers: z.array(racerSummarySchema).max(8),
    startsInMs: z.number(),
  }),
  z.object({
    type: z.literal("racer-event"),
    racerId: z.string(),
    raceMs: z.number(),
    event: racerEventSchema,
  }),
  z.object({ type: z.literal("racer-finished"), racerId: z.string(), finishMs: z.number() }),
  z.object({ type: z.literal("racer-left"), racerId: z.string() }),
  z.object({ type: z.literal("race-over"), results: z.array(raceResultSchema).max(8) }),
  z.object({ type: z.literal("pong"), sentAt: z.number() }),
  z.object({
    type: z.literal("error"),
    code: z.enum(ERROR_CODES),
    message: z.string(),
  }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type ErrorCode = (typeof ERROR_CODES)[number];
