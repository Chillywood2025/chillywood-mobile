// Full production React screen/card/action-sheet mount. Native hosts, network,
// picker/provider facts and geometry are explicit controlled boundaries below.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
export const ROOT=process.env.STUDIO_SOURCE_ROOT||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(process.env.STUDIO_DEPENDENCY_ROOT||ROOT,'package.json'));
export const React=require('react');
const {createRoot}=require('react-dom/client');
export const ts=require('typescript');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const noop=()=>{},doc={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
const container=()=>({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,parentNode:null,tagName:'DIV'});
doc.documentElement=container();globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};
export const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
export const textOf=n=>Array.isArray(n)?n.map(textOf).join(' '):n==null||typeof n==='boolean'?'':typeof n==='string'||typeof n==='number'?String(n):textOf(n.props?.children);
export const video=(id,visibility='public')=>({id,ownerId:'owner',title:`Title ${id}`,description:'',visibility,createdAt:'2026-10-10T00:00:00Z',updatedAt:'2026-10-10T00:00:00Z',moderationStatus:'clean',renditionStatuses:[],playbackUrl:`preview:${id}`,storagePath:`video/${id}`,thumbnailUrl:'',thumbStoragePath:null,vipAccessRequired:false});
export const edit=id=>({clipFormat:'vertical_9_16',fitMode:'fill',trimStartMs:null,trimEndMs:null,coverStoragePath:`cover/${id}`,coverMimeType:'image/jpeg',coverFileSizeBytes:100,titleOverlayText:`Overlay ${id}`,titleOverlaySubtitle:'',titleOverlayPosition:'bottom',titleOverlayStyle:'clean',templatePreset:'clean',brandMarkEnabled:false,brandAssetId:null});
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
export function productionFunctions(file,names,bindings){
 const source=fs.readFileSync(path.join(ROOT,file),'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS),found=new Map();
 function visit(n){if(ts.isFunctionDeclaration(n)&&names.includes(n.name?.text))found.set(n.name.text,n.getText(ast));if(ts.isVariableDeclaration(n)&&names.includes(n.name.getText(ast)))found.set(n.name.getText(ast),`const ${n.getText(ast)};`);ts.forEachChild(n,visit);}visit(ast);
 names.forEach(name=>assert.ok(found.has(name),`Production declaration ${name}`));const ctx={exports:{},...bindings};vm.runInNewContext(compile([...found.values()].join('\n')+`\nexports.api={${names.join(',')}};`),ctx);return ctx.exports.api;
}
export async function mount(t,{route={tab:'content'},videos=[video('A'),video('B')],overrides={},session:initialSession=null}={}){
  const replayPolicy = productionFunctions('_lib/liveEvents.ts',['readNewCreatorEventReplayTermsError'],{Date,Number});
  const nodes=new Map(),calls=[],alerts=[],routes=[],timers=new Map(),scrolls=[],measures=[];let timerId=0;
  let session=initialSession||{user:{id:'owner',email:'owner@example.test'},isSignedIn:true,isLoading:false,authority:{userId:'owner',accountId:'owner',sessionGeneration:'first',state:'ACTIVE',restoreOnly:false},authorityStatus:'active'};
  let params={...route};
  const router={push:x=>routes.push(x),back:noop,setParams:x=>{params={...params,...x};}};
  const renderChildren=x=>React.Children.toArray(x).filter(v=>typeof v==='object');
  const host=name=>React.forwardRef(function NativeFixture(props,ref){
    const { onLayout } = props;
    const id=React.useId();nodes.set(id,{type:name,props});
    React.useLayoutEffect(()=>()=>nodes.delete(id),[id]);
    React.useImperativeHandle(ref,()=>({measureLayout:(_root,ok)=>{measures.push(textOf({props}));ok(0,100);},scrollTo:opts=>scrolls.push(opts)}),[props]);
    React.useLayoutEffect(()=>{onLayout?.({nativeEvent:{layout:{x:0,y:100,width:360,height:100}}});},[onLayout]);
    return React.createElement(React.Fragment,null,...renderChildren(props.children));
  });
  const native={};for(const n of ['View','Text','TextInput','TouchableOpacity','Pressable','ScrollView','ImageBackground','ActivityIndicator','Image','Video'])native[n]=host(n);
  native.Modal=function FixtureModal({visible,children}){return visible?React.createElement(React.Fragment,null,children):null;};
  Object.assign(native,{StyleSheet:{create:x=>x,absoluteFillObject:{}},Platform:{OS:'android',select:x=>x.android??x.default},Alert:{alert:(...a)=>alerts.push(a)},Linking:{openURL:async()=>{}},Share:{share:async()=>{}}});
  const config={branding:{appDisplayName:"Chi'llywood"},features:{creatorSettingsEnabled:true},runtimeControls:{uploads_enabled:true,creator_posting_enabled:true,max_upload_size_mb:500}};
  const snapshot={targets:{premium_subscription:{hasEntitlement:true}}};
  const authorityApi=productionFunctions('_lib/accountSessionAuthority.ts',['sameAccountSessionAuthority'],{});
  const base={
    captureAccountBoundSupabaseMutationSubject:async()=>({accessToken:'synthetic-clip-token',authority:session.authority}),
    getCurrentAccountSessionAuthoritySnapshot:()=>session.authority??null,
    readCreatorAuthoringPrices:async sourceType=>({status:'resolved',subjectUserId:session.user.id,prices:[{priceKey:'fixture-price',productKey:'fixture-product',amountMinor:['vip_pass','channel_subscription'].includes(sourceType)?499:99,currency:'usd',label:['vip_pass','channel_subscription'].includes(sourceType)?'$4.99':'$0.99',environment:'sandbox',provider:'revenuecat_app_store',providerProductId:'fixture-store-product',platform:'ios',status:'sandbox',providerVerified:false,availablePlatforms:['ios','android'],availabilityLabel:'iOS and Android'}]}),
    sameAccountSessionAuthority:authorityApi.sameAccountSessionAuthority,
    useSession:()=>session,useBetaProgram:()=>({isLoading:false,isActive:true,accessState:{status:'active'}}),getBetaAccessBlockCopy:()=>({title:'Beta required',body:'Blocked'}),
    DEFAULT_APP_CONFIG:config,readAppConfig:async()=>config,resolveFeatureConfig:x=>x.features,resolveBrandingConfig:x=>x.branding,
    readUserProfile:async()=>({username:'Owner',displayName:'Owner',avatarIndex:0,platformAccessVisibility:'public',watchPartyAccessRule:'open',communicationAccessRule:'open'}),normalizeUserProfile:x=>x,saveUserProfile:async x=>x,
    getCachedMonetizationSnapshot:()=>snapshot,readMonetizationSnapshot:async()=>snapshot,subscribeToMonetizationSnapshot:()=>noop,
    readCurrentUserEntitlement:async()=>({isActive:true}),readMyPlatformRoleMemberships:async()=>[],hasPlatformRoleMembership:()=>false,
    readCreatorPermissions:async()=>({canUsePartyPassRooms:true,canUsePremiumRooms:true}),
    readCreatorVideos:async()=>videos,readCreatorReplayLibraryItems:async()=>[],readCreatorEventReminderSummaries:async()=>[],
    readCreatorVideoForOwner:async id=>videos.find(v=>v.id===id)||video(id),readCreatorVideoForPlayer:async id=>({playbackUrl:`loaded:${id}`,thumbnailUrl:`cover:${id}`}),
    readClipStudioEditsForVideos:async()=>new Map(),readClipStudioEdit:async()=>null,
    readChannelAudienceMembers:async()=>[],readPlatformBrandStudio:async()=>null,readChannelAudienceSummary:async()=>null,readChannelSafetyAdminSummary:async()=>null,readCreatorAnalyticsSummary:async()=>null,
    createEmptyCreatorPayoutDashboardReadModel:()=>({latestRows:[],status:'not_active'}),readCreatorPayoutDashboardSummary:async()=>({latestRows:[],status:'not_active'}),
    DEFAULT_CREATOR_MONETIZATION_RUNTIME_FLAGS:{liveMoneyEnabled:false},CREATOR_MONETIZATION_DOCTRINE:{},resolveCreatorPayoutReadiness:()=>({}),
    readCreatorMonetizationFoundationSummary:async()=>null,readCreatorPayoutBalances:async()=>null,readCreatorMoneyAuditSourceRows:async()=>[],buildCreatorMoneyAuditEvents:()=>[],
    getProviderReadinessFallbackSummary:()=>[],readProviderReadinessSummary:async()=>[],getMoneyFeatureFlagFallbackSummary:()=>[],readMoneyFeatureFlagSummary:async()=>[],
    getMoneyFeatureFlag:(_,key)=>({key,state:key==='live_money_enabled'?'off':'sandbox_only'}),getMoneyFeatureStateLabel:x=>x,isMoneyFeatureSandboxOrOn:s=>['on','sandbox_only'].includes(s),
    getRevenueCatProductionReadiness:()=>({anyPublicKeyConfigured:false}),readMyCreatorTipSettings:async()=>null,resolveSandboxMonetizationTester:async()=>false,
    getChannelSubscriberRelationshipActionSupport:()=>({}),resolveChannelAccess:async()=>({}),
    normalizeAccessVisibility:x=>x||'public',getAccessVisibilityLabel:x=>x||'Public',ACCESS_VISIBILITY_OPTIONS:[{value:'public',label:'Public'},{value:'private',label:'Private'},{value:'subscribers',label:'Subscribers'}],
    formatPlatformBrandAssetStatus:()=> 'Not set',formatPlatformBrandScanStatus:()=> 'Pending',getUserFacingErrorMessage:(_e,f)=>f,
    formatCreatorVideoFileSize:()=>'',CREATOR_VIDEO_MAX_RUNTIME_LABEL:'30 minutes',getCreatorVideoStorageLimitMessage:()=>'',isCreatorVideoFileOverChannelMovieLimit:()=>false,
    formatClipStudioFormatLabel:x=>x,formatClipStudioTemplateLabel:x=>x,getClipStudioTemplatePresetConfig:()=>({}),CLIP_STUDIO_SUBTITLE_OVERLAY_MAX_LENGTH:100,CLIP_STUDIO_TITLE_OVERLAY_MAX_LENGTH:100,
    getClipStudioTitleOverlayValidationMessage:()=>null,getClipStudioCoverValidationMessage:()=>null,formatCreatorReplayStatusLabel:x=>x,formatCreatorReplayVisibilityLabel:x=>x,
    isCreatorVideoPubliclyShareable:v=>v.visibility==='public',trackEvent:noop,formatMonetizationCurrency:x=>`$${(x/100).toFixed(2)}`,
    formatChannelSubscriptionPrice:()=>'$4.99',formatCreatorVipPassPrice:()=>'$4.99',getChannelSubscriptionReadbackStatus:()=>({}),
    findProviderReadinessSummary:()=>null,getCreatorReadinessLabel:()=> 'Not ready',getProviderReadinessTone:()=> 'muted',summarizeProviderReadiness:(_x,f)=>f||'Not ready',
    CHILLYWOOD_VISUAL:{},LIVE_REPLAY_ACKNOWLEDGEMENT:'Acknowledge replay',RACHI_OFFICIAL_USER_ID:'official',
    isMoneyCenterSectionBodyVisible:expanded=>expanded,sanitizeCreatorRoomAccessRule:x=>x,
  };
  const components={ProfileMediaImage:native.Image,StableImage:native.Image,AppText:native.Text,ChillywoodPrimaryActionFill:()=>null,MoneyScopeInfoButton:()=>null,NotificationBellButton:()=>null,CreatorContentActionSheet:()=>null,EventBroadcastPreparation:()=>null,
    BetaAccessScreen:props=>React.createElement(native.View,{testID:'beta-gate'},React.createElement(native.Text,null,props.title),React.createElement(native.Text,null,props.body)),
    AppActionButton:props=>React.createElement(native.TouchableOpacity,{...props},React.createElement(native.Text,null,props.label)),
    AppEmptyState:props=>React.createElement(native.View,null,React.createElement(native.Text,null,props.title),React.createElement(native.Text,null,props.body),props.onAction?React.createElement(native.TouchableOpacity,{onPress:props.onAction},React.createElement(native.Text,null,props.actionLabel)):null),AppStickyActionBar:()=>null};
  const mocks={...base,...components,...overrides};
  const cache=new Map();
  function evaluate(file){
    if(cache.has(file))return cache.get(file);
    const code=compile(fs.readFileSync(path.join(ROOT,file),'utf8')),exports={};cache.set(file,exports);
    const imports=name=>{
      if(name==='react')return React;if(name==='react-native')return native;
      if(name==='react-native-safe-area-context')return {useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})};
      if(name==='expo-router')return {useLocalSearchParams:()=>params,useRouter:()=>router};
      if(name==='expo-av')return {Video:native.Video,ResizeMode:{CONTAIN:'contain',COVER:'cover'}};
      if(name==='expo-image-picker')return {UIImagePickerPreferredAssetRepresentationMode:{Compatible:'compatible'},launchImageLibraryAsync:(...args)=>{calls.push(['launchImageLibraryAsync',...args]);return mocks.launchImageLibraryAsync?.(...args)??Promise.resolve({canceled:true});}};
      if(name.endsWith('/deviceImagePicker'))return evaluate('_lib/deviceImagePicker.ts');
      if(name==='./userFacingErrors')return evaluate('_lib/userFacingErrors.ts');
      if(name==='expo-document-picker')return {getDocumentAsync:(...args)=>{calls.push(['getDocumentAsync',...args]);return mocks.getDocumentAsync(...args);}};
      if(name.endsWith('.jpg'))return 1;
      if(name.endsWith('/creator-video-card'))return evaluate('components/creator-media/creator-video-card.tsx');
      if(name.endsWith('/creatorVideoPreview'))return evaluate('_lib/creatorVideoPreview.ts');
      if(name.endsWith('/CreatorContentActionSheet'))return evaluate('components/creator-media/CreatorContentActionSheet.tsx');
      if(name.endsWith('/creatorMonetizationFeatures'))return evaluate('_lib/creatorMonetizationFeatures.ts');
      if(name.endsWith('/creatorMonetizationRouteTargets'))return evaluate('_lib/creatorMonetizationRouteTargets.ts');
      if(name.endsWith('/eventSchedule'))return evaluate('_lib/eventSchedule.ts');
      if(name.endsWith('/useCreatorAuthoringPrice'))return evaluate('_lib/useCreatorAuthoringPrice.ts');
      if(name.endsWith('/creator-price-picker'))return evaluate('components/monetization/creator-price-picker.tsx');
      if(name.endsWith('/event-sale-editor'))return evaluate('components/monetization/event-sale-editor.tsx');
      if(name.endsWith('/event-auction-editor'))return {EventAuctionEditor:()=>null};
      if(name.endsWith('/creator-auction-held-earnings'))return {CreatorAuctionHeldEarnings:()=>null};
      if(name.endsWith('/subscription-price-request-status'))return {SubscriptionPriceRequestStatus:()=>null};
      if(name.endsWith('/liveEvents'))return new Proxy(replayPolicy,{get:(target,key)=>{
        if(key in target)return target[key];
        if(key in mocks)return typeof mocks[key]==='function'?(...args)=>{calls.push([key,...args]);return mocks[key](...args);}:mocks[key];
        throw Error(`Unconfigured import ${name}:${String(key)}`);
      }});
      if(name.endsWith('/event-lifecycle-controls'))return evaluate('components/monetization/event-lifecycle-controls.tsx');
      return new Proxy({},{get:(_,key)=>{
        if(key==='__esModule')return false;
        if(key in mocks)return typeof mocks[key]==='function'?(...args)=>{calls.push([key,...args]);return mocks[key](...args);}:mocks[key];
        if(/^list/.test(key))return async(...args)=>{calls.push([key,...args]);return [];};
        if(/^normalizeClipStudio|^normalizePlatformBrand/.test(key))return x=>x;
        throw Error(`Unconfigured import ${name}:${String(key)}`);
      }});
    };
    vm.runInNewContext(code,{exports,require:imports,__DEV__:false,console,Date,Intl,Set,Map,URL,Promise,Math,Error,requestAnimationFrame:f=>{f();return 1;},cancelAnimationFrame:noop,setTimeout:(f)=>{timers.set(++timerId,f);return timerId;},clearTimeout:id=>timers.delete(id)});return exports;
  }
  const screen=evaluate('app/channel-settings.tsx');
  // Exercise the app's exact account-keyed navigator JSX rather than pretending
  // Studio remains mounted when the owning root navigation tree is replaced.
  const layout=fs.readFileSync(path.join(ROOT,'app/_layout.tsx'),'utf8'),layoutAst=ts.createSourceFile('_layout.tsx',layout,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let navigator,keyDeclaration;function visitLayout(n){if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(layoutAst)==='RootNavigator')navigator=n.getText(layoutAst);if(ts.isVariableDeclaration(n)&&n.name.getText(layoutAst)==='navigationTreeKey')keyDeclaration=`const ${n.getText(layoutAst)};`;ts.forEachChild(n,visitLayout);}visitLayout(layoutAst);
  assert.ok(navigator&&keyDeclaration,'root navigator uses production authority key');
  const keyApi=productionFunctions('_lib/accountSessionAuthority.ts',['getAccountNavigationTreeKey'],{});
  const rootElement=()=>{const ctx={exports:{},React,RootNavigator:screen.ChannelStudioScreen,authority:session.authority??null,...keyApi};vm.runInNewContext(compile(`${keyDeclaration}\nexports.element=(${navigator});`),ctx);return ctx.exports.element;};
  const root=createRoot(container());
  const render=()=>React.act(async()=>root.render(rootElement()));
  await render();t?.after(()=>React.act(async()=>root.unmount()));
  const all=()=>[...nodes.values()];
  return {calls,alerts,routes,scrolls,measures,mocks,all,text:()=>all().filter(n=>n.type==='Text').map(n=>textOf(n)).join('\n'),
    find:(predicate)=>all().find(predicate),input:p=>all().find(n=>n.type==='TextInput'&&n.props.placeholder===p),
    button:label=>all().find(n=>['TouchableOpacity','Pressable'].includes(n.type)&&(n.props.accessibilityLabel===label||textOf(n).trim()===label)),
    async press(n){assert.ok(n,'mounted visible button exists');assert.notEqual(n.props.disabled,true,'mounted button enabled');await React.act(async()=>{void n.props.onPress();});},
    async change(n,v){assert.ok(n,'mounted visible input exists');assert.notEqual(n.props.editable,false,'mounted input editable');await React.act(async()=>n.props.onChangeText(v));},
    async resolve(d,v){await React.act(async()=>d.resolve(v));},async reject(d,e){await React.act(async()=>d.reject(e));},
    async timers(){await React.act(async()=>{const pending=[...timers.values()];timers.clear();for(const f of pending)void f();});},
    async route(x){params={...params,...x};await render();},async account(x){session=x;await render();},unmount:()=>React.act(async()=>root.unmount())};
}
