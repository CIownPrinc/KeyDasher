import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { REALTIME_PATH } from "@/game/protocol/endpoint";
import { clientMessageSchema, type ServerMessage } from "@/game/protocol/messages";
import { env } from "@/env";
import { logger } from "../logger";
import type { Connection } from "./connection";
import { errorMessage, Matchmaker } from "./matchmaker";
import { RateLimiter } from "./rate-limiter";

const MAX_PAYLOAD_BYTES = 1024;
const MAX_CONNECTIONS = 1000;
const MAX_CONNECTIONS_PER_ADDRESS = 12;
/** Comfortably above the fastest human typists (~20 keys/s), far below a flood. */
const BURST_MESSAGES = 60;
const SUSTAINED_MESSAGES_PER_SECOND = 35;
const HEARTBEAT_MS = 30_000;
const POLICY_VIOLATION = 1008;

/** Accepts game sockets on REALTIME_PATH and leaves every other upgrade to Next.js. */
export function attachRealtimeGateway(server: Server): void {
  const matchmaker = new Matchmaker(() => performance.now());
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
  const connectionsByAddress = new Map<string, number>();

  server.on("upgrade", (request, socket, head) => {
    if (pathnameOf(request) !== REALTIME_PATH) return;
    const address = request.socket.remoteAddress ?? "unknown";
    const refusal = upgradeRefusal(request, sockets.clients.size, connectionsByAddress.get(address) ?? 0);
    if (refusal) {
      logger.warn({ refusal }, "refused realtime upgrade");
      rejectUpgrade(socket, refusal);
      return;
    }
    sockets.handleUpgrade(request, socket, head, (ws) => {
      connectionsByAddress.set(address, (connectionsByAddress.get(address) ?? 0) + 1);
      ws.once("close", () => {
        const remaining = (connectionsByAddress.get(address) ?? 1) - 1;
        if (remaining > 0) connectionsByAddress.set(address, remaining);
        else connectionsByAddress.delete(address);
      });
      servePlayer(ws, matchmaker);
    });
  });

  startHeartbeat(sockets);
}

function servePlayer(ws: WebSocket, matchmaker: Matchmaker): void {
  const connection: Connection = {
    id: randomUUID(),
    send: (message: ServerMessage) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
    },
  };
  const limiter = new RateLimiter(BURST_MESSAGES, SUSTAINED_MESSAGES_PER_SECOND, performance.now());
  markAlive(ws);
  ws.on("pong", () => markAlive(ws));

  ws.on("message", (data, isBinary) => {
    if (!limiter.tryTake(performance.now())) {
      connection.send(errorMessage("too-fast"));
      ws.close(POLICY_VIOLATION, "too-fast");
      return;
    }
    const parsed = isBinary ? null : parseClientMessage(data);
    if (!parsed) {
      connection.send(errorMessage("bad-message"));
      ws.close(POLICY_VIOLATION, "bad-message");
      return;
    }
    matchmaker.handle(connection, parsed);
  });

  ws.on("close", () => matchmaker.disconnect(connection));
  ws.on("error", (error) => logger.warn({ err: error, connection: connection.id }, "socket error"));
}

function parseClientMessage(data: RawData) {
  try {
    const result = clientMessageSchema.safeParse(JSON.parse(data.toString()));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

type UpgradeRefusal = "forbidden-origin" | "server-full";

function upgradeRefusal(
  request: IncomingMessage,
  openConnections: number,
  connectionsFromAddress: number,
): UpgradeRefusal | null {
  if (!isSameOrigin(request)) return "forbidden-origin";
  if (openConnections >= MAX_CONNECTIONS) return "server-full";
  if (connectionsFromAddress >= MAX_CONNECTIONS_PER_ADDRESS) return "server-full";
  return null;
}

/** Browsers always send Origin on WebSocket upgrades; refusing other sites blocks cross-site hijacking. */
export function isSameOrigin(request: IncomingMessage): boolean {
  const { origin, host } = request.headers;
  if (!origin || !host) return false;
  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.origin === new URL(env.SITE_URL).origin && parsedOrigin.host === host;
  } catch {
    return false;
  }
}

function rejectUpgrade(socket: Duplex, refusal: UpgradeRefusal): void {
  const status = refusal === "forbidden-origin" ? "403 Forbidden" : "503 Service Unavailable";
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
}

function pathnameOf(request: IncomingMessage): string | null {
  try {
    return new URL(request.url ?? "", "http://localhost").pathname;
  } catch {
    return null;
  }
}

const alive = new WeakSet<WebSocket>();

function markAlive(ws: WebSocket): void {
  alive.add(ws);
}

/** Drops sockets that stop answering pings so dead players don't hold room slots. */
function startHeartbeat(sockets: WebSocketServer): void {
  const timer = setInterval(() => {
    for (const ws of sockets.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, HEARTBEAT_MS);
  sockets.on("close", () => clearInterval(timer));
}
