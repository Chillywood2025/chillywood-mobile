#!/usr/bin/env node
// Linux-only bridge for ONE newly approved, temporary Supabase CLI login.
// Never searches credentials, reads keyrings, logs a token, or invokes login.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {PROJECT, VERSIONS, TOOL, sourceBinding, loadBundle} from './live-room-exact-deploy.mjs';

export const ADAPTER='scripts/live-room-temporary-cli-session.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PREFIX='chillywood-room-deploy-';
const RECEIPT='room-session.json';
const APPLY_MARKER='apply-attempt.json';
const CLI_VERSION='2.109.1';
const requireThat=(ok,code)=>{if(!ok)throw Error(code);};
const codeOf=e=>/^[A-Z_]+$/u.test(e?.message??'')?e.message:'TEMPORARY_SESSION_BLOCKED';
const flags=fs.constants;
export const PLATFORM_CA='/usr/local/share/ca-certificates/nebula-dns.crt';
const PLATFORM_CA_HASH='ab6933a81e6f0d142e6d5f58ed465589d899a523c2752055761af11d4ee38f2b';
export function verifyPlatformCA(io=fs){
  for(const directory of ['/usr','/usr/local','/usr/local/share','/usr/local/share/ca-certificates']){
    const s=io.lstatSync(directory);
    requireThat(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===65534&&(s.mode&0o7777)===0o755,'PLATFORM_CA_ANCESTRY_INVALID');
  }
  const mounts=io.readFileSync('/proc/self/mountinfo','utf8').trim().split('\n').map(line=>line.split(' '));
  const covering=mounts.filter(fields=>PLATFORM_CA===fields[4]||PLATFORM_CA.startsWith(fields[4]+'/')).sort((a,b)=>b[4].length-a[4].length);
  requireThat(covering[0]?.[4]==='/usr'&&covering[0][5].split(',').includes('ro'),'PLATFORM_CA_MOUNT_INVALID');
  const fd=io.openSync(PLATFORM_CA,flags.O_RDONLY|flags.O_NOFOLLOW);
  try{
    const s=io.fstatSync(fd);
    requireThat(s.isFile()&&s.uid===65534&&(s.mode&0o7777)===0o644&&s.size===1310,'PLATFORM_CA_FILE_INVALID');
    const bytes=io.readFileSync(fd);
    requireThat(createHash('sha256').update(bytes).digest('hex')===PLATFORM_CA_HASH,'PLATFORM_CA_HASH_INVALID');
  }finally{io.closeSync(fd);}
}
// The executor injects a new loopback proxy for each command. This trusts the
// current launch environment, not arbitrary loopback listeners or caller URLs.
// Never persist the route, inherit bypass lists, or relax destination TLS.
export function trustedProxyEnvironment(inherited=process.env,verifyTrust=verifyPlatformCA){
  const forbidden=['NODE_OPTIONS','NODE_TLS_REJECT_UNAUTHORIZED','SSL_CERT_DIR','CURL_CA_BUNDLE','SUPABASE_API_URL','SUPABASE_API_HOST','SUPABASE_CLI_BINARY_OVERRIDE'];
  requireThat(forbidden.every(k=>inherited[k]===undefined),'TRANSPORT_OVERRIDE_FORBIDDEN');
  const aliases=['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy'];
  const values=aliases.map(k=>inherited[k]);
  requireThat(values.every(v=>typeof v==='string')&&values.every(v=>v===values[0]),'PLATFORM_PROXY_ALIASES_INVALID');
  const match=/^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\/?$/u.exec(values[0]);
  requireThat(match&&Number(match[1])<=65535,'PLATFORM_PROXY_ROUTE_INVALID');
  requireThat(['NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','REQUESTS_CA_BUNDLE'].every(k=>inherited[k]===PLATFORM_CA),'PLATFORM_CA_ALIASES_INVALID');
  verifyTrust();
  return Object.freeze({HTTP_PROXY:values[0],HTTPS_PROXY:values[0],NODE_EXTRA_CA_CERTS:PLATFORM_CA,SSL_CERT_FILE:PLATFORM_CA});
}
export function requireNodeProxySupport(supported=process.allowedNodeEnvironmentFlags.has('--use-env-proxy')){
  requireThat(supported,'NODE_ENV_PROXY_UNSUPPORTED');
}
export function temporaryCliEnvironment(home,inherited=process.env){
  requireThat(sessionPath(path.basename(home))===home,'SESSION_ID_INVALID');
  return {HOME:home,SUPABASE_HOME:path.join(home,'.supabase'),SUPABASE_NO_KEYRING:'1',PATH:'/usr/local/bin:/usr/bin:/bin',LANG:'C.UTF-8',LC_ALL:'C.UTF-8',...trustedProxyEnvironment(inherited)};
}
const fdPath=(fd,name)=>`/proc/self/fd/${fd}/${name}`;
const identity=s=>({dev:String(s.dev),ino:String(s.ino)});
const sameIdentity=(s,id)=>String(s.dev)===id?.dev&&String(s.ino)===id?.ino;
const tokenFileIdentity=s=>({...identity(s),size:s.size,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs});
function existsNoFollow(file){try{fs.lstatSync(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
const privateObject=(s,directory)=>{
  requireThat(directory?s.isDirectory():s.isFile(),'SESSION_OBJECT_TYPE_INVALID');
  requireThat(s.uid===process.getuid()&&(s.mode&0o7777)===(directory?0o700:0o600),'SESSION_OBJECT_PERMISSIONS_INVALID');
  if(!directory)requireThat(s.nlink===1,'SESSION_HARDLINK_FORBIDDEN');
};
function tempRoot(){
  requireThat(process.platform==='linux'&&typeof process.getuid==='function'&&flags.O_NOFOLLOW!==undefined,'LINUX_PRIVATE_SESSION_REQUIRED');
  const root=os.tmpdir();
  // No environment-selected credential root, alternate filesystem, or symlink.
  requireThat(root==='/tmp','STANDARD_LINUX_TMP_REQUIRED');
  for(const parent of ['/',root]){
    const s=fs.lstatSync(parent);
    requireThat(s.isDirectory()&&!s.isSymbolicLink()&&[0,process.getuid()].includes(s.uid)
      &&((s.mode&0o022)===0||(parent===root&&(s.mode&0o1000)!==0)),'TMP_PARENT_INVALID');
  }
  return root;
}
function sessionPath(session){
  requireThat(/^chillywood-room-deploy-[A-Za-z0-9]{6}$/u.test(session??''),'SESSION_ID_INVALID');
  return path.join(tempRoot(),session);
}
export function verifyDeploymentSource(source,root=ROOT){
  const binding=sourceBinding(root,source);
  requireThat(execFileSync('git',['ls-files','--error-unmatch',ADAPTER],{cwd:root,encoding:'utf8',stdio:'pipe'}).trim()===ADAPTER,'ADAPTER_NOT_COMMITTED');
  loadBundle(root,source);
  return binding;
}

// Tests use synthetic source bindings and tokens in their own newly created
// directories. Runtime always obtains binding through verifyDeploymentSource.
export function createTemporarySession(binding){
  requireThat(/^[a-f0-9]{40}$/u.test(binding?.source??'')&&/^[a-f0-9]{40}$/u.test(binding?.tree??''),'SOURCE_BINDING_REQUIRED');
  const home=fs.mkdtempSync(path.join(tempRoot(),PREFIX));
  privateObject(fs.lstatSync(home),true);
  const config=path.join(home,'.supabase');fs.mkdirSync(config,{mode:0o700});privateObject(fs.lstatSync(config),true);
  requireThat(!existsNoFollow(path.join(config,'access-token')),'TOKEN_MUST_BE_ABSENT_AT_PREPARE');
  const session=path.basename(home),createdAt=new Date().toISOString();
  const tokenName=`chillywood-room-access-${createdAt.slice(0,10).replaceAll('-','')}-once-${session.slice(PREFIX.length)}`;
  const receipt={schema:1,project:PROJECT,session,tokenName,cliVersion:CLI_VERSION,...binding,createdAt,
    tokenAbsentAtPrepare:true,homeIdentity:identity(fs.lstatSync(home)),configIdentity:identity(fs.lstatSync(config)),applyAttempted:false,cleaned:false};
  fs.writeFileSync(path.join(home,RECEIPT),JSON.stringify(receipt)+'\n',{flag:'wx',mode:0o600});
  return {status:'prepared',session,home,tokenName,cliVersion:CLI_VERSION,...binding,createdAt};
}
function openDirectory(file){const fd=fs.openSync(file,flags.O_RDONLY|flags.O_DIRECTORY|flags.O_NOFOLLOW);try{privateObject(fs.fstatSync(fd),true);return fd;}catch(e){fs.closeSync(fd);throw e;}}
function readBounded(fd,limit){
  const stat=fs.fstatSync(fd);privateObject(stat,false);requireThat(stat.size>0&&stat.size<=limit,'SESSION_FILE_SIZE_INVALID');
  const buffer=Buffer.alloc(limit+1);
  try{
    const n=fs.readSync(fd,buffer,0,buffer.length,0);requireThat(n===stat.size&&n<=limit,'SESSION_FILE_CHANGED');
    const after=fs.fstatSync(fd);privateObject(after,false);requireThat(after.size===stat.size&&after.mtimeMs===stat.mtimeMs&&after.ctimeMs===stat.ctimeMs,'SESSION_FILE_CHANGED');
    return {buffer:buffer.subarray(0,n),stat};
  }catch(e){buffer.fill(0);throw e;}
}
function openSession(session,source){
  const home=sessionPath(session),fds=[];
  try{
    const homeFd=openDirectory(home);fds.push(homeFd);
    const receiptFd=fs.openSync(fdPath(homeFd,RECEIPT),flags.O_RDWR|flags.O_NOFOLLOW|flags.O_NONBLOCK);fds.push(receiptFd);
    const {buffer}=readBounded(receiptFd,8192);let receipt;
    try{receipt=JSON.parse(buffer.toString('utf8'));}catch{throw Error('SESSION_RECEIPT_INVALID');}finally{buffer.fill(0);}
    const allowedKeys=['schema','project','session','tokenName','cliVersion','source','tree','createdAt','tokenAbsentAtPrepare','homeIdentity','configIdentity','applyAttempted','cleaned','lastRun','tokenFileIdentity','localCleanupAt'];
    requireThat(receipt&&Object.keys(receipt).every(k=>allowedKeys.includes(k)),'SESSION_RECEIPT_INVALID');
    requireThat(receipt.schema===1&&receipt.project===PROJECT&&receipt.session===session&&receipt.source===source&&/^[a-f0-9]{40}$/u.test(receipt.tree??'')&&receipt.cliVersion===CLI_VERSION&&receipt.tokenAbsentAtPrepare===true,'SESSION_BINDING_INVALID');
    requireThat(typeof receipt.createdAt==='string'&&/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/u.test(receipt.createdAt),'SESSION_RECEIPT_INVALID');
    requireThat(receipt.tokenName===`chillywood-room-access-${receipt.createdAt.slice(0,10).replaceAll('-','')}-once-${session.slice(PREFIX.length)}`,'SESSION_TOKEN_IDENTITY_INVALID');
    requireThat(typeof receipt.applyAttempted==='boolean'&&typeof receipt.cleaned==='boolean','SESSION_RECEIPT_INVALID');
    if(receipt.lastRun)requireThat(Object.keys(receipt.lastRun).every(k=>['mode','status','startedAt'].includes(k))&&['plan','apply'].includes(receipt.lastRun.mode)&&['started','plan_ready','already_applied_verified','applied_verified','apply_unconfirmed','plan_failed'].includes(receipt.lastRun.status),'SESSION_RECEIPT_INVALID');
    const configFd=openDirectory(fdPath(homeFd,'.supabase'));fds.push(configFd);
    requireThat(sameIdentity(fs.fstatSync(homeFd),receipt.homeIdentity)&&sameIdentity(fs.fstatSync(configFd),receipt.configIdentity),'SESSION_DIRECTORY_REPLACED');
    const checkPaths=()=>{
      const h=fs.lstatSync(home),c=fs.lstatSync(path.join(home,'.supabase'));privateObject(h,true);privateObject(c,true);
      requireThat(sameIdentity(h,receipt.homeIdentity)&&sameIdentity(c,receipt.configIdentity),'SESSION_DIRECTORY_REPLACED');
    };
    checkPaths();
    return {home,homeFd,configFd,receiptFd,receipt,checkPaths,close:()=>fds.reverse().forEach(fd=>fs.closeSync(fd))};
  }catch(e){fds.reverse().forEach(fd=>fs.closeSync(fd));throw e;}
}
function saveReceipt(handle){
  handle.receipt.applyAttempted ||= fs.existsSync(fdPath(handle.homeFd,APPLY_MARKER));
  const contents=JSON.stringify(handle.receipt)+'\n';requireThat(Buffer.byteLength(contents)<=8192,'SESSION_RECEIPT_TOO_LARGE');
  fs.ftruncateSync(handle.receiptFd,0);fs.writeSync(handle.receiptFd,contents,0,'utf8');fs.fsyncSync(handle.receiptFd);
}
const publicIdentity=h=>({session:h.receipt.session,tokenName:h.receipt.tokenName,source:h.receipt.source,tree:h.receipt.tree,providerRevocation:'not_performed'});
function helperProcess(file,args,options){
  return new Promise(resolve=>execFile(file,args,options,(error,stdout)=>resolve({exitCode:error?1:0,stdout})));
}
function sanitizedHelperResult(stdout,receipt){
  let result;try{result=JSON.parse(stdout);}catch{return null;}
  const statuses=['plan_ready','already_applied_verified','applied_verified','apply_unconfirmed'];
  const allowed=['project','source','tree','status','wrote','responseConfirmed','versions','historySha256'];
  if(!result||Object.keys(result).some(k=>!allowed.includes(k))||result.project!==PROJECT||result.source!==receipt.source||result.tree!==receipt.tree||!statuses.includes(result.status)||typeof result.wrote!=='boolean'||JSON.stringify(result.versions)!==JSON.stringify(VERSIONS))return null;
  if(result.responseConfirmed!==undefined&&typeof result.responseConfirmed!=='boolean')return null;
  if(result.historySha256!==undefined&&!/^[a-f0-9]{64}$/u.test(result.historySha256))return null;
  return result;
}
export async function runTemporarySession({session,source,apply=false,root=ROOT,checkSource=verifyDeploymentSource,runChild=helperProcess,launchEnvironment=process.env,nodeProxySupported=process.allowedNodeEnvironmentFlags.has('--use-env-proxy'),verifyTrust=verifyPlatformCA}){
  requireThat(typeof apply==='boolean','APPLY_FLAG_INVALID');
  requireNodeProxySupport(nodeProxySupported);
  const proxy=trustedProxyEnvironment(launchEnvironment,verifyTrust);
  const binding=checkSource(source,root),h=openSession(session,source);
  let token,env,buffer;
  try{
    requireThat(binding.tree===h.receipt.tree&&!h.receipt.cleaned,'SESSION_SOURCE_OR_STATE_INVALID');
    requireThat(!apply||(!h.receipt.applyAttempted&&!fs.existsSync(fdPath(h.homeFd,APPLY_MARKER))),'PREVIOUS_APPLY_REQUIRES_RECONCILIATION');
    const fd=fs.openSync(fdPath(h.configFd,'access-token'),flags.O_RDONLY|flags.O_NOFOLLOW|flags.O_NONBLOCK);
    try{
      const result=readBounded(fd,128);buffer=result.buffer;
      requireThat(result.stat.ctimeMs>=Date.parse(h.receipt.createdAt),'TOKEN_NOT_CREATED_AFTER_PREPARE');
      const tokenIdentity=tokenFileIdentity(result.stat);
      requireThat(!h.receipt.tokenFileIdentity||JSON.stringify(h.receipt.tokenFileIdentity)===JSON.stringify(tokenIdentity),'SESSION_TOKEN_FILE_REPLACED');
      h.receipt.tokenFileIdentity=tokenIdentity;
      token=buffer.toString('utf8').trim();requireThat(/^sbp_(?:oauth_)?[a-f0-9]{40}$/u.test(token),'FRESH_CLI_TOKEN_FORMAT_INVALID');
    }finally{fs.closeSync(fd);}
    h.checkPaths();checkSource(source,root);
    if(apply){
      try{fs.writeFileSync(fdPath(h.homeFd,APPLY_MARKER),JSON.stringify({session,source,startedAt:new Date().toISOString()})+'\n',{flag:'wx',mode:0o600});}
      catch(e){if(e.code==='EEXIST')throw Error('PREVIOUS_APPLY_REQUIRES_RECONCILIATION');throw e;}
      fs.fsyncSync(h.homeFd);
      h.receipt.applyAttempted=true;
    }
    h.receipt.lastRun={mode:apply?'apply':'plan',status:'started',startedAt:new Date().toISOString()};saveReceipt(h);
    // Only the validated executor proxy survives. No bypass, API host, custom
    // CA, TLS, profile, preload or executable override. Token stays private.
    env={HOME:h.home,PATH:'/usr/local/bin:/usr/bin:/bin',LANG:'C.UTF-8',LC_ALL:'C.UTF-8',...proxy,SUPABASE_ACCESS_TOKEN:token};
    let child;
    try{child=await runChild(process.execPath,['--use-env-proxy',path.join(root,TOOL),'--source',source,...(apply?['--apply']:[])],{
      cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:210000,maxBuffer:32768,killSignal:'SIGTERM',windowsHide:true});}
    catch{child={exitCode:1,stdout:''};}
    let result=sanitizedHelperResult(child.stdout,h.receipt);
    if(result&&(child.exitCode!==0&&result.status!=='apply_unconfirmed'))result=null;
    if(result&&((!apply&&!['plan_ready','already_applied_verified'].includes(result.status))||(apply&&result.status==='plan_ready')||result.wrote!==['applied_verified','apply_unconfirmed'].includes(result.status)))result=null;
    h.receipt.lastRun.status=result?.status??(apply?'apply_unconfirmed':'plan_failed');saveReceipt(h);
    return {...publicIdentity(h),status:result?.status??(apply?'apply_unconfirmed':'plan_failed'),...(result?{helper:result}:{}),cleanupRequired:true};
  }finally{
    buffer?.fill(0);if(env)delete env.SUPABASE_ACCESS_TOKEN;token=undefined;h.close();
  }
}

// This removes only the new session's validated local file, never a keyring or
// remote token. Keep the identity receipt so provider revocation can be checked.
export function cleanupTemporarySession({session,source}){
  const h=openSession(session,source);
  try{
    h.checkPaths();let present=true;
    try{const s=fs.lstatSync(fdPath(h.configFd,'access-token'));privateObject(s,false);requireThat(s.ctimeMs>=Date.parse(h.receipt.createdAt),'TOKEN_NOT_CREATED_AFTER_PREPARE');requireThat(!h.receipt.tokenFileIdentity||JSON.stringify(tokenFileIdentity(s))===JSON.stringify(h.receipt.tokenFileIdentity),'SESSION_TOKEN_FILE_REPLACED');}catch(e){if(e.code==='ENOENT')present=false;else throw e;}
    if(present)fs.unlinkSync(fdPath(h.configFd,'access-token'));
    h.receipt.cleaned=true;h.receipt.localCleanupAt=new Date().toISOString();saveReceipt(h);
    return {...publicIdentity(h),status:present?'local_token_removed':'local_token_absent',providerRevocationRequired:true};
  }finally{h.close();}
}
async function main(){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help'){process.stdout.write('Usage: node scripts/live-room-temporary-cli-session.mjs prepare --source SHA | run --session ID --source SHA [--apply] | cleanup --session ID --source SHA\nOnly an adapter-created temporary Linux HOME and its newly approved CLI2.109.1 fallback token. No login, keyring, or provider revocation. One apply attempt; plan remains available for reconciliation. Never pass a token argument.\n');return;}
  const operation=args.shift();requireThat(['prepare','run','cleanup'].includes(operation),'ARGUMENT_INVALID');
  const options={};for(let i=0;i<args.length;i++){
    const key=args[i];requireThat(['--source','--session','--apply'].includes(key)&&options[key]===undefined,'ARGUMENT_INVALID');
    if(key==='--apply')options[key]=true;else{requireThat(typeof args[i+1]==='string'&&!args[i+1].startsWith('--'),'ARGUMENT_INVALID');options[key]=args[++i];}
  }
  const source=options['--source'],session=options['--session'];requireThat(/^[a-f0-9]{40}$/u.test(source??''),'EXACT_SOURCE_REQUIRED');
  requireThat(operation==='run'||!options['--apply'],'ARGUMENT_INVALID');
  if(operation==='prepare'){requireThat(session===undefined,'ARGUMENT_INVALID');process.stdout.write(JSON.stringify(createTemporarySession(verifyDeploymentSource(source)))+'\n');return;}
  requireThat(session!==undefined,'SESSION_ID_REQUIRED');
  const result=operation==='cleanup'?cleanupTemporarySession({session,source}):await runTemporarySession({session,source,apply:options['--apply']===true});
  process.stdout.write(JSON.stringify(result)+'\n');if(['apply_unconfirmed','plan_failed'].includes(result.status))process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{process.stderr.write(JSON.stringify({status:'blocked',code:codeOf(e),cleanupRequired:true,providerRevocation:'not_performed'})+'\n');process.exitCode=1;});
