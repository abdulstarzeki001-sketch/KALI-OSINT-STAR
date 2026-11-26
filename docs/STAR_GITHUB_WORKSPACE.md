STAR AI GitHub Workspace at #runtime. Create a fine-grained GitHub PAT limited to KALI-OSINT-STAR with Contents read/write, Pull requests read/write, Actions read, Metadata read. Add as encrypted production Pages secret STAR_GITHUB_TOKEN (never VITE_*). The ChatGPT GitHub connector is not a credential for this app. Read/propose uses Cloudflare model and public repository reads (rate limited). D1 stores owner-scoped previews. Explicit approval opens branch/PR; second approval merges only if main unchanged and CI and Quality pass on exact head. Pages automatically builds main; verify deployment separately. Scope limited to single existing text file in allowed UI/tests/docs, no workflows/secrets/delete. Publishing state on partial error requires manual recovery. No multi-file agent or autonomous shell. Apply migration 003 before deployment; owner smoke test required.

## Actions executor
The UI now dispatches only a reviewed single-file proposal using repository_dispatch with the existing Contents-write PAT. The fixed workflow uses a short-lived GITHUB_TOKEN to create an isolated branch, commit the approved bytes, verify the content, open a PR, and dispatch CI and Quality on that exact head branch. Refresh execution to reconcile the single-file PR against the saved bytes. A separate approval and exact-head checks are still required for merge; Cloudflare deploys main. No browser service is needed. Do not include secrets in proposals. Owner authentication is unchanged. Verify actual Actions dispatch and the production deployment separately. Failed or ambiguous dispatches remain queued for manual investigation; never automatically replay writes.

The Cloudflare build emits a metadata-only star-deployment.json containing CF_PAGES_COMMIT_SHA. The UI only reports this specific merge as deployed when that live SHA equals the verified PR merge commit; a later deployment is shown as not confirmed for that exact SHA.


## STAR Executor integration verification (do not merge)

Independent GitHub Actions dispatch test. Not a platform model or Cloudflare owner-session execution.
