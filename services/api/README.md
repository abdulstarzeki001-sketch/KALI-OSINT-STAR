# Read-only FastAPI backend
Run:
\`\`\`bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
python -m pytest -q
\`\`\`
No shell execution, remote scanner, or C2 endpoints are implemented. This API runs locally only.
