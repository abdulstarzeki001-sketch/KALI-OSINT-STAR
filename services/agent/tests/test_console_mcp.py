"""Check that an MCP-submitted task can be opened without re-submission."""
from pathlib import Path

def test_console_can_open_existing_mcp_task():
    html=(Path(__file__).parents[1]/"static"/"index.html").read_text(encoding="utf-8")
    assert 'id="taskId"' in html
    assert 'id="loadTask"' in html
    assert 'el("loadTask").onclick=' in html
    assert 'const requested=el("taskId").value.trim().toLowerCase()' in html
    assert '/^[a-f0-9]{24}$/' in html
    assert 'id=requested;el("task").hidden=false;' in html
    assert 'await refresh();timer=setInterval(refresh,2500)' in html
    assert 'api("/api/tasks/"+id+"/decide"' in html
