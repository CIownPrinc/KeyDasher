import { z } from "zod";

/**
 * Everything a racer's typing can cause. These cross the network, so the schema is the
 * single source of truth and the TypeScript type is inferred from it.
 */
export const racerEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("advance"), edgeId: z.string().max(16), flow: z.number().min(1).max(2) }),
  z.object({ kind: z.literal("typo") }),
  z.object({ kind: z.literal("crack"), edgeId: z.string().max(16) }),
  z.object({
    kind: z.literal("fall"),
    edgeId: z.string().max(16),
    checkpointId: z.string().max(32),
  }),
]);

export type RacerEvent = z.infer<typeof racerEventSchema>;
