import {parseProposal,parseAdvisory,proposalMessages,reviewMessages} from './coding-copilot.ts';
import type {Proposal,Task} from './coding-copilot.ts';
export type AgentPhase='proposing'|'reviewing'|'ready'|'stopped';
type Ask=(model:'qwen3-coder-vast'|'llama-cloudflare',messages:{role:string;content:string}[],signal:AbortSignal)=>Promise<unknown>;
type Options={name:string;source:string;task:Task;consentQwen:boolean;consentLlama:boolean;signal:AbortSignal;isCurrent:()=>boolean;ask:Ask;onPhase:(phase:AgentPhase)=>void;onProposal:(p:Proposal)=>void;onReview:(p:Proposal,review:string)=>void};
export async function runEngineeringCycle(o:Options){
 // The two providers require separately granted authorization. Neither can apply edits.
 if(!o.consentQwen||!o.consentLlama)throw Error('Both provider consents are required');
 const guard=()=>{if(o.signal.aborted||!o.isCurrent())throw Error('Cycle cancelled or source changed')};
 try{
  guard();
  const messages=proposalMessages(o.name,o.source,o.task);
  o.onPhase('proposing');
  const response=await o.ask('qwen3-coder-vast',messages,o.signal);
  guard();
  const proposal=parseProposal(response,o.name,o.source);
  o.onProposal(proposal);
  guard();
  o.onPhase('reviewing');
  const reviewResponse=await o.ask('llama-cloudflare',reviewMessages(proposal),o.signal);
  guard();
  const review=parseAdvisory(reviewResponse);
  o.onReview(proposal,review);
  o.onPhase('ready');
  return {proposal,review,testsExecuted:false as const,applied:false as const};
 }catch(error){o.onPhase('stopped');throw error}
}
