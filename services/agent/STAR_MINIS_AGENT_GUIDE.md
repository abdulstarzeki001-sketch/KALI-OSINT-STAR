# STAR AI Agent — owner-controlled GitHub + Railway workflow

This service is **separate from Minis chat**. It exposes an approval-gated coding
agent running in a sandboxed snapshot of the `KALI-OSINT-STAR` repository.
The agent can inspect repository files, read Git status, and suggest changes.
A model suggestion **cannot** directly execute an arbitrary shell command.

## Two distinct credentials

1. `STAR_AGENT_API_KEY` — owner-only key (32+ unpredictable characters) for
   `https://star-agent-runner-production.up.railway.app/`. Enter it into the
   Agent console, not a Minis prompt, and never commit it.
2. `STAR_AGENT_MODEL_KEY` — service-to-service key for the pinned STAR AI
   gateway. It must match the Cloudflare gateway's bearer key. Keep it only
   in Railway environment variables. It is **never sent to the browser**.

The Cloudflare gateway model endpoint must be exactly
`https://star-ai-minis-v2.abdulstarzeki001.workers.dev/v1/chat/completions`.

Set on the existing Railway `STAR-Agent-Runner` service:

```text
STAR_MODEL_BACKEND=cloudflare
STAR_CLOUDFLARE_MODEL_URL=https://star-ai-minis-v2.abdulstarzeki001.workers.dev/v1/chat/completions
STAR_AGENT_MODEL_KEY=<stored privately>
STAR_AGENT_API_KEY=<independent strong secret>
```

Do NOT expose Ollama's raw 11434 port or use model credentials in GitHub.
Old signed Cloudflare Access mode is still supported if the configured URL
remains the original private Pages route.

## Owner approval flow

1. Open the Agent console on Railway, sign in with the owner key.
2. Ask: "Inspect the repository, identify failing tests, and propose changes.
   Ask permission before writing a file or running a test."
3. The engine may automatically use `list_files`, `read_file`, `search_text`,
   and `git_status` within the isolated workspace.
4. Changes to files and development test commands show an approval request.
   Review the proposed action/arguments and approve or reject it.
5. The workspace is a **container snapshot**. Edits do not push to GitHub
   automatically. Make a reviewed PR before merging production changes.

Tools are fixed to a short allowlist; shell metacharacters cannot be injected
as an arbitrary command because subprocesses receive argument arrays without
a shell. Test processes have bounded timeouts and stripped environments.
Do not treat this as a general-purpose pentesting shell.

## Verify

```sh
python3 -m pytest services/agent/tests -q
```

Perform a live authenticated task after deployment, and verify that an
`approval_required` status occurs for any proposed change. Do not claim
live agent inference works based only on the `/health` response.
