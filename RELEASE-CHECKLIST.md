# Release checklist

## Before the public launch

- [ ] Deploy the app to a persistent Node.js host that supports WebSocket upgrades on `/realtime`.
- [ ] Set `SITE_URL` to the public HTTPS origin before building, and set `HOSTNAME=0.0.0.0` if the host requires an external listener.
- [ ] Configure the proxy or hosting platform to forward WebSocket upgrades and serve the site over HTTPS/WSS on the same origin.
- [ ] Use one server instance. Matchmaking and room state are in memory; multiple instances need shared state and event delivery first.
- [ ] Open a private room from two separate networks or devices and verify joining, starting, disconnect handling, and rematches on the deployed URL.
- [ ] Confirm the production logs and hosting limits are adequate for the expected traffic.
- [ ] Recheck the development-only `braces` advisory (GHSA-vfj7-8cjw-p6xm) through Next.js lint tooling and the shadcn stylesheet package when a patched release is available; the current registry has no version beyond 3.0.3.

Server restarts clear active races and room codes. The app does not store player accounts or race history.
