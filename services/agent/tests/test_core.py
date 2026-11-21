import asyncio
import json
from pathlib import Path
import pytest
from services.agent.core import Executor, Engine, Model, Store, Task

def executor(tmp_path):
    root=tmp_path/'workspace';root.mkdir()
    return Executor(root,tmp_path/'state',['example.com'])

def test_paths_and_secrets(tmp_path):
    ex=executor(tmp_path)
    (ex.root/'README.md').write_text('hello world')
    assert ex.read_file('README.md')=='hello world'
    with pytest.raises(ValueError):ex.read_file('../outside.txt')
    with pytest.raises(ValueError):ex.read_file('/etc/passwd')
    with pytest.raises(ValueError):ex.read_file('.env')
    with pytest.raises(ValueError):ex.create_file('README.md','bad')
    assert 'README.md' in ex.list_files()
    assert 'README.md:1' in ex.search_text('hello')

def test_symlink_secret_read_blocked(tmp_path):
    ex=executor(tmp_path)
    (ex.root/'.env.private').write_text('never-read-me')
    (ex.root/'public.txt').symlink_to(ex.root/'.env.private')
    with pytest.raises(ValueError):ex.read_file('public.txt')
    with pytest.raises(ValueError):ex.read_file('.env.private')
    with pytest.raises(ValueError):ex.read_file('my-secret-token.txt')


def test_pending_approval_previews_actual_changes():
    t=Task(id='test',prompt='edit',status='approval_required',
           pending={'id':'call1','name':'replace_text',
                    'arguments':{'path':'README.md','old':'before','new':'after'}})
    p=t.public()['pending']
    assert p['arguments']['old']=='before'
    assert p['arguments']['new']=='after'


def test_allowlisted_commands(tmp_path):
    ex=executor(tmp_path)
    assert ex.command_policy(['git','status'])=='auto'
    assert ex.command_policy(['python3','-m','pytest','-q'])=='approval'
    for cmd in [['bash','-c','echo pwn'],['curl','https://example.com'],
                ['git','push'],['python3','-c','print(2)'],['npm','install']]:
        with pytest.raises(ValueError):ex.command_policy(cmd)

def test_browser_scope(tmp_path):
    ex=executor(tmp_path)
    assert ex.allowed_url('https://example.com/page')
    for url in ['http://example.com','https://other.com',
                'https://example.com.evil.test','https://127.0.0.1',
                'https://example.com:444/','https://user:pass@example.com/']:
        assert not ex.allowed_url(url)

def test_edit_requires_unique_old_text_and_create_is_no_overwrite(tmp_path):
    ex=executor(tmp_path)
    (ex.root/'code.txt').write_text('alpha beta alpha')
    with pytest.raises(ValueError):ex.replace_text('code.txt','alpha','new')
    result=ex.replace_text('code.txt','beta','fixed')
    assert 'Updated' in result
    assert (ex.root/'code.txt').read_text()=='alpha fixed alpha'
    assert 'Created' in ex.create_file('new.txt','hello')
    with pytest.raises(ValueError):ex.create_file('new.txt','overwrite')

class FakeModel:
    def __init__(self,answers):self.answers=list(answers);self.requests=[]
    async def complete(self,messages):
        self.requests.append(messages[:])
        return self.answers.pop(0)

def call(id,name,args):
    return {'id':id,'type':'function','function':{'name':name,'arguments':json.dumps(args)}}

@pytest.mark.asyncio
async def test_agent_autonomous_reads_and_finishes(tmp_path):
    ex=executor(tmp_path)
    (ex.root/'README.md').write_text('Project STAR')
    fake=FakeModel([
        {'content':None,'tool_calls':[call('one','read_file',{'path':'README.md'})]},
        {'content':'قرأت ملف المشروع وقد وجدت النص الصحيح'}
    ])
    engine=Engine(ex,fake,Store(tmp_path/'tasks.sqlite'))
    t=await engine.submit('اقرأ README.md ثم لخّصه')
    for i in range(25):
        if t.status=='completed':break
        await asyncio.sleep(.02)
    assert t.status=='completed'
    assert any(e['kind']=='tool_result' for e in t.events)
    assert any('Project STAR' in str(m.get('content','')) for m in t.messages)

@pytest.mark.asyncio
async def test_approval_before_write_and_review(tmp_path):
    ex=executor(tmp_path)
    (ex.root/'code.txt').write_text('before')
    fake=FakeModel([
        {'content':None,'tool_calls':[call('write1','replace_text',{'path':'code.txt','old':'before','new':'after'})]},
        {'content':'تم التعديل بعد الموافقة'}
    ])
    engine=Engine(ex,fake,Store(tmp_path/'tasks.sqlite'))
    t=await engine.submit('عدّل ملف code.txt')
    for i in range(25):
        if t.status=='approval_required':break
        await asyncio.sleep(.02)
    assert t.status=='approval_required'
    assert (ex.root/'code.txt').read_text()=='before'
    await engine.decide(t.id,True)
    for i in range(25):
        if t.status=='completed':break
        await asyncio.sleep(.02)
    assert t.status=='completed'
    assert (ex.root/'code.txt').read_text()=='after'

@pytest.mark.asyncio
async def test_denied_write_does_not_mutate_files(tmp_path):
    ex=executor(tmp_path)
    (ex.root/'code.txt').write_text('original')
    fake=FakeModel([
        {'content':None,'tool_calls':[call('write1','replace_text',{'path':'code.txt','old':'original','new':'bad'})]}
    ])
    engine=Engine(ex,fake,Store(tmp_path/'tasks.sqlite'))
    t=await engine.submit('edit')
    for i in range(25):
        if t.status=='approval_required':break
        await asyncio.sleep(.02)
    await engine.decide(t.id,False)
    assert t.status=='rejected'
    assert (ex.root/'code.txt').read_text()=='original'

def test_sqlite_recovery_never_replays_approval(tmp_path):
    db=tmp_path/'tasks.sqlite'
    store=Store(db)
    t=Task(id='0123456789abcdef01234567',prompt='test',status='approval_required')
    store.save(t)
    recovered=Store(db).get(t.id)
    assert recovered['status']=='interrupted'

def test_llama_endpoint_path():
    model=Model('http://star-ai-cpu:8080/v1','fake-key','star-ai-cpu')
    assert model.url=='http://star-ai-cpu:8080/v1/chat/completions'
