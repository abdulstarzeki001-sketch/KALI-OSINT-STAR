# STAR Autonomous Developer V2

Owner-authenticated multi-file jobs (1–4 files), existing regular text files or explicitly requested new files; folders are created implicitly by Git. Model generates bounded edits per file, previews are stored in D1. Approval dispatches a fixed workflow on trusted main; one Git tree and one commit; no execution of submitted bytes in the write job. Separate read-only CI/Quality runs on the exact branch, and a second owner approval gates merge. Cloudflare SHA verification is separate. Repair creates a new proposal based on verified failed job/step metadata (not complete build logs), at most two chained repairs. Rollback inverts a merged plan only if current bytes match; deletes only files originally created by the plan, or restores previously removed files. No arbitrary shell, secrets, workflows, unrestricted agent, or automatic retries. Current scope is same repo UI/tests/docs/README. Chat composer can transfer an instruction to V2 explicitly; paths and approval remain required. Apply D1 migration 004 and deploy private egress worker before use. Live owner-session verification remains required.


## Independent V2 live test (do not merge)
