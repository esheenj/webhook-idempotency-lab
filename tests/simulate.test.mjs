import test from 'node:test';import assert from 'node:assert/strict';import {parseScenario,simulate} from '../src/simulate.mjs';
const policy={ttlMs:60000,requireKey:true};
const at=s=>'2026-01-01T12:00:'+String(s).padStart(2,'0')+'Z';
const delivery=(eventId,key='K',payload={order:1},s=0,route='orders',tenant='demo')=>({eventId,kind:'deliver',at:at(s),tenant,route,key,payload});
const finish=(eventId,originEventId,s=2,responseCode=201)=>({eventId,kind:'complete',at:at(s),originEventId,responseCode});
const run=(events,p=policy)=>simulate({policy:p,events});
const verdicts=r=>r.decisions.map(d=>d.verdict);
test('empty scenario has deterministic non-operation status',()=>{const r=run([]);assert.equal(r.state,'OFFLINE_SIMULATION_ONLY');assert.equal(r.summary.events,0);});
test('initial scoped key is admitted pending',()=>assert.deepEqual(verdicts(run([delivery('e1')])),['ADMITTED_FIRST']));
test('retry while pending is a conflict',()=>assert.deepEqual(verdicts(run([delivery('e1'),delivery('e2','K',{order:1},1)])),['ADMITTED_FIRST','CONCURRENT_CONFLICT']));
test('completed request replays saved status',()=>{
 const r=run([delivery('e1'),finish('e2','e1'),delivery('e3','K',{order:1},3)]);
 assert.deepEqual(verdicts(r),['ADMITTED_FIRST','COMPLETED','REPLAYED_COMPLETED']);
 assert.equal(r.decisions[2].httpStatus,201);
});
test('same key different payload returns mismatch',()=>{
 const r=run([delivery('e1'),delivery('e2','K',{order:2},1)]);
 assert.equal(r.decisions[1].verdict,'PAYLOAD_MISMATCH');assert.equal(r.decisions[1].httpStatus,422);
});
test('canonical JSON ordering does not affect fingerprint',()=>{
 const r=run([delivery('e1','K',{x:1,y:2}),delivery('e2','K',{y:2,x:1},1)]);
 assert.equal(r.decisions[1].verdict,'CONCURRENT_CONFLICT');
});
test('same key separate tenants not conflated',()=>{
 const r=run([delivery('e1'),delivery('e2','K',{order:1},1,'orders','other')]);
 assert.deepEqual(verdicts(r),['ADMITTED_FIRST','ADMITTED_FIRST']);
});
test('same key separate routes not conflated',()=>{
 const r=run([delivery('e1'),delivery('e2','K',{order:1},1,'refunds')]);
 assert.deepEqual(verdicts(r),['ADMITTED_FIRST','ADMITTED_FIRST']);
});
test('missing required key rejected',()=>{
 const r=run([delivery('e1',null)]);assert.equal(r.decisions[0].verdict,'KEY_REQUIRED');assert.equal(r.decisions[0].httpStatus,400);
});
test('optional key makes unprotected admission explicit',()=>{
 const r=run([delivery('e1',null)],{...policy,requireKey:false});
 assert.equal(r.decisions[0].verdict,'UNKEYED_UNTRACKED');
});
test('duplicate event id has no effect',()=>{
 const r=run([delivery('e1'),delivery('e1','OTHER',{order:2},1)]);
 assert.equal(r.decisions[1].verdict,'DUPLICATE_EVENT_ID');assert.equal(r.summary.admitted,1);
});
test('complete unknown origin does not create a record',()=>assert.equal(run([finish('e1','unknown')]).decisions[0].verdict,'UNKNOWN_OR_EXPIRED_ORIGIN'));
test('completion twice is idempotent',()=>{
 const r=run([delivery('e1'),finish('e2','e1'),finish('e3','e1',3)]);
 assert.equal(r.decisions[2].verdict,'ALREADY_COMPLETED');
});
test('completion records allowed response code',()=>{
 for(const code of [200,201,202,204])assert.equal(run([delivery('e1'),finish('e2','e1',2,code)]).decisions[1].httpStatus,code);
});
test('request key reuses after TTL but may duplicate effect',()=>{
 const r=run([delivery('e1'),{...delivery('e2','K',{order:1},1),at:'2026-01-01T12:01:00Z'}]);
 assert.equal(r.decisions[1].verdict,'ADMITTED_AFTER_EXPIRY');
});
test('expired original cannot be completed late',()=>{
 const r=run([delivery('e1'),{...finish('e2','e1'),at:'2026-01-01T12:01:00Z'}]);
 assert.equal(r.decisions[1].verdict,'UNKNOWN_OR_EXPIRED_ORIGIN');
});
test('out of order event does not mutate stored status',()=>{
 const r=run([delivery('e1','K',{order:1},5),delivery('e2','K',{order:1},2),finish('e3','e1',6)]);
 assert.equal(r.decisions[1].verdict,'OUT_OF_ORDER');assert.equal(r.decisions[2].verdict,'COMPLETED');
});
test('wrong payload after completion still mismatches',()=>{
 const r=run([delivery('e1'),finish('e2','e1'),delivery('e3','K',{order:2},3)]);
 assert.equal(r.decisions[2].verdict,'PAYLOAD_MISMATCH');
});
test('unknown kind rejected',()=>assert.throws(()=>run([{eventId:'e1',kind:'pay',at:at(0)}]),/Unsupported event kind/));
test('invalid completion status rejected',()=>assert.throws(()=>run([finish('e1','old',1,500)]),/Simulated completion code/));
test('timezone required',()=>assert.throws(()=>run([{...delivery('e1'),at:'2026-01-01T12:00:00'}]),/explicit timezone/));
test('invalid policy rejected',()=>{
 assert.throws(()=>run([], {...policy,ttlMs:0}),/ttlMs must/);
 assert.throws(()=>run([],{...policy,requireKey:'yes'}),/requireKey/);
});
test('missing payload rejected',()=>assert.throws(()=>run([{...delivery('e1'),payload:undefined}]),/requires an object/));
test('non-object payload rejected',()=>assert.throws(()=>run([{...delivery('e1'),payload:[1,2]}]),/requires an object/));
test('invalid identifiers rejected',()=>assert.throws(()=>run([delivery('!')]),/identifier/));
test('invalid JSON structure rejected',()=>assert.throws(()=>simulate({events:[]}),/Expected/));
test('at most 300 events accepted, 301 rejected',()=>{
 const events=Array.from({length:300},(_,i)=>delivery('e'+i,'K'+i,{order:i}));
 assert.equal(run(events).summary.events,300);
 assert.throws(()=>run([...events,delivery('x')]),/Maximum 300/);
});
test('plain object input and JSON input equivalent',()=>{const v={policy,events:[delivery('e1')]};assert.deepEqual(simulate(v),simulate(JSON.stringify(v)));});
test('two complete response replays remain same',()=>{
 const r=run([delivery('e1'),finish('e2','e1',2,204),delivery('e3','K',{order:1},3),delivery('e4','K',{order:1},4)]);
 assert.equal(r.decisions[2].httpStatus,204);assert.equal(r.decisions[3].httpStatus,204);
});
test('no side-effect executions are reported',()=>assert.match(JSON.stringify(run([delivery('e1')])),/OFFLINE_SIMULATION_ONLY/));
