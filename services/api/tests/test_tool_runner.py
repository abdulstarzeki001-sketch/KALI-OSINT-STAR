"""Integration tests for the approval-gated 15-tool registry."""
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from app.main import app

OP='test-operator-token-more-than-32-characters'
AP='different-approval-token-more-than-32-characters'
AUTH={'Authorization':f'Bearer {OP}'}
APPROVE={**AUTH,'X-STAR-APPROVAL':AP}

@pytest.fixture
def client(tmp_path,monkeypatch):
    monkeypatch.setenv('STAR_DB_PATH',str(tmp_path/'operations.db'))
    monkeypatch.setenv('STAR_OPERATOR_TOKEN',OP)
    monkeypatch.setenv('STAR_APPROVAL_TOKEN',AP)
    monkeypatch.delenv('STAR_ENABLE_TOOL_HELP',raising=False)
    with TestClient(app) as tc:
        yield tc

def create(client,tool='frida',action='inspect'):
    result=client.post('/api/v1/tooling/jobs',headers=AUTH,json={'tool_id':tool,'action':action})
    assert result.status_code==201,result.text
    return result.json()['id']

def approve(client,uid):
    response=client.post(f'/api/v1/tooling/jobs/{uid}/approve',headers=APPROVE,json={
        'reason':'Read-only inspection of my isolated local Kali workstation',
        'scope_confirmed':True})
    assert response.status_code==200,response.text

def wait(client,uid):
    for _ in range(100):
        result=client.get('/api/v1/tooling/jobs',headers=AUTH).json()['jobs']
        row=next(j for j in result if j['id']==uid)
        if row['status'] in ('completed','failed','cancelled'):
            return row
        time.sleep(.03)
    pytest.fail('Tool job did not finish')

def test_catalog_has_all_15_and_auth(client):
    assert client.get('/api/v1/tooling/catalog').status_code==401
    response=client.get('/api/v1/tooling/catalog',headers=AUTH)
    assert response.status_code==200
    data=response.json()
    assert len(data['tools'])==15
    assert len({x['id'] for x in data['tools']})==15
    assert not data['help_enabled']
    assert all(x['actions']==['inspect'] for x in data['tools'])

def test_inspect_requires_approval_executes_once_and_audits(client):
    uid=create(client,'mimikatz')
    assert client.post(f'/api/v1/tooling/jobs/{uid}/run',headers=AUTH).status_code==409
    assert client.post(f'/api/v1/tooling/jobs/{uid}/approve',headers=AUTH,json={'reason':'Properly authorized','scope_confirmed':True}).status_code==403
    approve(client,uid)
    run=client.post(f'/api/v1/tooling/jobs/{uid}/run',headers=AUTH)
    assert run.status_code==200
    job=wait(client,uid)
    assert job['status']=='completed'
    assert job['result']['executed'] is False
    assert job['result']['method']=='local_executable_inventory'
    assert client.post(f'/api/v1/tooling/jobs/{uid}/run',headers=AUTH).status_code==409
    audit=client.get('/api/v1/audit',headers=AUTH).json()['events']
    assert any(item['action']=='tool_probe_finished' for item in audit)
    assert OP not in str(audit) and AP not in str(audit)

def test_unknown_and_shell_attempts_denied(client):
    for payload in ({'tool_id':'shell','action':'inspect'},
                    {'tool_id':'frida','action':'exploit'},
                    {'tool_id':'frida','action':'inspect','command':'id'},
                    {'tool_id':'mimikatz','action':'help'},
                    {'tool_id':'frida','action':'help'}):
        assert client.post('/api/v1/tooling/jobs',headers=AUTH,json=payload).status_code==422

def test_approval_cancel_and_expiry(client):
    uid=create(client)
    assert client.post(f'/api/v1/tooling/jobs/{uid}/approve',headers=APPROVE,json={
        'reason':'not permitted','scope_confirmed':False}).status_code==422
    cancelled=client.post(f'/api/v1/tooling/jobs/{uid}/cancel',headers=AUTH)
    assert cancelled.json()['status']=='cancelled'
    assert client.post(f'/api/v1/tooling/jobs/{uid}/run',headers=AUTH).status_code==409

def test_help_only_runs_fixed_arguments_when_explicitly_enabled(client,tmp_path,monkeypatch):
    binary=tmp_path/'frida'
    binary.write_text('#!/bin/sh\nprintf "Safe command: <%s>\\n" "$1"\n')
    binary.chmod(0o755)
    monkeypatch.setenv('PATH',str(tmp_path))
    monkeypatch.setenv('STAR_ENABLE_TOOL_HELP','true')
    cat=client.get('/api/v1/tooling/catalog',headers=AUTH).json()
    frida=next(t for t in cat['tools'] if t['id']=='frida')
    assert frida['installed'] and 'help' in frida['actions']
    uid=create(client,'frida','help')
    approve(client,uid)
    assert client.post(f'/api/v1/tooling/jobs/{uid}/run',headers=AUTH).status_code==200
    row=wait(client,uid)
    assert row['status']=='completed',row
    assert row['result']['executed'] is True
    assert '<--help>' in row['result']['stdout']

def test_help_change_after_approval_fails_closed(client,monkeypatch):
    monkeypatch.setenv('STAR_ENABLE_TOOL_HELP','true')
    uid=create(client,'frida','help')
    approve(client,uid)
    monkeypatch.setenv('STAR_ENABLE_TOOL_HELP','false')
    assert client.post(f'/api/v1/tooling/jobs/{uid}/run',headers=AUTH).status_code==403
