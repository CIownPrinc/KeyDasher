import { createServer } from "node:http";
import next from "next";
import { env } from "@/env";
import { logger } from "@/server/logger";
import { attachRealtimeGateway } from "@/server/realtime/gateway";

async function main(): Promise<void> {
  const dev = env.NODE_ENV !== "production";
  const app = next({ dev, hostname: env.HOSTNAME, port: env.PORT });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = createServer((request, response) => {
    void handle(request, response);
  });
  attachRealtimeGateway(server);
  server.listen(env.PORT, env.HOSTNAME, () => {
    logger.info({ url: `http://${env.HOSTNAME}:${env.PORT}`, dev }, "KeyDasher is ready");
  });
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, "server failed to start");
  process.exit(1);
});
