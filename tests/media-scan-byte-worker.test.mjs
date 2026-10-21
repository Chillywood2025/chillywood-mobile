import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../ops/malware-scanner-worker/worker.mjs',import.meta.url),'utf8');
const body=source.slice(source.indexOf('async function processJob('),source.indexOf('\nfunction safeLogText'));
const job={id:'job-one',target_table:'platform_brand_assets',storage_provider:'supabase',attempt_count:2};
function fixture({beginFails=false,receiptFails=false,status='clean',downloadFails=false,completeFails=false}={}) {
 const calls=[];
 const bytes={path:'/synthetic-test-only',bytes:23,sha256:'a'.repeat(64)};
 const rpc=async(name,payload)=>{
  calls.push({name,payload});
  if(name==='begin_media_scan_byte_observation') {if(beginFails)throw Error('private');return 'observation-one';}
  if(receiptFails)throw Error('private');return 'receipt-one';
 };
 const download=async()=>{calls.push({name:'download'});if(downloadFails)throw Error('download failed');return bytes;};
 const scan=async()=>{calls.push({name:'scan'});return {status,findingName:null,output:'fixture'};};
 const complete=async(j,result)=>{calls.push({name:'complete',status:result});if(completeFails&&result==='clean')throw Error('completion failed');};
 const process=new Function('rpc','WORKER_ID','downloadSupabaseObject','downloadPrivateOriginObject','scanFile','completeJob','safeLogText','rm','console',body+';return processJob;')(
  rpc,'worker-one',download,download,scan,complete,String,async()=>{}, {warn(){},log(){},error(){}});
 return {calls,process};
}
test('actual handler persists only computed bytes after independent clean completion',async()=>{
 const f=fixture();await f.process(job);
 assert.deepEqual(f.calls.map(x=>x.name),['begin_media_scan_byte_observation','download','scan','complete','record_media_scan_byte_receipt']);
 assert.deepEqual(f.calls[0].payload,{p_job_id:'job-one',p_worker_id:'worker-one',p_attempt_count:2});
 assert.deepEqual(f.calls[4].payload,{p_observation_id:'observation-one',p_job_id:'job-one',p_worker_id:'worker-one',p_sha256:'a'.repeat(64),p_size_bytes:23});
});
for(const options of [{beginFails:true},{receiptFails:true}]) test('optional receipt errors never change clean status or retry completion: '+JSON.stringify(options),async()=>{
 const f=fixture(options);await f.process(job);
 assert.deepEqual(f.calls.filter(x=>x.name==='complete').map(x=>x.status),['clean']);
 if(options.beginFails) assert.equal(f.calls.some(x=>x.name==='record_media_scan_byte_receipt'),false);
});
for(const options of [{status:'scan_failed'},{status:'malware_detected'},{downloadFails:true},{completeFails:true}]) test('failed scan/read/completion never persists a receipt: '+JSON.stringify(options),async()=>{
 const f=fixture(options);await f.process(job);
 assert.equal(f.calls.some(x=>x.name==='record_media_scan_byte_receipt'),false);
});
test('unrelated scanner jobs remain on their original path',async()=>{
 const f=fixture();await f.process({...job,target_table:'videos'});
 assert.deepEqual(f.calls.map(x=>x.name),['download','scan','complete']);
});
