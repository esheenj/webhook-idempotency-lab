import {simulate} from './simulate.mjs';
const $=id=>document.getElementById(id);
const sample={policy:{ttlMs:60000,requireKey:true},events:[
 {eventId:'e1',kind:'deliver',at:'2026-01-01T12:00:00Z',tenant:'demo',route:'orders',key:'order-001',payload:{order:'A',amount:100}},
 {eventId:'e2',kind:'deliver',at:'2026-01-01T12:00:01Z',tenant:'demo',route:'orders',key:'order-001',payload:{amount:100,order:'A'}},
 {eventId:'e3',kind:'complete',at:'2026-01-01T12:00:02Z',originEventId:'e1',responseCode:201},
 {eventId:'e4',kind:'deliver',at:'2026-01-01T12:00:03Z',tenant:'demo',route:'orders',key:'order-001',payload:{order:'A',amount:100}},
 {eventId:'e5',kind:'deliver',at:'2026-01-01T12:00:04Z',tenant:'demo',route:'orders',key:'order-001',payload:{order:'B',amount:100}},
 {eventId:'e6',kind:'deliver',at:'2026-01-01T12:00:05Z',tenant:'demo',route:'orders',payload:{order:'C'}},
 {eventId:'e7',kind:'deliver',at:'2026-01-01T12:00:06Z',tenant:'demo',route:'refunds',key:'order-001',payload:{order:'B'}}
]};
let result=null;
function reset(){$('source').value=JSON.stringify(sample,null,2);$('summary').textContent='Example restored. Click Evaluate scenario to inspect response decisions.';}
function evaluate(){
 try{
  const input=$('source').value;
  if(!input.trim()||input.length>1048576)throw Error('Provide a JSON scenario up to 1 MiB.');
  result=simulate(input);
  const s=result.summary;
  for(const x of ['events','admitted','completed','replayed','held'])$(x).textContent=String(s[x]);
  $('state').textContent='SIMULATED ONLY';$('state').className='state success';
  $('summary').textContent=result.limitations;
  const list=$('decisions');list.replaceChildren();
  if(!result.decisions.length){const li=document.createElement('li');li.textContent='No events in scenario.';list.append(li);}
  for(const event of result.decisions){
   const li=document.createElement('li'),left=document.createElement('div'),code=document.createElement('code'),small=document.createElement('small');
   code.textContent=String(event.index).padStart(2,'0')+' / '+event.eventId;
   small.textContent=event.kind+' · '+(event.key||'no-key');left.append(code,small);
   const right=document.createElement('div'),status=document.createElement('strong'),note=document.createElement('p');
   status.textContent=event.verdict+' / HTTP '+event.httpStatus;
   status.className=['PAYLOAD_MISMATCH','KEY_REQUIRED','OUT_OF_ORDER'].includes(event.verdict)?'fail':
     ['CONCURRENT_CONFLICT','DUPLICATE_EVENT_ID','UNKNOWN_OR_EXPIRED_ORIGIN'].includes(event.verdict)?'warn':'';
   note.textContent=event.why;right.append(status,note);li.append(left,right);list.append(li);
  }
  $('download').disabled=false;
 }catch(err){
  result=null;$('download').disabled=true;$('state').className='state error';$('state').textContent='INPUT ERROR';
  $('summary').textContent=err.message;$('decisions').replaceChildren();
  for(const id of ['events','admitted','completed','replayed','held'])$(id).textContent='—';
 }
}
function download(){
 if(!result)return;
 const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='webhook-idempotency-simulated-report.json';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('reset').addEventListener('click',reset);$('run').addEventListener('click',evaluate);$('download').addEventListener('click',download);reset();
