// Fixed synthetic compatibility quiz. Scores are NOT general model benchmarks.
export const BENCHMARK_VERSION='python-compat-v1';
const questions=[
 {id:'pydantic',prompt:'Pydantic v2: which import provides BaseSettings?',choices:['from pydantic import BaseSettings','from pydantic_settings import BaseSettings','from pydantic.base import BaseSettings'],correct:'B',reference:'https://docs.pydantic.dev/latest/concepts/pydantic_settings/'},
 {id:'sqlalchemy',prompt:'SQLAlchemy 2.x async SQLite: which combination is correct?',choices:['create_engine + sqlite:///db.sqlite','sessionmaker + synchronous engine','create_async_engine + sqlite+aiosqlite:///db.sqlite'],correct:'C',reference:'https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html'},
 {id:'jose',prompt:'python-jose jwt.decode: which options entry requires the exp claim?',choices:['{"require_exp": true}','{"require": ["exp"]}','["exp"]'],correct:'A',reference:'https://github.com/mpdavis/python-jose/blob/master/jose/jwt.py'},
 {id:'evidence',prompt:'A model writes tests but no runner was invoked. Which report is accurate?',choices:['All tests passed','Tests were written but not executed','The code is proven secure'],correct:'B',reference:''},
 {id:'secret',prompt:'What is a safe production JWT secret configuration?',choices:['A shared literal fallback','A public example key','A mandatory high-entropy secret provided outside source control'],correct:'C',reference:'https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html'}
] as const;
export function benchmarkPrompt(){
 return 'Synthetic software engineering quiz. No sensitive input.\n'+questions.map((q,i)=>`Q${i+1}: ${q.prompt}\n`+q.choices.map((c,j)=>`${'ABC'[j]}. ${c}`).join('\n')).join('\n\n');
}
export const BENCHMARK_INSTRUCTION='Return exactly one plain-text line per answer, in the format Q<number>=<chosen letter> for each of the five questions (one letter from A, B, C). Do not quote the questions or provide alternative answers. These are questions, not executed tests.';
export function gradeBenchmark(analysis:string){
 const lines=analysis.split(/\r?\n/);
 const matches=lines.map(line=>line.trim().match(/^Q([1-5])\s*=\s*([ABC])$/i)).filter(m=>m!==null);
 const details=questions.map((q,i)=>{
  const answers=matches.filter(m=>Number(m[1])===i+1).map(m=>m[2].toUpperCase());
  const answer=answers.length===1?answers[0]:null;
  return {id:q.id,question:q.prompt,answer,expected:q.correct,status:answer===null?'unscorable':answer===q.correct?'correct':'incorrect',reference:q.reference};
 });
 const complete=details.every(d=>d.answer!==null);
 return {version:BENCHMARK_VERSION,complete,correct:details.filter(d=>d.status==='correct').length,total:details.length,details};
}
