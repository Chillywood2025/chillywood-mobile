import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const modulePath = fileURLToPath(new URL('../scripts/lib/clip-workload-supervisor.py', import.meta.url));
const common = `import importlib.util,json,os,sys
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('supervisor',${JSON.stringify(modulePath)})
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
root=sys.argv[1]
budget={'cpu_count':1,'memory_mib':256,'disk_mib':64,'wall_seconds':10}
`;

function runPython(code) {
  const root = mkdtempSync(path.join(tmpdir(), 'clip-workload-supervisor-'));
  try {
    return JSON.parse(execFileSync('python3', ['-c', common + code, root], {
      encoding: 'utf8', timeout: 20_000, maxBuffer: 1_000_000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    }));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('workload budget requires explicit CPU, memory, disk and deadline with reserves', () => {
  const result = runPython(`host={'memory_available_bytes':8*s.GIB,'cpu_affinity':[2,3],
'disk_free_bytes':8*s.GIB,'cgroup':{'cpu_quota_cores':None}}
results=[]
for change in [{'cpu_count':3},{'memory_mib':4096},{'disk_mib':7168},{'wall_seconds':0},{'memory_mib':255},{'cpu_count':True}]:
 try:s.validate_budget(host,{**budget,**change});results.append('unexpected-pass')
 except ValueError as error:results.append(str(error))
good=s.validate_budget(host,budget)
quota={**host,'cgroup':{'cpu_quota_cores':0.5}}
try:s.validate_budget(quota,budget);results.append('unexpected-pass')
except ValueError as error:results.append(str(error))
print(json.dumps({'failures':results,'selected':good['selected_cpus']}))`);
  assert.deepEqual(result.selected, [2]);
  assert.equal(result.failures.length, 7);
  assert.ok(result.failures.every(failure => failure !== 'unexpected-pass'));
});

test('real local jobs obey concurrency and affinity while reporting queue wait', () => {
  const result = runPython(`budget['cpu_count']=2
commands=[{'id':'job'+str(i),'args':[sys.executable,'-c','import os,time; assert len(os.sched_getaffinity(0))==2;time.sleep(0.35)']} for i in range(4)]
print(json.dumps(s.run_batch(commands,root=root,budget=budget,concurrency=2)))`);
  assert.equal(result.ok, true);
  assert.equal(result.max_active_jobs, 2);
  assert.equal(result.jobs.length, 4);
  assert.ok(result.jobs[2].queue_wait_seconds >= 0.3);
  assert.ok(result.peak_sampled_process_tree_rss_bytes > 0);
  assert.ok(result.jobs.every(job => job.return_code === 0 && job.live_descendants_after_exit === 0));
  assert.equal(result.owned_live_processes_after_cleanup, 0);
  assert.equal(result.active_transcodes_peak, 0);
  assert.ok(['observed_v2_root_files', 'quota_unknown_not_exposed', 'quota_unknown_nested_root_only'].includes(result.host.cgroup.status));
});

test('completed empty groups are retired before a later launch failure and PID reuse', () => {
  const result = runPython(`original=s.subprocess.Popen
leaders=[];killed=[];reused=False
def launch(*args,**kwargs):
 global reused
 if leaders:
  reused=True
  raise OSError('mock_second_launch_failed')
 process=original(*args,**kwargs);leaders.append(process.pid);return process
original_processes=s._processes
def processes():
 if reused:return [{'pid':leaders[0],'group':leaders[0],'session':leaders[0],'state':'S','start_ticks':999999999}]
 return original_processes()
s.subprocess.Popen=launch;s._processes=processes
s._kill_group=lambda leader,sig:killed.append(leader)
try:s.run_batch([{'id':str(i),'args':[sys.executable,'-c','pass']} for i in range(2)],root=root,budget=budget)
except OSError as error:failure=str(error)
print(json.dumps({'failure':failure,'killed':killed}))`);
  assert.equal(result.failure, 'mock_second_launch_failed');
  assert.deepEqual(result.killed, []);
});

test('root cgroup files cannot qualify a nested worker effective limit', () => {
  const result = runPython(`original=s._read
values={'/proc/self/cgroup':'0::/nested/worker','/sys/fs/cgroup/memory.max':'1','/sys/fs/cgroup/memory.current':'0','/sys/fs/cgroup/cpu.max':'1000 100000'}
s._read=lambda path:values.get(path,original(path))
print(json.dumps(s.collect_host(root)))`);
  assert.equal(result.cgroup.status, 'quota_unknown_nested_root_only');
  assert.equal(result.cgroup.nested_effective_limit_unresolved, true);
  assert.equal(result.cgroup.cpu_quota_cores, null);
  assert.ok(result.memory_available_bytes > 1);
});

test('unexpected failure stops queued admission; an explicitly expected failure is retained', () => {
  const result = runPython(`commands=[{'id':'bad','args':[sys.executable,'-c','raise SystemExit(7)']},
{'id':'never','args':[sys.executable,'-c','raise SystemExit(0)']}]
failed=s.run_batch(commands,root=root,budget=budget)
expected=s.run_batch([{**commands[0],'expected_exit':[7]}],root=root,budget=budget)
print(json.dumps({'failed':failed,'expected':expected}))`);
  assert.equal(result.failed.ok, false);
  assert.equal(result.failed.failure, 'unexpected_exit:bad');
  assert.equal(result.failed.jobs[1].status, 'not_started');
  assert.equal(result.expected.ok, true);
  assert.equal(result.expected.jobs[0].return_code, 7);
});

test('deadline kills and reaps the owned process tree', () => {
  const result = runPython(`budget['wall_seconds']=1
code="import subprocess,sys,time;subprocess.Popen([sys.executable,'-c','import time;time.sleep(10)']);time.sleep(10)"
print(json.dumps(s.run_batch([{'id':'deadline','args':[sys.executable,'-c',code]}],root=root,budget=budget)))`);
  assert.equal(result.ok, false);
  assert.equal(result.failure, 'wall_deadline_exceeded');
  assert.equal(result.owned_live_processes_after_cleanup, 0);
  assert.equal(result.jobs[0].supervisor_cleanup_performed, true);
  assert.ok(result.wall_seconds < 4);
});

test('sampled memory and actual scratch bytes independently stop bounded test jobs', () => {
  const result = runPython(`memory=s.run_batch([{'id':'memory','args':[sys.executable,'-c',"import time;x=bytearray(320*1024*1024);time.sleep(10)"]}],root=root,budget=budget)
disk=s.run_batch([{'id':'disk','args':[sys.executable,'-c',"import pathlib,time;pathlib.Path('bytes').write_bytes(b'x'*(2*1024*1024));time.sleep(10)"]}],root=root,budget={**budget,'disk_mib':1})
print(json.dumps({'memory':memory,'disk':disk}))`);
  assert.equal(result.memory.failure, 'sampled_memory_budget_exceeded');
  assert.equal(result.memory.owned_live_processes_after_cleanup, 0);
  assert.equal(result.disk.failure, 'scratch_disk_budget_exceeded');
  assert.equal(result.disk.owned_live_processes_after_cleanup, 0);
});

test('a root exiting with a live child fails rather than crediting supervisor cleanup', () => {
  const result = runPython(`code="import subprocess,sys;subprocess.Popen([sys.executable,'-c','import time;time.sleep(10)'])"
print(json.dumps(s.run_batch([{'id':'leftover','args':[sys.executable,'-c',code]}],root=root,budget=budget)))`);
  assert.equal(result.ok, false);
  assert.equal(result.failure, 'descendants_left_after_exit:leftover');
  assert.ok(result.jobs[0].live_descendants_after_exit >= 1);
  assert.equal(result.jobs[0].supervisor_cleanup_performed, true);
  assert.equal(result.owned_live_processes_after_cleanup, 0);
});

test('cancellation waits for actual tiny FFmpeg transcode and distinguishes clean child retirement', () => {
  const result = runPython(`code="""import subprocess,signal,sys
p=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-re','-f','lavfi','-i','color=size=16x16:rate=10','-t','10','-filter_complex','[0:v]null[out]','-map','[out]','-f','null','-'])
def stop(*args):
 p.kill()
signal.signal(signal.SIGUSR1,stop)
p.wait()
"""
print(json.dumps(s.run_batch([{'id':'cancel','args':[sys.executable,'-c',code]}],root=root,budget=budget,cancel_job='cancel'))) `);
  assert.equal(result.ok, true);
  assert.equal(result.active_transcodes_peak, 1);
  assert.equal(result.jobs[0].cancel_signal_sent, true);
  assert.equal(result.jobs[0].live_descendants_after_exit, 0);
  assert.equal(result.jobs[0].supervisor_cleanup_performed, false);
  assert.equal(result.owned_live_processes_after_cleanup, 0);
});
