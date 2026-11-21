# STAR AI Cyber Gateway (Railway)

Real Node 22 HTTP API for authorized security review and provider-routed AI chat. No fake model responses, shell execution, scanners, or remote target controls.

## Run

Use Node 22+: cd services/star-ai-gateway && npm test && npm start.
Deploy this folder as a SEPARATE Railway service in incredible-mercy. Do not replace STAR-ShellFish. Railway root directory: /services/star-ai-gateway. Health: GET /healthz.

## Configure securely

Set STAR_GATEWAY_TOKEN to a new random value (32+ characters) in Railway Variables, never in code or screenshots. Set STAR_MODELS_JSON to a JSON array of provider mappings: {id, upstreamModel, baseUrl, keyEnv}. Set provider keys separately using named environment variables such as STAR_PROVIDER_QWEN_KEY. Only public HTTPS provider endpoints are accepted. No provider is configured by default, and chat returns a real 503 until configured.

Use a Cloudflare Access-protected server-side Pages Function or private gateway to call Railway. Never put STAR_GATEWAY_TOKEN or provider keys in VITE_ variables or the client. Railway private networking can be used for other Railway services; Cloudflare Pages requires a secured HTTPS edge.

## Endpoints

* GET /healthz: checks service, local audit and model readiness (no credentials required).
* GET /v1/models: bearer auth, model aliases for configured provider keys.
* POST /v1/security/audit: bearer auth; JSON {artifact,kind}, with kind code, config, headers, logs, or report. Returns deterministic pattern matches, severity, and line numbers WITHOUT source snippets. Does NOT contact the model or any target.
* POST /v1/security/review: bearer auth; JSON {model,kind,artifact,question?}. Redacts basic secret patterns before sending to the configured model and returns analysis plus the local audit. Secret masking is best-effort, so do not submit sensitive government or production data without authorization.
* POST /v1/chat/completions: bearer auth; JSON {model,messages,mode?,stream?,temperature?,max_tokens?}. Modes: general, code, security, incident, agent. Uses an OpenAI-compatible upstream (non-streaming and provider SSE supported).

Requests are restricted to 32 KiB, 20 requests/minute per process, at most two simultaneous model calls. Rate limits are per instance, NOT distributed; add an edge or Redis-backed limiter before public scale. Prompt text is treated as untrusted; arbitrary shell execution is intentionally absent. The service does not log request bodies or API keys. The host must enforce TLS and authenticated access. The static analysis is a heuristic, not a pentest or proof that a vulnerability exists.

## Validation

Run npm test from this directory. CI runs these tests on PRs. For live testing, first configure a paid or available upstream model and send an authenticated test message; do not claim readiness from CI or /healthz alone.
