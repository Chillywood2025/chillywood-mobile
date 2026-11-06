#!/usr/bin/env node
// Local preparation/readback only. Never invokes a deployment or provider.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export const manifest=Object.freeze(JSON.parse(fs.readFileSync(new URL('./manifest.json',import.meta.url),'utf8')));
const NAMES=Object.freeze(['create-creator-tip-checkout','creator-cashout-webhook','creator-cashout-worker',
  'sandbox-creator-cashout-webhook','sandbox-creator-cashout','stripe-connect-account',
  'stripe-connect-onboarding-link','stripe-merch-checkout']);
const JWT=Object.freeze([true,false,true,false,true,false,false,false]);
const requireThat=(ok,code)=>{if(!ok)throw Error(code);};
const sha256=value=>createHash('sha256').update(value).digest('hex');
const ordered=files=>[...files].sort((a,b)=>a.path.localeCompare(b.path,'en'));

function endpoint(name){
  requireThat(manifest.schema===1&&manifest.project==='bmkkhihfbmsnnmcqkoly'
    &&manifest.applicationSource==='abed523a21535d7854b3dbad51f1aa8b70bdb17d'
    &&manifest.applicationTree==='808ba06732ae32caac4276465df269ae7a75015a'
    &&JSON.stringify(manifest.endpoints.map(e=>e.name))===JSON.stringify(NAMES)
    &&manifest.endpoints.every((e,i)=>e.verifyJwt===JWT[i]),'EDGE_MANIFEST_SCOPE_INVALID');
  const entry=manifest.endpoints.find(e=>e.name===name);
  requireThat(entry,'EDGE_TARGET_NOT_AUTHORIZED');return entry;
}

function filesFromCapture(captured,entry){
  requireThat(captured&&captured.name===entry.name&&captured.slug===entry.name
    &&captured.id===entry.functionId&&captured.status==='ACTIVE'
    &&Number.isInteger(captured.version)&&captured.version>=entry.baselineVersion
    &&captured.verify_jwt===entry.verifyJwt&&captured.import_map===false
    &&Array.isArray(captured.files),'EDGE_BASELINE_IDENTITY_MISMATCH');
  const names=new Set();
  const files=captured.files.map(file=>{
    requireThat(typeof file.name==='string'&&typeof file.content==='string'
      &&/^(?:supabase\/)?functions\/[A-Za-z0-9_./-]+$/.test(file.name)
      &&!file.name.split('/').some(p=>!p||p==='.'||p==='..'),'EDGE_CAPTURE_PATH_INVALID');
    const name=file.name.startsWith('supabase/')?file.name:'supabase/'+file.name;
    requireThat(!names.has(name),'EDGE_CAPTURE_DUPLICATE');names.add(name);
    return {path:name,sha256:sha256(file.content)};
  });
  const expected=`functions/${entry.name}/index.ts`;
  const matches=captured.files.filter(file=>file.name.endsWith(expected)
    &&(captured.entrypoint_path===file.name||captured.entrypoint_path?.endsWith('/'+file.name)));
  requireThat(matches.length===1,'EDGE_CAPTURE_ENTRYPOINT_MISMATCH');
  return ordered(files);
}

/** A fresh canonical get_edge_function capture is required before every write.
 * An unknown deployment outcome is reconciled with this classifier, never retried. */
export function classifyCapture(name,captured){
  const entry=endpoint(name),files=filesFromCapture(captured,entry);
  if(captured.version>entry.baselineVersion
    &&JSON.stringify(files)===JSON.stringify(ordered(entry.sourceFiles)))return 'already_applied_verified';
  requireThat(captured.version===entry.baselineVersion
    &&JSON.stringify(files)===JSON.stringify(ordered(entry.baselineFiles)),'EDGE_BASELINE_SOURCE_MISMATCH');
  return 'ready';
}

/** Emits arguments for the canonical deploy_edge_function tool. No transport.
 * Database cutover must separately be applied and verified before invoking it. */
export async function prepare(name,captured,readSource){
  const entry=endpoint(name);
  requireThat(classifyCapture(name,captured)==='ready','EDGE_ALREADY_APPLIED');
  const {collectSourceBundle}=await import('../creator-backend-rollout/prepare-edge.mjs');
  const entrypoint=`supabase/functions/${name}/index.ts`;
  const bundle=collectSourceBundle(readSource,entrypoint);
  requireThat(!bundle.import_map_path,'EDGE_IMPORT_MAP_CHANGE_FORBIDDEN');
  requireThat(JSON.stringify(ordered(bundle.files.map(f=>({path:f.name,sha256:sha256(f.content)}))))
    ===JSON.stringify(ordered(entry.sourceFiles)),'EDGE_SOURCE_CLOSURE_MISMATCH');
  return {name,project_id:manifest.project,verify_jwt:entry.verifyJwt,
    entrypoint_path:entrypoint,files:bundle.files};
}

async function main(){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help'){
    console.log('Usage: node ops/automatic-commerce-edge/prepare.mjs --source FULL_REVIEWED_COMMIT_SHA --function NAME --capture FILE [--readback]\nLocal only. Requires committed clean exact tooling and the PR683 application bytes. Does not deploy, activate, change JWT, or call any provider.');return;
  }
  const values={};let readback=false;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--readback'){requireThat(!readback,'EDGE_ARGUMENT_INVALID');readback=true;continue;}
    requireThat(['--source','--function','--capture'].includes(args[i])&&!values[args[i]]&&args[i+1],'EDGE_ARGUMENT_INVALID');
    values[args[i]]=args[++i];
  }
  requireThat(Object.keys(values).length===3,'EDGE_ARGUMENT_INVALID');
  const source=values['--source'];requireThat(/^[a-f0-9]{40}$/.test(source??''),'EDGE_EXACT_SOURCE_REQUIRED');
  const git=(...args)=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  requireThat(git('rev-parse','HEAD')===source,'EDGE_SOURCE_HEAD_MISMATCH');
  requireThat(git('status','--porcelain','--untracked-files=normal','--','ops/automatic-commerce-edge','ops/creator-backend-rollout/prepare-edge.mjs','supabase/functions','package.json','package-lock.json')==='','EDGE_TRACKED_SOURCE_DIRTY');
  // Git status can hide assume-unchanged/skip-worktree edits. Compare executable
  // inputs directly with the immutable object, without trusting the imported
  // helper's reader to validate that helper itself.
  for(const relative of ['ops/automatic-commerce-edge/prepare.mjs','ops/automatic-commerce-edge/manifest.json',
    'ops/creator-backend-rollout/prepare-edge.mjs','package.json','package-lock.json']){
    const committed=execFileSync('git',['show',`${source}:${relative}`],{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe']});
    requireThat(committed===fs.readFileSync(path.join(ROOT,relative),'utf8'),'EDGE_TOOL_NOT_COMMITTED');
  }
  // No repository helper executes until its own committed bytes are verified.
  const {gitReader}=await import('../creator-backend-rollout/prepare-edge.mjs');
  const readSource=gitReader(ROOT,source);
  const capture=JSON.parse(fs.readFileSync(values['--capture'],'utf8'));
  const name=values['--function'];
  process.stdout.write(JSON.stringify(readback?{name,status:classifyCapture(name,capture)}:await prepare(name,capture,readSource))+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{console.error(/^EDGE_[A-Z_]+$/.test(error?.message??'')?error.message:'EDGE_PREPARATION_BLOCKED');process.exitCode=1;});
}
