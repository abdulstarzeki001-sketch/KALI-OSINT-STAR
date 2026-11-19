# STAR Terminal — first-party integration inside KALI-OSINT-STAR

## Components

- **Browser:** `https://kali-osint-star.pages.dev/#terminal` — React full-height terminal, toolbar, STAR AI prompt, diagnostics, and optional snapshot export.
- **Pages Functions:** `/api/terminal/session`, `/api/terminal/ws`, `/api/terminal/diagnose`, `/api/terminal/backup/latest`. These endpoints only accept the canonical production host and require Cloudflare Access JWT assertion. POST and WebSocket requests check the browser Origin. No external host is taken from user input.
- **Private Pages service binding:** `WORMSTAR_TERMINAL` → Cloudflare Worker `wormstar-ai-lab`; existing `STAR_AI` binding must be retained. Bindings do not expose an extra public port.
- **Server-only shared secret:** `KALI_TERMINAL_BRIDGE_SECRET` encrypted separately on KALI Pages production and Wormstar Worker. Never use `VITE_` prefix or commit the value.
- **Wormstar Worker:** `/api/integrations/kali/terminal/*`, validates the server secret then reuses existing signed short-lived ticket and Railway origin-gated WebSocket proxy.
- **Railway:** Existing `terminal` service, unchanged HTTP and WebSocket port 8080, with its persistent `/persist` volume and owner password. The public Railway domain still rejects requests without Wormstar's existing private origin credential.

## Workflow

1. Sign into KALI-OSINT-STAR via its Cloudflare Access owner app.
2. Choose **الترمنال** in the sidebar or bottom navigation, or choose **فتح الترمنال المدمج** in Operations.
3. Press **اتصال**; KALI Pages Function checks Access and obtains a 20-second signed ticket from the private Wormstar Service Binding. The browser receives only this short-lived ticket.
4. A same-origin WebSocket connects from KALI Pages through the service binding to Wormstar, then from Wormstar to the fixed Railway container. The Railway password remains only in Wormstar's Cloudflare Secrets.
5. Commands run in the isolated Railway terminal; the browser does not reach a laptop or local Kali machine. STAR AI is advisory via the established Railway gateway.
6. To save a backup, first run `persist save`, `persist backup` and `persist verify` inside the terminal. Use the collapsed download section to export a snapshot to iPhone Files.

## Deployment order and safe rollback

1. Deploy Wormstar Worker bridge and its tests.
2. Configure the encrypted shared secret in both Cloudflare environments and add Pages production Service Binding `WORMSTAR_TERMINAL` pointing to `wormstar-ai-lab` **without removing `STAR_AI`**.
3. Deploy the KALI Pages React UI and Functions. Require existing GitHub TypeScript/Vite + Python API tests and the new `npm run test:terminal` tests to pass.
4. Check Cloudflare Pages production deployment state. Confirm an anonymous HTTP request is redirected to Cloudflare Access and that neither the browser bundle nor GitHub contains the bridge/ Railway secret.
5. Test the real owner Safari browser session and WebSocket handshake manually. CI test success does not, by itself, prove a live iPhone WebSocket session.

If the Pages integration fails, do not change Railway credentials or disable its origin guard. Open the existing fallback owner terminal at `https://wormstar-ai-lab.abdulstarzeki001.workers.dev/terminal/`. To roll back the KALI UI, revert its Pages deployment or switch its integration link without touching the persistent Railway volume.

## Security

- Every Pages Function behind the terminal bridge and `/api/ai/analyze` verifies the `Cf-Access-Jwt-Assertion` JWT itself (`apps/web/access-jwt.js`): RS256 signature against `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, `iss`, `aud`, `type=app`, `exp`/`nbf`, and a non-empty identity. Presence of the header alone is no longer trusted, and the signed `meta` token that the public Access login page hands to anonymous visitors is rejected. Unreachable signing keys fail closed with 503.
  - Defaults: team `fancy-haze-5879.cloudflareaccess.com`, AUD `6292524f…2e26` (public identifiers, not secrets). Override with Pages variables `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD`; optionally set `ACCESS_ALLOWED_EMAILS` (comma separated) for an in-code owner allowlist.
- WebSocket connection is user-initiated, and no port scan happens on page load.
- Production traffic requires the KALI Cloudflare Access owner app; preview credentials do not authorize the canonical endpoint.
- No secrets or command history are stored in React localStorage.
- This is a genuine remote shell in a user-controlled container. Do not run targets without authorization and do not treat the container as a fully sandboxed security boundary.
- The output is plain text, not HTML, to avoid script execution from terminal content.


## Dashboard entry point (18 November 2026)

The same-origin terminal is available from the existing `#dashboard` route via its primary **«فتح STAR Terminal»** button and the compact **STAR Terminal داخل KALI-OSINT-STAR** launch card. Both use React's in-app `navigate('terminal')`, which updates the hash to `#terminal` and loads the existing `CloudTerminalPanel`. The sidebar, mobile bottom navigation, Operations panel, and original Wormstar fallback all remain available.

This is a user-interface integration in the `KALI-OSINT-STAR` source repository, not a duplicated Railway terminal, not an iframe, and not a new container. The existing Cloudflare Pages production Service Bindings `WORMSTAR_TERMINAL` and `STAR_AI` and the confidential `KALI_TERMINAL_BRIDGE_SECRET` are reused without rotation or public exposure.

On production Cloudflare Pages, the top bar identifies the environment as `STAR CLOUD` rather than mistakenly showing `LOCAL MODE` when a local FastAPI endpoint is absent. Actual terminal availability still requires the owner to open the tab and press **اتصال**; the UI does not label the Railway WebSocket connected before a `ready` event.
