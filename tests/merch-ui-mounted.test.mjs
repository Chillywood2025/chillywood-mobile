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
const product = (id='tee') => ({id,creatorId:'creator',title:`Shirt ${id}`,description:'Cotton test shirt',imageUrl:null,priceMinor:2000,currency:'usd',publicationStatus:'published',stockQuantity:2,availableQuantity:2,environment:'sandbox',checkoutAvailable:false,checkoutReason:'Approved sandbox testers only.',updatedAt:'2026-10-29T00:00:00Z',shippingSummary:'Sandbox only — no physical shipment.'});
const order = id => ({id,creatorId:'creator',productId:'tee',title:`Order shirt ${id}`,quantity:1,totalMinor:2000,currency:'usd',paymentStatus:'paid',fulfillmentStatus:'not_started',refundedAmountMinor:0,createdAt:'2026-10-29T00:00:00Z',updatedAt:'2026-10-29T00:00:00Z',environment:'sandbox'});
const session = id => ({user:{id},authorityStatus:'active',authority:{userId:id,accountId:id,sessionGeneration:id,state:'ACTIVE',restoreOnly:false}});
const textOf = x => Array.isArray(x) ? x.map(textOf).join(' ') : x==null||typeof x==='boolean' ? '' : typeof x==='string'||typeof x==='number' ? String(x) : textOf(x.props?.children);
async function mount(t,{screen='MerchShopScreen',props={creatorId:'creator'},rpc,fetch:fetcher,mutateScreen,picker=async()=>null,uploader=async()=>{throw Error("Unexpected upload");}}={}) {
  const nodes=new Map(),calls=[],routes=[],opens=[];let current=session('buyer'),focused=true;
  const host=name=>function Host(p){const id=React.useId();nodes.set(id,{type:name,props:p});React.useLayoutEffect(()=>()=>nodes.delete(id),[id]);return React.createElement(React.Fragment,null,...React.Children.toArray(p.children).filter(v=>typeof v==='object'));};
  const native={StyleSheet:{create:x=>x},Linking:{openURL:async u=>opens.push(u)}};for(const n of ['View','Text','TextInput','Pressable','ScrollView','ActivityIndicator','Image'])native[n]=host(n);
  function compile(file,imports,extras={}) {const exports={};let source=fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');if(file==='components/merch/merch-screens.tsx'&&mutateScreen)source=mutateScreen(source);vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require:imports,console,Intl,Date,Map,Promise,URL,Error,Uint8Array,crypto:webcrypto,fetch:fetcher??(async()=>{throw Error('Unexpected fetch');}),...extras});return exports;}
  const helper=compile('_lib/creatorMerch.ts',name=>name==='react-native'?native:name.endsWith('/merchProductPhotos')?{resolveMerchProductPhotos:products=>photos.resolveMerchProductPhotos(products)}:name.endsWith('/supabase')?{SUPABASE_URL:'https://example.test'}:{
    runCurrentAccountBoundSupabaseMutationRpc:async(name,args)=>{calls.push({name,args,actor:current.user.id});return {data:await rpc(name,args,current.user.id),error:null};},
    captureAccountBoundSupabaseMutationSubject:async()=>({accessToken:'fixture',authority:current.authority}),assertAccountBoundSupabaseMutationSubjectCurrent:s=>{assert.equal(s.authority,current.authority,'exact account unchanged');},
  });
  const photos=compile('_lib/merchProductPhotos.ts',name=>name.endsWith('/socialAttachmentPicker')?{pickSocialAttachmentFile:picker}:name.endsWith('/imageUploadNormalization')?{normalizeImageUploadFile:async file=>({file,cleanup:async()=>{}})}:name.endsWith('/platformBranding')?{uploadPlatformBrandAsset:uploader}:name.endsWith('/supabase')?{SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'fixture'}:{
    captureAccountBoundSupabaseMutationSubject:async()=>({accessToken:'fixture',authority:current.authority}),assertAccountBoundSupabaseMutationSubjectCurrent:s=>{assert.equal(s.authority,current.authority,'exact account unchanged');},
    invokeAccountBoundSupabaseMutationRpc:async(_subject,name,args)=>{calls.push({name,args,actor:current.user.id});return {data:await rpc(name,args,current.user.id),error:null};},
  });
  const module=compile('components/merch/merch-screens.tsx',name=>name==='react'?React:name==='react-native'?native:name==='expo-router'?{
    useRouter:()=>({push:r=>routes.push(r),back:()=>routes.push('back'),replace:r=>routes.push(r),canGoBack:()=>true}),
    useFocusEffect:fn=>React.useEffect(()=>focused?fn():undefined,[fn,focused]),
  }:name.endsWith('/session')?{useSession:()=>current}:name.endsWith('/merchProductPhotos')?photos:helper);
  const root=createRoot(container()),render=()=>React.act(async()=>root.render(React.createElement(module[screen],props)));
  await render();t.after(()=>React.act(async()=>root.unmount()));
  const all=()=>[...nodes.values()],button=label=>all().find(n=>n.type==='Pressable'&&n.props.accessibilityLabel===label);
  return {calls,routes,opens,all,button,text:()=>all().filter(n=>n.type==='Text').map(textOf).join('\n'),
    press:async label=>{const b=button(label);assert.ok(b,`button ${label}`);assert.equal(b.props.disabled,false);await React.act(async()=>{b.props.onPress();});},
    change:async(label,value)=>{const n=all().find(n=>n.type==='TextInput'&&n.props.accessibilityLabel===label);assert.ok(n);await React.act(async()=>n.props.onChangeText(value));},
    account:async id=>{current=session(id);await render();},resolve:async(d,v)=>React.act(async()=>d.resolve(v)),focus:async v=>{focused=v;await render();},
  };
}
test('shop product detail shows price, shipping and disabled checkout reason through real helper RPC',async t=>{
 const h=await mount(t,{rpc:async()=>({products:[product()],nextCursor:null})});
 assert.equal(h.calls[0].name,'list_creator_merch_products');assert.equal(h.calls[0].args.p_creator_id,'creator');
 await h.press('View Shirt tee');assert.match(h.text(),/\$20.00/);assert.match(h.text(),/no physical shipment/);assert.match(h.text(),/Checkout unavailable:\s+Approved sandbox testers only/);assert.equal(h.button('Sandbox checkout · $20.00'),undefined);
 await h.press('All products');assert.ok(h.button('View Shirt tee'));await h.press('My orders');assert.equal(h.routes.at(-1),'/merch/orders');
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
test('creator editor validates, saves through real RPC and prevents duplicate submits',async t=>{
 const pending=deferred();const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async(name)=>name==='save_creator_merch_product'?pending.promise:{products:[],nextCursor:null}});
 await h.press('Add product');await h.press('Publish listing');assert.match(h.text(),/Enter a title/);assert.equal(h.calls.filter(c=>c.name==='save_creator_merch_product').length,0);
 await h.change('Product title','New shirt');await h.change('Price (USD)','24.99');await h.change('Available stock','3');await h.press('Publish listing');assert.equal(h.button('Publish listing').props.disabled,true);
 const call=h.calls.find(c=>c.name==='save_creator_merch_product');assert.equal(call.args.p_price_minor,2499);assert.equal(call.args.p_publication_status,'published');assert.equal(call.args.p_stock_quantity,3);
 await h.resolve(pending,product('saved'));assert.ok(h.button('Add product'));
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
 let writes=0;const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async(name)=>{if(name==='save_creator_merch_product'){writes++;throw Error('Product changed. Refresh before editing.');}return {products:[],nextCursor:null};}});
 await h.press('Add product');await h.change('Product title','Keep this draft');await h.change('Price (USD)','10');await h.change('Available stock','2');await h.press('Save draft');
 assert.match(h.text(),/Product changed/);assert.equal(h.all().find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Product title').props.value,'Keep this draft');assert.equal(h.button('Save draft').props.disabled,false);assert.equal(writes,1);
 await h.press('Cancel editing');assert.ok(h.button('Add product'));
});
test('creator records sandbox fulfillment only, with exact optimistic previous status',async t=>{
 const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async(name)=>name==='list_creator_merch_products'?{products:[],nextCursor:null}:name==='list_my_merch_orders'?{orders:[{...order('ready'),fulfillmentStatus:'processing'}],nextCursor:null}:order('ready')});
 await h.press('Customer orders');assert.match(h.text(),/do not dispatch or deliver/);await h.press('Record sandbox shipped');
 const call=h.calls.find(c=>c.name==='update_creator_merch_fulfillment');assert.equal(call.args.p_status,'shipped');assert.equal(call.args.p_expected_status,'processing');assert.equal(call.args.p_order_id,'ready');
});
test('new product retains the same UUID across uncertain save retries',async t=>{
 const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async(name)=>{if(name==='save_creator_merch_product')throw Error('Outcome unknown');return {products:[],nextCursor:null};}});
 await h.press('Add product');await h.change('Product title','One product');await h.change('Price (USD)','10');await h.press('Save draft');await h.press('Save draft');
 const calls=h.calls.filter(c=>c.name==='save_creator_merch_product');assert.equal(calls.length,2);assert.match(calls[0].args.p_product_id,/^[0-9a-f-]{36}$/);assert.equal(calls[0].args.p_product_id,calls[1].args.p_product_id);
});
test('restocking edits available units while preserving held and sold allocations',async t=>{
 const sold={...product('sold'),stockQuantity:10,availableQuantity:0};const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async(name)=>name==='save_creator_merch_product'?sold:{products:[sold],nextCursor:null}});
 await h.press('Edit Shirt sold');assert.equal(h.all().find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Available stock').props.value,'0');assert.match(h.text(),/10\s+units already held or sold/);
 await h.change('Available stock','5');await h.press('Publish listing');const call=h.calls.find(c=>c.name==='save_creator_merch_product');assert.equal(call.args.p_stock_quantity,15);assert.equal(call.args.p_expected_updated_at,sold.updatedAt);
});
test('negative control: removing exact-account remount makes the private-order invariant fail',async t=>{
 const h=await mount(t,{screen:'MerchOrdersScreen',props:{},rpc:async()=>({orders:[order('private-buyer')],nextCursor:null}),mutateScreen:s=>{assert.ok(s.includes('key={JSON.stringify(authority)}'));return s.replace('key={JSON.stringify(authority)}','key="broken-static-key"');}});
 assert.match(h.text(),/private-buyer/);await h.account('other');assert.throws(()=>assert.doesNotMatch(h.text(),/private-buyer/),/private-buyer/);
});
test('negative control: removing synchronous checkout latch admits repeated-tap requests',async t=>{
 const pending=deferred();let fetches=0;const h=await mount(t,{rpc:async()=>({products:[{...product(),checkoutAvailable:true}],nextCursor:null}),fetch:async()=>{fetches++;return pending.promise;},mutateScreen:s=>{assert.ok(s.includes('!selected || latch.current || page.loading'));return s.replace('!selected || latch.current || page.loading','!selected || page.loading');}});
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
 await studio.press('Add product');await studio.change('Product title','Old account draft');await studio.change('Price (USD)','10');const staleSave=studio.button('Publish listing').props.onPress;
 await studio.account('replacement');await React.act(async()=>staleSave());assert.equal(studio.calls.filter(c=>c.name==='save_creator_merch_product').length,0);
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
 const p=optionsProduct();const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async(name)=>name==='configure_creator_merch_variants'?{...p,updatedAt:'new-revision'}:name==='save_creator_merch_product'?p:{products:[p],nextCursor:null}});
 await h.press('Edit Shirt tee');await h.press('Manage sizes / colors');await h.change('Option 1 Available stock','5');await h.press('Archive option 2');await h.press('Save sizes / colors');
 const call=h.calls.find(c=>c.name==='configure_creator_merch_variants');assert.equal(call.args.p_variants[0].stockQuantity,7);assert.equal(call.args.p_variants[1].status,'archived');assert.equal(call.args.p_expected_updated_at,p.updatedAt);
 await h.press('Save draft');assert.equal(h.calls.find(c=>c.name==='save_creator_merch_product').args.p_expected_updated_at,'new-revision');
});
test('pending SKU order displays immutable labels and resumes the same option',async t=>{
 const requests=[];const h=await mount(t,{screen:'MerchOrdersScreen',props:{},rpc:async()=>({orders:[{...order('sku'),paymentStatus:'pending',variantId:'small',sku:'ORIGINAL-SKU',size:'Old size',color:'Old color',checkoutResumeAvailable:true,checkoutAttemptId:'original'}],nextCursor:null}),fetch:async(_u,o)=>{requests.push(JSON.parse(o.body));return {ok:true,json:async()=>({checkoutCreated:true,orderId:'sku',url:'https://checkout.stripe.com/c/pay/sku'})};}});
 assert.match(h.text(),/Old size \/ Old color/);assert.match(h.text(),/ORIGINAL-SKU/);await h.press('Resume same sandbox checkout');assert.equal(requests[0].variant_id,'small');assert.equal(requests[0].attempt_id,'original');
});
test('photo picker cancellation never allocates an asset or saves a product',async t=>{
 const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async()=>({products:[product()],nextCursor:null}),picker:async()=>null});
 await h.press('Edit Shirt tee');await h.press('Choose product photo');assert.equal(h.calls.length,1);assert.equal(h.button('Use this photo'),undefined);
});
test('photo upload failure retries same staged identity and assignment is explicit with latest revision',async t=>{
 let uploads=0;const attempts=[];const h=await mount(t,{screen:'MerchStudioScreen',props:{},picker:async()=>({uri:'file:///photo.jpg',mimeType:'image/jpeg',name:'photo.jpg'}),uploader:async input=>{attempts.push(input.attempt);if(++uploads===1)throw Error('Upload interrupted');return {id:'asset',scanStatus:'pending',moderationStatus:'clean'};},rpc:async(name)=>name==='check_creator_merch_photo_target'?true:name==='assign_merch_product_photo'?{...product(),photoAssetId:'asset',photoStatus:'pending_review',updatedAt:'photo-revision'}:name==='save_creator_merch_product'?product():{products:[product()],nextCursor:null}});
 await h.press('Edit Shirt tee');await h.press('Choose product photo');assert.match(h.text(),/Upload interrupted/);await h.press('Retry photo upload');assert.equal(attempts[0],attempts[1]);assert.match(h.text(),/Not attached yet/);assert.equal(h.calls.filter(c=>c.name==='assign_merch_product_photo').length,0);
 await h.press('Use this photo');assert.match(h.text(),/Attached photo: pending_review/);await h.press('Save draft');const save=h.calls.find(c=>c.name==='save_creator_merch_product');assert.equal(save.args.p_expected_updated_at,'photo-revision');assert.equal(save.args.p_image_url,null);
});
test('account replacement while picker is open cannot upload or attach old account photo',async t=>{
 const chosen=deferred();let uploads=0;const h=await mount(t,{screen:'MerchStudioScreen',props:{},picker:()=>chosen.promise,uploader:async()=>{uploads++;},rpc:async()=>({products:[product()],nextCursor:null})});
 await h.press('Edit Shirt tee');await h.press('Choose product photo');await h.account('other');await h.resolve(chosen,{uri:'file:///private.jpg'});assert.equal(uploads,0);assert.equal(h.calls.filter(c=>c.name==='assign_merch_product_photo').length,0);assert.equal(h.button('Use this photo'),undefined);
});
test('blocked or unrecoverable order has a direct support path without implying refund',async t=>{
 const h=await mount(t,{screen:'MerchOrdersScreen',props:{},rpc:async()=>({orders:[{...order('help'),paymentStatus:'pending',checkoutResumeAvailable:false}],nextCursor:null})});await h.press('Get order help');assert.deepEqual(h.routes.at(-1).pathname,'/support');assert.equal(h.routes.at(-1).params.orderId,'help');
});
test('focus refresh retires previously selected SKU when that option becomes paused',async t=>{
 let p=optionsProduct();const h=await mount(t,{rpc:async()=>({products:[p],nextCursor:null})});await h.press('View Shirt tee');await h.press('S / Blue');await h.focus(false);p={...p,variants:p.variants.map(v=>({...v,status:'paused'}))};await h.focus(true);await h.press('View Shirt tee');assert.equal(h.button('Sandbox checkout · $20.00'),undefined);assert.equal(h.button('S / Blue · Unavailable').props.disabled,true);
});
test('photo assignment failure leaves staged selection for explicit retry and never publishes',async t=>{
 let assigns=0;const h=await mount(t,{screen:'MerchStudioScreen',props:{},picker:async()=>({uri:'file:///photo.jpg'}),uploader:async()=>({id:'asset',scanStatus:'clean',moderationStatus:'clean'}),rpc:async(name)=>{if(name==='assign_merch_product_photo'){assigns++;throw Error('Product changed. Reload before attaching.');}return name==='check_creator_merch_photo_target'?true:{products:[product()],nextCursor:null};}});
 await h.press('Edit Shirt tee');await h.press('Choose product photo');await h.press('Use this photo');assert.match(h.text(),/Reload before attaching/);assert.ok(h.button('Use this photo'));assert.equal(assigns,1);assert.equal(h.calls.filter(c=>c.name==='save_creator_merch_product').length,0);
});
test('late photo upload after leaving and returning cannot expose staged preview or attach',async t=>{
 const upload=deferred();const h=await mount(t,{screen:'MerchStudioScreen',props:{},picker:async()=>({uri:'file:///private.jpg'}),uploader:()=>upload.promise,rpc:async name=>name==='check_creator_merch_photo_target'?true:{products:[product()],nextCursor:null}});
 await h.press('Edit Shirt tee');await h.press('Choose product photo');await h.focus(false);await h.focus(true);await h.resolve(upload,{id:'asset',scanStatus:'clean',moderationStatus:'clean'});assert.equal(h.button('Use this photo'),undefined);assert.equal(h.calls.filter(c=>c.name==='assign_merch_product_photo').length,0);
});
test('negative control: dropping selected variant from production checkout is detected at API boundary',async t=>{
 const requests=[];const h=await mount(t,{mutateScreen:s=>s.replace('variantId: selectedVariant?.id ?? null','variantId: null'),rpc:async()=>({products:[optionsProduct()],nextCursor:null}),fetch:async(_u,o)=>{requests.push(JSON.parse(o.body));return {ok:true,json:async()=>({checkoutCreated:true,orderId:'sku',url:'https://checkout.stripe.com/c/pay/sku'})};}});await h.press('View Shirt tee');await h.press('S / Blue');await h.press('Sandbox checkout · $20.00');assert.throws(()=>assert.equal(requests[0].variant_id,'small'));
});
test('managed photo preview never becomes the catalog legacy HTTPS fallback',async t=>{
 const p={...product(),photoAssetId:'asset',photoStatus:'ready',photoUrl:'https://example.test/signed-private?token=temporary'};const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async name=>name==='save_creator_merch_product'?p:{products:[p],nextCursor:null}});await h.press('Edit Shirt tee');await h.press('Save draft');assert.equal(h.calls.find(c=>c.name==='save_creator_merch_product').args.p_image_url,null);
});
test('creator can pause every SKU and buyer storefront exposes no purchasable option',async t=>{
 let p=optionsProduct();const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async(name,args)=>{if(name==='configure_creator_merch_variants'){p={...p,variants:args.p_variants.map(v=>({...v,availableQuantity:v.status==='active'?2:0})),availableQuantity:0,checkoutAvailable:false,updatedAt:'paused-revision'};return p;}return {products:[p],nextCursor:null};}});
 await h.press('Edit Shirt tee');await h.press('Manage sizes / colors');await h.press('Pause option 1');await h.press('Archive option 2');await h.press('Save sizes / colors');assert.ok(h.button('Manage sizes / colors'));assert.equal(h.calls.find(c=>c.name==='configure_creator_merch_variants').args.p_variants[0].status,'paused');
 const shop=await mount(t,{rpc:async()=>({products:[p],nextCursor:null})});await shop.press('View Shirt tee');assert.equal(shop.button('S / Blue · Unavailable').props.disabled,true);assert.equal(shop.button('Sandbox checkout · $20.00'),undefined);
});
test('explicit photo assignment keeps local preview only for bound asset and removal clears it',async t=>{
 const h=await mount(t,{screen:'MerchStudioScreen',props:{},picker:async()=>({uri:'file:///selected.jpg'}),uploader:async()=>({id:'asset',scanStatus:'pending',moderationStatus:'clean'}),rpc:async(name,args)=>name==='check_creator_merch_photo_target'?true:name==='assign_merch_product_photo'?{...product(),photoAssetId:args.p_asset_id,photoStatus:args.p_asset_id?'pending_review':'none',photoStoragePath:args.p_asset_id?'private/path':null,updatedAt:'assigned'}:{products:[product()],nextCursor:null}});
 await h.press('Edit Shirt tee');await h.press('Choose product photo');await h.press('Use this photo');assert.equal(h.all().find(n=>n.type==='Image'&&n.props.accessibilityLabel==='Product photo preview').props.source.uri,'file:///selected.jpg');assert.match(h.text(),/Attached photo: pending_review/);assert.equal(h.button('Use this photo'),undefined);
 await h.press('Remove product photo');assert.equal(h.all().find(n=>n.type==='Image'&&n.props.accessibilityLabel==='Product photo preview'),undefined);
});
test('staged photo discard retries exact asset, blocks replacement, and retains selection until confirmed',async t=>{
 let discards=0,picks=0;const h=await mount(t,{screen:'MerchStudioScreen',props:{},picker:async()=>{picks++;return {uri:'file:///selected.jpg'};},uploader:async()=>({id:'staged-asset',scanStatus:'pending',moderationStatus:'clean'}),rpc:async(name,args)=>{if(name==='discard_creator_merch_photo'){discards++;if(discards===1)throw Error('Removal interrupted');return {assetId:args.p_asset_id,deletedAt:'retained'};}return name==='check_creator_merch_photo_target'?true:{products:[product()],nextCursor:null};}});
 await h.press('Edit Shirt tee');await h.press('Choose product photo');assert.equal(h.button('Choose product photo').props.disabled,true);await h.press('Discard selected photo');assert.match(h.text(),/Removal interrupted/);assert.ok(h.button('Use this photo'));assert.equal(h.button('Choose product photo').props.disabled,true);await h.press('Discard selected photo');assert.equal(h.button('Use this photo'),undefined);assert.equal(h.button('Choose product photo').props.disabled,false);assert.equal(picks,1);assert.deepEqual(h.calls.filter(c=>c.name==='discard_creator_merch_photo').map(c=>c.args.p_asset_id),['staged-asset','staged-asset']);
});
test('photo approval is absent for pending scan and blocked photos',async t=>{
 for(const photoStatus of ['pending_review','blocked']) {const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async()=>({products:[{...product(),photoAssetId:'asset',photoStatus,photoCanApprove:false}],nextCursor:null})});await h.press('Edit Shirt tee');assert.equal(h.button('Approve photo for display'),undefined);assert.equal(h.calls.filter(c=>c.name==='approve_creator_merch_photo').length,0);}
});
test('eligible photo approval is explicit and updates revision without publishing',async t=>{
 const p={...product(),photoAssetId:'asset',photoStatus:'pending_review',photoCanApprove:true};const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async name=>name==='approve_creator_merch_photo'?{...p,photoCanApprove:false,photoStatus:'ready',updatedAt:'approved-revision'}:name==='save_creator_merch_product'?p:{products:[p],nextCursor:null}});await h.press('Edit Shirt tee');assert.equal(h.calls.filter(c=>c.name==='approve_creator_merch_photo').length,0);await h.press('Approve photo for display');assert.equal(h.calls.find(c=>c.name==='approve_creator_merch_photo').args.p_expected_updated_at,p.updatedAt);assert.match(h.text(),/Attached photo: ready/);assert.equal(h.button('Approve photo for display'),undefined);assert.equal(h.calls.filter(c=>c.name==='save_creator_merch_product').length,0);await h.press('Save draft');assert.equal(h.calls.find(c=>c.name==='save_creator_merch_product').args.p_expected_updated_at,'approved-revision');
});
test('photo approval failure does not claim ready and late account response cannot expose old photo',async t=>{
 const pending=deferred();let fail=true;const p={...product(),photoAssetId:'asset',photoStatus:'pending_review',photoCanApprove:true};const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async name=>{if(name==='approve_creator_merch_photo'){if(fail)throw Error('Scan changed; cannot approve');return pending.promise;}return {products:[p],nextCursor:null};}});await h.press('Edit Shirt tee');await h.press('Approve photo for display');assert.match(h.text(),/cannot approve/);assert.doesNotMatch(h.text(),/Attached photo: ready/);fail=false;await h.press('Approve photo for display');await h.account('other');await h.resolve(pending,{...p,photoStatus:'ready',photoCanApprove:false});assert.doesNotMatch(h.text(),/Attached photo: ready/);assert.equal(h.button('Approve photo for display'),undefined);
});
test('photo status refresh reveals eligibility without accepting a concurrent product revision',async t=>{
 const p={...product(),photoAssetId:'asset',photoStatus:'pending_review',photoScanStatus:'pending',photoCanApprove:false};const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async name=>name==='read_creator_merch_photo_status'?{...p,title:'Concurrent edit',updatedAt:'concurrent-revision',photoCanApprove:true,photoScanStatus:'clean'}:name==='save_creator_merch_product'?p:{products:[p],nextCursor:null}});await h.press('Edit Shirt tee');await h.change('Product title','Unsaved title');await h.press('Refresh photo status');assert.ok(h.button('Approve photo for display'));assert.equal(h.all().find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Product title').props.value,'Unsaved title');await h.press('Save draft');assert.equal(h.calls.find(c=>c.name==='save_creator_merch_product').args.p_expected_updated_at,p.updatedAt);
});
test('paused option available units are not mislabeled as held or sold in creator editor',async t=>{
 const p={...optionsProduct(),stockQuantity:10,availableQuantity:0,variants:[{id:'paused',sku:'P',size:'M',color:null,status:'paused',stockQuantity:10,availableQuantity:8}]};const h=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async()=>({products:[p],nextCursor:null})});await h.press('Edit Shirt tee');assert.match(h.text(),/2\s+units already held or sold/);assert.doesNotMatch(h.text(),/10\s+units already held or sold/);
});
test('permanent pre-registration photo failure can cancel selection and choose a different file',async t=>{
 let picks=0,uploads=0;const h=await mount(t,{screen:'MerchStudioScreen',props:{},picker:async()=>({uri:`file:///photo-${++picks}.jpg`}),uploader:async()=>{if(++uploads===1)throw Error('Unsupported image size');return {id:'new-asset',scanStatus:'pending',moderationStatus:'clean'};},rpc:async name=>name==='check_creator_merch_photo_target'?true:{products:[product()],nextCursor:null}});await h.press('Edit Shirt tee');await h.press('Choose product photo');assert.match(h.text(),/Unsupported image size/);await h.press('Cancel photo selection');assert.equal(h.button('Choose product photo').props.disabled,false);await h.press('Choose product photo');assert.equal(picks,2);assert.ok(h.button('Use this photo'));
});
test('ambiguous registered photo upload cannot cancel identity or choose replacement',async t=>{
 const h=await mount(t,{screen:'MerchStudioScreen',props:{},picker:async()=>({uri:'file:///photo.jpg'}),uploader:async input=>{input.attempt.payload={id:'uncertain-asset'};throw Error('Acknowledgment lost');},rpc:async name=>name==='check_creator_merch_photo_target'?true:{products:[product()],nextCursor:null}});await h.press('Edit Shirt tee');await h.press('Choose product photo');assert.equal(h.button('Cancel photo selection'),undefined);assert.equal(h.button('Choose product photo').props.disabled,true);assert.ok(h.button('Retry photo upload'));
});
test('safety-removed photo never shows legacy fallback and creator can choose replacement',async t=>{
 const p={...product(),photoStatus:'blocked',photoAssetId:null,imageUrl:'https://example.test/old.jpg'};const shop=await mount(t,{rpc:async()=>({products:[p],nextCursor:null})});await shop.press('View Shirt tee');assert.equal(shop.all().filter(n=>n.type==='Image').length,0);const studio=await mount(t,{screen:'MerchStudioScreen',props:{},rpc:async()=>({products:[p],nextCursor:null})});await studio.press('Edit Shirt tee');assert.match(studio.text(),/removed by safety checks/);assert.equal(studio.button('Choose product photo').props.disabled,false);
});
