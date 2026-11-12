import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {manifest,prepare,classifyCapture} from './prepare.mjs';
import {sha256} from '../creator-backend-rollout/prepare-edge.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const fixture=JSON.parse(fs.readFileSync(path.join(ROOT,'tests/fixtures/automatic-commerce-edge/baseline.json'),'utf8'));
const application=JSON.parse(fs.readFileSync(path.join(ROOT,'tests/fixtures/automatic-commerce-edge/application-source.json'),'utf8'));
const read=p=>Object.hasOwn(application.files,p)?application.files[p]:null;
const readCurrent=p=>fs.existsSync(path.join(ROOT,p))?fs.readFileSync(path.join(ROOT,p),'utf8'):null;
const capture=(entry,final=false)=>({id:entry.functionId,slug:entry.name,name:entry.name,status:'ACTIVE',
  version:entry.baselineVersion+(final?1:0),verify_jwt:entry.verifyJwt,import_map:false,
  entrypoint_path:`/tmp/captured/source/supabase/functions/${entry.name}/index.ts`,
  files:(final?entry.sourceFiles:entry.baselineFiles).map(f=>({name:f.path.slice('supabase/'.length),
    content:final?read(f.path):fixture.files[f.path]}))});

test('fixture binds exact observed pre-PR source without a Git-history or provider dependency',()=>{
  assert.equal(application.schema,1);assert.equal(application.source,manifest.applicationSource);assert.equal(application.tree,manifest.applicationTree);
  assert.deepEqual(Object.keys(application.files).sort(),[...new Set(manifest.endpoints.flatMap(e=>e.sourceFiles.map(f=>f.path)))].sort());
  for(const entry of manifest.endpoints)for(const file of entry.sourceFiles)
    assert.equal(sha256(read(file.path)),file.sha256,file.path);
  assert.equal(fixture.schema,1);assert.equal(fixture.source,manifest.baselineSource);
  assert.deepEqual(Object.keys(fixture.files).sort(),[...new Set(manifest.endpoints.flatMap(e=>e.baselineFiles.map(f=>f.path)))].sort());
  for(const entry of manifest.endpoints)for(const file of entry.baselineFiles)
    assert.equal(sha256(fixture.files[file.path]),file.sha256,file.path);
});

for(const entry of manifest.endpoints){
  test(`${entry.name}: prepare complete immutable closure with existing JWT policy`,async()=>{
    const before=capture(entry);assert.equal(classifyCapture(entry.name,before),'ready');
    const args=await prepare(entry.name,before,read);
    assert.deepEqual(Object.keys(args).sort(),['name','project_id','verify_jwt','entrypoint_path','files'].sort());
    assert.equal(args.project_id,'bmkkhihfbmsnnmcqkoly');assert.equal(args.verify_jwt,entry.verifyJwt);
    assert.equal(args.entrypoint_path,`supabase/functions/${entry.name}/index.ts`);
    assert.deepEqual(args.files.map(f=>({path:f.name,sha256:sha256(f.content)})),entry.sourceFiles);
  });
  test(`${entry.name}: exact current readback reconciles an unknown deployment without resend`,async()=>{
    const after=capture(entry,true);assert.equal(classifyCapture(entry.name,after),'already_applied_verified');
    await assert.rejects(()=>prepare(entry.name,after,read),/EDGE_ALREADY_APPLIED/);
    after.files[0].content+='\n';assert.throws(()=>classifyCapture(entry.name,after),/EDGE_BASELINE_SOURCE_MISMATCH/);
  });
}

test('baseline mutations reject after a genuine passing baseline',()=>{
  const entry=manifest.endpoints[0];assert.equal(classifyCapture(entry.name,capture(entry)),'ready');
  const mutations=[
    [x=>x.id='different','EDGE_BASELINE_IDENTITY_MISMATCH'],
    [x=>x.name='different','EDGE_BASELINE_IDENTITY_MISMATCH'],
    [x=>x.slug='different','EDGE_BASELINE_IDENTITY_MISMATCH'],
    [x=>x.status='INACTIVE','EDGE_BASELINE_IDENTITY_MISMATCH'],
    [x=>x.verify_jwt=!x.verify_jwt,'EDGE_BASELINE_IDENTITY_MISMATCH'],
    [x=>x.import_map=true,'EDGE_BASELINE_IDENTITY_MISMATCH'],
    [x=>x.version--,'EDGE_BASELINE_IDENTITY_MISMATCH'],
    [x=>x.version++,'EDGE_BASELINE_SOURCE_MISMATCH'],
    [x=>x.files[0].content+='\n','EDGE_BASELINE_SOURCE_MISMATCH'],
    [x=>x.files.pop(),'EDGE_CAPTURE_ENTRYPOINT_MISMATCH'],
    [x=>x.files.push({...x.files[0]}),'EDGE_CAPTURE_DUPLICATE'],
    [x=>x.files[0].name='functions/../secret','EDGE_CAPTURE_PATH_INVALID'],
    [x=>x.files[0].name='/functions/x','EDGE_CAPTURE_PATH_INVALID'],
    [x=>x.entrypoint_path='/tmp/wrong.ts','EDGE_CAPTURE_ENTRYPOINT_MISMATCH'],
  ];
  for(const [mutate,code] of mutations){const candidate=capture(entry);mutate(candidate);
    assert.throws(()=>classifyCapture(entry.name,candidate),error=>error.message===code,code);}
});

test('modified or additional application source cannot be prepared',async()=>{
  const entry=manifest.endpoints[0],before=capture(entry);
  assert.ok(await prepare(entry.name,before,read));
  const changed=manifest.endpoints.find(e=>e.sourceFiles.some(f=>f.path==='supabase/functions/_shared/creator-cashout-execution.ts'));
  assert.ok(changed);
  assert.notEqual(sha256(readCurrent('supabase/functions/_shared/creator-cashout-execution.ts')),sha256(read('supabase/functions/_shared/creator-cashout-execution.ts')));
  await assert.rejects(()=>prepare(changed.name,capture(changed),readCurrent),/EDGE_SOURCE_CLOSURE_MISMATCH/);
  await assert.rejects(()=>prepare(entry.name,before,p=>p.endsWith('/index.ts')?read(p)+'\n':read(p)),/EDGE_SOURCE_CLOSURE_MISMATCH/);
  await assert.rejects(()=>prepare(entry.name,before,p=>p==='supabase/functions/deno.json'?'{}':read(p)),/EDGE_SOURCE_CLOSURE_MISMATCH/);
  await assert.rejects(()=>prepare('creator-provider-observation-worker',before,read),/EDGE_TARGET_NOT_AUTHORIZED/);
  await assert.rejects(()=>prepare('revenuecat-webhook',before,read),/EDGE_TARGET_NOT_AUTHORIZED/);
});

test('CLI rejects hidden tooling mutations before executing an unverified helper',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'automatic-edge-cli-'));
  const tooling=['ops/automatic-commerce-edge/prepare.mjs','ops/automatic-commerce-edge/manifest.json',
    'ops/creator-backend-rollout/prepare-edge.mjs','package.json','package-lock.json'];
  const files=[...new Set([...tooling,...manifest.endpoints.flatMap(e=>e.sourceFiles.map(f=>f.path))])];
  const run=(command,args)=>spawnSync(command,args,{cwd:directory,encoding:'utf8',maxBuffer:2*1024*1024});
  const git=(...args)=>{const result=run('git',args);assert.equal(result.status,0,result.stderr);return result.stdout.trim();};
  try{
    for(const file of files){fs.mkdirSync(path.dirname(path.join(directory,file)),{recursive:true});
      if(Object.hasOwn(application.files,file))fs.writeFileSync(path.join(directory,file),read(file));
      else fs.copyFileSync(path.join(ROOT,file),path.join(directory,file));}
    fs.symlinkSync(path.join(ROOT,'node_modules'),path.join(directory,'node_modules'),'dir');
    git('init','-q');git('add','--',...files);
    git('-c','user.name=Local fixture','-c','user.email=fixture@example.invalid','-c','core.hooksPath=/dev/null',
      'commit','-qm','Synthetic local Edge preparation fixture');
    const source=git('rev-parse','HEAD'),entry=manifest.endpoints[0],captureFile=path.join(directory,'capture.json');
    fs.writeFileSync(captureFile,JSON.stringify(capture(entry)));
    const args=['ops/automatic-commerce-edge/prepare.mjs','--source',source,'--function',entry.name,'--capture',captureFile];
    const before=run(process.execPath,args);assert.equal(before.status,0,before.stderr);
    assert.equal(JSON.parse(before.stdout).files.length,entry.sourceFiles.length);
    for(const file of tooling){
      const target=path.join(directory,file),original=fs.readFileSync(target,'utf8');
      git('update-index','--skip-worktree',file);
      fs.writeFileSync(target,original+(file==='ops/creator-backend-rollout/prepare-edge.mjs'
        ?'\nthrow new Error("UNVERIFIED_HELPER_EXECUTED");\n':'\n'));
      assert.equal(git('status','--porcelain','--',file),'','mutation is hidden from status');
      const rejected=run(process.execPath,args);
      assert.equal(rejected.status,1,file);assert.equal(rejected.stderr.trim(),'EDGE_TOOL_NOT_COMMITTED',file);
      assert.equal(rejected.stdout,'','no deployment arguments escape');
      fs.writeFileSync(target,original);git('update-index','--no-skip-worktree',file);
    }
    const restored=run(process.execPath,args);assert.equal(restored.status,0,restored.stderr);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
