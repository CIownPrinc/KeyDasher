import type { ServerMessage } from "@/game/protocol/messages";

/** What rooms need from a player's socket; keeps game code ignorant of the transport. */
export interface Connection {
  readonly id: string;
  send(message: ServerMessage): void;
}
