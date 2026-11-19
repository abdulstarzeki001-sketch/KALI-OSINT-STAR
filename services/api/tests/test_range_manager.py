"""Range Manager: auth, approval, opt-in flag, fixed argv, dynamic Juice Shop flags."""
import hashlib
import hmac
import subprocess
import time

import pytest
from fastapi.testclient import TestClient

from app import range_manager
from app.main import app

OP = 'test-operator-token-more-than-32-characters'
AP = 'different-approval-token-more-than-32-characters'
AUTH = {'Authorization': f'Bearer {OP}'}
APPROVE = {**AUTH, 'X-STAR-APPROVAL': AP}
CONSENT = {'reason': 'Isolated local range on my own Kali laptop', 'scope_confirmed': True}


class FakeDocker:
    def __init__(self):
        self.calls = []
        self.fail = False
        self.running = set()

    def __call__(self, argv, env, timeout):
        self.calls.append((list(argv), dict(env), timeout))
        if self.fail:
            return subprocess.CompletedProcess(argv, 1, b'', b'pull access denied')
        if 'up' in argv:
            self.running.add(argv[-1])
        if 'rm' in argv:
            self.running.discard(argv[-1])
        if 'ps' in argv:
            rows = '\n'.join('{"Service":"%s","State":"running"}' % s for s in sorted(self.running))
            return subprocess.CompletedProcess(argv, 0, rows.encode(), b'')
        return subprocess.CompletedProcess(argv, 0, b'ok', b'')


@pytest.fixture
def docker(monkeypatch):
    fake = FakeDocker()
    monkeypatch.setattr(range_manager, 'compose', fake)
    return fake


@pytest.fixture
def client(tmp_path, monkeypatch, docker):
    monkeypatch.setenv('STAR_DB_PATH', str(tmp_path / 'operations.db'))
    monkeypatch.setenv('STAR_OPERATOR_TOKEN', OP)
    monkeypatch.setenv('STAR_APPROVAL_TOKEN', AP)
    monkeypatch.setenv('STAR_RANGE_ENABLED', 'true')
    with TestClient(app) as tc:
        yield tc


def wait_status(client, lab_id, want):
    for _ in range(200):
        attempts = client.get('/api/v1/range/attempts', headers=AUTH).json()['attempts']
        row = next((a for a in attempts if a['lab_id'] == lab_id), None)
        if row and row['status'] == want:
            return row
        time.sleep(0.02)
    pytest.fail(f'{lab_id} never reached {want}')


def ctf_key_of(attempt_id):
    with range_manager.connection() as db:
        return db.execute('SELECT ctf_key FROM range_attempts WHERE id=?', (attempt_id,)).fetchone()[0]


def test_every_route_requires_operator_token(client, docker):
    assert client.get('/api/v1/range/labs').status_code == 401
    assert client.get('/api/v1/range/attempts').status_code == 401
    assert client.post('/api/v1/range/labs/juice-shop/start', json=CONSENT).status_code == 401
    assert client.post('/api/v1/range/labs/juice-shop/stop').status_code == 401
    assert client.post('/api/v1/range/attempts/x/flags', json={'challenge': 'ab', 'flag': '0' * 40}).status_code == 401
    assert docker.calls == []


def test_start_and_reset_need_separate_approval_and_scope(client, docker):
    assert client.post('/api/v1/range/labs/juice-shop/start', headers=AUTH, json=CONSENT).status_code == 403
    assert client.post('/api/v1/range/labs/juice-shop/reset', headers=AUTH, json=CONSENT).status_code == 403
    bad = {**CONSENT, 'scope_confirmed': False}
    assert client.post('/api/v1/range/labs/juice-shop/start', headers=APPROVE, json=bad).status_code == 422
    extra = {**CONSENT, 'command': 'id'}
    assert client.post('/api/v1/range/labs/juice-shop/start', headers=APPROVE, json=extra).status_code == 422
    assert docker.calls == []


def test_disabled_by_default(client, docker, monkeypatch):
    monkeypatch.delenv('STAR_RANGE_ENABLED')
    labs = client.get('/api/v1/range/labs', headers=AUTH).json()
    assert labs['enabled'] is False and labs['problem'] == 'disabled'
    assert client.post('/api/v1/range/labs/juice-shop/start', headers=APPROVE, json=CONSENT).status_code == 403
    assert client.post('/api/v1/range/labs/dvwa/stop', headers=AUTH).status_code == 403
    assert docker.calls == []


def test_unknown_lab_is_rejected_without_docker(client, docker):
    for lab in ('gateway', '../etc', 'juice-shop;id', 'metasploitable'):
        r = client.post(f'/api/v1/range/labs/{lab}/start', headers=APPROVE, json=CONSENT)
        assert r.status_code == 404, lab
    assert docker.calls == []


def test_start_uses_fixed_argv_and_passes_secret_only_in_env(client, docker):
    r = client.post('/api/v1/range/labs/juice-shop/start', headers=APPROVE, json=CONSENT)
    assert r.status_code == 202
    attempt = r.json()
    assert 'ctf_key' not in attempt
    wait_status(client, 'juice-shop', 'running')
    key = ctf_key_of(attempt['id'])
    assert len(key) == 64
    ups = [c for c in docker.calls if 'up' in c[0]]
    assert ups[-1][0][-6:] == ['up', '-d', '--force-recreate', '--no-deps', '--renew-anon-volumes', 'juice-shop']
    for argv, env, _ in ups:
        assert argv[:2] == ['docker', 'compose'] and '-p' in argv and 'kos-range' in argv
        assert key not in ' '.join(argv)
        assert env['KOS_JUICE_CTF_KEY'] == key
        assert OP not in env.values() and AP not in env.values()
    labs = client.get('/api/v1/range/labs', headers=AUTH).json()
    juice = next(l for l in labs['labs'] if l['id'] == 'juice-shop')
    assert juice['running'] is True and juice['attempt']['id'] == attempt['id']
    assert key not in str(labs)


def test_dynamic_flags_are_verified_per_attempt(client, docker):
    first = client.post('/api/v1/range/labs/juice-shop/start', headers=APPROVE, json=CONSENT).json()
    wait_status(client, 'juice-shop', 'running')
    key = ctf_key_of(first['id'])
    good = hmac.new(key.encode(), b'Score Board', hashlib.sha1).hexdigest()
    url = f"/api/v1/range/attempts/{first['id']}/flags"
    assert client.post(url, headers=AUTH, json={'challenge': 'Score Board', 'flag': 'a' * 40}).json()['correct'] is False
    ok = client.post(url, headers=AUTH, json={'challenge': 'Score Board', 'flag': good.upper()}).json()
    assert ok == {'correct': True, 'challenge': 'Score Board', 'duplicate': False, 'solves': 1}
    again = client.post(url, headers=AUTH, json={'challenge': 'Score Board', 'flag': good}).json()
    assert again['duplicate'] is True and again['solves'] == 1
    # The same flag must not be valid for another challenge or a later attempt.
    assert client.post(url, headers=AUTH, json={'challenge': 'DOM XSS', 'flag': good}).json()['correct'] is False
    second = client.post('/api/v1/range/labs/juice-shop/reset', headers=APPROVE, json=CONSENT).json()
    wait_status(client, 'juice-shop', 'running')
    assert ctf_key_of(second['id']) != key
    assert ctf_key_of(first['id']) is None
    old = client.post(url, headers=AUTH, json={'challenge': 'Score Board', 'flag': good})
    assert old.status_code == 409
    url2 = f"/api/v1/range/attempts/{second['id']}/flags"
    assert client.post(url2, headers=AUTH, json={'challenge': 'Score Board', 'flag': good}).json()['correct'] is False


def test_flag_input_shape_is_strict(client, docker):
    for body in ({'challenge': 'Score Board', 'flag': 'z' * 40}, {'challenge': 'x', 'flag': 'a' * 40},
                 {'challenge': 'Score Board', 'flag': 'a' * 41}, {'challenge': '$(id)', 'flag': 'a' * 40},
                 {'challenge': 'Score Board', 'flag': 'a' * 40, 'extra': 1}):
        assert client.post('/api/v1/range/attempts/x/flags', headers=AUTH, json=body).status_code == 422


def test_labs_without_flags_reject_submissions(client, docker):
    attempt = client.post('/api/v1/range/labs/dvwa/start', headers=APPROVE, json=CONSENT).json()
    wait_status(client, 'dvwa', 'running')
    assert ctf_key_of(attempt['id']) is None
    r = client.post(f"/api/v1/range/attempts/{attempt['id']}/flags", headers=AUTH,
                    json={'challenge': 'Score Board', 'flag': 'a' * 40})
    assert r.status_code == 409


def test_stop_removes_container_and_ends_attempt(client, docker):
    attempt = client.post('/api/v1/range/labs/webgoat/start', headers=APPROVE, json=CONSENT).json()
    wait_status(client, 'webgoat', 'running')
    r = client.post('/api/v1/range/labs/webgoat/stop', headers=AUTH)
    assert r.status_code == 200
    assert docker.calls[-1][0][-5:] == ['rm', '--stop', '--force', '-v', 'webgoat']
    assert wait_status(client, 'webgoat', 'ended')['id'] == attempt['id']


def test_failed_start_is_recorded_and_audited(client, docker):
    docker.fail = True
    client.post('/api/v1/range/labs/juice-shop/start', headers=APPROVE, json=CONSENT)
    row = wait_status(client, 'juice-shop', 'failed')
    assert row['detail']['error_code'] == 'compose_failed'
    audit = client.get('/api/v1/audit?limit=20', headers=AUTH).json()['events']
    actions = [e['action'] for e in audit]
    assert 'range_start_requested' in actions and 'range_start_failed' in actions
