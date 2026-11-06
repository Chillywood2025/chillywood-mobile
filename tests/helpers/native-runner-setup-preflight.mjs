import assert from 'node:assert/strict';
import {Worker,MessageChannel,receiveMessageOnPort} from 'node:worker_threads';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';

export function nativeSetupDatabase(){
 const control=new Int32Array(new SharedArrayBuffer(8)),bytes=new Uint8Array(new SharedArrayBuffer(4*1024*1024));
 const {port1,port2}=new MessageChannel();
 const start=(snapshot,snapshotPort)=>new Worker(new URL('./native-setup-pglite-worker.mjs',import.meta.url),{
  workerData:{control:control.buffer,bytes:bytes.buffer,snapshot,snapshotPort},transferList:snapshotPort?[snapshotPort]:[],
 });
 let worker=start(undefined,port2),snapshot;
 const receive=()=>{
  assert.notEqual(Atomics.wait(control,0,0,180_000),'timed-out','sequential fixture database operation timed out');
  const result=JSON.parse(new TextDecoder().decode(bytes.subarray(0,Atomics.load(control,1))));
  if(result.error)throw Object.assign(new Error(result.error.message),result.error,{stderr:result.error.message});
  return result;
 };
 try{
  assert.equal(receive().ready,true);snapshot=receiveMessageOnPort(port1)?.message.snapshot;
  assert.ok(snapshot instanceof Blob,'one immutable replay snapshot is required');
 }catch(error){void worker.terminate();throw error;}finally{port1.close();}
 const request=value=>{assert.ok(worker,'sequential fixture worker is closed');Atomics.store(control,0,0);worker.postMessage(value);return receive();};
 const close=async()=>{if(!worker)return;const current=worker;try{request({action:'close'});}finally{
  await current.terminate();worker=null;assert.equal(current.threadId,-1,'prior WASM worker has fully exited');
 }};
 return {query:sql=>request({action:'query',sql}).output,reset:async()=>{
  // A case owns one WASM isolate. Repeated module disposal in the same worker
  // hit V8's UnregisterWasmAllocation assertion; fully terminate it before
  // loading the identical replay snapshot in the next independent worker.
  await close();Atomics.store(control,0,0);worker=start(snapshot);
  try{assert.equal(receive().ready,true);}catch(error){await worker.terminate();worker=null;throw error;}
  return {threadId:worker.threadId};
 },close};
}

export function nativeSource(file){return fs.readFileSync(new URL(`../../${file}`,import.meta.url),'utf8');}
export function nativeSpan(source,start,end){
 assert.equal(source.split(start).length,2,`unique native setup start: ${start}`);
 const from=source.indexOf(start),to=source.indexOf(end,from);
 assert.ok(to>from,`native setup end: ${end}`);
 return source.slice(from,to);
}
export function nativeFunction(source,name){
 const ast=ts.createSourceFile('native.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),found=[];
 const visit=node=>{if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found.push(node);ts.forEachChild(node,visit);};visit(ast);
 assert.equal(found.length,1,`unique actual native function ${name}`);return found[0].getText(ast);
}
export function nativeVariables(source,names){
 const ast=ts.createSourceFile('native.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),found=[];
 for(const name of names){
  const matches=[];
  const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name)matches.push(node);ts.forEachChild(node,visit);};visit(ast);
  assert.equal(matches.length,1,`unique actual native variable ${name}`);found.push(`const ${matches[0].getText(ast)};`);
 }
 return found.join('\n');
}

export async function executeNativeSetup(file,source,parts,{query,tail='',overrides={}}={}){
 const url=new URL(`../../${file}`,import.meta.url),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const context={query,...overrides};
 for(const statement of ast.statements){
  if(!ts.isImportDeclaration(statement))continue;
  const specifier=statement.moduleSpecifier.text;
  // Setup excerpts cannot call an OS/provider transport. Never make native
  // execution available just because the parent runner imports it.
  if(specifier==='node:child_process')continue;
  const imported=await import(specifier.startsWith('.')?new URL(specifier,url):specifier);
  const clause=statement.importClause;if(!clause)continue;
  if(clause.name)context[clause.name.text]=imported.default;
  if(clause.namedBindings&&ts.isNamedImports(clause.namedBindings))for(const entry of clause.namedBindings.elements)
   context[entry.name.text]=imported[entry.propertyName?.text??entry.name.text];
 }
 Object.assign(context,overrides);
 const globals=[];
 for(const statement of ast.statements)if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations)
  if(['lit','literal','parse','parsed','json','auth','service','accessGrantsSnapshotSql'].includes(declaration.name.getText(ast)))
   globals.push(`const ${declaration.getText(ast)};`);
 const code=[...globals,...parts,tail].join('\n');
 assert.doesNotMatch(code,/\b(?:spawn|spawnSync|execFileSync|fetch)\s*\(/u,'no native, OS or external transport in setup preflight');
 // No session/start/race/OS bindings are supplied. Calling an excerpt's native
 // schedule is an error, never an emulated successful two-backend schedule.
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const result=await new AsyncFunction(...Object.keys(context),code)(...Object.values(context));
 return {result,sourceSha256:createHash('sha256').update(source).digest('hex'),excerptSha256:createHash('sha256').update(code).digest('hex')};
}
