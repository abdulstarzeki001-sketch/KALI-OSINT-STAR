"""Regression for Llama's observed shorthand action after a successful read."""
import asyncio
import json

import pytest
from services.agent.cloudflare_planner import parse_action
from services.agent.core import Engine, Executor, Store


def test_real_world_read_file_shorthand_is_parsed_with_allowlisted_schema():
    raw='{"action":"read_file","arguments":{"path":"docs/EMBEDDED_TERMINAL_AR.md"}}'
    response=parse_action(raw)
    assert response.get('invalid_action') is None
    call=response['tool_calls'][0]['function']
    assert call['name']=='read_file'
    assert json.loads(call['arguments'])=={'path':'docs/EMBEDDED_TERMINAL_AR.md'}


@pytest.mark.parametrize('reply', [
    '{"action":"shell","arguments":{"command":"cat /etc/passwd"}}',
    '{"action":"read_file","name":"run_command","arguments":{"path":"README.md"}}',
    '{"action":"read_file","arguments":{"path":"README.md","unsafe":true}}',
    '{"action":"read_file","arguments":{}}',
    '{"action":"read_file","arguments":{"path":42}}',
    '{"action":"run_command","arguments":{"argv":["bash","-c","whoami"],"x":"y"}}',
])
def test_shorthand_does_not_accept_unknown_commands_or_wrong_schema(reply):
    result=parse_action(reply)
    assert result['invalid_action'] is True
    assert not result.get('tool_calls')


@pytest.mark.asyncio
async def test_agent_reads_two_real_files_and_finishes_instead_of_false_completed(tmp_path):
    root=tmp_path/'workspace'
    root.mkdir()
    (root/'README.md').write_text('STAR AI root',encoding='utf8')
    (root/'docs').mkdir()
    (root/'docs'/'EMBEDDED_TERMINAL_AR.md').write_text('Terminal instructions',encoding='utf8')

    class Model:
        async def complete(self,messages):
            reads=sum(m.get('role')=='tool' for m in messages)
            if reads==0:
                return parse_action('{"action":"tool","name":"read_file","arguments":{"path":"README.md"}}')
            if reads==1:
                return parse_action('{"action":"read_file","arguments":{"path":"docs/EMBEDDED_TERMINAL_AR.md"}}')
            return parse_action('{"action":"finish","message":"تمت قراءة الملفين؛ ثلاث توصيات مدعومة بالمحتوى."}')

    engine=Engine(Executor(root,tmp_path/'state',[]),Model(),Store(tmp_path/'tasks.sqlite'))
    task=await engine.submit('اقرأ README ثم التقرير، وقدم ثلاث توصيات دون تعديل')
    for _ in range(100):
        if task.status in ('completed','failed'):break
        await asyncio.sleep(0.02)
    assert task.status=='completed',task.result
    assert sum(event['kind']=='tool_result' for event in task.events)==2
    assert 'ثلاث توصيات' in task.result
    assert any('Terminal instructions' in (m.get('content') or '') for m in task.messages)


@pytest.mark.asyncio
async def test_shorthand_write_requires_separate_owner_approval(tmp_path):
    root=tmp_path/'workspace'
    root.mkdir()
    (root/'sample.txt').write_text('original')
    class Model:
        async def complete(self,messages):
            return parse_action('{"action":"replace_text","arguments":{"path":"sample.txt","old":"original","new":"modified"}}')
    engine=Engine(Executor(root,tmp_path/'state',[]),Model(),Store(tmp_path/'tasks.sqlite'))
    task=await engine.submit('edit sample')
    for _ in range(100):
        if task.status in ('approval_required','failed'):break
        await asyncio.sleep(.02)
    assert task.status=='approval_required'
    assert (root/'sample.txt').read_text()=='original'
    await engine.decide(task.id,False)
    assert task.status=='rejected'
    assert (root/'sample.txt').read_text()=='original'


@pytest.mark.asyncio
async def test_unrecognized_model_action_marks_task_failed_not_success(tmp_path):
    root=tmp_path/'workspace'
    root.mkdir()
    class Model:
        async def complete(self,messages):
            return parse_action('{"action":"arbitrary_remote_shell","arguments":{"command":"anything"}}')
    engine=Engine(Executor(root,tmp_path/'state',[]),Model(),Store(tmp_path/'tasks.sqlite'))
    task=await engine.submit('do a harmless check')
    for _ in range(100):
        if task.status in ('completed','failed'):break
        await asyncio.sleep(.02)
    assert task.status=='failed'
    assert not any(e['kind']=='tool_result' for e in task.events)
    assert any(e['kind']=='invalid_action' for e in task.events)
