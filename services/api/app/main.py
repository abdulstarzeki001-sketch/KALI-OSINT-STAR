from fastapi import FastAPI
app=FastAPI(title="KALI OSINT STAR API",version="0.1.0",description="Read-only training API. No remote execution.")
@app.get("/api/v1/health")
def health():
    return {"status":"ok","service":"kali-osint-star-api","mode":"training-only"}
@app.get("/api/v1/capabilities")
def capabilities():
    return {"mode":"training-only","remote_execution":False,"vulnerability_scanning":False,"authentication_configured":False,"features":["health-check","training-metadata"],"notice":"No shell, scans or C2 capabilities exposed."}
@app.get("/api/v1")
def api_root():
    return {"name":"KALI OSINT STAR","docs":"/docs","health":"/api/v1/health"}
