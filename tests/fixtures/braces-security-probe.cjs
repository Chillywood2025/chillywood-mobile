'use strict';
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=process.argv[2];
const baselinePath=process.argv[3];
const original=require(baselinePath);
const patched=require(root+'/vendor/braces-safe/index.js');
let checks=0;
function check(fn){fn();checks++}
const methods=['parse','compile','expand','stringify'];
const nested=(n,left='{',right='}')=>left.repeat(n)+'a'+right.repeat(n);
for(const method of methods) for(const pair of [['{','}'],['(',')']]) {
  check(()=>assert.doesNotThrow(()=>patched[method](nested(100,...pair))));
  check(()=>assert.throws(()=>patched[method](nested(101,...pair)),/Input depth \(101\), exceeds max depth \(100\)/));
  for(const limit of [1.5,99.5,0.5]){
    const n=Math.floor(limit);
    check(()=>assert.doesNotThrow(()=>patched[method](nested(n,...pair),{maxDepth:limit})));
    check(()=>assert.throws(()=>patched[method](nested(n+1,...pair),{maxDepth:limit}),/exceeds max depth/));
  }
  for(const maxDepth of [Infinity,NaN,1000,'1000',false,null]) check(()=>assert.throws(()=>patched[method](nested(101,...pair),{maxDepth}),/exceeds max depth/));
}
for(const method of methods) {
  check(()=>assert.doesNotThrow(()=>patched[method]('{('.repeat(50)+'a'+')}'.repeat(50))));
  check(()=>assert.throws(()=>patched[method]('{('.repeat(51)+'a'+')}'.repeat(51)),/exceeds max depth/));
  for(const pattern of ['{'.repeat(101), '('.repeat(101), '{)'.repeat(101), '(}'.repeat(101)]) check(()=>assert.throws(()=>patched[method](pattern),/exceeds max depth/));
  for(const pattern of ['\\{'.repeat(101), '"'+'{'.repeat(101)+'"', "'"+'('.repeat(101)+"'", '['+'{'.repeat(101)+']']) check(()=>assert.doesNotThrow(()=>patched[method](pattern)));
}
for(const method of ['compile','expand','stringify']){
  for(const n of [100,101,4000]) {
    let leaf={type:'text',value:'a'};
    for(let i=0;i<n;i++)leaf={type:'paren',nodes:[leaf]};
    const ast={type:'root',nodes:[leaf]};
    if(n===100) check(()=>assert.doesNotThrow(()=>patched[method](ast)));
    else check(()=>assert.throws(()=>patched[method](ast),/AST depth \(101\), exceeds max depth \(100\)/));
  }
  const ast={type:'root',nodes:[]};ast.nodes.push(ast);
  check(()=>assert.throws(()=>patched[method](ast),/AST depth/));
}
for(const count of [1,2,50]) {
 const nodes=Array.from({length:count},()=>({type:'paren',nodes:[]}));
 nodes.forEach((x,i)=>x.parent=nodes[(i+1)%count]);
 check(()=>assert.throws(()=>patched.expand(nodes[0]),/AST parent chain contains a cycle/));
}
// Published 3.0.3 parity, including malformed, escaped and quoted patterns.
let seed=0x19ab23;
const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
const alphabet=['{','}','(',')','[',']',',','.','\\','a','b','1','2','$','"',"'",'`','/'];
const corpus=['{{a,b},c}','{{a},b}','x{a,b}y','{1..4}','{04..10..2}','{a,b}{c,d}',"'unpaired",'a{b..c,d}e'];
for(let k=0;k<3500;k++) {let s='';const n=Math.floor(rand()*36);for(let i=0;i<n;i++)s+=alphabet[Math.floor(rand()*alphabet.length)];corpus.push(s)}
const options=[{}, {escapeInvalid:true}, {keepQuotes:true}, {keepEscaping:true}, {expand:true,nodupes:true,noempty:true}];
const normalize=x=>JSON.stringify(x,(k,v)=>(k==='parent'||k==='prev'||k==='queue')?undefined:v);
function result(lib,method,pattern,opt){try{return ['ok',normalize(lib[method](pattern,opt))]}catch(e){return['error',e.name,e.message]}}
for(const p of corpus)for(const optionsValue of options)for(const method of methods)check(()=>assert.deepEqual(result(patched,method,p,optionsValue),result(original,method,p,optionsValue),JSON.stringify({p,method,optionsValue})));
for(const method of ['compile','expand']){
 const script=`const b=require(process.argv[1]);try { b.${method}('{'.repeat(4000)+'a'+'}'.repeat(4000)); console.log('accepted');}catch(e){console.log(e.name+':'+e.message);}`;
 const optionsValue={env:{...process.env,NODE_PATH:root+'/node_modules'},timeout:5000,encoding:'utf8'};
 const baseline=spawnSync(process.execPath,['--stack_size=512','-e',script,baselinePath],optionsValue);
 const fixed=spawnSync(process.execPath,['--stack_size=512','-e',script,root+'/vendor/braces-safe/index.js'],optionsValue);
 check(()=>assert.match(baseline.stdout,/Maximum call stack size exceeded/));
 check(()=>assert.match(fixed.stdout,/SyntaxError:Input depth \(101\), exceeds max depth \(100\)/));
 console.log(JSON.stringify({method,baseline:baseline.stdout.trim(),fixed:fixed.stdout.trim()}));
}
console.log(JSON.stringify({checks,parityPatterns:corpus.length,parityCases:corpus.length*options.length*methods.length}));
