import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const extract=(path,names)=>{
  const source=fs.readFileSync(new URL(path,import.meta.url),'utf8');
  const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
  return ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');
};
// Execute both production wrappers and the real reminder query helper. Only the
// transport and unrelated row presentation are stubbed, not the error behavior.
const code=ts.transpileModule([
  extract('../_lib/liveEvents.ts',['readPublicEventSummaries']),
  extract('../_lib/notifications.ts',['readPublicEventReminderSummaries','readViewerEventReminderRows']),
].join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function setup(eventResult,reminderResult){
  const queries=[];
  const context=vm.createContext({exports:{},CREATOR_EVENTS_TABLE:'events',EVENT_REMINDERS_TABLE:'reminders',CREATOR_EVENT_SELECT:'*',
    normalizeText:v=>String(v??'').trim(),isDefined:v=>v!=null,parseCreatorEventRow:v=>v,buildCreatorEventSummary:v=>v,parseEventReminderRow:v=>v,
    readSessionUserId:async id=>id,buildReminderEnrollment:(_id,_viewer,_event,row)=>({state:row?'active':'none'}),
    supabase:{from(table){queries.push(table);const q={select:()=>q,eq:()=>q,neq:()=>q,order:()=>q,in:()=>q,returns:async()=>table==='events'?eventResult:reminderResult};return q;}}});
  vm.runInContext(code,context);return{read:context.exports.readPublicEventReminderSummaries,queries};
}
test('profile strict public event request propagates transport failure instead of an empty schedule',async()=>{
  const s=setup({data:null,error:{message:'offline'}});
  await assert.rejects(s.read('creator','viewer',{throwOnUnavailable:true}),/events could not be loaded/);
  assert.deepEqual(s.queries,['events']);
});
test('strict reminder read failure cannot become a false not-enrolled state',async()=>{
  const s=setup({data:[{id:'event'}],error:null},{data:null,error:{message:'offline'}});
  await assert.rejects(s.read('creator','viewer',{throwOnUnavailable:true}),/reminders could not be loaded/);
  assert.deepEqual(s.queries,['events','reminders']);
});
test('successful empty and enrollment remain supported and legacy callers retain compatibility',async()=>{
  assert.equal((await setup({data:[],error:null}).read('creator','viewer',{throwOnUnavailable:true})).length,0);
  const s=setup({data:[{id:'event'}],error:null},{data:[{event_id:'event'}],error:null});
  assert.equal((await s.read('creator','viewer',{throwOnUnavailable:true}))[0].enrollment.state,'active');
  assert.equal((await setup({data:null,error:{message:'offline'}}).read('creator','viewer')).length,0);
});
