import {createSharedVisualLoader} from "./helpers/shared-visual-host.mjs";
// Real production screens, hooks, and helper; native hosts and authenticated RPC
// transport are modeled. These tests do not claim live payment or device proof.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
const require = createRequire(import.meta.url), React = require('react'), ts = require('typescript');
const { createRoot } = require('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {}, doc = {addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
const container = () => ({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,parentNode:null,tagName:'DIV'});
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const deferred = () => {let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const product = (id='tee') => ({id,creatorId:'creator',title:`Shirt ${id}`,description:'Cotton test shirt',imageUrl:null,priceMinor:2000,currency:'usd',publicationStatus:'published',shippingTrackingMode:'tracked',stockQuantity:2,availableQuantity:2,environment:'sandbox',checkoutAvailable:false,checkoutReason:'Approved sandbox testers only.',updatedAt:'2026-10-29T00:00:00Z',shippingSummary:'Sandbox only — no physical shipment.'});
const order = id => ({id,creatorId:'creator',productId:'tee',title:`Order shirt ${id}`,quantity:1,totalMinor:2000,currency:'usd',paymentStatus:'paid',fulfillmentStatus:'not_started',refundedAmountMinor:0,createdAt:'2026-10-29T00:00:00Z',updatedAt:'2026-10-29T00:00:00Z',environment:'sandbox'});
const session = id => ({user:{id},authorityStatus:'active',authority:{userId:id,accountId:id,sessionGeneration:id,state:'ACTIVE',restoreOnly:false}});
const textOf = x => Array.isArray(x) ? x.map(textOf).join(' ') : x==null||typeof x==='boolean' ? '' : typeof x==='string'||typeof x==='number' ? String(x) : textOf(x.props?.children);
async function mount(t,{screen='MerchShopScreen',props={creatorId:'creator'},rpc,taxRpc=false,fetch:fetcher,mutateScreen,picker=async()=>null,uploader=async()=>{throw Error("Unexpected upload");}}={}) {
  const nodes=new Map(),calls=[],routes=[],opens=[];let current=session('buyer'),snapshot=current.authority,focused=true;
  const host=name=>function Host(p){const id=React.useId();nodes.set(id,{type:name,props:p});React.useLayoutEffect(()=>()=>nodes.delete(id),[id]);return React.createElement(React.Fragment,null,...React.Children.toArray(p.children).filter(v=>typeof v==='object'));};
  const native={StyleSheet:{create:x=>x,flatten:x=>x},Linking:{openURL:async u=>opens.push(u)}};for(const n of ['View','Text','TextInput','Pressable','TouchableOpacity','ScrollView','ActivityIndicator','Image'])native[n]=host(n);
  const visuals=createSharedVisualLoader(React,native,host);
  function compile(file,imports,extras={}) {const exports={};let source=fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');if(file==='components/merch/merch-screens.tsx'&&mutateScreen)source=mutateScreen(source);vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require:name=>visuals(name)??imports(name),console,Intl,Date,Map,Promise,URL,Error,Uint8Array,setTimeout,clearTimeout,AbortController,crypto:webcrypto,fetch:fetcher??(async()=>{throw Error('Unexpected fetch');}),...extras});return exports;}
  const helper=compile('_lib/creatorMerch.ts',name=>name==='react-native'?native:name.endsWith('/merchProductPhotos')?{resolveMerchProductPhotos:products=>photos.resolveMerchProductPhotos(products)}:name.endsWith('/supabase')?{SUPABASE_URL:'https://example.test'}:{
    runCurrentAccountBoundSupabaseMutationRpc:async(name,args)=>{calls.push({name,args,actor:current.user.id});return {data:await rpc(name,args,current.user.id),error:null};},
    captureAccountBoundSupabaseMutationSubject:async()=>({accessToken:'fixture',authority:current.authority}),assertAccountBoundSupabaseMutationSubjectCurrent:s=>{assert.equal(s.authority,current.authority,'exact account unchanged');},
  });
  const photos=compile('_lib/merchProductPhotos.ts',name=>name.endsWith('/socialAttachmentPicker')?{pickSocialAttachmentFile:picker}:name.endsWith('/deviceImagePicker')?{pickDeviceImage:picker}:name.endsWith('/imageUploadNormalization')?{normalizeImageUploadFile:async file=>({file,cleanup:async()=>{}})}:name.endsWith('/platformBranding')?{uploadPlatformBrandAsset:uploader}:name.endsWith('/supabase')?{SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'fixture'}:{
    captureAccountBoundSupabaseMutationSubject:async()=>({accessToken:'fixture',authority:current.authority}),assertAccountBoundSupabaseMutationSubjectCurrent:s=>{assert.equal(s.authority,current.authority,'exact account unchanged');},
    invokeAccountBoundSupabaseMutationRpc:async(_subject,name,args)=>{calls.push({name,args,actor:current.user.id});return {data:await rpc(name,args,current.user.id),error:null};},
  });
  const trackingHelper=compile('_lib/merchTracking.ts',()=>({
    runCurrentAccountBoundSupabaseMutationRpc:async(name,args)=>{
      const authority=current.authority;calls.push({name,args,actor:current.user.id});
      const data=await rpc(name,args,current.user.id);
      assert.equal(authority,current.authority,'tracking exact account unchanged');
      return {data,error:null};
    },
  }));
  const correctionHelper=compile('_lib/merchTrackingCorrections.ts',()=>({runCurrentAccountBoundSupabaseMutationRpc:async(name,args)=>{
    const authority=current.authority;calls.push({name,args,actor:current.user.id});const data=await rpc(name,args,current.user.id);
    assert.equal(authority,current.authority,'correction exact account unchanged');return {data,error:null};
  }}));
  const correctionPanel=compile('components/merch/merch-tracking-corrections.tsx',name=>name==='react'?React:name==='react-native'?native:name==='expo-router'?{
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useFocusEffect:fn=>React.useEffect(()=>focused?fn():undefined,[fn,focused]),
  }:name.endsWith('/creatorMerch')?helper:correctionHelper);
  const trackingPanel=compile('components/merch/merch-tracking-panel.tsx',name=>name==='react'?React:name==='react-native'?native:name==='expo-router'?{
    // Harness focus changes explicitly rerender the root, unlike a normal outer variable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useFocusEffect:fn=>React.useEffect(()=>focused?fn():undefined,[fn,focused]),
  }:name==='./merch-tracking-corrections'?correctionPanel:trackingHelper);
  const shippingHelper=compile('_lib/merchFulfillmentAddress.ts',()=>({
    runCurrentAccountBoundSupabaseMutationRpc:async(name,args)=>{
      const authority=current.authority;calls.push({name,args,actor:current.user.id});
      const data=await rpc(name,args,current.user.id);
      assert.equal(authority,current.authority,'shipping exact account unchanged');
      return {data,error:null};
    },
  }));
  const shippingPanel=compile('components/merch/merch-shipping-details.tsx',name=>name==='react'?React:name==='react-native'?native:name==='expo-router'?{
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useFocusEffect:fn=>React.useEffect(()=>focused?fn():undefined,[fn,focused]),
  }:shippingHelper);
  const returnHelper=compile('_lib/merchReturnCases.ts',()=>({runCurrentAccountBoundSupabaseMutationRpc:async(name,args)=>{
    const authority=current.authority;calls.push({name,args,actor:current.user.id});const data=await rpc(name,args,current.user.id);
    assert.equal(authority,current.authority,'returns exact account unchanged');return {data,error:null};
  }}));
  const returnPanel=compile('components/merch/merch-return-cases.tsx',name=>name==='react'?React:name==='react-native'?native:name==='expo-router'?{
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useFocusEffect:fn=>React.useEffect(()=>focused?fn():undefined,[fn,focused]),
  }:name.endsWith('/creatorMerch')?helper:returnHelper);
  const queuePanel=compile('components/merch/merch-return-queue.tsx',name=>name==='react'?React:name==='react-native'?native:name==='expo-router'?{useRouter:()=>({push:r=>routes.push(r)}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useFocusEffect:fn=>React.useEffect(()=>focused?fn():undefined,[fn,focused]),
  }:returnHelper);
  const taxHelper=compile('_lib/creatorMerchTax.ts',()=>({runCurrentAccountBoundSupabaseMutationRpc:async(name,args)=>{
    const authority=current.authority;calls.push({name,args,actor:current.user.id});const data=!taxRpc&&name==='list_creator_merch_tax_categories'?{categories:[],selection:null}:await rpc(name,args,current.user.id);
    assert.equal(authority,current.authority,'category exact account unchanged');return {data,error:null};
  }}));
  const taxPanel=compile('components/merch/merch-tax-category.tsx',name=>name==='react'?React:name==='react-native'?native:name.endsWith('/accountSessionAuthority')?{getCurrentAccountSessionAuthoritySnapshot:()=>snapshot,sameAccountSessionAuthority:(a,b)=>JSON.stringify(a)===JSON.stringify(b)}:name.endsWith('/session')?{useSession:()=>current}:taxHelper);
  const back=compile('components/navigation/app-back-button.tsx',name=>name==='react'?React:name==='react-native'?native:{Ionicons:host('Icon')});
  const module=compile('components/merch/merch-screens.tsx',name=>name==='react'?React:name==='react-native'?native:name.endsWith('/navigation/app-back-button')?back:name==='expo-router'?{
    useRouter:()=>({push:r=>routes.push(r),back:()=>routes.push('back'),replace:r=>routes.push(r),canGoBack:()=>true}),
    // Harness focus changes explicitly rerender the root.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useFocusEffect:fn=>React.useEffect(()=>focused?fn():undefined,[fn,focused]),
  }:name.endsWith('/accountSessionAuthority')?{getCurrentAccountSessionAuthoritySnapshot:()=>snapshot,sameAccountSessionAuthority:(a,b)=>JSON.stringify(a)===JSON.stringify(b)}:name.endsWith('/session')?{useSession:()=>current}:name.endsWith('/merchProductPhotos')?photos:name==='./merch-tracking-panel'?trackingPanel:name==='./merch-shipping-details'?shippingPanel:name==='./merch-return-cases'?returnPanel:name==='./merch-return-queue'?queuePanel:name==='./merch-tax-category'?taxPanel:helper);
  const root=createRoot(container()),render=()=>React.act(async()=>root.render(React.createElement(module[screen],props)));
  await render();t.after(()=>React.act(async()=>root.unmount()));
  const all=()=>[...nodes.values()],button=label=>all().find(n=>n.type==='Pressable'&&n.props.accessibilityLabel===label);
  return {calls,routes,opens,all,button,text:()=>all().filter(n=>n.type==='Text').map(textOf).join('\n'),
    press:async label=>{const b=button(label);assert.ok(b,`button ${label}`);assert.equal(b.props.disabled,false);await React.act(async()=>{b.props.onPress();});},
    change:async(label,value)=>{const n=all().find(n=>n.type==='TextInput'&&n.props.accessibilityLabel===label);assert.ok(n);await React.act(async()=>n.props.onChangeText(value));},
    rotateSnapshot:()=>{snapshot={...snapshot,sessionGeneration:'rotated'};},account:async id=>{current=session(id);snapshot=current.authority;await render();},resolve:async(d,v)=>React.act(async()=>d.resolve(v)),focus:async v=>{focused=v;await render();},
  };
}
test('shop, orders and creator studio render shared skyline through actual Shell without an opaque scroll cover',async t=>{
 for(const screen of ['MerchShopScreen','MerchOrdersScreen','MerchStudioScreen']) {
  const h=await mount(t,{screen,rpc:async()=>({products:[],orders:[],nextCursor:null})});
  const background=h.all().filter(n=>n.type==='ImageBackground'&&n.props.testID==='merch-branded-surface');
  assert.ok(background.length>0,screen);
  assert.equal(background[0].props.source,'bundled-chicago-skyline');
  for(const scroll of h.all().filter(n=>n.type==='ScrollView'))assert.equal(scroll.props.style.backgroundColor,'transparent');
 }
});

test('shop product detail shows price, shipping and disabled checkout reason through real helper RPC',async t=>{
 const h=await mount(t,{rpc:async()=>({products:[product()],nextCursor:null})});
 assert.equal(h.calls[0].name,'list_creator_merch_products');assert.equal(h.calls[0].args.p_creator_id,'creator');
 await h.press('View Shirt tee');assert.match(h.text(),/\$20.00/);assert.match(h.text(),/no physical shipment/);assert.match(h.text(),/Checkout unavailable:\s+Approved sandbox testers only/);assert.equal(h.button('Sandbox checkout · $20.00'),undefined);
 await h.press('All products');assert.ok(h.button('View Shirt tee'));await h.press('My orders');assert.equal(h.routes.at(-1),'/merch/orders');
});
test('shop resets attempt only after exact authoritative abort; explicit retry never auto-pays',async t=>{
 const requests=[];let mode='abort';
 const h=await mount(t,{rpc:async()=>({products:[{...product(),checkoutAvailable:true}],nextCursor:null}),fetch:async(_url,options)=>{
  const request=JSON.parse(options.body);requests.push(request);
  return {ok:false,json:async()=>({checkoutCreated:false,checkoutRetrySafe:mode==='abort',abortedAttemptId:request.attempt_id,message:'not confirmed'})};
 }});
 await h.press('View Shirt tee');await h.press('Sandbox checkout · $20.00');
 assert.equal(requests.length,1);assert.match(h.text(),/stock hold was released/);assert.doesNotMatch(h.text(),/payment may still be pending/);assert.equal(h.opens.length,0);
 mode='unknown';await h.press('Sandbox checkout · $20.00');assert.equal(requests.length,2);assert.notEqual(requests[1].attempt_id,requests[0].attempt_id);
 await h.press('Sandbox checkout · $20.00');assert.equal(requests.length,3);assert.equal(requests[2].attempt_id,requests[1].attempt_id,'unknown outcomes retain stable attempt');
});
test('catalog error is not a false empty shop and Retry requests real helper again',async t=>{
 let fail=true;const h=await mount(t,{rpc:async()=>{if(fail)throw Error('Catalog offline');return {products:[],nextCursor:null};}});
 assert.match(h.text(),/Catalog offline/);assert.doesNotMatch(h.text(),/No products are published/);fail=false;await h.press('Retry');assert.match(h.text(),/No products are published/);assert.equal(h.calls.length,2);
});
test('pagination keeps existing listings on failure and does not duplicate rows on retry',async t=>{
 let fail=true;const h=await mount(t,{rpc:async(_n,a)=>{if(!a.p_before_id)return {products:[product('first')],nextCursor:'cursor'};if(fail)throw Error('Page failed');return {products:[product('first'),product('second')],nextCursor:null};}});
 await h.press('Load more');assert.match(h.text(),/Shirt first/);assert.match(h.text(),/Page failed/);fail=false;await h.press('Load more');assert.equal(h.all().filter(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='View Shirt first').length,1);assert.ok(h.button('View Shirt second'));
});
test('orders disappear on exact-account replacement and late prior-account result is suppressed',async t=>{
 const old=deferred();const h=await mount(t,{screen:'MerchOrdersScreen',props:{},rpc:async(_n,_a,actor)=>actor==='buyer'?old.promise:{orders:[order('new')],nextCursor:null}});
 await h.account('other');assert.match(h.text(),/Order shirt new/);await h.resolve(old,{orders:[order('private-old')],nextCursor:null});assert.doesNotMatch(h.text(),/private-old/);
});
test('real buyer order screen opens exact-order non-delivery case without verified delivery',async t=>{
 const h=await mount(t,{screen:'MerchOrdersScreen',props:{orderId:'exact-order'},rpc:async(name,args)=>{
   if(name==='read_merch_return_cases')return {cases:[],canManage:false};
   if(name==='submit_merch_return_case')return {id:'case-1',orderId:args.p_order_id};
   return {orders:[order('exact-order')],nextCursor:null};
 }});
 await h.press('View return cases');await h.change('Return case details','The item has not arrived');
 assert.equal(h.button('Request return').props.disabled,true);await h.press('Report non-delivery');
 const request=h.calls.find(call=>call.name==='submit_merch_return_case');assert.equal(request.args.p_order_id,'exact-order');assert.equal(request.args.p_kind,'non_delivery');assert.equal(request.actor,'buyer');
});
test('creator editor validates, saves through real RPC and prevents duplicate submits',async t=>{
 const pending=deferred();const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async(name)=>name==='save_creator_merch_product_with_tracking'?pending.promise:{products:[],nextCursor:null}});
 await h.press('Add product');await h.press('Publish test listing');assert.match(h.text(),/Enter a title/);assert.equal(h.calls.filter(c=>c.name==='save_creator_merch_product_with_tracking').length,0);
 await h.change('Product title','New shirt');await h.change('Price (USD)','24.99');await h.change('Available stock','3');await h.press('Tracked shipping');await h.press('Publish test listing');assert.equal(h.button('Publish test listing').props.disabled,true);
 const call=h.calls.find(c=>c.name==='save_creator_merch_product_with_tracking');assert.equal(call.args.p_price_minor,2499);assert.equal(call.args.p_publication_status,'published');assert.equal(call.args.p_stock_quantity,3);
 await h.resolve(pending,product('saved'));assert.ok(h.button('Add product'));
});
test('new product offers Gallery and Files before saving and retains local selection through invalid input',async t=>{
 const sources=[];let uploads=0;const h=await mount(t,{screen:'MerchStudioScreen',props:{},picker:async source=>{sources.push(source);return {uri:'file:///local.jpg',mimeType:'image/jpeg'};},uploader:async()=>{uploads++;},rpc:async()=>({products:[],nextCursor:null})});
 await h.press('Add product');assert.ok(h.button('Choose product photo from Files'));await h.press('Choose product photo from Photos / Gallery');
 assert.deepEqual(sources,['images']);assert.ok(h.all().find(n=>n.props.accessibilityLabel==='Selected product photo preview'));
 await h.press('Save draft');assert.match(h.text(),/Enter a title/);assert.ok(h.button('Cancel photo selection'));assert.equal(uploads,0);assert.equal(h.calls.filter(c=>c.name==='check_creator_merch_photo_target'||c.name==='save_creator_merch_product_with_tracking').length,0);
 await h.press('Cancel photo selection');await h.press('Choose product photo from Files');assert.deepEqual(sources,['images','files']);await h.press('Publish test listing');assert.match(h.text(),/Save your draft to upload/);assert.equal(uploads,0);
});
test('new selected photo uploads only after owned draft acknowledgement and retries without another draft or picker',async t=>{
 const saved=deferred();let picks=0,uploads=0;const h=await mount(t,{screen:'MerchStudioScreen',props:{},picker:async()=>{picks++;return {uri:'file:///local.jpg',mimeType:'image/jpeg'};},uploader:async()=>{if(++uploads===1)throw Error('Upload interrupted');return {id:'new-photo',scanStatus:'pending',moderationStatus:'clean'};},rpc:async(name)=>name==='save_creator_merch_product_with_tracking'?saved.promise:name==='check_creator_merch_photo_target'?true:{products:[],nextCursor:null}});
 await h.press('Add product');await h.press('Choose product photo from Photos / Gallery');await h.change('Product title','New shirt');await h.change('Price (USD)','20');await h.press('Tracked shipping');await h.press('Save draft');assert.equal(uploads,0);
 const save=h.calls.find(c=>c.name==='save_creator_merch_product_with_tracking');assert.equal(save.args.p_publication_status,'draft');await h.resolve(saved,{...product(save.args.p_product_id),publicationStatus:'draft'});assert.equal(uploads,1);assert.match(h.text(),/Upload interrupted/);await h.press('Retry photo upload');assert.equal(uploads,2);assert.equal(picks,1);assert.ok(h.button('Use this photo'));assert.equal(h.calls.filter(c=>c.name==='save_creator_merch_product_with_tracking').length,1);assert.equal(h.calls.filter(c=>c.name==='assign_merch_product_photo').length,0);
});
test('new photo picker is single flight and ignores account replacement before selection returns',async t=>{
 const selected=deferred();let picks=0;const h=await mount(t,{screen:'MerchStudioScreen',props:{},picker:()=>{picks++;return selected.promise;},rpc:async()=>({products:[],nextCursor:null})});await h.press('Add product');const b=h.button('Choose product photo from Photos / Gallery');await React.act(async()=>{b.props.onPress();b.props.onPress();});assert.equal(picks,1);await h.account('other');await h.resolve(selected,{uri:'file:///private.jpg'});assert.equal(h.all().find(n=>n.props.accessibilityLabel==='Selected product photo preview'),undefined);assert.equal(h.calls.filter(c=>c.name==='check_creator_merch_photo_target').length,0);
});
test('new draft acknowledgement after account replacement never starts selected-photo upload',async t=>{
 const saved=deferred();let uploads=0;const h=await mount(t,{screen:'MerchStudioScreen',props:{},picker:async()=>({uri:'file:///private.jpg'}),uploader:async()=>{uploads++;},rpc:async name=>name==='save_creator_merch_product_with_tracking'?saved.promise:{products:[],nextCursor:null}});
 await h.press('Add product');await h.press('Choose product photo from Photos / Gallery');await h.change('Product title','Private');await h.change('Price (USD)','10');await h.press('Tracked shipping');await h.press('Save draft');await h.account('other');await h.resolve(saved,product('old-draft'));assert.equal(uploads,0);assert.equal(h.button('Use this photo'),undefined);assert.equal(h.calls.filter(c=>c.name==='check_creator_merch_photo_target').length,0);
});
test('same-user session rotation before React remount fences a pending gallery result and draft continuation',async t=>{
 for(const phase of ['picker','draft']) {
  const pending=deferred();let uploads=0;const h=await mount(t,{screen:'MerchStudioScreen',props:{},picker:async()=>phase==='picker'?pending.promise:{uri:'file:///private.jpg'},uploader:async()=>{uploads++;},rpc:async name=>name==='save_creator_merch_product_with_tracking'?pending.promise:{products:[],nextCursor:null}});
  await h.press('Add product');await h.press('Choose product photo from Photos / Gallery');
  if(phase==='draft'){await h.change('Product title','Private');await h.change('Price (USD)','10');await h.press('Tracked shipping');await h.press('Save draft');}
  h.rotateSnapshot();await h.resolve(pending,phase==='picker'?{uri:'file:///private.jpg'}:product('old-draft'));assert.equal(uploads,0);assert.equal(h.button('Use this photo'),undefined);assert.equal(h.calls.filter(c=>c.name==='check_creator_merch_photo_target').length,0);
  if(phase==='picker')assert.equal(h.all().find(n=>n.props.accessibilityLabel==='Selected product photo preview'),undefined);
 }
});
test('sandbox checkout double taps use one request; opening browser is never represented as paid',async t=>{
 const pending=deferred();let fetches=0;const h=await mount(t,{rpc:async()=>({products:[{...product(),checkoutAvailable:true}],nextCursor:null}),fetch:async()=>{fetches++;return pending.promise;}});
 await h.press('View Shirt tee');const b=h.button('Sandbox checkout · $20.00');await React.act(async()=>{b.props.onPress();b.props.onPress();});assert.equal(fetches,1);
 await h.resolve(pending,{ok:true,json:async()=>({checkoutCreated:true,orderId:'pending-order',url:'https://checkout.stripe.com/c/pay/fixture'})});
 assert.equal(h.opens.length,1);assert.equal(h.routes.at(-1).params.orderId,'pending-order');assert.match(h.text(),/does not confirm payment/);assert.doesNotMatch(h.text(),/Payment successful/);
});
test('focus refresh retires selected product and removes paused listings, not just their checkout button',async t=>{
 let products=[{...product(),checkoutAvailable:true}];const h=await mount(t,{rpc:async()=>({products,nextCursor:null})});
 await h.press('View Shirt tee');assert.ok(h.button('Sandbox checkout · $20.00'));await h.focus(false);products=[];await h.focus(true);
 assert.doesNotMatch(h.text(),/Shirt tee/);assert.equal(h.button('Sandbox checkout · $20.00'),undefined);assert.match(h.text(),/No products are published/);
});
test('blurred checkout never navigates to an order after the user has left and returned',async t=>{
 const pending=deferred();const h=await mount(t,{rpc:async()=>({products:[{...product(),checkoutAvailable:true}],nextCursor:null}),fetch:async()=>pending.promise});
 await h.press('View Shirt tee');await h.press('Sandbox checkout · $20.00');await h.focus(false);await h.focus(true);
 await h.resolve(pending,{ok:true,json:async()=>({checkoutCreated:true,orderId:'late-order',url:'https://checkout.stripe.com/c/pay/fixture'})});
 assert.equal(h.routes.length,0);assert.equal(h.opens.length,0);assert.doesNotMatch(h.text(),/Checkout opened/);
});
test('sold-out product has no checkout action even if stale server capability says available',async t=>{
 const h=await mount(t,{rpc:async()=>({products:[{...product(),availableQuantity:0,checkoutAvailable:true}],nextCursor:null})});
 await h.press('View Shirt tee');assert.match(h.text(),/Sold out/);assert.equal(h.button('Sandbox checkout · $20.00'),undefined);assert.equal(h.button('Increase quantity').props.disabled,true);
});
test('failed creator save preserves the entered draft, surfaces failure and allows explicit retry',async t=>{
 let writes=0;const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async(name)=>{if(name==='save_creator_merch_product_with_tracking'){writes++;throw Error('Product changed. Refresh before editing.');}return {products:[],nextCursor:null};}});
 await h.press('Add product');await h.change('Product title','Keep this draft');await h.change('Price (USD)','10');await h.change('Available stock','2');await h.press('Tracked shipping');await h.press('Save draft');
 assert.match(h.text(),/Product changed/);assert.equal(h.all().find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Product title').props.value,'Keep this draft');assert.equal(h.button('Save draft').props.disabled,false);assert.equal(writes,1);
 await h.press('Cancel editing');assert.ok(h.button('Add product'));
});
test('creator records sandbox fulfillment only, with exact optimistic previous status',async t=>{
 const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async(name)=>name==='list_creator_merch_products'?{products:[],nextCursor:null}:name==='list_my_merch_orders'?{orders:[{...order('ready'),fulfillmentStatus:'processing'}],nextCursor:null}:order('ready')});
 await h.press('Customer orders');assert.match(h.text(),/do not dispatch or deliver/);await h.press('Record sandbox shipped');
 const call=h.calls.find(c=>c.name==='update_creator_merch_fulfillment');assert.equal(call.args.p_status,'shipped');assert.equal(call.args.p_expected_status,'processing');assert.equal(call.args.p_order_id,'ready');
});
test('new product retains the same UUID across uncertain save retries',async t=>{
 const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async(name)=>{if(name==='save_creator_merch_product_with_tracking')throw Error('Outcome unknown');return {products:[],nextCursor:null};}});
 await h.press('Add product');await h.change('Product title','One product');await h.change('Price (USD)','10');await h.press('Tracked shipping');await h.press('Save draft');await h.press('Save draft');
 const calls=h.calls.filter(c=>c.name==='save_creator_merch_product_with_tracking');assert.equal(calls.length,2);assert.match(calls[0].args.p_product_id,/^[0-9a-f-]{36}$/);assert.equal(calls[0].args.p_product_id,calls[1].args.p_product_id);
});
test('restocking edits available units while preserving held and sold allocations',async t=>{
 const sold={...product('sold'),stockQuantity:10,availableQuantity:0};const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async(name)=>name==='save_creator_merch_product_with_tracking'?sold:{products:[sold],nextCursor:null}});
 await h.press('Edit Shirt sold');assert.equal(h.all().find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Available stock').props.value,'0');assert.match(h.text(),/10\s+units already held or sold/);
 await h.change('Available stock','5');await h.press('Publish test listing');const call=h.calls.find(c=>c.name==='save_creator_merch_product_with_tracking');assert.equal(call.args.p_stock_quantity,15);assert.equal(call.args.p_expected_updated_at,sold.updatedAt);
});
test('negative control: removing exact-account remount makes the private-order invariant fail',async t=>{
 const h=await mount(t,{screen:'MerchOrdersScreen',props:{},rpc:async()=>({orders:[order('private-buyer')],nextCursor:null}),mutateScreen:s=>{assert.ok(s.includes('key={JSON.stringify(authority)}'));return s.replace('key={JSON.stringify(authority)}','key="broken-static-key"');}});
 assert.match(h.text(),/private-buyer/);await h.account('other');assert.throws(()=>assert.doesNotMatch(h.text(),/private-buyer/),/private-buyer/);
});
test('negative control: removing synchronous checkout latch admits repeated-tap requests',async t=>{
 const pending=deferred();let fetches=0;const h=await mount(t,{rpc:async()=>({products:[{...product(),checkoutAvailable:true}],nextCursor:null}),fetch:async()=>{fetches++;return pending.promise;},mutateScreen:s=>{assert.ok(s.includes('!selected.shippingTrackingMode || latch.current || page.loading'));return s.replace('!selected.shippingTrackingMode || latch.current || page.loading','!selected.shippingTrackingMode || page.loading');}});
 await h.press('View Shirt tee');const b=h.button('Sandbox checkout · $20.00');await React.act(async()=>{b.props.onPress();b.props.onPress();});assert.equal(fetches,2);assert.throws(()=>assert.equal(fetches,1));
 await h.resolve(pending,{ok:false,json:async()=>({message:'Test ended'})});
});

test('pending order resumes its durable original attempt after remount, never creates another attempt',async t=>{
 const pendingOrder={...order('pending'),paymentStatus:'pending',checkoutAttemptId:'70000000-0000-4000-8000-000000000001',checkoutResumeAvailable:true,checkoutResumeReason:'Resume this same order.'};
 const requests=[];const h=await mount(t,{screen:'MerchOrdersScreen',props:{},rpc:async()=>({orders:[pendingOrder],nextCursor:null}),fetch:async(_url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({checkoutCreated:true,orderId:'pending',url:'https://checkout.stripe.com/c/pay/same'})};}});
 await h.press('Resume same sandbox checkout');assert.equal(requests.length,1);assert.equal(requests[0].attempt_id,pendingOrder.checkoutAttemptId);assert.equal(requests[0].product_id,'tee');assert.equal(h.opens.length,1);assert.match(h.text(),/does not confirm payment/);
});
test('expired pending order offers status explanation instead of a new checkout attempt',async t=>{
 const h=await mount(t,{screen:'MerchOrdersScreen',props:{},rpc:async()=>({orders:[{...order('expired'),paymentStatus:'pending',checkoutResumeAvailable:false,checkoutResumeReason:'Waiting for provider confirmation; reconciliation required.'}],nextCursor:null})});
 assert.equal(h.button('Resume same sandbox checkout'),undefined);assert.match(h.text(),/reconciliation required/);assert.ok(h.button('Refresh orders'));
});
test('queued old-account checkout and creator-save callbacks cannot dispatch as replacement account',async t=>{
 let fetches=0;const shop=await mount(t,{rpc:async()=>({products:[{...product(),checkoutAvailable:true}],nextCursor:null}),fetch:async()=>{fetches++;throw Error('must not reach provider');}});
 await shop.press('View Shirt tee');const staleBuy=shop.button('Sandbox checkout · $20.00').props.onPress;
 await shop.account('replacement');await React.act(async()=>staleBuy());assert.equal(fetches,0);
 const studio=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async()=>({products:[],nextCursor:null})});
 await studio.press('Add product');await studio.change('Product title','Old account draft');await studio.change('Price (USD)','10');const staleSave=studio.button('Publish test listing').props.onPress;
 await studio.account('replacement');await React.act(async()=>staleSave());assert.equal(studio.calls.filter(c=>c.name==='save_creator_merch_product_with_tracking').length,0);
});
const optionsProduct = () => ({...product(),variantMode:'options',checkoutAvailable:true,variants:[
 {id:'small',sku:'TEE-S',size:'S',color:'Blue',stockQuantity:4,availableQuantity:2,status:'active',updatedAt:'old'},
 {id:'large',sku:'TEE-L',size:'L',color:'Blue',stockQuantity:0,availableQuantity:0,status:'active',updatedAt:'old'},
]});
test('buyer must choose available SKU and checkout transports exact option, never aggregate stock',async t=>{
 const requests=[];const h=await mount(t,{rpc:async()=>({products:[optionsProduct()],nextCursor:null}),fetch:async(_u,o)=>{requests.push(JSON.parse(o.body));return {ok:true,json:async()=>({checkoutCreated:true,orderId:'sku-order',url:'https://checkout.stripe.com/c/pay/sku'})};}});
 await h.press('View Shirt tee');assert.equal(h.button('Sandbox checkout · $20.00'),undefined);assert.equal(h.button('L / Blue · Sold out').props.disabled,true);
 await h.press('S / Blue');assert.match(h.text(),/SKU\s+TEE-S/);await h.press('Sandbox checkout · $20.00');assert.equal(requests[0].variant_id,'small');
});
test('creator SKU save retains held units and all variants, then saves details against returned revision',async t=>{
 const p=optionsProduct();const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async(name)=>name==='configure_creator_merch_variants'?{...p,updatedAt:'new-revision'}:name==='save_creator_merch_product_with_tracking'?p:{products:[p],nextCursor:null}});
 await h.press('Edit Shirt tee');await h.press('Manage sizes / colors');await h.change('Option 1 Available stock','5');await h.press('Archive option 2');await h.press('Save sizes / colors');
 const call=h.calls.find(c=>c.name==='configure_creator_merch_variants');assert.equal(call.args.p_variants[0].stockQuantity,7);assert.equal(call.args.p_variants[1].status,'archived');assert.equal(call.args.p_expected_updated_at,p.updatedAt);
 await h.press('Save draft');assert.equal(h.calls.find(c=>c.name==='save_creator_merch_product_with_tracking').args.p_expected_updated_at,'new-revision');
});
test('pending SKU order displays immutable labels and resumes the same option',async t=>{
 const requests=[];const h=await mount(t,{screen:'MerchOrdersScreen',props:{},rpc:async()=>({orders:[{...order('sku'),paymentStatus:'pending',variantId:'small',sku:'ORIGINAL-SKU',size:'Old size',color:'Old color',checkoutResumeAvailable:true,checkoutAttemptId:'original'}],nextCursor:null}),fetch:async(_u,o)=>{requests.push(JSON.parse(o.body));return {ok:true,json:async()=>({checkoutCreated:true,orderId:'sku',url:'https://checkout.stripe.com/c/pay/sku'})};}});
 assert.match(h.text(),/Old size \/ Old color/);assert.match(h.text(),/ORIGINAL-SKU/);await h.press('Resume same sandbox checkout');assert.equal(requests[0].variant_id,'small');assert.equal(requests[0].attempt_id,'original');
});
test('photo picker cancellation never allocates an asset or saves a product',async t=>{
 const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async()=>({products:[product()],nextCursor:null}),picker:async()=>null});
 await h.press('Edit Shirt tee');await h.press('Choose product photo from Photos / Gallery');assert.equal(h.calls.filter(c=>!['list_merch_return_case_queue','list_creator_merch_tax_categories'].includes(c.name)).length,1);assert.equal(h.button('Use this photo'),undefined);
});
test('photo upload failure retries same staged identity and assignment is explicit with latest revision',async t=>{
 let uploads=0;const attempts=[];const h=await mount(t,{screen:'MerchStudioScreen',props:{},picker:async()=>({uri:'file:///photo.jpg',mimeType:'image/jpeg',name:'photo.jpg'}),uploader:async input=>{attempts.push(input.attempt);if(++uploads===1)throw Error('Upload interrupted');return {id:'asset',scanStatus:'pending',moderationStatus:'clean'};},rpc:async(name)=>name==='check_creator_merch_photo_target'?true:name==='assign_merch_product_photo'?{...product(),photoAssetId:'asset',photoStatus:'pending_review',updatedAt:'photo-revision'}:name==='save_creator_merch_product_with_tracking'?product():{products:[product()],nextCursor:null}});
 await h.press('Edit Shirt tee');await h.press('Choose product photo from Photos / Gallery');assert.match(h.text(),/Upload interrupted/);await h.press('Retry photo upload');assert.equal(attempts[0],attempts[1]);assert.match(h.text(),/Not attached yet/);assert.equal(h.calls.filter(c=>c.name==='assign_merch_product_photo').length,0);
 await h.press('Use this photo');assert.match(h.text(),/Attached photo: pending_review/);await h.press('Save draft');const save=h.calls.find(c=>c.name==='save_creator_merch_product_with_tracking');assert.equal(save.args.p_expected_updated_at,'photo-revision');assert.equal(save.args.p_image_url,null);
});
test('account replacement while picker is open cannot upload or attach old account photo',async t=>{
 const chosen=deferred();let uploads=0;const h=await mount(t,{screen:'MerchStudioScreen',props:{},picker:()=>chosen.promise,uploader:async()=>{uploads++;},rpc:async()=>({products:[product()],nextCursor:null})});
 await h.press('Edit Shirt tee');await h.press('Choose product photo from Photos / Gallery');await h.account('other');await h.resolve(chosen,{uri:'file:///private.jpg'});assert.equal(uploads,0);assert.equal(h.calls.filter(c=>c.name==='assign_merch_product_photo').length,0);assert.equal(h.button('Use this photo'),undefined);
});
test('blocked or unrecoverable order has a direct support path without implying refund',async t=>{
 const h=await mount(t,{screen:'MerchOrdersScreen',props:{},rpc:async()=>({orders:[{...order('help'),paymentStatus:'pending',checkoutResumeAvailable:false}],nextCursor:null})});await h.press('Get order help');assert.deepEqual(h.routes.at(-1).pathname,'/support');assert.equal(h.routes.at(-1).params.orderId,'help');
});
test('focus refresh retires previously selected SKU when that option becomes paused',async t=>{
 let p=optionsProduct();const h=await mount(t,{rpc:async()=>({products:[p],nextCursor:null})});await h.press('View Shirt tee');await h.press('S / Blue');await h.focus(false);p={...p,variants:p.variants.map(v=>({...v,status:'paused'}))};await h.focus(true);await h.press('View Shirt tee');assert.equal(h.button('Sandbox checkout · $20.00'),undefined);assert.equal(h.button('S / Blue · Unavailable').props.disabled,true);
});
test('photo assignment failure leaves staged selection for explicit retry and never publishes',async t=>{
 let assigns=0;const h=await mount(t,{screen:'MerchStudioScreen',props:{},picker:async()=>({uri:'file:///photo.jpg'}),uploader:async()=>({id:'asset',scanStatus:'clean',moderationStatus:'clean'}),rpc:async(name)=>{if(name==='assign_merch_product_photo'){assigns++;throw Error('Product changed. Reload before attaching.');}return name==='check_creator_merch_photo_target'?true:{products:[product()],nextCursor:null};}});
 await h.press('Edit Shirt tee');await h.press('Choose product photo from Photos / Gallery');await h.press('Use this photo');assert.match(h.text(),/Reload before attaching/);assert.ok(h.button('Use this photo'));assert.equal(assigns,1);assert.equal(h.calls.filter(c=>c.name==='save_creator_merch_product_with_tracking').length,0);
});
test('late photo upload after leaving and returning cannot expose staged preview or attach',async t=>{
 const upload=deferred();const h=await mount(t,{screen:'MerchStudioScreen',props:{},picker:async()=>({uri:'file:///private.jpg'}),uploader:()=>upload.promise,rpc:async name=>name==='check_creator_merch_photo_target'?true:{products:[product()],nextCursor:null}});
 await h.press('Edit Shirt tee');await h.press('Choose product photo from Photos / Gallery');await h.focus(false);await h.focus(true);await h.resolve(upload,{id:'asset',scanStatus:'clean',moderationStatus:'clean'});assert.equal(h.button('Use this photo'),undefined);assert.equal(h.calls.filter(c=>c.name==='assign_merch_product_photo').length,0);
});
test('negative control: dropping selected variant from production checkout is detected at API boundary',async t=>{
 const requests=[];const h=await mount(t,{mutateScreen:s=>s.replace('variantId: selectedVariant?.id ?? null','variantId: null'),rpc:async()=>({products:[optionsProduct()],nextCursor:null}),fetch:async(_u,o)=>{requests.push(JSON.parse(o.body));return {ok:true,json:async()=>({checkoutCreated:true,orderId:'sku',url:'https://checkout.stripe.com/c/pay/sku'})};}});await h.press('View Shirt tee');await h.press('S / Blue');await h.press('Sandbox checkout · $20.00');assert.throws(()=>assert.equal(requests[0].variant_id,'small'));
});
test('managed photo preview never becomes the catalog legacy HTTPS fallback',async t=>{
 const p={...product(),photoAssetId:'asset',photoStatus:'ready',photoUrl:'https://example.test/signed-private?token=temporary'};const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async name=>name==='save_creator_merch_product_with_tracking'?p:{products:[p],nextCursor:null}});await h.press('Edit Shirt tee');await h.press('Save draft');assert.equal(h.calls.find(c=>c.name==='save_creator_merch_product_with_tracking').args.p_image_url,null);
});
test('creator can pause every SKU and buyer storefront exposes no purchasable option',async t=>{
 let p=optionsProduct();const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async(name,args)=>{if(name==='configure_creator_merch_variants'){p={...p,variants:args.p_variants.map(v=>({...v,availableQuantity:v.status==='active'?2:0})),availableQuantity:0,checkoutAvailable:false,updatedAt:'paused-revision'};return p;}return {products:[p],nextCursor:null};}});
 await h.press('Edit Shirt tee');await h.press('Manage sizes / colors');await h.press('Pause option 1');await h.press('Archive option 2');await h.press('Save sizes / colors');assert.ok(h.button('Manage sizes / colors'));assert.equal(h.calls.find(c=>c.name==='configure_creator_merch_variants').args.p_variants[0].status,'paused');
 const shop=await mount(t,{rpc:async()=>({products:[p],nextCursor:null})});await shop.press('View Shirt tee');assert.equal(shop.button('S / Blue · Unavailable').props.disabled,true);assert.equal(shop.button('Sandbox checkout · $20.00'),undefined);
});
test('explicit photo assignment keeps local preview only for bound asset and removal clears it',async t=>{
 const h=await mount(t,{screen:'MerchStudioScreen',props:{},picker:async()=>({uri:'file:///selected.jpg'}),uploader:async()=>({id:'asset',scanStatus:'pending',moderationStatus:'clean'}),rpc:async(name,args)=>name==='check_creator_merch_photo_target'?true:name==='assign_merch_product_photo'?{...product(),photoAssetId:args.p_asset_id,photoStatus:args.p_asset_id?'pending_review':'none',photoStoragePath:args.p_asset_id?'private/path':null,updatedAt:'assigned'}:{products:[product()],nextCursor:null}});
 await h.press('Edit Shirt tee');await h.press('Choose product photo from Photos / Gallery');await h.press('Use this photo');assert.equal(h.all().find(n=>n.type==='Image'&&n.props.accessibilityLabel==='Product photo preview').props.source.uri,'file:///selected.jpg');assert.match(h.text(),/Attached photo: pending_review/);assert.equal(h.button('Use this photo'),undefined);
 await h.press('Remove product photo');assert.equal(h.all().find(n=>n.type==='Image'&&n.props.accessibilityLabel==='Product photo preview'),undefined);
});
test('staged photo discard retries exact asset, blocks replacement, and retains selection until confirmed',async t=>{
 let discards=0,picks=0;const h=await mount(t,{screen:'MerchStudioScreen',props:{},picker:async()=>{picks++;return {uri:'file:///selected.jpg'};},uploader:async()=>({id:'staged-asset',scanStatus:'pending',moderationStatus:'clean'}),rpc:async(name,args)=>{if(name==='discard_creator_merch_photo'){discards++;if(discards===1)throw Error('Removal interrupted');return {assetId:args.p_asset_id,deletedAt:'retained'};}return name==='check_creator_merch_photo_target'?true:{products:[product()],nextCursor:null};}});
 await h.press('Edit Shirt tee');await h.press('Choose product photo from Photos / Gallery');assert.equal(h.button('Choose product photo from Photos / Gallery').props.disabled,true);await h.press('Discard selected photo');assert.match(h.text(),/Removal interrupted/);assert.ok(h.button('Use this photo'));assert.equal(h.button('Choose product photo from Photos / Gallery').props.disabled,true);await h.press('Discard selected photo');assert.equal(h.button('Use this photo'),undefined);assert.equal(h.button('Choose product photo from Photos / Gallery').props.disabled,false);assert.equal(picks,1);assert.deepEqual(h.calls.filter(c=>c.name==='discard_creator_merch_photo').map(c=>c.args.p_asset_id),['staged-asset','staged-asset']);
});
test('photo approval is absent for pending scan and blocked photos',async t=>{
 for(const photoStatus of ['pending_review','blocked']) {const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async()=>({products:[{...product(),photoAssetId:'asset',photoStatus,photoCanApprove:false}],nextCursor:null})});await h.press('Edit Shirt tee');assert.equal(h.button('Approve photo for display'),undefined);assert.equal(h.calls.filter(c=>c.name==='approve_creator_merch_photo').length,0);}
});
test('eligible photo approval is explicit and updates revision without publishing',async t=>{
 const p={...product(),photoAssetId:'asset',photoStatus:'pending_review',photoCanApprove:true};const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async name=>name==='approve_creator_merch_photo'?{...p,photoCanApprove:false,photoStatus:'ready',updatedAt:'approved-revision'}:name==='save_creator_merch_product_with_tracking'?p:{products:[p],nextCursor:null}});await h.press('Edit Shirt tee');assert.equal(h.calls.filter(c=>c.name==='approve_creator_merch_photo').length,0);await h.press('Approve photo for display');assert.equal(h.calls.find(c=>c.name==='approve_creator_merch_photo').args.p_expected_updated_at,p.updatedAt);assert.match(h.text(),/Attached photo: ready/);assert.equal(h.button('Approve photo for display'),undefined);assert.equal(h.calls.filter(c=>c.name==='save_creator_merch_product_with_tracking').length,0);await h.press('Save draft');assert.equal(h.calls.find(c=>c.name==='save_creator_merch_product_with_tracking').args.p_expected_updated_at,'approved-revision');
});
test('photo approval failure does not claim ready and late account response cannot expose old photo',async t=>{
 const pending=deferred();let fail=true;const p={...product(),photoAssetId:'asset',photoStatus:'pending_review',photoCanApprove:true};const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async name=>{if(name==='approve_creator_merch_photo'){if(fail)throw Error('Scan changed; cannot approve');return pending.promise;}return {products:[p],nextCursor:null};}});await h.press('Edit Shirt tee');await h.press('Approve photo for display');assert.match(h.text(),/cannot approve/);assert.doesNotMatch(h.text(),/Attached photo: ready/);fail=false;await h.press('Approve photo for display');await h.account('other');await h.resolve(pending,{...p,photoStatus:'ready',photoCanApprove:false});assert.doesNotMatch(h.text(),/Attached photo: ready/);assert.equal(h.button('Approve photo for display'),undefined);
});
test('photo status refresh reveals eligibility without accepting a concurrent product revision',async t=>{
 const p={...product(),photoAssetId:'asset',photoStatus:'pending_review',photoScanStatus:'pending',photoCanApprove:false};const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async name=>name==='read_creator_merch_photo_status'?{...p,title:'Concurrent edit',updatedAt:'concurrent-revision',photoCanApprove:true,photoScanStatus:'clean'}:name==='save_creator_merch_product_with_tracking'?p:{products:[p],nextCursor:null}});await h.press('Edit Shirt tee');await h.change('Product title','Unsaved title');await h.press('Refresh photo status');assert.ok(h.button('Approve photo for display'));assert.equal(h.all().find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Product title').props.value,'Unsaved title');await h.press('Save draft');assert.equal(h.calls.find(c=>c.name==='save_creator_merch_product_with_tracking').args.p_expected_updated_at,p.updatedAt);
});
test('paused option available units are not mislabeled as held or sold in creator editor',async t=>{
 const p={...optionsProduct(),stockQuantity:10,availableQuantity:0,variants:[{id:'paused',sku:'P',size:'M',color:null,status:'paused',stockQuantity:10,availableQuantity:8}]};const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async()=>({products:[p],nextCursor:null})});await h.press('Edit Shirt tee');assert.match(h.text(),/2\s+units already held or sold/);assert.doesNotMatch(h.text(),/10\s+units already held or sold/);
});
test('permanent pre-registration photo failure can cancel selection and choose a different file',async t=>{
 let picks=0,uploads=0;const h=await mount(t,{screen:'MerchStudioScreen',props:{},picker:async()=>({uri:`file:///photo-${++picks}.jpg`}),uploader:async()=>{if(++uploads===1)throw Error('Unsupported image size');return {id:'new-asset',scanStatus:'pending',moderationStatus:'clean'};},rpc:async name=>name==='check_creator_merch_photo_target'?true:{products:[product()],nextCursor:null}});await h.press('Edit Shirt tee');await h.press('Choose product photo from Photos / Gallery');assert.match(h.text(),/Unsupported image size/);await h.press('Cancel photo selection');assert.equal(h.button('Choose product photo from Photos / Gallery').props.disabled,false);await h.press('Choose product photo from Photos / Gallery');assert.equal(picks,2);assert.ok(h.button('Use this photo'));
});
test('ambiguous registered photo upload cannot cancel identity or choose replacement',async t=>{
 const h=await mount(t,{screen:'MerchStudioScreen',props:{},picker:async()=>({uri:'file:///photo.jpg'}),uploader:async input=>{input.attempt.payload={id:'uncertain-asset'};throw Error('Acknowledgment lost');},rpc:async name=>name==='check_creator_merch_photo_target'?true:{products:[product()],nextCursor:null}});await h.press('Edit Shirt tee');await h.press('Choose product photo from Photos / Gallery');assert.equal(h.button('Cancel photo selection'),undefined);assert.equal(h.button('Choose product photo from Photos / Gallery').props.disabled,true);assert.ok(h.button('Retry photo upload'));
});
test('safety-removed photo never shows legacy fallback and creator can choose replacement',async t=>{
 const p={...product(),photoStatus:'blocked',photoAssetId:null,imageUrl:'https://example.test/old.jpg'};const shop=await mount(t,{rpc:async()=>({products:[p],nextCursor:null})});await shop.press('View Shirt tee');assert.equal(shop.all().filter(n=>n.type==='Image').length,0);const studio=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async()=>({products:[p],nextCursor:null})});await studio.press('Edit Shirt tee');assert.match(studio.text(),/removed by safety checks/);assert.equal(studio.button('Choose product photo from Photos / Gallery').props.disabled,false);
});

test('mounted merch order shows only frozen90/10NET terms and does not rewrite historical fees',async t=>{
 const current=await mount(t,{screen:'MerchOrdersScreen',props:{},rpc:async()=>({orders:[{...order('new'),netSharePolicyVersion:'physical_merch_net_90_10_v1',platformNetShareBps:1000,creatorNetShareBps:9000}],nextCursor:null})});assert.match(current.text(),/Recorded merch terms: creator 90% \/ app 10% of net/);assert.match(current.text(),/Provider fees and final net are not yet verified/);
 const old=await mount(t,{screen:'MerchOrdersScreen',props:{},rpc:async()=>({orders:[order('historical')],nextCursor:null})});assert.match(old.text(),/Historical order: no new revenue-share terms applied/);assert.doesNotMatch(old.text(),/Recorded merch terms:/);
});

test('mounted merch discloses prospective return terms without treating creator delivery or elapsed time as payable',async t=>{
 const shop=await mount(t,{rpc:async()=>({products:[product()],nextCursor:null})});await shop.press('View Shirt tee');
 assert.match(shop.text(),/30-day return window starting at verified delivery/);assert.match(shop.text(),/Sandbox fulfillment status is not verified delivery/);
 const terms={returnPolicyVersion:'physical_merch_verified_delivery_30d_v1',returnWindowDays:30};
 const unverified=await mount(t,{screen:'MerchOrdersScreen',props:{},rpc:async()=>({orders:[{...order('unverified'),...terms,fulfillmentStatus:'delivered',returnWindowStatus:'awaiting_verified_delivery'}],nextCursor:null})});
 assert.match(unverified.text(),/Return window has not started: verified delivery is required/);
 const elapsed=await mount(t,{screen:'MerchOrdersScreen',props:{},rpc:async()=>({orders:[{...order('elapsed'),...terms,verifiedDeliveryAt:'2026-09-01T00:00:00Z',returnWindowStatus:'elapsed'}],nextCursor:null})});
 assert.match(elapsed.text(),/does not make earnings available for cash-out; other holds still apply/);
 const disputed=await mount(t,{screen:'MerchOrdersScreen',props:{},rpc:async()=>({orders:[{...order('review'),...terms,verifiedDeliveryAt:'2026-09-01T00:00:00Z',returnWindowStatus:'review_required'}],nextCursor:null})});
 assert.match(disputed.text(),/Return or dispute review is required/);
 const historical=await mount(t,{screen:'MerchOrdersScreen',props:{},rpc:async()=>({orders:[order('old')],nextCursor:null})});
 assert.match(historical.text(),/new 30-day return terms have not been applied/);assert.doesNotMatch(historical.text(),/Recorded return terms:/);
});

const trackingProjection = (patch={}) => ({assigned:false,providerConfigured:false,financialAuthority:false,...patch});
const trackedOrder = id => ({...order(id),shippingTrackingMode:'tracked'});
test('real mounted tracking panel binds normalized assignment once and exposes setup pending, not delivery',async t=>{
 const pending=deferred();let projection=trackingProjection();
 const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async(name)=>{
  if(name==='list_creator_merch_products')return {products:[],nextCursor:null};
  if(name==='list_my_merch_orders')return {orders:[trackedOrder('tracked')],nextCursor:null};
  if(name==='get_merch_tracking')return projection;
  if(name==='assign_merch_tracking')return pending.promise;
  throw Error(`Unexpected RPC ${name}`);
 }});
 await h.press('Customer orders');assert.match(h.text(),/Automatic tracking setup is pending/);
 await h.press('UPS');await h.change('Order tracking number',' 1z123456789 ');
 const save=h.button('Assign tracking to this order');await React.act(async()=>{save.props.onPress();save.props.onPress();});
 const calls=h.calls.filter(c=>c.name==='assign_merch_tracking');assert.equal(calls.length,1);
 assert.equal(calls[0].args.p_order_id,'tracked');assert.equal(calls[0].args.p_carrier,'ups');assert.equal(calls[0].args.p_tracking_number,'1Z123456789');
 projection=trackingProjection({assigned:true,carrier:'ups',trackingNumber:'1Z123456789',status:'UNKNOWN',confidence:'review'});
 await h.resolve(pending,projection);assert.equal(h.button('Assign tracking to this order'),undefined);
 assert.match(h.text(),/cannot be replaced or removed here/);assert.match(h.text(),/does not switch to purchase-date timing/);
 assert.equal(h.all().filter(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Order tracking number').length,0);
});
test('buyer sees corroborated carrier status separately from contents and earnings clearance',async t=>{
 const h=await mount(t,{screen:'MerchOrdersScreen',props:{},rpc:async name=>name==='list_my_merch_orders'?{orders:[trackedOrder('buyer-track')],nextCursor:null}:trackingProjection({assigned:true,providerConfigured:true,carrier:'usps',trackingNumber:'123456789',status:'DELIVERED',confidence:'corroborated',deliveryAt:'2026-10-30T12:00:00Z'})});
 assert.match(h.text(),/Carrier reports delivered/);assert.match(h.text(),/not proof of package contents/);assert.match(h.text(),/other earnings holds still apply/);
 assert.equal(h.button('Assign tracking to this order'),undefined);assert.equal(h.button('UPS'),undefined);
});
test('untracked order never creates a tracking read or assignment surface',async t=>{
 const h=await mount(t,{screen:'MerchOrdersScreen',props:{},rpc:async()=>({orders:[{...order('untracked'),shippingTrackingMode:'untracked'}],nextCursor:null})});
 assert.equal(h.calls.filter(c=>c.name.includes('merch_tracking')).length,0);assert.doesNotMatch(h.text(),/Shipment tracking/);
});
test('tracking adapter fails closed on malformed authority and hides raw provider or database errors',async t=>{
 let malformed=true;
 const h=await mount(t,{screen:'MerchOrdersScreen',props:{},rpc:async name=>{
  if(name==='list_my_merch_orders')return {orders:[trackedOrder('safe')],nextCursor:null};
  if(malformed)return trackingProjection({financialAuthority:true});
  throw Error('private-provider-secret destination payload');
 }});
 assert.match(h.text(),/Tracking could not be loaded or saved/);assert.doesNotMatch(h.text(),/Carrier reports delivered/);
 malformed=false;await h.press('Refresh shipment tracking');assert.doesNotMatch(h.text(),/private-provider-secret|destination payload/);
});
test('late tracking read from retired account cannot reveal old tracking number',async t=>{
 const pending=deferred();
 const h=await mount(t,{screen:'MerchOrdersScreen',props:{},rpc:async(name,_args,actor)=>{
  if(name==='list_my_merch_orders')return {orders:[trackedOrder(actor)],nextCursor:null};
  if(actor==='buyer')return pending.promise;
  return trackingProjection({assigned:true,carrier:'ups',trackingNumber:'NEW123456',status:'TRANSIT'});
 }});
 await h.account('replacement');assert.match(h.text(),/NEW123456/);
 await h.resolve(pending,trackingProjection({assigned:true,carrier:'ups',trackingNumber:'PRIVATEOLD123'}));
 assert.doesNotMatch(h.text(),/PRIVATEOLD123/);assert.match(h.text(),/NEW123456/);
});
test('late assignment after focus retirement is reread but cannot overwrite current tracking',async t=>{
 const pending=deferred();let projection=trackingProjection();
 const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async name=>{
  if(name==='list_creator_merch_products')return {products:[],nextCursor:null};
  if(name==='list_my_merch_orders')return {orders:[trackedOrder('focus-track')],nextCursor:null};
  if(name==='get_merch_tracking')return projection;
  if(name==='assign_merch_tracking')return pending.promise;
  throw Error(name);
 }});
 await h.press('Customer orders');await h.change('Order tracking number','123456789');await h.press('Assign tracking to this order');
 await h.focus(false);projection=trackingProjection({assigned:true,carrier:'ups',trackingNumber:'CURRENT123456',status:'TRANSIT'});await h.focus(true);
 await h.resolve(pending,trackingProjection({assigned:true,carrier:'usps',trackingNumber:'STALE123456',status:'DELIVERED'}));
 assert.match(h.text(),/CURRENT123456/);assert.doesNotMatch(h.text(),/STALE123456/);
});
test('untracked buyer disclosure and checkout transport preserve exact displayed mode, price and currency',async t=>{
 const requests=[];
 const h=await mount(t,{rpc:async()=>({products:[{...product(),shippingTrackingMode:'untracked',checkoutAvailable:true}],nextCursor:null}),fetch:async(_url,options)=>{
  requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({checkoutCreated:true,orderId:'untracked-checkout',url:'https://checkout.stripe.com/c/pay/untracked'})};
 }});
 await h.press('View Shirt tee');assert.match(h.text(),/Untracked shipping: 30-day return window starting at verified successful purchase/);
 assert.match(h.text(),/declaration is frozen for your order/);await h.press('Sandbox checkout · $20.00');
 assert.equal(requests[0].tracking_mode,'untracked');assert.equal(requests[0].expected_unit_price_minor,2000);assert.equal(requests[0].expected_currency,'usd');
});
test('creator has no default shipping mode and must explicitly choose before saving',async t=>{
 const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async name=>name==='save_creator_merch_product_with_tracking'?{...product('new'),shippingTrackingMode:'untracked'}:{products:[],nextCursor:null}});
 await h.press('Add product');assert.equal(h.button('Tracked shipping').props.accessibilityState.selected,false);assert.equal(h.button('Untracked shipping').props.accessibilityState.selected,false);
 await h.change('Product title','Explicit mode');await h.change('Price (USD)','15');await h.press('Save draft');
 assert.match(h.text(),/Choose tracked or untracked shipping/);assert.equal(h.calls.filter(c=>c.name==='save_creator_merch_product_with_tracking').length,0);
 await h.press('Untracked shipping');assert.equal(h.button('Untracked shipping').props.accessibilityState.selected,true);await h.press('Save draft');
 assert.equal(h.calls.find(c=>c.name==='save_creator_merch_product_with_tracking').args.p_tracking_mode,'untracked');
});
test('untracked order requires verified purchase proof and elapsed window never promises payout',async t=>{
 const terms={shippingTrackingMode:'untracked',returnPolicyVersion:'physical_merch_declared_untracked_30d_v2',returnWindowDays:30};
 const missing=await mount(t,{screen:'MerchOrdersScreen',props:{},rpc:async()=>({orders:[{...order('unknown-purchase'),...terms,returnWindowStatus:'awaiting_verified_purchase'}],nextCursor:null})});
 assert.match(missing.text(),/Recorded return terms: 30 days from verified successful purchase/);
 assert.match(missing.text(),/Return window has not started: verified successful purchase is required/);assert.doesNotMatch(missing.text(),/Shipment tracking/);
 const elapsed=await mount(t,{screen:'MerchOrdersScreen',props:{},rpc:async()=>({orders:[{...order('elapsed-purchase'),...terms,verifiedPurchaseAt:'2026-09-01T00:00:00Z',returnWindowStatus:'elapsed'}],nextCursor:null})});
 assert.match(elapsed.text(),/return window has elapsed/);assert.match(elapsed.text(),/does not make earnings available for cash-out/);
 assert.doesNotMatch(elapsed.text(),/verified delivery is required/);
});

test('creator order help retains creator context and exact order without buyer read',async t=>{
 const id='ab333333-3333-4333-8333-333333333333';
 const h=await mount(t,{screen:'MerchStudioScreen',props:{orderId:id},rpc:async(name,args)=>name==='list_creator_merch_products'?{products:[],nextCursor:null}:name==='list_my_merch_orders'?{orders:[{...order(id),fulfillmentStatus:'blocked'}],nextCursor:null}:{cases:[],canManage:false}});
 const read=h.calls.find(x=>x.name==='list_my_merch_orders');assert.equal(read.args.p_role,'creator');assert.equal(read.args.p_order_id,id);
 await h.press('Get order help');assert.deepEqual(JSON.parse(JSON.stringify(h.routes.at(-1))),{pathname:'/support',params:{orderId:id,orderRole:'creator'}});
 await h.press('All customer orders');assert.equal(h.routes.at(-1),'/merch/studio');
});

test('creator queue badge discovers unresolved cases across orders, paginates and opens exact case with creator authority',async t=>{
 const cursor='ab333333-3333-4333-8333-333333333333';
 const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async(name,args)=>name==='list_merch_return_case_queue'?{role:'creator',totalCount:51,nextCursor:args.p_after?null:cursor,cases:[{id:args.p_after?'case-51':'case-1',orderId:'exact-order',kind:'non_delivery',status:'open',createdAt:'2026-10-01',events:[]}]}:{products:[],nextCursor:null}});
 assert.ok(h.button('Unresolved return / delivery cases (51)'));await h.press('Unresolved return / delivery cases (51)');await h.press('Next case page');await h.press('Open case case-51');
 assert.deepEqual(JSON.parse(JSON.stringify(h.routes.at(-1))),{pathname:'/merch/studio',params:{orderId:'exact-order',caseId:'case-51'}});
 await h.press('Refresh case queue');assert.ok(h.button('Open case case-1'));
});

test('creator queue late page cannot disclose cases after exact-account replacement',async t=>{
 const d=deferred();const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async(name,_args,actor)=>name==='list_merch_return_case_queue'?(actor==='buyer'?d.promise:{role:'creator',totalCount:0,nextCursor:null,cases:[]}):{products:[],nextCursor:null}});
 await h.account('other');await h.resolve(d,{role:'creator',totalCount:99,nextCursor:null,cases:[]});assert.ok(h.button('Unresolved return / delivery cases (0)'));assert.doesNotMatch(h.text(),/\(99\)/);
});

test('creator case destination filters exact case after authorized exact-order read, not a different case',async t=>{
 const row=id=>({id,orderId:'exact-order',kind:'non_delivery',status:'open',createdAt:'2026-10-01',events:[{id:id+'-event',action:'opened',actorRole:'buyer',note:id==='selected-case'?'SELECTED DETAILS':'OTHER CASE DETAILS',createdAt:'2026-10-01'}]});
 const h=await mount(t,{screen:'MerchStudioScreen',props:{orderId:'exact-order',caseId:'selected-case'},rpc:async(name,args)=>{
 if(name==='list_merch_return_case_queue')return {role:'creator',totalCount:2,nextCursor:null,cases:[]};
 if(name==='read_merch_return_cases'){assert.equal(args.p_order_id,'exact-order');return {cases:[row('selected-case'),row('other-case')],canManage:true};}
 if(name==='list_my_merch_orders')return {orders:[{...order('exact-order'),paymentStatus:'paid'}],nextCursor:null};
 return {products:[],nextCursor:null};}});
 await h.press('View return cases');assert.match(h.text(),/SELECTED DETAILS/);assert.doesNotMatch(h.text(),/OTHER CASE DETAILS/);assert.ok(h.button('Respond to case selected-case'));assert.equal(h.button('Respond to case other-case'),undefined);
});

for(const fresh of [false,true])test(`creator payment review shows neutral ${fresh?'checked':'needs refresh'} wording without promising availability`,async t=>{
 const checked=new Date(Date.now()-60000).toISOString(),until=new Date(Date.now()+60000).toISOString();
 const h=await mount(t,{screen:'MerchStudioScreen',props:{orderId:'review-order'},rpc:async name=>name==='list_merch_return_case_queue'?{role:'creator',totalCount:0,nextCursor:null,cases:[]}:name==='list_my_merch_orders'?{orders:[{...order('review-order'),providerDisputeState:'none',providerDisputeRefreshStatus:fresh?'fresh':'stale',providerDisputeCheckedAt:checked,providerDisputeFreshUntil:until}],nextCursor:null}:{products:[],nextCursor:null}});
 assert.match(h.text(),fresh?/Payment review checked/:/Payment review needs refreshed verification/);assert.match(h.text(),/not confirmation that earnings are available/);
});

test('live publication displays exact server review and only confirms explicit creator consent',async t=>{
 const p=product();const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async(name,args)=>{
  if(name==='review_creator_merch_live_publication')return {ready:true,reviewId:'review-1',title:p.title,priceMinor:2000,currency:'usd',availableQuantity:2,trackingMode:'tracked',summary:'Real purchases. Net fees apply.'};
  if(name==='confirm_creator_merch_live_publication')return {...p,environment:'production'};
  return {products:[p],nextCursor:null};
 }});
 await h.press('Edit Shirt tee');await h.press('Review live publishing');
 assert.match(h.text(),/Real purchases/);assert.equal(h.calls.filter(c=>c.name==='confirm_creator_merch_live_publication').length,0);
 const review=h.calls.find(c=>c.name==='review_creator_merch_live_publication');assert.equal(review.args.p_expected_updated_at,p.updatedAt);assert.equal(Object.hasOwn(review.args,'environment'),false);
 await h.press('Confirm publish for real purchases');const confirm=h.calls.find(c=>c.name==='confirm_creator_merch_live_publication');assert.deepEqual(JSON.parse(JSON.stringify(confirm.args)),{p_review_id:'review-1'});
});
test('unsaved edits and cancelled live review cannot publish; test-history copy stays explicit',async t=>{
 const p=product();const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async name=>name==='review_creator_merch_live_publication'?{ready:false,copyRequired:true,reason:'Test order history needs a separate draft.'}:name==='copy_creator_merch_live_draft'?{...p,id:'copy',publicationStatus:'draft',imageUrl:null,photoAssetId:null}:{products:[p],nextCursor:null}});
 await h.press('Edit Shirt tee');await h.change('Price (USD)','21');await h.press('Review live publishing');assert.match(h.text(),/Save your changes first/);assert.equal(h.calls.filter(c=>c.name==='review_creator_merch_live_publication').length,0);
 await h.change('Price (USD)','20');await h.press('Review live publishing');assert.equal(h.calls.filter(c=>c.name==='copy_creator_merch_live_draft').length,0);
 await h.press('Create separate live-ready draft copy');assert.equal(h.calls.filter(c=>c.name==='copy_creator_merch_live_draft').length,1);assert.match(h.text(),/original test listing is unchanged/);
});

test('creator chooses only server categories and unknown request is explicit, never a tax override',async t=>{
 const p=product();let selected=false;
 const h=await mount(t,{screen:'MerchStudioScreen',props:{},taxRpc:true,rpc:async(name,args)=>{
  if(name==='list_creator_merch_tax_categories')return {categories:[{id:'category-approved',categoryKey:'reviewed-fixture',label:'Approved fixture category',revision:1}],selection:selected?{status:'review_required',categoryId:null,requestId:'request-1',reason:'Waiting for owner review.'}:null};
  if(name==='select_creator_merch_tax_category'){selected=true;return {status:'review_required',categoryId:args.p_category_id,requestId:'request-1',reason:'Waiting for owner review.',updatedAt:'2026-11-01T00:00:00Z'};}
  return {products:[p],nextCursor:null};
 }});
 await h.press('Edit Shirt tee');assert.ok(h.button('Use category: Approved fixture category'));assert.equal(h.calls.filter(c=>c.name==='select_creator_merch_tax_category').length,0);
 await h.press('Request review for an unlisted category');assert.match(h.text(),/Describe what the product/);assert.equal(h.calls.filter(c=>c.name==='select_creator_merch_tax_category').length,0);
 await h.change('Describe product for category review','Handmade decorative item, materials need review');await h.press('Request review for an unlisted category');
 const call=h.calls.find(c=>c.name==='select_creator_merch_tax_category');assert.equal(call.args.p_category_id,null);assert.equal(call.args.p_expected_updated_at,p.updatedAt);assert.equal(Object.hasOwn(call.args,'taxCode'),false);assert.match(h.text(),/Waiting for owner review/);
 assert.equal(h.calls.filter(c=>c.name==='confirm_creator_merch_live_publication').length,0);
});
test('pending category result cannot cross an account switch',async t=>{
 const pending=deferred(),p=product();const h=await mount(t,{screen:'MerchStudioScreen',props:{},taxRpc:true,rpc:async name=>name==='list_creator_merch_tax_categories'?pending.promise:{products:[p],nextCursor:null}});
 await h.press('Edit Shirt tee');await h.account('new-account');await h.resolve(pending,{categories:[{id:'private-category',categoryKey:'private',label:'Previous creator private category',revision:1}],selection:null});assert.doesNotMatch(h.text(),/Previous creator private category/);
});
