import assert from 'node:assert/strict';
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
