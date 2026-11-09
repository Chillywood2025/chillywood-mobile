import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const script=path.join(root,'scripts/guard-android-signing-secret-policy.mjs');
const fixtures=['local-auth-paid-video-retained','local-auth-paid-video-retained-platform-v1','local-auth-paid-video-retained-platform-v2']
  .map(name=>`isolated-runtime/sandbox-commerce-v1/tests/${name}/deno.lock`);
const approved=fs.readFileSync(path.join(root,fixtures[0]));
function repository(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'signing-guard-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd:dir,stdio:['ignore','pipe','pipe']});git('init','-q');
  for(const name of ['.gitignore','.easignore'])fs.copyFileSync(path.join(root,name),path.join(dir,name));
  const write=(file,bytes=approved)=>{fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),bytes);};
  const stage=file=>git('add','-f','--',file);
  const check=()=>spawnSync(process.execPath,[script],{cwd:dir,encoding:'utf8'});
  return {dir,git,write,stage,check};
}
const rejects=r=>{const result=r.check();assert.notEqual(result.status,0);assert.match(result.stderr,/Signing\/private credential material|Environment credential material/u);};
test('all three exact public dependency fixtures pass tracked and staged checks',t=>{
  const r=repository(t);for(const file of fixtures){r.write(file);r.stage(file);}const result=r.check();assert.equal(result.status,0,result.stderr);
});
test('changed worktree lock bytes cannot use approved path',t=>{
  const r=repository(t);r.write(fixtures[0]);r.stage(fixtures[0]);r.write(fixtures[0],Buffer.concat([approved,Buffer.from('\n')]));rejects(r);
});
test('safe worktree cannot conceal a modified staged Git blob',t=>{
  const r=repository(t);r.write(fixtures[0],'unapproved staged bytes');r.stage(fixtures[0]);r.write(fixtures[0]);rejects(r);
});
for(const file of ['deno.lock','nested/deno.lock'])test(`unlisted public lock remains rejected: ${file}`,t=>{
  const r=repository(t);r.write(file);r.stage(file);rejects(r);
});
test('worktree symlink to approved bytes remains rejected',t=>{
  const r=repository(t);r.write(fixtures[0]);r.stage(fixtures[0]);r.write('public-copy',approved);
  fs.unlinkSync(path.join(r.dir,fixtures[0]));fs.symlinkSync(path.join(r.dir,'public-copy'),path.join(r.dir,fixtures[0]));rejects(r);
});
test('staged symlink cannot be hidden by regular approved worktree bytes',t=>{
  const r=repository(t);r.write('public-copy',approved);r.write(fixtures[0]);fs.unlinkSync(path.join(r.dir,fixtures[0]));
  fs.symlinkSync(path.join(r.dir,'public-copy'),path.join(r.dir,fixtures[0]));r.stage(fixtures[0]);fs.unlinkSync(path.join(r.dir,fixtures[0]));r.write(fixtures[0]);rejects(r);
});
test('executable index mode is not an approved public fixture',t=>{
  const r=repository(t);r.write(fixtures[0]);r.stage(fixtures[0]);r.git('update-index','--chmod=+x','--',fixtures[0]);rejects(r);
});
for(const file of ['credentials.json','release.keystore','.env.production'])test(`credential protections remain intact: ${file}`,t=>{
  const r=repository(t);r.write(file,approved);r.stage(file);rejects(r);
});

test('Git replacement objects cannot disguise unapproved staged bytes',t=>{
  const r=repository(t);r.write(fixtures[0],'unapproved staged bytes');r.stage(fixtures[0]);
  const bad=r.git('rev-parse',':'+fixtures[0]).toString().trim();r.write(fixtures[0]);
  const good=r.git('hash-object','-w','--',fixtures[0]).toString().trim();r.git('replace',bad,good);rejects(r);
});

const nativeLock='supabase/functions/native-store-sandbox-command-v1/deno.lock';
const nativeBytes=fs.readFileSync(path.join(root,nativeLock));
test('exact native endpoint public lock passes tracked and staged checks',t=>{
 const r=repository(t);r.write(nativeLock,nativeBytes);r.stage(nativeLock);const result=r.check();assert.equal(result.status,0,result.stderr);
});
test('native endpoint working bytes cannot substitute for its exact public lock',t=>{
 const r=repository(t);r.write(nativeLock,nativeBytes);r.stage(nativeLock);r.write(nativeLock,Buffer.concat([nativeBytes,Buffer.from('\n')]));rejects(r);
});
test('native endpoint safe working bytes cannot conceal substituted staged bytes',t=>{
 const r=repository(t);r.write(nativeLock,'unapproved staged native lock');r.stage(nativeLock);r.write(nativeLock,nativeBytes);rejects(r);
});
for(const file of ['deno.lock','supabase/functions/unlisted/deno.lock'])test(`native lock bytes do not authorize unlisted path: ${file}`,t=>{
 const r=repository(t);r.write(file,nativeBytes);r.stage(file);rejects(r);
});
test('approved locks cannot exchange their distinct path-specific digests',t=>{
 const r=repository(t);r.write(nativeLock,approved);r.stage(nativeLock);rejects(r);
 r.write(nativeLock,nativeBytes);r.stage(nativeLock);r.write(fixtures[0],nativeBytes);r.stage(fixtures[0]);rejects(r);
});
test('native endpoint lock still rejects executable index mode and symlink worktree',t=>{
 const r=repository(t);r.write(nativeLock,nativeBytes);r.stage(nativeLock);r.git('update-index','--chmod=+x','--',nativeLock);rejects(r);
 r.git('update-index','--chmod=-x','--',nativeLock);r.write('native-copy',nativeBytes);fs.unlinkSync(path.join(r.dir,nativeLock));fs.symlinkSync(path.join(r.dir,'native-copy'),path.join(r.dir,nativeLock));rejects(r);
});

const nativeRangeLock='supabase/functions/native-store-paid-video-range-v1/deno.lock';
test('native range dependency lock accepts only exact regular staged bytes',t=>{
 const r=repository(t);r.write(nativeRangeLock,nativeBytes);r.stage(nativeRangeLock);assert.equal(r.check().status,0);
 r.write(nativeRangeLock,'modified');rejects(r);
 r.stage(nativeRangeLock);r.write(nativeRangeLock,nativeBytes);rejects(r);
});
test('native range lock rejects executable and symlink representations',t=>{
 const r=repository(t);r.write(nativeRangeLock,nativeBytes);r.stage(nativeRangeLock);r.git('update-index','--chmod=+x','--',nativeRangeLock);rejects(r);
 r.git('update-index','--chmod=-x','--',nativeRangeLock);r.write('range-copy',nativeBytes);fs.unlinkSync(path.join(r.dir,nativeRangeLock));fs.symlinkSync(path.join(r.dir,'range-copy'),path.join(r.dir,nativeRangeLock));rejects(r);
});
for(const name of ['native-store-ingress-v1','native-store-reconcile-v1']) {
 const file=`supabase/functions/${name}/deno.lock`,bytes=fs.readFileSync(path.join(root,file));
 test(`${name} exact public lock passes`,t=>{const r=repository(t);r.write(file,bytes);r.stage(file);assert.equal(r.check().status,0);});
 test(`${name} working tamper rejected`,t=>{const r=repository(t);r.write(file,bytes);r.stage(file);r.write(file,Buffer.concat([bytes,Buffer.from('\n')]));rejects(r);});
 test(`${name} staged tamper rejected`,t=>{const r=repository(t);r.write(file,'substituted');r.stage(file);r.write(file,bytes);rejects(r);});
}
