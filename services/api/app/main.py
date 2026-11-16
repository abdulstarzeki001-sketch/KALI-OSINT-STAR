"""Local-only API for explicitly approved training operations."""
from fastapi import FastAPI, Request
from starlette.middleware.trustedhost import TrustedHostMiddleware
from .operations import router as operations_router, configured

app = FastAPI(title="KALI OSINT STAR API", version="0.2.0",
              description="Local-only allowlisted training operations",
              openapi_url=None, docs_url=None, redoc_url=None)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])
app.include_router(operations_router)

@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    return response

@app.get("/api/v1/health")
def health():
    return {"status": "ok", "service": "kali-osint-star-api", "mode": "training-only"}

@app.get("/api/v1/capabilities")
def capabilities():
    return {"mode": "training-only", "remote_execution": False,
            "vulnerability_scanning": False, "authentication_configured": configured(),
            "local_approved_tasks": configured(),
            "features": ["health-check", "training-metadata", "approved-local-operations", "audit-log"],
            "notice": "No arbitrary shell, external scanning or C2 operations."}

@app.get("/api/v1")
def api_root():
    return {"name": "KALI OSINT STAR", "health": "/api/v1/health"}
