import {createSharedVisualLoader} from "./shared-visual-host.mjs";
// Real component/helper, synthetic native hosts and exact-account RPC transport.
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {webcrypto} from 'node:crypto';
const noop=()=>{},doc={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
const container=()=>({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,parentNode:null,tagName:'DIV'});
const textOf=x=>Array.isArray(x)?x.map(textOf).join(' '):x==null||typeof x==='boolean'?'':typeof x==='object'?textOf(x.props?.children):String(x);
export async function mountReturns({orderId='order-1',actor='buyer',rpc,rpcEnvelope=false,manage=false,deadline=null,staff=false,gate=false}){
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;doc.documentElement=container();globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class {};
 const nodes=new Map(),pending=new Set();let focused=true,account=actor,id=orderId,closed=false;
 const host=name=>function Host(props){const key=React.useId();nodes.set(key,{name,props});React.useLayoutEffect(()=>()=>nodes.delete(key),[key]);return React.createElement(React.Fragment,null,...React.Children.toArray(props.children).filter(x=>typeof x==='object'));};
 const native=Object.fromEntries(['View','Text','Pressable','TextInput'].map(n=>[n,host(n)]));
 const visuals=createSharedVisualLoader(React,native,host);
 const compile=(file,imports)=>{const module={exports:{}};new Function('require','exports','module','crypto',ts.transpileModule(fs.readFileSync(new URL('../../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText)(name=>visuals(name)??imports(name),module.exports,module,webcrypto);return module.exports;};
 const transport={runCurrentAccountBoundSupabaseMutationRpc:async(name,args)=>{const subject=account,promise=rpc(name,args,subject);pending.add(promise);try{const data=await promise;if(subject!==account)throw Error('account changed');return rpcEnvelope?data:{data,error:null};}finally{pending.delete(promise);}}};
 const helper=compile('_lib/merchReturnCases.ts',()=>transport);
 const commerce=compile('_lib/creatorMerch.ts',()=>transport);
 const panel=compile(`components/merch/${staff?'merch-return-review':'merch-return-cases'}.tsx`,name=>name==='react'?React:name==='react-native'?native:name==='expo-router'?{
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useFocusEffect:fn=>React.useEffect(()=>focused?fn():undefined,[fn,focused]),
 }:name.endsWith('/creatorMerch')?commerce:helper);
 const root=createRoot(container());
 const render=()=>React.act(async()=>root.render(React.createElement(staff?(gate?panel.MerchReturnReviewGate:panel.MerchReturnReview):panel.MerchReturnCases,{key:account,orderId:id,paymentStatus:'paid',manage,deadline,onChanged:noop})));
 await render();
 const button=label=>[...nodes.values()].find(x=>x.name==='Pressable'&&x.props.accessibilityLabel===label);
 return {text:()=>[...nodes.values()].filter(x=>x.name==='Text').map(x=>textOf(x.props.children)).join('\n'),button,
  press:async(label,{wait=true}={})=>React.act(async()=>{const node=button(label);if(!node||node.props.disabled)throw Error('button unavailable: '+label);node.props.onPress();if(wait)await Promise.allSettled([...pending]);}),
  change:async value=>React.act(async()=>{const node=[...nodes.values()].find(x=>x.name==='TextInput');if(!node||node.props.editable===false)throw Error('input unavailable');node.props.onChangeText(value);}),
  account:async value=>{account=value;await render();},order:async value=>{id=value;await render();},focus:async value=>{focused=value;await render();},
  resolve:async(d,value)=>React.act(async()=>d.resolve(value)),
  close:async()=>{if(!closed){closed=true;await React.act(async()=>root.unmount());}},
 };
}
