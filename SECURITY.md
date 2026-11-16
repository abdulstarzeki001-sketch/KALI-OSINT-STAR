# Security policy / سياسة الأمن

This repository is PUBLIC. Never commit credentials, API keys, session cookies,
PII, server logs, collected scans, or authorized assessment data.

The project is a TRAINING DASHBOARD only. The public FastAPI scaffold exposes
non-sensitive read-only status metadata. No command execution, remote control,
or vulnerability scanner is installed or reachable.

Do not scan or attack the root domains of education platforms. Only use virtual
machines, containers, challenges, and assigned labs specifically authorized by
those providers. Authorization and network scope must be verified out-of-band.

For production, add a separate threat model, authentication, role-based access,
request limits, audit logging, scope allowlist, and isolated worker architecture
before any agent is capable of network operations.