import { createNativeStoreReconciliationHandlerV1 } from "../_shared/native-store-reconciliation-handler-v1.ts";
import { processConfiguredNativeStoreReceiptV1 } from "../_shared/native-store-configured-process-v1.ts";

// Deliberately the existing legacy service JWT mode. No user-role claim check,
// sb_secret fallback, key creation, or alternate header grants service authority.
export function exactNativeReconciliationServiceBearer(request:Request,key:string|undefined):boolean {
 if(typeof key!=="string"||key.length<32||key.length>8192||! /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(key))return false;
 const supplied=request.headers.get("authorization")??"",expected=`Bearer ${key}`;
 if(supplied.length>8200)return false;
 let difference=supplied.length^expected.length;
 for(let i=0;i<expected.length;i++)difference|=(supplied.charCodeAt(i)||0)^expected.charCodeAt(i);
 return difference===0;
}
export const handler=createNativeStoreReconciliationHandlerV1({
 enabled:()=>Deno.env.get("NATIVE_STORE_RECONCILE_ENABLED")==="true",
 authenticate:async request=>exactNativeReconciliationServiceBearer(request,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")),
 process:processConfiguredNativeStoreReceiptV1,});
if(import.meta.main)Deno.serve(handler);
