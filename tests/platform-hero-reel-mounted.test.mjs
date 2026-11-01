import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import { React, ts, ROOT } from './platform-studio-mounted-harness.mjs';
const require = createRequire(path.join(ROOT,'package.json'));
const { createRoot } = require('react-dom/client');

test('production Hero Reel pauses on blur/background, removes listeners, and handles native errors without autoplay',async()=>{
 const nodes=new Map(),listeners=new Map();let focusCleanup,background,plays=0,pauses=0,removed=0,releaseError=false;
 const player={play(){if(releaseError)throw new Error('released');plays++;},pause(){pauses++;},addListener(name,fn){listeners.set(name,fn);return {remove(){removed++;listeners.delete(name);}};}};
 const host=name=>function Host(props){const id=React.useId();nodes.set(id,{name,props});React.useEffect(()=>()=>nodes.delete(id),[id]);return React.createElement(React.Fragment,null,...React.Children.toArray(props.children).filter(x=>typeof x==='object'));};
 const AppState={currentState:'active',addEventListener(_event,fn){background=fn;return {remove(){removed++;}};}};
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(ROOT,'components/creator-media/PlatformHeroReel.tsx'),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{exports,require(name){
  if(name==='react')return React;
  if(name==='react-native')return {AppState,StyleSheet:{create:x=>x},Text:host('Text'),View:host('View'),TouchableOpacity:host('Button')};
  if(name==='expo-router')return {useFocusEffect:cb=>React.useEffect(()=>{focusCleanup=cb();return focusCleanup;},[cb])};
  if(name==='expo-video')return {VideoView:host('VideoView'),useVideoPlayer(source,setup){assert.equal(source.useCaching,false);const initialized=React.useRef(false);if(!initialized.current){setup(player);initialized.current=true;}return player;}};
  throw new Error(name);
 }});
 const doc=globalThis.document,noop=()=>{};
 const root=createRoot({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,parentNode:null,tagName:'DIV'});
 const all=()=>[...nodes.values()];const button=()=>all().find(n=>n.name==='Button');
 try{
  await React.act(async()=>root.render(React.createElement(exports.PlatformHeroReel,{uri:'https://fixture.invalid/signed',label:'Creator'})));
  assert.equal(plays,0);assert.equal(player.muted,true);assert.equal(player.staysActiveInBackground,false);assert.equal(player.allowsExternalPlayback,false);
  const view=all().find(n=>n.name==='VideoView');assert.equal(view.props.nativeControls,true);assert.equal(view.props.allowsPictureInPicture,false);
  await React.act(async()=>button().props.onPress());assert.equal(plays,1);
  await React.act(async()=>{AppState.currentState='background';background('background');});assert.ok(pauses>0);
  await React.act(async()=>button().props.onPress());assert.equal(plays,1);
  const stalePlay=button().props.onPress;
  await React.act(async()=>{AppState.currentState='active';focusCleanup();});assert.ok(pauses>=2);
  await React.act(async()=>stalePlay());assert.equal(plays,1,'retained play callback cannot play after blur');
  const beforeNative=pauses;await React.act(async()=>listeners.get('playingChange')({isPlaying:true}));
  assert.equal(pauses,beforeNative+1,'native play event after blur is immediately paused');
  await React.act(async()=>listeners.get('statusChange')({status:'error'}));assert.equal(button(),undefined);
  assert.ok(all().some(n=>n.name==='Text'&&String(n.props.children).includes('could not play')));
 }finally{await React.act(async()=>root.unmount());}
 assert.equal(removed,3);assert.equal(listeners.size,0);
});
