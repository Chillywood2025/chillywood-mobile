// Disposable loopback-only cluster. Some cloud workspaces prohibit Unix socket
// creation. No remote database URL, provider configuration or reusable database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

export async function createNativeAuthoringCluster(bin){
 assert.ok(path.isAbsolute(bin));
 const port=await new Promise((resolve,reject)=>{const socket=createServer();socket.once('error',reject);
  socket.listen(0,'127.0.0.1',()=>{const value=socket.address().port;socket.close(error=>error?reject(error):resolve(String(value)));});});
 const work=fs.mkdtempSync(path.join(os.tmpdir(),'native-authoring-')),data=path.join(work,'data'),db='authoring_'+randomUUID().replaceAll('-','');
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')));
 const args=database=>['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','postgres','-d',database];
 const run=(tool,argv,input)=>spawnSync(path.join(bin,tool),argv,{env,input,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});
 const invoke=(tool,argv,input)=>{const r=run(tool,argv,input);assert.equal(r.status,0,(r.stderr||r.error?.message||'').slice(-8192));return r.stdout.trim();};
 const q=sql=>invoke('psql',args(db),sql),sessions=new Set();let initialized=false,started=false;
 const cleanup={sessionsClosed:false,clusterStopped:false,clusterNotRunningVerified:false,directoryRemoved:false};
 return{q,cleanup,
  start(sql){assert.match(invoke('postgres',['--version']),/PostgreSQL\) 17\.6/u);
   invoke('initdb',['-D',data,'-U','postgres','--encoding=UTF8','--no-locale','--auth=trust']);initialized=true;
   invoke('pg_ctl',['-D',data,'-w','-t','15','-l',path.join(work,'server.log'),'-o',`-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port} -c autovacuum=off`,'start']);started=true;
   invoke('psql',args('postgres'),`create database ${db};`);q(sql);
   assert.equal(q("select current_setting('listen_addresses')='127.0.0.1' and current_setting('unix_socket_directories')='';"),'t');
  },
  rejects(sql,pattern){const r=run('psql',args(db),sql);assert.notEqual(r.status,0);assert.match(r.stderr,pattern);},
  async held(sql){const child=spawn(path.join(bin,'psql'),args(db),{env,stdio:['pipe','pipe','pipe']});sessions.add(child);let stdout='',stderr='';
   child.stdout.on('data',x=>{stdout+=x;});child.stderr.on('data',x=>{stderr+=x;});child.stdin.on('error',()=>{});
   const done=new Promise(resolve=>child.once('close',code=>{sessions.delete(child);resolve({code,stderr});}));
   child.stdin.write("set idle_in_transaction_session_timeout='15s';\n"+sql+"\nselect 'native_authoring_ready';\n");
   const deadline=Date.now()+2500;while(!stdout.includes('native_authoring_ready')&&child.exitCode===null&&Date.now()<deadline)await delay(10);
   assert.ok(stdout.includes('native_authoring_ready'),stderr);
   return{async finish(ending){child.stdin.end(ending+';\n');const result=await done;assert.equal(result.code,0,result.stderr);}};
  },
  captureFailure(){},
  diagnostics(primary,secondary){return{primary:String(primary),secondary:String(secondary),started,initialized,cleanup,
   serverLog:fs.existsSync(path.join(work,'server.log'))?fs.readFileSync(path.join(work,'server.log'),'utf8').slice(-8192):null};},
  async close(){const exits=[...sessions].map(child=>new Promise(resolve=>{child.once('close',resolve);child.kill('SIGTERM');}));await Promise.all(exits);cleanup.sessionsClosed=true;
   if(initialized){const status=run('pg_ctl',['-D',data,'status']);
    if(status.status===0){invoke('pg_ctl',['-D',data,'-m','immediate','-w','-t','15','stop']);cleanup.clusterStopped=true;}
    else assert.equal(status.status,3,'Unknown cluster state; retained '+work);
    assert.equal(run('pg_ctl',['-D',data,'status']).status,3);cleanup.clusterNotRunningVerified=true;
   }
   fs.rmSync(work,{recursive:true});cleanup.directoryRemoved=true;
  },
 };
}
