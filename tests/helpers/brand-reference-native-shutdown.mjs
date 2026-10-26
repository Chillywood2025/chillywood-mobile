import assert from 'node:assert/strict';

// PostgreSQL is PID 1 in these fixtures. Its clean exit can terminate the
// waiting docker-exec pg_ctl client (137). The client status alone proves
// neither success nor OOM: require independent container and server evidence.
export function assertBrandNativeCleanShutdown({requestedAt,command,inspection,logs}){
 const requested=Date.parse(requestedAt);assert.ok(Number.isFinite(requested));
 assert.equal(command.error??null,null,'shutdown client must not time out or fail to launch');
 assert.ok([0,137].includes(command.status),'unexpected shutdown client exit');
 assert.equal(command.signal??null,null,'shutdown client was interrupted');
 assert.equal(inspection.status,0,'independent shutdown inspect failed');
 const state=JSON.parse(inspection.stdout).State;
 assert.equal(state.Status,'exited');assert.equal(state.Running,false);
 assert.equal(state.OOMKilled,false);assert.equal(state.Dead,false);
 assert.equal(state.Restarting,false);assert.equal(state.Paused,false);
 assert.equal(state.ExitCode,0);assert.equal(state.Pid,0);assert.equal(state.Error,'');
 assert.ok(Date.parse(state.StartedAt)<requested,'the inspected server must predate this request');
 assert.ok(Date.parse(state.FinishedAt)>=requested,'shutdown must follow this request');
 assert.equal(logs.status,0,'independent shutdown logs failed');
 const lines=((logs.stdout??'')+(logs.stderr??'')).split('\n').map(line=>({
  line,time:Date.parse(line.match(/^(\S+) /)?.[1]??'')
 })).filter(({time})=>Number.isFinite(time)&&time>=requested&&time<=Date.parse(state.FinishedAt));
 const request=lines.findIndex(({line})=>/LOG:\s+received smart shutdown request\s*$/.test(line));
 const complete=lines.findIndex(({line},index)=>index>request&&/LOG:\s+database system is shut down\s*$/.test(line));
 assert.ok(request>=0&&complete>request,'fresh smart-shutdown and completion logs are required');
 return state;
}
