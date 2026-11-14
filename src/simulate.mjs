// Zero-dependency, offline webhook / HTTP idempotency decision simulator.
// It neither receives webhooks nor performs network calls or side effects.
const OBJ=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const ID=/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/;
const id=(v,label)=>{if(typeof v!=='string'||!ID.test(v))throw Error(label+' must be an identifier of 1–128 safe characters');return v;};
const integer=(v,label)=>{if(!Number.isSafeInteger(v)||v<0)throw Error(label+' must be a non-negative safe integer');return v;};
const time=(v,label)=>{
 if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(v))
   throw Error(label+' must be ISO 8601 with explicit timezone');
 const n=Date.parse(v);if(!Number.isFinite(n))throw Error(label+' must be a valid date');return n;
};
function stable(v,depth=0){
 if(depth>24)throw Error('Payload nesting exceeds 24 levels');
 if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);
 if(typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(x=>stable(x,depth+1)).join(',')+']';
 if(OBJ(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k],depth+1)).join(',')+'}';
 throw Error('Payload must be JSON-compatible');
}
export function parseScenario(input){
 const v=typeof input==='string'?JSON.parse(input):input;
 if(!OBJ(v)||!OBJ(v.policy)||!Array.isArray(v.events))throw Error('Expected {policy:{ttlMs,requireKey},events:[]}');
 if(v.events.length>300)throw Error('Maximum 300 events');
 const ttlMs=integer(v.policy.ttlMs,'ttlMs');
 if(ttlMs<1||ttlMs>2592000000)throw Error('ttlMs must be between 1 millisecond and 30 days');
 if(typeof v.policy.requireKey!=='boolean')throw Error('requireKey must be boolean');
 const events=v.events.map((event,index)=>{
   if(!OBJ(event))throw Error('Event '+index+' is not an object');
   const e={eventId:id(event.eventId,'eventId'),kind:id(event.kind,'kind'),at:time(event.at,'at'),
    atIso:new Date(time(event.at,'at')).toISOString()};
   if(!['deliver','complete'].includes(e.kind))throw Error('Unsupported event kind: '+e.kind);
   if(e.kind==='deliver'){
     e.tenant=id(event.tenant,'tenant');e.route=id(event.route,'route');
     e.key=event.key===undefined||event.key===null||event.key===''?null:id(event.key,'key');
     if(!OBJ(event.payload))throw Error('Delivery requires an object payload');
     e.payloadCanonical=stable(event.payload);
   } else {
     e.originEventId=id(event.originEventId,'originEventId');
     e.responseCode=integer(event.responseCode,'responseCode');
     if(![200,201,202,204].includes(e.responseCode))throw Error('Simulated completion code must be 200, 201, 202 or 204');
   }
   return e;
 });
 return {policy:{ttlMs,requireKey:v.policy.requireKey},events};
}
export function simulate(input){
 const {policy,events}=parseScenario(input);
 const scopes=new Map(),ids=new Set(),origins=new Map();
 const decisions=[];
 let lastTime=-Infinity;
 const emit=(e,verdict,httpStatus,why,record=null)=>{
   decisions.push({index:decisions.length+1,eventId:e.eventId,kind:e.kind,
     key:e.key??record?.key??null,scope:record?.scope??null,at:e.atIso,
     verdict,httpStatus,why,originalEventId:record?.originEventId??null});
 };
 for(const e of events){
   if(ids.has(e.eventId)){emit(e,'DUPLICATE_EVENT_ID',409,'Event ID was already seen. Original event kept.');continue;}
   ids.add(e.eventId);
   if(e.at<lastTime){emit(e,'OUT_OF_ORDER',422,'Event time precedes the previously accepted sequence; no state changes.');continue;}
   lastTime=e.at;
   if(e.kind==='complete'){
     const scope=origins.get(e.originEventId),record=scope===undefined?null:scopes.get(scope);
     if(!record||record.originEventId!==e.originEventId||e.at-record.createdAt>=policy.ttlMs){emit(e,'UNKNOWN_OR_EXPIRED_ORIGIN',404,'No active matching original delivery, or its configured TTL elapsed.');continue;}
     if(record.state==='complete'){emit(e,'ALREADY_COMPLETED',record.responseCode,'Original simulated operation already completed.',record);continue;}
     record.state='complete';record.responseCode=e.responseCode;
     emit(e,'COMPLETED',e.responseCode,'Original simulated operation recorded as completed.',record);continue;
   }
   if(!e.key){
     if(policy.requireKey)emit(e,'KEY_REQUIRED',400,'The configured endpoint requires an idempotency key.');
     else emit(e,'UNKEYED_UNTRACKED',202,'No key: simulated admission without deduplication protection.');
     continue;
   }
   const scope=JSON.stringify([e.tenant,e.route,e.key]);
   let record=scopes.get(scope);
   let expired=false;
   if(record&&e.at-record.createdAt>=policy.ttlMs){scopes.delete(scope);origins.delete(record.originEventId);record=null;expired=true;}
   if(!record){
     record={key:e.key,scope,originEventId:e.eventId,createdAt:e.at,
       payloadCanonical:e.payloadCanonical,state:'pending',responseCode:null};
     scopes.set(scope,record);origins.set(e.eventId,scope);
     emit(e,expired?'ADMITTED_AFTER_EXPIRY':'ADMITTED_FIRST',202,expired?'Prior key record expired; another hypothetical effect could occur.':'New scoped key, hypothetical operation marked pending; no real delivery processed.',record);
     continue;
   }
   if(record.payloadCanonical!==e.payloadCanonical){
     emit(e,'PAYLOAD_MISMATCH',422,'Same scoped key with different payload; do not replay or overwrite.',record);
   } else if(record.state==='pending'){
     emit(e,'CONCURRENT_CONFLICT',409,'Original request is still pending; retry later.',record);
   } else {
     emit(e,'REPLAYED_COMPLETED',record.responseCode,'Same scoped key and payload; return the stored simulated completion response.',record);
   }
 }
 const summary={events:decisions.length,admitted:decisions.filter(x=>['ADMITTED_FIRST','ADMITTED_AFTER_EXPIRY','UNKEYED_UNTRACKED'].includes(x.verdict)).length,
   completed:decisions.filter(x=>x.verdict==='COMPLETED').length,
   replayed:decisions.filter(x=>x.verdict==='REPLAYED_COMPLETED').length,
   held:decisions.filter(x=>['DUPLICATE_EVENT_ID','OUT_OF_ORDER','UNKNOWN_OR_EXPIRED_ORIGIN','KEY_REQUIRED','PAYLOAD_MISMATCH','CONCURRENT_CONFLICT'].includes(x.verdict)).length};
 return {state:'OFFLINE_SIMULATION_ONLY',summary,decisions,
  limitations:'Not an HTTP endpoint, webhook receiver, durable transaction store, signature verifier, provider compatibility guarantee, or concurrent execution controller. Simulated HTTP statuses are explanatory examples, not wire responses.'};
}
