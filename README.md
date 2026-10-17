# KeyDasher

A browser typing platformer race. Every word you finish is a move — a dash, hop, leap, climb, zipline,
or lift — through a candy obstacle course. Race friends in real time or practice against bots.

## Play

```bash
pnpm install
pnpm dev          # http://localhost:3000 (Next.js + the realtime game server in one process)
```

- **Practice vs bots** runs entirely in the browser, no server round-trips.
- **Quick race online** matches you with anyone else queueing within 6 seconds; bots fill the grid.
- **Private room** gives you a 4-letter code and an invite link (`/?room=CODE`). The host starts and
  can call a rematch.

Open two browser windows to see multiplayer on one machine.

## How it plays

- Type the word floating ahead to move. You can type the next word mid-jump; moves queue up.
- **Forks:** type the first letter of the route you want. Each fork shows move and key counts.
  - _Safe_ routes: lots of short words, no risk.
  - _Shortcuts_: one tricky phrase (capitals, punctuation, digits) skips a slow section.
  - _Risky_ routes: few words over crumbly biscuits or a zipline. Two slips on one red word and you
    fall back to the last checkpoint flag.
- **Flow:** each clean word speeds up your moves, up to x1.48. One typo resets it.

The course is **Jellybean Peaks**: three forks (Split, Cliff, Summit) and seven routes.

## Architecture

| Path                 | What lives there                                                                 |
| -------------------- | -------------------------------------------------------------------------------- |
| `src/game/`          | Pure, shared engine: level graph, racer rules, motion timeline, bots, race room. |
| `src/server/`        | WebSocket gateway, matchmaking, server rooms (authoritative).                    |
| `src/features/race/` | Client sessions (practice + online), canvas renderer, HUD, audio.                |
| `src/features/home/` | Landing page and racer profile.                                                  |
| `server.ts`          | Custom Node server: Next.js plus the `/realtime` socket on one port.             |

Racer state comes **only from the sequence of keys typed**, never from time. That lets the server stay
authoritative while each client predicts its own racer with no drift, and replays opponents from the
compact events the server relays. Time only enters through the motion timeline, which turns events
into smooth, queued animation.

Server hardening: same-origin check on socket upgrades, Zod validation of every message, a per-socket
rate limit, payload size caps, connection caps per address, room caps, and heartbeat cleanup.

## Scripts

```bash
pnpm check        # typecheck + lint + tests
pnpm test         # Vitest (engine, balance, protocol, server utilities)
pnpm build && pnpm start
```

`src/game/balance.test.ts` simulates flawless typists from 35 to 120 WPM and checks that every
shortcut and risky route really is faster than the safe road. If you edit the level, run it.

Environment variables (all optional, validated in `src/env.ts`): `PORT`, `HOSTNAME`, `SITE_URL`,
`LOG_LEVEL`.

## Public deployment

Build and run the custom Node server with `pnpm build && pnpm start`. The production start command
works on Windows and Unix systems. Set `SITE_URL` to the public HTTPS origin **before building** so
canonical links and the sitemap point to the right site. Set `HOSTNAME=0.0.0.0` when the server must
listen beyond localhost; `PORT` defaults to `3000`.

Host the app on a persistent Node process that supports WebSocket upgrades on `/realtime`. Keep
requests and WebSockets on the same public origin, and terminate HTTPS/WSS at the proxy or hosting
platform. Rooms and matchmaking live in process memory, so use one server instance unless you add
shared room state and cross-instance event delivery. A restart clears active rooms and their codes.
