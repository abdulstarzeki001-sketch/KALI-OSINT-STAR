STAR AI GitHub Workspace at #runtime. Create a fine-grained GitHub PAT limited to KALI-OSINT-STAR with Contents read/write, Pull requests read/write, Actions read, Metadata read. Add as encrypted production Pages secret STAR_GITHUB_TOKEN (never VITE_*). The ChatGPT GitHub connector is not a credential for this app. Read/propose uses Cloudflare model and public repository reads (rate limited). D1 stores owner-scoped previews. Explicit approval opens branch/PR; second approval merges only if main unchanged and CI and Quality pass on exact head. Pages automatically builds main; verify deployment separately. Scope limited to single existing text file in allowed UI/tests/docs, no workflows/secrets/delete. Publishing state on partial error requires manual recovery. No multi-file agent or autonomous shell. Apply migration 003 before deployment; owner smoke test required.

## STAR GitHub Actions live smoke test

Run 45729894659 / attempt 1. Documentation-only test; do not merge.
