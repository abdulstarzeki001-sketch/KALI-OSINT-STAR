"""Read-only Linux/NVIDIA/Ollama snapshot. No inference, secrets or network exposure."""
import csv
import datetime
import json
import os
import shutil
import subprocess
import urllib.request
from pathlib import Path

def gpu_snapshot():
    try:
        p = subprocess.run(["nvidia-smi", "--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=8, check=True)
        rows = []
        for row in csv.reader(p.stdout.splitlines()):
            if len(row) != 6 or len(rows) >= 16:
                return None
            index, name, util, used, total, temp = [x.strip() for x in row]
            def number(s):
                return int(s) if s.isascii() and s.isdigit() else None
            rows.append(dict(index=number(index), name=name[:100], utilization=number(util), usedMiB=number(used), totalMiB=number(total), temperatureC=number(temp)))
        return rows or None
    except (OSError, subprocess.SubprocessError, ValueError):
        return None

def ram_snapshot():
    try:
        values = {}
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith(("MemTotal:", "MemAvailable:")):
                key, value, _ = line.split()
                values[key] = int(value)*1024
        total, available = values["MemTotal:"], values["MemAvailable:"]
        return {"totalBytes":total,"availableBytes":available} if 0 <= available <= total else None
    except (OSError, ValueError, KeyError):
        return None

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def loaded_models():
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        with opener.open("http://127.0.0.1:11434/api/ps", timeout=5) as r:
            raw = r.read(262145)
        if len(raw)>262144:
            return None
        data = json.loads(raw)
        models = data["models"]
        if not isinstance(models,list) or len(models)>32:
            return None
        return [{"name":m["name"][:160],"sizeBytes":m.get("size"),"vramBytes":m.get("size_vram")} for m in models]
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return None

def snapshot():
    try:
        disk = shutil.disk_usage(".")
        storage = {"totalBytes":disk.total,"freeBytes":disk.free}
    except OSError:
        storage=None
    try:
        load = list(os.getloadavg())
    except OSError:
        load=None
    return {"schema":1,"capturedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),"source":"local-host-snapshot","gpus":gpu_snapshot(),"ram":ram_snapshot(),"cpuCount":os.cpu_count(),"loadAverage":load,"storage":storage,"models":loaded_models(),"tokensPerSecond":None,"actualCost":None}

if __name__=="__main__":
    print(json.dumps(snapshot(),indent=2))
