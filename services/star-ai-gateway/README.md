# STAR AI Cyber Gateway (Railway)

Real Node 22 HTTP API for authorized security review and provider-routed AI chat. No fake model responses, shell execution, scanners, or remote target controls.

## Run

Use Node 22+: cd services/star-ai-gateway && npm test && npm start.
Deploy this folder as a SEPARATE Railway service in incredible-mercy. Do not replace STAR-ShellFish. Railway root directory: /services/star-ai-gateway. Health: GET /healthz.

## Configure securely

Set STAR_GATEWAY_TOKEN to a new random value (32+ characters) in Railway Variables, never in code or screenshots. Set STAR_MODELS_JSON to a JSON array of provider mappings: {id, upstreamModel, baseUrl, keyEnv}. Set provider keys separately using named environment variables such as STAR_PROVIDER_QWEN_KEY. Only public HTTPS provider endpoints are accepted. No provider is configured by default, and chat returns a real 503 until configured.

Use a Cloudflare Access-protected server-side Pages Function or private gateway to call Railway. Never put STAR_GATEWAY_TOKEN or provider keys in VITE_ variables or the client. Railway private networking can be used for other Railway services; Cloudflare Pages requires a secured HTTPS edge.

### Ollama on a private Tailscale node

Keep Ollama bound to localhost on the GPU server and publish it with Tailscale Serve. Grant the gateway's dedicated Tailscale tag access to that GPU node on TCP 443. In the existing Railway gateway service, set `STAR_TAILNET_OLLAMA_URL` to the GPU node's `https://<node>.<tailnet>.ts.net/v1` URL, and seal `TS_AUTHKEY` with a short-lived, reusable, ephemeral auth key for that tag. Both variables are required to enable the route. The gateway re-enrolls after a restart, so renew the auth key before it expires.

The gateway adds `qwen3-coder-vast` for the installed `qwen3-coder:30b` model. The Tailscale proxy listens on container loopback and is used only for this provider's completion URL. The existing model catalog and Cloudflare Access authentication still apply. The private catalog also offers `star-pro-vast` for an already installed `star-pro:latest` defensive engineering model. No model is pulled or executed by catalog configuration. Keep the current frontend default until authenticated inference against the new alias succeeds. Confirm inference with an authenticated request to `/v1/chat/completions` or an AI review in the web app.

## Endpoints

* GET /healthz: checks service, local audit and model readiness (no credentials required).
* GET /v1/models: bearer auth, model aliases for configured provider keys.
* POST /v1/security/audit: bearer auth; JSON {artifact,kind}, with kind code, config, headers, logs, or report. Returns deterministic pattern matches, severity, and line numbers WITHOUT source snippets. Does NOT contact the model or any target.
* POST /v1/security/review: bearer auth; JSON {model,kind,artifact,question?}. Redacts basic secret patterns before sending to the configured model and returns analysis plus the local audit. Secret masking is best-effort, so do not submit sensitive government or production data without authorization.
* POST /v1/chat/completions: bearer auth; JSON {model,messages,mode?,stream?,temperature?,max_tokens?}. Modes: general, code, security, incident, agent. Uses an OpenAI-compatible upstream (non-streaming and provider SSE supported).

Requests are restricted to 32 KiB, 20 requests/minute per process, at most two simultaneous model calls. Rate limits are per instance, NOT distributed; add an edge or Redis-backed limiter before public scale. Prompt text is treated as untrusted; arbitrary shell execution is intentionally absent. The service does not log request bodies or API keys. The host must enforce TLS and authenticated access. The static analysis is a heuristic, not a pentest or proof that a vulnerability exists.

## Validation

Run npm test from this directory. CI runs these tests on PRs. For live testing, first configure a paid or available upstream model and send an authenticated test message; do not claim readiness from CI or /healthz alone.

## Cloudflare Access JWT integration

For the user's existing KALI-OSINT-STAR Pages frontend, the gateway can validate the Cloudflare Access app JWT forwarded from the server-side Pages Function. Configure `STAR_ACCESS_TEAM_DOMAIN` and `STAR_ACCESS_AUD` on Railway using the same public team domain and application AUD as `apps/web/access-jwt.js`. Optionally limit identities via `STAR_ACCESS_ALLOWED_EMAILS`. This **does not** remove the strong separate `STAR_GATEWAY_TOKEN` method used for owner CLI access. The Pages Function verifies the same JWT first, then forwards it only to the pinned Railway HTTPS hostname. No gateway secret is injected into Vite or exposed to Safari. Live model inference still requires upstream provider keys.

## STAR Cyber Deep Audit — multi-file SAST

POST `/v1/security/deep-audit` with `{"files":[{"path":"src/app.py","content":"yaml.load(data)"}],"format":"json"}`.
Requires existing Gateway authorization (bearer key or verified Access JWT). It inspects text heuristically with 26 static rules and reports path, line, severity, CWE, recommendation and an internal priority score. It never executes source code, performs live scans or contacts a model. Limits: 8 files, 16,000 characters/file, 48,000 total. Use `"format":"sarif"` for a SARIF 2.1.0 JSON object suitable for later GitHub Code Scanning upload by an authorized workflow (it does **not** upload automatically). Source line snippets are not returned. False positives and false negatives remain possible; this does not replace CodeQL, Semgrep, or manual review.
