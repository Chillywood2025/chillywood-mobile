// Tests only. Loads the actual shared owner while replacing the native SDK at
// the module boundary. Never imports or invokes the physical purchase SDK.
import fs from 'node:fs';import assert from 'node:assert/strict';import ts from 'typescript';
import {runKeyedSingleFlight} from '../../_lib/actionSingleFlight.mjs';
const load=(relative,mocks={})=>{const out={};new Function('exports','require','__DEV__',ts.transpileModule(fs.readFileSync(new URL('../../'+relative,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(out,id=>{assert.ok(Object.hasOwn(mocks,id),'unmodeled runtime import: '+id);return mocks[id];},false);return out;};
export function syntheticNativePurchaseOwner({readAuthority,purchase,productionAuthorize=async()=>{},productionPurchase=()=>{throw Error('production witness unavailable');}}){
 return load('_lib/revenuecat.ts',{'expo-application':{applicationId:'com.chillywood.mobile'},'react-native':{Platform:{OS:'ios'},Linking:{}},
  'react-native-purchases':{__esModule:true,default:{configure(){},setLogHandler(){},setLogLevel(){},addCustomerInfoUpdateListener(){},getAppUserID:async()=>readAuthority().userId,purchaseStoreProduct:purchase,purchasePackage:purchase},LOG_LEVEL:{ERROR:0},PRODUCT_CATEGORY:{}},
  './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:readAuthority,readCurrentAccountSessionAuthority:async()=>readAuthority(),sameAccountSessionAuthority:(a,b)=>!!a&&!!b&&['userId','accountId','sessionGeneration','state','restoreOnly'].every(k=>a[k]===b[k])},
  './actionSingleFlight.mjs':{runKeyedSingleFlight},'./entitlementAuthority':{withAuthorityReadDeadline:async p=>await p},'./logger':{debugLog(){},reportRuntimeError(){}},
  './runtimeConfig':{getRuntimeConfig:()=>({revenueCat:{iosPublicSdkKey:'appl_synthetic_fixture',appStorePurchasesEnabled:true}})},
  './revenuecatPurchaseClosure':load('_lib/revenuecatPurchaseClosure.ts'),
  './nativeProductionPaidVideoBridge':{purchasePreparedNativeProductionVideo:productionPurchase,authorizePreparedNativeProductionVideo:productionAuthorize},
  './isolatedTestStoreBuild':{isIsolatedTestStoreFlavor:()=>false},'./isolatedTestStoreV2Build':{isIsolatedTestStoreV2Flavor:()=>false},'./isolatedTestStoreV3Build':{isIsolatedTestStoreV3Flavor:()=>false}});
}
