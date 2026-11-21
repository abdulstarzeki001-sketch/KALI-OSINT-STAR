// Session-only coordination; imported CI evidence never authorizes a local draft.
export type ChangeFlow={name:string;base:string;candidate:string;stage:'proposed'|'reviewed'|'applied'};
export type FlowEvent={type:'proposal'|'review'|'apply';name:string;base:string;candidate:string};
export function advanceFlow(previous:ChangeFlow|null,event:FlowEvent):ChangeFlow|null{
 const {name,base,candidate}=event;
 if(!name||!candidate.trim()||base===candidate)return previous;
 if(event.type==='proposal')return {name,base,candidate,stage:'proposed'};
 if(!previous||previous.name!==name||previous.base!==base||previous.candidate!==candidate||previous.stage==='applied')return previous;
 if(event.type==='review')return {...previous,stage:'reviewed'};
 return {...previous,stage:'applied'};
}
export function currentFlow(flow:ChangeFlow|null,name:string,source:string){
 if(!flow||flow.name!==name)return null;
 return source===(flow.stage==='applied'?flow.candidate:flow.base)?flow.stage:'stale';
}
type Evidence={origin:string;commit:string|null;runId:string|null;passed:boolean};
export function evidenceState(evidence:Evidence|null){
 if(!evidence)return {status:'missing',commit:null,runId:null} as const;
 return {status:evidence.passed?'reported-pass':'reported-failure',commit:evidence.commit,runId:evidence.runId} as const;
}
export function summarizeFlow(flow:ChangeFlow|null,name:string,source:string,evidence:Evidence|null){
 return {stage:currentFlow(flow,name,source),evidence:evidenceState(evidence),draftTestsVerified:false,releaseAuthorized:false};
}
