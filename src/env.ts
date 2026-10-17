import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/** The only place that reads process.env. Fails at boot if anything is malformed. */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    HOSTNAME: z.string().min(1).default("localhost"),
    /** Public URL of the site, used for canonical links and the sitemap. */
    SITE_URL: z.url().default("http://localhost:3000"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  },
  client: {},
  experimental__runtimeEnv: {},
  emptyStringAsUndefined: true,
});
