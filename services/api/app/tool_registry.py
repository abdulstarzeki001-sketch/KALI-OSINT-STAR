"""Read-only Kali training integrations. Never accept client-provided commands."""
from dataclasses import dataclass
import shutil
import os
from typing import Optional

@dataclass(frozen=True)
class ToolSpec:
    id: str
    title: str
    group: str
    binaries: tuple[str, ...]
    help_args: Optional[tuple[str, ...]] = None
    note: str = ""

# For high-risk tooling, metadata-only probes deliberately do not launch the program.
TOOLS: tuple[ToolSpec, ...] = (
    ToolSpec('mythic','Mythic C2','C2',('mythic-cli',),note='Inventory only; agents and listeners are not started.'),
    ToolSpec('sliver','Sliver C2','C2',('sliver-server','sliver-client'),note='Inventory only; no implants or C2 listeners.'),
    ToolSpec('havoc','Havoc Framework','C2',('havoc',),note='Inventory only; no teamserver is started.'),
    ToolSpec('caldera','MITRE CALDERA','Simulation',('caldera',),note='Python source deployments may not expose a CLI binary.'),
    ToolSpec('bloodhound','BloodHound CE','Identity',('bloodhound','bloodhound-python'),note='No domain collection or login performed.'),
    ToolSpec('certipy','Certipy','Identity',('certipy-ad','certipy'),('-h',),note='Only the local help command is supported.'),
    ToolSpec('impacket','Impacket','Identity',('impacket-lookupsid',),('-h',),note='Only local lookupsid help; no authentication.'),
    ToolSpec('netexec','NetExec','Identity',('nxc',),('--help',),note='Only local help; no network target or credentials.'),
    ToolSpec('rubeus','Rubeus','Identity',('Rubeus.exe',),note='Windows binary; metadata only, never executed.'),
    ToolSpec('mimikatz','Mimikatz','Identity',('mimikatz.exe','mimikatz'),note='Credential material is not accessed; metadata only.'),
    ToolSpec('ligolo','Ligolo-ng','Network',('ligolo-proxy',),('-h',),note='No tunnel is opened.'),
    ToolSpec('frida','Frida','Reverse engineering',('frida',),('--help',),note='No process instrumentation.'),
    ToolSpec('ghidra','Ghidra','Reverse engineering',('ghidra','ghidraRun','analyzeHeadless'),note='GUI/headless analyzer not launched.'),
    ToolSpec('aflpp','AFL++','Fuzzing',('afl-fuzz',),('-h',),note='No fuzzing run or target is launched.'),
    ToolSpec('syzkaller','Syzkaller','Fuzzing',('syz-manager',),('-h',),note='No kernel fuzzing or VM is launched.'),
)
BY_ID = {tool.id: tool for tool in TOOLS}

def find_binary(spec: ToolSpec) -> str | None:
    for name in spec.binaries:
        result = shutil.which(name)
        if result and os.path.isfile(result) and os.access(result, os.X_OK):
            return os.path.realpath(result)
    return None

def help_is_enabled() -> bool:
    return os.environ.get('STAR_ENABLE_TOOL_HELP', '').strip().lower() == 'true'

def serialize(spec: ToolSpec) -> dict:
    executable = find_binary(spec)
    return {
        'id': spec.id, 'title': spec.title, 'group': spec.group,
        'installed': executable is not None,
        'binary': os.path.basename(executable) if executable else None,
        'actions': ['inspect'] + (['help'] if spec.help_args and help_is_enabled() else []),
        'help_available': bool(spec.help_args), 'note': spec.note,
    }
