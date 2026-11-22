"""Run fixed, reviewed quality suites and write a metadata-only evidence report."""
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SUITES = (
    ("python-quality", [sys.executable, "-m", "unittest", "-v", "scripts.test_star_ai_quality", "scripts.test_engineering_runner", "scripts.test_gpu_snapshot", "scripts.test_model_inventory"]),
    ("opencode-config", [sys.executable, "-m", "json.tool", "opencode.json"]),
    ("web-quality", ["node", "--experimental-strip-types", "--test",
        "apps/web/tests/quality-report.test.mjs", "apps/web/tests/verified-benchmark.test.mjs",
        "apps/web/tests/engineering-memory.test.mjs", "apps/web/tests/repository-intelligence.test.mjs",
        "apps/web/tests/project-workspace.test.mjs", "apps/web/tests/coding-copilot.test.mjs",
        "apps/web/tests/engineering-evidence.test.mjs", "apps/web/tests/engineering-orchestrator.test.mjs",
        "apps/web/tests/intelligent-debugger.test.mjs", "apps/web/tests/control-center.test.mjs", "apps/web/tests/performance-engine.test.mjs", "apps/web/tests/gpu-snapshot.test.mjs", "apps/web/tests/model-manager.test.mjs", "apps/web/tests/smart-router.test.mjs"]),
)
def run_suite(suite_id, command):
    start = time.monotonic()
    try:
        result = subprocess.run(command, cwd=ROOT, check=False, timeout=90, shell=False)
        status = "passed" if result.returncode == 0 else "failed"
        code = result.returncode
    except subprocess.TimeoutExpired:
        status, code = "timeout", None
    except OSError:
        status, code = "unavailable", None
    return {"id": suite_id, "status": status, "exitCode": code,
            "elapsedMs": round((time.monotonic() - start) * 1000)}

def metadata():
    sha = os.environ.get("GITHUB_SHA", "")
    run_id = os.environ.get("GITHUB_RUN_ID", "")
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if (os.environ.get("GITHUB_ACTIONS") == "true"
            and re.fullmatch(r"[a-f0-9]{40}", sha)
            and re.fullmatch(r"[0-9]{1,20}", run_id)
            and repo == "abdulstarzeki001-sketch/KALI-OSINT-STAR"):
        return {"origin": "github-actions", "commit": sha, "runId": run_id}
    return {"origin": "local", "commit": None, "runId": None}

def build_report():
    suites = [run_suite(name, cmd) for name, cmd in SUITES]
    return {"schema": 1, **metadata(), "suites": suites,
            "passed": all(s["status"] == "passed" for s in suites)}

def main():
    report = build_report()
    # Fixed path; never accept user-supplied shell commands or output locations.
    path = ROOT / "star-engineering-evidence.json"
    with path.open("x", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(json.dumps(report, indent=2))
    return 0 if report["passed"] else 1

if __name__ == "__main__":
    sys.exit(main())
