import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const React = require("react");
const { createRoot } = require("react-dom/client");
const ts = require("typescript");
const noop = () => {};
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const settle = async () => { for (let i=0;i<100;i++) await Promise.resolve(); };
function container() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const doc = {addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
  const element = () => ({addEventListener:noop,removeEventListener:noop,namespaceURI:"http://www.w3.org/1999/xhtml",nodeName:"DIV",nodeType:1,ownerDocument:doc,parentNode:null,tagName:"DIV"});
  doc.documentElement=element();globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class {};
  return element();
}
function elements(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return [tree,...elements(tree.props?.children)];
}
function textOf(tree) {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (!tree) return "";
  if (Array.isArray(tree)) return tree.map(textOf).join(" ");
  return textOf(tree.props?.children);
}
async function mountScreen(file, overrides={}) {
  const state = {user:{id:"a"},authority:{sessionGeneration:"1"}, tree:null, pushes:[], writes:[], syncRetries:[], resolutions:[], saved:["film"], failSaved:false, failTitles:false, ...overrides};
  const title = {id:"film",title:"Film",is_published:true,status:"published",content_access_rule:"open"};
  const query = (table) => {
    const result = () => ({data: table === "titles" ? [title] : [],error:state.failTitles ? Error("offline") : null});
    const chain = new Proxy({}, {get:(_,key) => key === "then" ? (yes,no) => Promise.resolve(result()).then(yes,no) : key === "maybeSingle" ? async () => ({data:title,error:null}) : () => chain});
    return chain;
  };
  const userData = {
    readMyListIds: () => state.readSaved ? state.readSaved() : state.failSaved ? Promise.reject(Error("offline")) : Promise.resolve([...state.saved]),
    readMergedWatchProgress: async () => state.readProgress ? (await state.readProgress()).progress : ({}),
    readMyListState: async options => {
      if(options?.retryUnknown) {state.syncRetries.push(options);if(state.retrySync)return state.retrySync();}
      if(options?.useAccountVersion) {state.resolutions.push(options);if(state.resolveConflict)return state.resolveConflict();}
      return {ids:await userData.readMyListIds(),syncStatus:state.syncStatus??"synced",readStatus:state.offline ? "offline" : "fresh"};
    },
    readWatchProgressState: async () => state.readProgress ? state.readProgress() : ({progress:{},syncStatus:"synced",readStatus:"fresh"}),
    readUserProfileByUserId: async () => null,
    buildUserChannelProfile: x => x,
    setMyListTitleSaved: (id,saved) => {state.writes.push({id,saved});return state.write ? state.write(id,saved) : Promise.resolve({ids:saved?[id]:[],syncStatus:"synced"});},
    toggleMyListTitle: async (id) => {state.writes.push({id});return state.write ? (await state.write(id)).ids : [id];},
  };
  const modules = {
    react:React,
    "expo-router": {router:{push:x=>state.pushes.push(x)},useRouter:()=>({push:x=>state.pushes.push(x),back:noop}),useLocalSearchParams:()=>({id:"film"}),useFocusEffect:callback=>React.useEffect(callback,[callback])},
    "react-native": {StyleSheet:{create:x=>x},useWindowDimensions:()=>({height:800}),Alert:{alert:noop},...Object.fromEntries(["ActivityIndicator","ImageBackground","RefreshControl","ScrollView","Text","TouchableOpacity","Pressable","View"].map(x=>[x,x]))},
    "react-native-safe-area-context":{SafeAreaView:"SafeAreaView",useSafeAreaInsets:()=>({top:0,bottom:0})},
    "@react-navigation/bottom-tabs":{useBottomTabBarHeight:()=>60},
    "../../_data/titles":{titles:[]},
    "../../_lib/session":{useSession:()=>({user:state.user,authority:state.authority,isSignedIn:!!state.user,isLoading:false})},
    "../../_lib/supabase":{supabase:{auth:{getUser:async()=>({data:{user:state.user}})},from:query}},
    "../../_lib/userData":userData,
    "../../_lib/channelAudience":{readFollowedChannelUserIds:async()=>[]},
    "../../_lib/customerExperiencePresentation":{resolveMainTabBrandRevealHeight:()=>100,isCurrentAuthorityRequest:x=>x.generation===x.currentGeneration && x.requestedAuthorityKey===x.currentAuthorityKey},
    "../../_lib/creatorPaidVideos":{readMyUnlockedPaidVideoLibraryItems:async()=>({status:"resolved",subjectUserId:state.user?.id??null,items:[]})},
    "../../_lib/creatorReplays":{readCreatorReplayLibraryItems:async()=>[],formatCreatorReplaySourceLabel:()=>"",formatCreatorReplayStatusLabel:()=>""},
    "../../_lib/publicTitles":{filterPubliclyReleasedTitles:x=>x,isPubliclyReleasedTitle:()=>true},
    "../../_lib/accessEntitlements":{resolveContentAccess:async()=>({isAllowed:true,classification:"open",monetization:{}})},
    "../../_lib/appConfig":{DEFAULT_APP_CONFIG:{},readAppConfig:async()=>({}),resolveBrandingConfig:()=>({}),resolveMonetizationConfig:()=>({}),resolveFeatureConfig:()=>({continueWatchingEnabled:true}),resolveHomeConfig:()=>({enabledRails:{continue_watching:true}})},
    "../../_lib/monetization":{getMonetizationAccessSheetPresentation:()=>({})},
    "../../_lib/premiumWatchPartyAccess":{},
    "../../_lib/analytics":{trackEvent:noop},
    "../../_lib/actionSingleFlight.mjs":{createActionSingleFlightLatch:()=>({release:noop})},
    "../../_lib/contentEngagement":{readTitleEngagementState:async()=>state.readEngagement ? state.readEngagement() : ({}),toggleTitleLike:async()=>{state.writes.push({like:true});return state.like ? state.like() : {liked:true};}},
    "../../_lib/moderation":{},
    "../../_lib/performancePolicy":{ROOM_ACTIVITY_ACTIVE_WINDOW_MS:10000},
    "@expo/vector-icons/MaterialIcons":"Icon",
    "../../_lib/accountSessionAuthority":{getCurrentAccountSessionAuthoritySnapshot:()=>null},
    "../../hooks/useRefreshOnForeground":{useRefreshOnForeground:noop},
    "../../_lib/creatorVideos":{readCreatorVideos:async()=>[]},
    "../../_lib/creatorFeed":{readCreatorRelationshipFeedVideos:async()=>null},
    "../../_lib/useLiveDiscoveryFeed":{useLiveDiscoveryFeed:()=>({publicItems:[],circleItems:[],signals:{},reload:async()=>{}})},
    "../../_lib/officialAccounts":{RACHI_OFFICIAL_ACCOUNT:{}},
    "../../_lib/profilePosts":{readProfilePosts:async()=>[]},
    "../../_lib/creatorVideoLinks":{},
    "../../_lib/discoveryFeed":{},
    "../../_lib/liveEvents":{readLatestPublicEventSummaries:async()=>[]},
    "../../_lib/homeLoadPolicy.mjs":{settleHomeOperationsWithinDeadline:async jobs=>{await Promise.allSettled(jobs);return {timedOut:false};}},
  };
  let source=process.env.SAVED_MEDIA_BASELINE ? execFileSync("git",["show",`${process.env.SAVED_MEDIA_BASELINE}:${file}`],{encoding:"utf8"}) : fs.readFileSync(file,"utf8");
  if (file === "app/(tabs)/index.tsx") {
    // Observe the actual production state after React commits. The current
    // Home design does not render its retained Continue Watching hero.
    const progressName=source.includes("const visibleWatchProgress") ? "visibleWatchProgress" : "watchProgress";
    source=source.replace("  const homeAvatarInitial =",`  React.useLayoutEffect(() => { observeProgress(${progressName}); });\n  const homeAvatarInitial =`);
  }
  for (const match of source.matchAll(/from "([^"]+)"/g)) {
    if (match[1].startsWith("../../components/")) modules[match[1]]=new Proxy({}, {get:(_,key)=>key === "CHILLYWOOD_VISUAL" ? {} : String(key)});
  }
  modules["../../components/navigation/main-tab-profile-cache"]={setMainTabHeaderProfileSnapshot:()=>true};
  const module={exports:{}};
  const code=ts.transpileModule(source,{compilerOptions:{esModuleInterop:true,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React},fileName:file}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,console,setTimeout,clearTimeout,observeProgress:value=>{state.progressSnapshot=value;},require:name=>{
    if(name.endsWith(".png"))return 1;
    if(Object.hasOwn(modules,name))return modules[name];
    throw Error(`Unmodeled boundary ${name}`);
  }},{filename:file});
  // The complete production screen runs with real React hooks. Native children
  // are retained as elements for handler/accessibility assertions, not mounted.
  function Screen() {state.tree=module.exports.default();return null;}
  const root=createRoot(container());
  const run=async fn=>{let result;await React.act(async()=>{result=await fn();await settle();});return result;};
  const render=()=>run(()=>root.render(React.createElement(Screen)));
  await render();
  return {state,run,render,flush:()=>run(noop),nodes:()=>elements(state.tree),text:()=>textOf(state.tree),unmount:()=>run(()=>root.unmount())};
}

test("Saved card removal is explicit, isolated from navigation, single-flight, and truthful on failure",async()=>{
  const h=await mountScreen("app/(tabs)/my-list.tsx");
  try {
    const remove=h.nodes().find(x=>x.props?.accessibilityLabel==="Remove Film from Saved");
    assert.ok(remove,"Saved card exposes an explicit remove button");
    const pending=deferred();h.state.write=()=>pending.promise;
    let first;
    await h.run(()=>{first=remove.props.onPress();remove.props.onPress();});
    assert.equal(h.state.writes.length,1);assert.equal(h.state.pushes.length,0);
    await h.run(()=>pending.reject(Error("disk full")));await first;
    assert.match(h.text(),/Unable to remove/);assert.ok(h.nodes().some(x=>x.props?.accessibilityLabel==="Open Film"));
    h.state.write=async()=>({ids:[],syncStatus:"pending"});
    await h.run(()=>h.nodes().find(x=>x.props?.accessibilityLabel==="Remove Film from Saved").props.onPress());
    assert.match(h.text(),/Account sync is pending/);assert.ok(!h.nodes().some(x=>x.props?.accessibilityLabel==="Open Film"));
  } finally {await h.unmount();}
});

test("Library keeps saved cards on failed membership or title refresh and reports uncertainty",async()=>{
  const h=await mountScreen("app/(tabs)/my-list.tsx");
  try {
    for(const failure of ["failSaved","failTitles"]) {
      h.state[failure]=true;
      await h.run(()=>h.nodes().find(x=>x.props?.refreshControl)?.props.refreshControl.props.onRefresh());
      assert.ok(h.nodes().some(x=>x.props?.accessibilityLabel==="Open Film"),failure);
      assert.match(h.text(),/could not refresh|could not fully refresh/i);
      h.state[failure]=false;
    }
  } finally {await h.unmount();}
});

test("Title save blocks duplicate taps, ignores older initial reads, and reports local failure",async()=>{
  const initial=deferred();const h=await mountScreen("app/title/[id].tsx",{readSaved:()=>initial.promise});
  try {
    const save=h.nodes().find(x=>x.props?.accessibilityLabel==="Save title" || (x.props?.onPress && textOf(x)==="+ Favorites"));assert.ok(save);
    const write=deferred();h.state.write=()=>write.promise;
    let task;await h.run(()=>{task=save.props.onPress();save.props.onPress();});
    assert.equal(h.state.writes.length,1);
    await h.run(()=>write.resolve({ids:["film"],syncStatus:"pending"}));await task;
    await h.run(()=>initial.resolve([]));
    assert.ok(h.nodes().some(x=>x.props?.accessibilityLabel==="Remove from Saved"));
    assert.match(h.text(),/Account sync is pending/);
    h.state.write=async()=>{throw Error("disk full");};
    await h.run(()=>h.nodes().find(x=>x.props?.accessibilityLabel==="Remove from Saved").props.onPress());
    assert.match(h.text(),/Unable to update Saved/);
    assert.ok(h.nodes().some(x=>x.props?.accessibilityLabel==="Remove from Saved"));
  } finally {await h.unmount();}
});

test("Title ignores old-account save completion and old rendered handlers",async()=>{
  const h=await mountScreen("app/title/[id].tsx",{saved:[]});
  try {
    const save=h.nodes().find(x=>x.props?.accessibilityLabel==="Save title" || (x.props?.onPress && textOf(x)==="+ Favorites"));assert.ok(save);
    const pending=deferred();h.state.write=()=>pending.promise;
    let task;await h.run(()=>{task=save.props.onPress();});
    h.state.user={id:"b"};await h.render();
    await h.run(()=>pending.resolve({ids:["film"],syncStatus:"synced"}));await task;
    assert.ok(h.nodes().some(x=>x.props?.accessibilityLabel==="Save title"));
    await h.run(()=>save.props.onPress());assert.equal(h.state.writes.length,1);
  } finally {await h.unmount();}
});

test("Library treats offline empty cache as unavailable rather than confirming an empty account",async()=>{
  const h=await mountScreen("app/(tabs)/my-list.tsx",{offline:true,saved:[]});
  try {assert.match(h.text(),/could not refresh/i);assert.doesNotMatch(h.text(),/No saved titles yet/);} finally {await h.unmount();}
});

test("Home ignores stale concurrent progress loads and old account results",async()=>{
  const pending=[];
  const h=await mountScreen("app/(tabs)/index.tsx",{readProgress:()=>{const d=deferred();pending.push(d);return d.promise;}});
  try {
    const progress=position=>({progress:{film:{positionMillis:position,durationMillis:100000,updatedAt:Date.now()}},syncStatus:"synced",readStatus:"fresh"});
    await h.run(()=>pending.at(-1).resolve(progress(50000)));
    for (const d of pending.slice(0,-1)) await h.run(()=>d.resolve(progress(10000)));
    assert.equal(h.state.progressSnapshot.film.positionMillis,50000);
    h.state.user={id:"b"};await h.render();
    assert.equal(h.state.progressSnapshot.film,undefined);
    await h.run(()=>pending.at(-1).resolve({progress:{},syncStatus:"synced",readStatus:"fresh"}));
    assert.equal(h.state.progressSnapshot.film,undefined);
  } finally {await h.unmount();}
});

test("Title like is single-flight and late account completions cannot alter new account UI",async()=>{
  const h=await mountScreen("app/title/[id].tsx");
  try {
    const like=h.nodes().find(x=>x.props?.onPress && /^Like/.test(textOf(x)));assert.ok(like);
    const pending=deferred();h.state.like=()=>pending.promise;
    let task;await h.run(()=>{task=like.props.onPress();like.props.onPress();});
    assert.equal(h.state.writes.length,1);
    h.state.authority={sessionGeneration:"2"};await h.render();
    await h.run(()=>pending.resolve({liked:true}));await task;
    assert.doesNotMatch(h.text(),/Unlike/);
    await h.run(()=>like.props.onPress());assert.equal(h.state.writes.length,1);
  } finally {await h.unmount();}
});

test("Library removal cannot be resurrected by an older refresh",async()=>{
  const h=await mountScreen("app/(tabs)/my-list.tsx");
  try {
    const read=deferred();h.state.readSaved=()=>read.promise;
    let refresh;await h.run(()=>{refresh=h.nodes().find(x=>x.props?.refreshControl).props.refreshControl.props.onRefresh();});
    await h.run(()=>h.nodes().find(x=>x.props?.accessibilityLabel==="Remove Film from Saved").props.onPress());
    await h.run(()=>read.resolve(["film"]));await refresh;
    assert.ok(!h.nodes().some(x=>x.props?.accessibilityLabel==="Open Film"));
  } finally {await h.unmount();}
});

test("Library removal completion cannot change the next account or revive old handlers",async()=>{
  const h=await mountScreen("app/(tabs)/my-list.tsx");
  try {
    const remove=h.nodes().find(x=>x.props?.accessibilityLabel==="Remove Film from Saved");
    const pending=deferred();h.state.write=()=>pending.promise;
    await h.run(()=>remove.props.onPress());
    h.state.user={id:"b"};await h.render();
    await h.run(()=>pending.resolve({ids:[],syncStatus:"synced"}));
    assert.ok(h.nodes().some(x=>x.props?.accessibilityLabel==="Open Film"));
    await h.run(()=>remove.props.onPress());assert.equal(h.state.writes.length,1);
  } finally {await h.unmount();}
});

test("Library exposes a known conflict even when the other collection read fails",async()=>{
  const h=await mountScreen("app/(tabs)/my-list.tsx",{syncStatus:"conflict",readProgress:async()=>{throw Error("offline");}});
  try {
    assert.match(h.text(),/another device/);
    assert.ok(h.nodes().some(x=>x.props?.accessibilityLabel==="Use account Library version"));
  } finally {await h.unmount();}
});

test("Unconfirmed account writes remain visibly unconfirmed after a screen remount",async()=>{
  for(const file of ["app/(tabs)/my-list.tsx","app/title/[id].tsx"]) {
    const h=await mountScreen(file,{syncStatus:"unknown"});
    try {assert.match(h.text(),/account update could not be confirmed/);} finally {await h.unmount();}
  }
});

for (const file of ["app/(tabs)/my-list.tsx","app/title/[id].tsx"]) {
  test(`${file}: conflict resolution is explicit, single-flight and does not claim success on failed read`,async()=>{
    const h=await mountScreen(file,{syncStatus:"conflict"});
    try {
      const button=()=>h.nodes().find(x=>/^Use account .* version$/.test(x.props?.accessibilityLabel??""));
      assert.ok(button());assert.match(h.text(),/another device/);
      assert.equal(h.state.resolutions.length,0);
      const pending=deferred();h.state.resolveConflict=()=>pending.promise;
      let task;const original=button();
      await h.run(()=>{task=original.props.onPress();original.props.onPress();});
      assert.equal(h.state.resolutions.length,1);
      await h.run(()=>pending.resolve({ids:["film"],syncStatus:"conflict",readStatus:"offline"}));await task;
      assert.ok(button(),"unavailable account read cannot discard the conflict");
      h.state.resolveConflict=async()=>({ids:[],syncStatus:"synced",readStatus:"fresh"});
      await h.run(()=>button().props.onPress());
      assert.equal(button(),undefined);
      assert.equal(h.state.writes.length,0,"use account version must not send a new save/remove");
    } finally {await h.unmount();}
  });

  test(`${file}: explicit account-sync retry is single-flight and retains unknown state on failure`,async()=>{
    const h=await mountScreen(file,{syncStatus:"unknown"});
    try {
      assert.equal(h.state.syncRetries.length,0,"initial load cannot retry an unknown write");
      const refresh=h.nodes().find(x=>x.props?.refreshControl);
      if(refresh) await h.run(()=>refresh.props.refreshControl.props.onRefresh());
      assert.equal(h.state.syncRetries.length,0,"ordinary refresh cannot retry an unknown write");
      const retry=()=>h.nodes().find(x=>x.props?.accessibilityLabel==="Retry account sync");
      const pending=deferred();h.state.retrySync=()=>pending.promise;
      let task;const button=retry();assert.ok(button);
      await h.run(()=>{task=button.props.onPress();button.props.onPress();});
      assert.equal(h.state.syncRetries.length,1);
      await h.run(()=>pending.resolve({ids:["film"],syncStatus:"unknown",readStatus:"fresh"}));await task;
      assert.ok(retry());assert.match(h.text(),/could not be confirmed/);
      h.state.retrySync=async()=>{throw Error("offline");};
      await h.run(()=>retry().props.onPress());
      assert.ok(retry(),"failed retry leaves explicit recovery available");
      h.state.retrySync=async()=>({ids:["film"],syncStatus:"synced",readStatus:"fresh"});
      await h.run(()=>retry().props.onPress());
      assert.equal(retry(),undefined);
      assert.ok(h.text().includes("Film"),"local Saved membership is retained");
    } finally {await h.unmount();}
  });
  test(`${file}: account change invalidates a pending sync retry and its old handler`,async()=>{
    const h=await mountScreen(file,{syncStatus:"unknown"});
    try {
      const button=h.nodes().find(x=>x.props?.accessibilityLabel==="Retry account sync");assert.ok(button);
      const pending=deferred();h.state.retrySync=()=>pending.promise;
      let task;await h.run(()=>{task=button.props.onPress();});
      h.state.user={id:"b"};h.state.saved=[];h.state.syncStatus="synced";await h.render();
      await h.run(()=>pending.resolve({ids:["film"],syncStatus:"unknown",readStatus:"fresh"}));await task;
      assert.ok(!h.nodes().some(x=>x.props?.accessibilityLabel==="Retry account sync"));
      assert.ok(!h.nodes().some(x=>x.props?.accessibilityLabel==="Remove from Saved" || x.props?.accessibilityLabel==="Remove Film from Saved"));
      await h.run(()=>button.props.onPress());assert.equal(h.state.syncRetries.length,1);
    } finally {await h.unmount();}
  });
}
