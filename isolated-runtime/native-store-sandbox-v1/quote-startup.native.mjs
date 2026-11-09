#!/usr/bin/env node
// Local-only regression: a separate disposable PostgreSQL owns quote's port.
// Failed startup must reveal its bounded log and never stop that other server.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import process from 'node:process';import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
assert.equal(process.argv.length,4);assert.equal(process.argv[2],'--local-bin');
const bin=process.argv[3];assert.ok(path.isAbsolute(bin));
const work=fs.mkdtempSync(path.join(os.tmpdir(),'quote-startup-proof-')),data=path.join(work,'occupant'),childTemp=path.join(work,'child');fs.mkdirSync(childTemp);
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('PG')));
const run=(tool,args)=>spawnSync(path.join(bin,tool),args,{env,encoding:'utf8',timeout:30000});
const ok=(tool,args)=>{const result=run(tool,args);assert.equal(result.status,0,result.stderr||result.error?.message);return result.stdout;};
try{
 assert.match(ok('postgres',['--version']),/PostgreSQL\) 17\.6/u);
 ok('initdb',['-D',data,'-U','postgres','--encoding=UTF8','--no-locale','--auth=trust']);
 ok('pg_ctl',['-D',data,'-w','-t','15','-l',path.join(work,'occupant.log'),'-o',"-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p 55490",'start']);
 const pid=fs.readFileSync(path.join(data,'postmaster.pid'),'utf8').split('\n')[0];
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./quote.native.mjs',import.meta.url)),'--local-bin',bin],{env:{...env,TMPDIR:childTemp},encoding:'utf8',timeout:45000,maxBuffer:1024*1024});
 assert.equal(result.error,undefined);assert.notEqual(result.status,0);assert.match(result.stderr,/quote_native_startup_server_log_tail/u);
 assert.match(result.stderr,/Address already in use|could not create any TCP\/IP sockets/u);
 assert.equal(fs.readFileSync(path.join(data,'postmaster.pid'),'utf8').split('\n')[0],pid);
 ok('pg_ctl',['-D',data,'status']);assert.deepEqual(fs.readdirSync(childTemp),[]);
 console.log(JSON.stringify({protocol:'native-store-quote-startup-proof-v1',cases:1,passed:1,unrelatedServerPreserved:true}));
}finally{
 if(run('pg_ctl',['-D',data,'status']).status===0)ok('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
 if(fs.existsSync(path.join(data,'postmaster.pid')))throw Error('Retained owned fixture cluster: '+work);
 fs.rmSync(work,{recursive:true,force:true});
}
