import { randomInt } from "node:crypto";
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type ClientMessage,
  type ErrorCode,
} from "@/game/protocol/messages";
import { logger } from "../logger";
import type { Connection } from "./connection";
import { ServerRoom } from "./server-room";

/** Caps memory and CPU: each room ticks on its own timer. */
const MAX_ROOMS = 200;

type JoinMessage = Extract<ClientMessage, { type: "join" }>;

const ERROR_TEXT: Readonly<Record<ErrorCode, string>> = {
  "bad-message": "Your game sent something the server didn't understand. Try refreshing.",
  "room-not-found": "No room with that code. Check the code with your friend.",
  "room-full": "That room is full. Try another room or a quick race.",
  "race-in-progress": "That race already started. Join once it finishes.",
  "not-host": "Only the host can start the race.",
  "too-fast": "Whoa, too many keystrokes at once. Reconnect to keep playing.",
  "server-busy": "The server is packed right now. Try again in a minute.",
};

export function errorMessage(code: ErrorCode) {
  return { type: "error", code, message: ERROR_TEXT[code] } as const;
}

/** Routes each connection to a room and keeps track of which room it is in. */
export class Matchmaker {
  private readonly quickRooms = new Set<ServerRoom>();
  private readonly privateRooms = new Map<string, ServerRoom>();
  private readonly roomByConnection = new Map<string, ServerRoom>();

  constructor(private readonly now: () => number) {}

  handle(connection: Connection, message: ClientMessage): void {
    switch (message.type) {
      case "join":
        this.join(connection, message);
        return;
      case "key":
        this.roomByConnection.get(connection.id)?.key(connection.id, message.char);
        return;
      case "start": {
        const refusal = this.roomByConnection.get(connection.id)?.requestStart(connection.id);
        if (refusal) connection.send(errorMessage(refusal));
        return;
      }
      case "ping":
        connection.send({ type: "pong", sentAt: message.sentAt });
        return;
    }
  }

  disconnect(connection: Connection): void {
    this.roomByConnection.get(connection.id)?.leave(connection.id);
    this.roomByConnection.delete(connection.id);
  }

  private join(connection: Connection, message: JoinMessage): void {
    this.disconnect(connection);
    const room = this.roomFor(message);
    if (typeof room === "string") {
      connection.send(errorMessage(room));
      return;
    }
    room.join(connection, message.name, message.color);
    this.roomByConnection.set(connection.id, room);
  }

  private roomFor(message: JoinMessage): ServerRoom | ErrorCode {
    switch (message.mode) {
      case "quick":
        return [...this.quickRooms].find((room) => room.joinBlocker === null) ?? this.openRoom(null);
      case "create":
        return this.openRoom(this.unusedCode());
      case "join": {
        const room = message.code ? this.privateRooms.get(message.code) : undefined;
        if (!room) return "room-not-found";
        return room.joinBlocker ?? room;
      }
    }
  }

  private openRoom(code: string | null): ServerRoom | ErrorCode {
    if (this.quickRooms.size + this.privateRooms.size >= MAX_ROOMS) return "server-busy";
    const room = new ServerRoom({ code, now: this.now, onClosed: (closed) => this.forget(closed) });
    if (code) this.privateRooms.set(code, room);
    else this.quickRooms.add(room);
    logger.info(
      { room: code ?? "quick", rooms: this.quickRooms.size + this.privateRooms.size },
      "room opened",
    );
    return room;
  }

  private forget(room: ServerRoom): void {
    this.quickRooms.delete(room);
    if (room.code) this.privateRooms.delete(room.code);
    for (const [connectionId, joined] of this.roomByConnection) {
      if (joined === room) this.roomByConnection.delete(connectionId);
    }
  }

  private unusedCode(): string {
    for (;;) {
      const code = Array.from(
        { length: ROOM_CODE_LENGTH },
        () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)],
      ).join("");
      if (!this.privateRooms.has(code)) return code;
    }
  }
}
