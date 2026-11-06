// Sequential SQL transport for actual native runner setup excerpts. This is
// NOT a PostgreSQL backend/concurrency simulator and never receives a URL.
import {parentPort,workerData} from 'node:worker_threads';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {createDatabase} from './database-runtime-authority-fixture.mjs';

const control=new Int32Array(workerData.control),bytes=new Uint8Array(workerData.bytes);
const encode=new TextEncoder();
let db;
function reply(value){
 const output=encode.encode(JSON.stringify(value));
 if(output.length>bytes.length)throw Error('native_setup_preflight_response_too_large');
 bytes.set(output);Atomics.store(control,1,output.length);Atomics.store(control,0,1);Atomics.notify(control,0);
}
const failure=error=>({error:{message:error.message,code:error.code,where:error.where}});
try{
 if(workerData.snapshot){
  db=new PGlite({loadDataDir:workerData.snapshot,extensions:{pgcrypto,pg_trgm}});await db.waitReady;
 }else{
  ({db}=await createDatabase());const snapshot=await db.dumpDataDir();
  workerData.snapshotPort.postMessage({snapshot});workerData.snapshotPort.close();
 }
 reply({ready:true});
}catch(error){reply(failure(error));parentPort.close();throw error;}
parentPort.on('message',async({action,sql})=>{
 try{
  if(action==='close'){await db.close();reply({closed:true});parentPort.close();return;}
  if(action!=='query'||typeof sql!=='string')throw Error('invalid_sequential_setup_operation');
  // Every native query() starts a new psql connection. A persistent WASM
  // connection must not accidentally carry previous claims, roles or headers.
  await db.exec(`rollback;reset role;set time zone 'UTC';set statement_timeout='20s';
   select set_config('request.jwt.claims','{}',false),set_config('request.jwt.claim.role','',false),
    set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.session_id','',false),set_config('request.headers','{}',false);`);
  const rows=await db.exec(sql);
  const output=rows.flatMap(result=>result.rows.map(row=>Object.values(row).map(value=>
   value===null?'':typeof value==='boolean'?(value?'t':'f'):typeof value==='object'?JSON.stringify(value):String(value)).join('|'))).join('\n');
  // Native psql closes after a batch, rolling back any unfinished transaction.
  await db.exec('rollback');reply({output});
 }catch(error){try{await db.exec('rollback');}catch{}reply(failure(error));}
});
