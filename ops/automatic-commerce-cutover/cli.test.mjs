import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';

for(const flag of ['--skip-worktree','--assume-unchanged'])test(`rejects hidden helper mutation before importing it (${flag})`,()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cutover-source-boundary-'));
 try {
  const directory=path.join(root,'ops/automatic-commerce-cutover');fs.mkdirSync(directory,{recursive:true});
  fs.copyFileSync(new URL('./cli.mjs',import.meta.url),path.join(directory,'cli.mjs'));
  fs.writeFileSync(path.join(directory,'prepare.mjs'),"import './bridge.mjs';export function prepareArguments(){return {fixture:true,query:'select 1;'};}\n");
  fs.writeFileSync(path.join(directory,'bridge.mjs'),'export const fixture=true;\n');
  fs.writeFileSync(path.join(directory,'catalog.mjs'),'export const fixture=true;\n');
  fs.writeFileSync(path.join(directory,'contract.json'),'{}\n');
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','--quiet');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','Synthetic source boundary fixture');
  const head=git('rev-parse','HEAD'),command=[path.join(directory,'cli.mjs'),'readback',head,'unused-fixture-capture.json'];
  const before=spawnSync(process.execPath,command,{encoding:'utf8'});assert.equal(before.status,0,before.stderr);assert.equal(JSON.parse(before.stdout).fixture,true);
  git('update-index',flag,'ops/automatic-commerce-cutover/bridge.mjs');
  fs.writeFileSync(path.join(directory,'bridge.mjs'),"throw Error('UNVERIFIED_HELPER_EXECUTED');\n");
  assert.equal(git('status','--porcelain'),'','fixture must really hide the mutation from status');
  const after=spawnSync(process.execPath,command,{encoding:'utf8'});assert.notEqual(after.status,0);
  assert.match(after.stderr,/TOOL_SOURCE_CHANGED/);assert.doesNotMatch(after.stderr,/UNVERIFIED_HELPER_EXECUTED/);assert.equal(after.stdout,'');
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
