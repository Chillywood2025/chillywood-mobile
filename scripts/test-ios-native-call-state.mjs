import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const native=join(root,'modules/chillywood-native-calls/ios');
const deadline=readFileSync(join(native,'ChillywoodIncomingCallDeadline.swift'),'utf8');
const policy=readFileSync(join(native,'ChillywoodIncomingCallStatePolicy.swift'),'utf8');
const transport=readFileSync(join(native,'ChillywoodIncomingCallStateObserver.swift'),'utf8');
const cases=readFileSync(join(root,'tests/native/ChillywoodIncomingCallStatePolicyTests.swift'),'utf8');
const transportCases=readFileSync(join(root,'tests/native/ChillywoodIncomingCallStateTransportTests.swift'),'utf8');
const compiler=process.env.CHILLYWOOD_SWIFTC || 'swiftc';
const temp=mkdtempSync(join(tmpdir(),'chilly-incoming-state-'));
assert.equal(process.argv.length,2,'unknown state-observer probe option');
function run(name,source,harness,expected=null){
  const main=join(temp,'main.swift'),executable=join(temp,name);
  writeFileSync(main,deadline+'\n'+source+'\n'+transport+'\n'+harness);
  execFileSync(compiler,['-swift-version','5',main,'-o',executable],{timeout:120000,stdio:'pipe'});
  try {
    const output=execFileSync(executable,{encoding:'utf8',timeout:20000,stdio:'pipe'});
    assert.equal(expected,null,`${name} mutation survived`);assert.match(output,/PASS \d+/);process.stdout.write(output);
  }catch(error){
    if(expected===null || error.status!==1)throw error;
    assert.equal(String(error.stderr).trim(),`FAIL: ${expected}`,`${name} failed for unrelated reason`);
    console.log(`Rejected ${name}: ${expected}`);
  }
}
function mutate(from,to){assert.equal(policy.split(from).length,2);return policy.replace(from,to);}
try {
  run('state-policy',policy,cases);run('state-transport',policy,transportCases);
  for(const [name,from,to,expected] of [
    ['owner','currentOwner == owner','true','replacement owner uuid cannot be ended'],
    ['accepted','!answered','true','local Answer wins over any older server status'],
    ['pending','!answerPending','true','local Answer wins over any older server status'],
    ['requested','!answerRequested','true','local Answer wins over any older server status'],
    ['connection','UUID(uuidString: connection) == connectionID','true','foreign or expanded frame is rejected'],
    ['sequence','sequence.doubleValue > Double(lastSequence)','sequence.doubleValue > 0','replayed sequence cannot end call'],
    ['deadline','case .wait = deadline.wakeup','case _ = deadline.wakeup','original wall deadline'],
  ])run(name,mutate(from,to),cases,expected);
}finally{rmSync(temp,{recursive:true,force:true});}
