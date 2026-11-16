"""Read-only local probes for 15 Kali security tools."""
from dataclasses import dataclass
import os, shutil

@dataclass(frozen=True)
class Tool:
    id: str
    name: str
    group: str
    bins: tuple[str,...]
    help_args: tuple[str,...] = ()

TOOLS=(
    Tool("mythic","Mythic C2","C2",("mythic-cli",)),
    Tool("sliver","Sliver C2","C2",("sliver-server","sliver-client")),
    Tool("havoc","Havoc","C2",("havoc",)),
    Tool("caldera","MITRE CALDERA","Simulation",("caldera",)),
    Tool("bloodhound","BloodHound CE","Identity",("bloodhound","bloodhound-python")),
    Tool("certipy","Certipy","Identity",("certipy-ad","certipy"),("-h",)),
    Tool("impacket","Impacket","Identity",("impacket-lookupsid",),("-h",)),
    Tool("netexec","NetExec","Identity",("nxc",),("--help",)),
    Tool("rubeus","Rubeus","Identity",("Rubeus.exe",)),
    Tool("mimikatz","Mimikatz","Identity",("mimikatz.exe","mimikatz")),
    Tool("ligolo","Ligolo-ng","Network",("ligolo-proxy",),("-h",)),
    Tool("frida","Frida","Reverse engineering",("frida",),("--help",)),
    Tool("ghidra","Ghidra","Reverse engineering",("ghidra","ghidraRun","analyzeHeadless")),
    Tool("aflpp","AFL++","Fuzzing",("afl-fuzz",),("-h",)),
    Tool("syzkaller","Syzkaller","Fuzzing",("syz-manager",),("-h",)),
)
REGISTRY={t.id:t for t in TOOLS}
def resolve(tool):
    for name in tool.bins:
        path=shutil.which(name)
        if path and os.path.isfile(path) and os.access(path,os.X_OK):
            return os.path.realpath(path)
    return None
def help_enabled():
    return os.getenv("STAR_ENABLE_TOOL_HELP","").strip().lower()=="true"
def to_json(tool):
    path=resolve(tool)
    return {"id":tool.id,"title":tool.name,"group":tool.group,
            "installed":bool(path),"binary":os.path.basename(path) if path else None,
            "actions":["inspect"]+(["help"] if tool.help_args and help_enabled() else []),
            "help_available":bool(tool.help_args),
            "note":"Read-only local inspection; no attack execution."}
