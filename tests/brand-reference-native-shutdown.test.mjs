import assert from 'node:assert/strict';
import test from 'node:test';
import {assertBrandNativeCleanShutdown} from './helpers/brand-reference-native-shutdown.mjs';

// Shape and timing reproduce the native PID-1 shutdown observed in run
// 40229249896. These tests validate the evidence oracle, not Docker behavior.
function evidence(status=137){return {
 requestedAt:'2026-10-25T20:11:01.458Z',command:{status,signal:null,error:null},
 inspection:{status:0,stdout:JSON.stringify({State:{Status:'exited',Running:false,Paused:false,Restarting:false,
  OOMKilled:false,Dead:false,Pid:0,ExitCode:0,Error:'',StartedAt:'2026-10-25T20:08:10.844310969Z',FinishedAt:'2026-10-25T20:11:03.521232882Z'}})},
 logs:{status:0,stdout:'',stderr:'2026-10-25T20:11:01.494927511Z 2026-10-25 20:11:01.494 UTC [1] LOG:  received smart shutdown request\n2026-10-25T20:11:03.519108952Z 2026-10-25 20:11:03.519 UTC [1] LOG:  database system is shut down\n'}
};}
test('clean native PID-1 shutdown needs independent proof for either pg_ctl client status',()=>{
 for(const status of [0,137])assert.equal(assertBrandNativeCleanShutdown(evidence(status)).ExitCode,0);
});
test('shutdown oracle rejects crashes, OOM, live containers, stale evidence and command failures',()=>{
 const mutations={
  oom:x=>state(x,{OOMKilled:true}),crash:x=>state(x,{ExitCode:137}),running:x=>state(x,{Running:true,Status:'running'}),
  dead:x=>state(x,{Dead:true}),error:x=>state(x,{Error:'engine failure'}),
  restart:x=>state(x,{Restarting:true}),paused:x=>state(x,{Paused:true}),pid:x=>state(x,{Pid:12}),
  staleFinish:x=>state(x,{FinishedAt:'2026-10-25T20:10:00Z'}),newServer:x=>state(x,{StartedAt:'2026-10-25T20:12:00Z'}),
  noInspect:x=>x.inspection.status=1,badInspect:x=>x.inspection.stdout='{}',noLogs:x=>x.logs.status=1,
  missingCompletion:x=>x.logs.stderr=x.logs.stderr.split('\n')[0],
  staleLogs:x=>x.logs.stderr=x.logs.stderr.replaceAll('20:11:','20:10:'),
  futureLogs:x=>x.logs.stderr=x.logs.stderr.replaceAll('20:11:','20:12:'),
  wrongOrder:x=>x.logs.stderr=x.logs.stderr.trim().split('\n').reverse().join('\n'),
  fastShutdown:x=>x.logs.stderr=x.logs.stderr.replace('smart shutdown','fast shutdown'),
  unexpectedClient:x=>x.command.status=1,timeout:x=>x.command.error='ETIMEDOUT',interrupted:x=>x.command.signal='SIGTERM'
 };
 for(const [label,mutate] of Object.entries(mutations)){const candidate=evidence();mutate(candidate);assert.throws(()=>assertBrandNativeCleanShutdown(candidate),undefined,label);}
});
function state(report,change){const value=JSON.parse(report.inspection.stdout);Object.assign(value.State,change);report.inspection.stdout=JSON.stringify(value);}
