/** Server disposition evidence only. Never a cached playback or purchase grant. */
export type NativeStoreTerminal = { id:string;selectionId:string;reservationId:string|null;
 kind:"allocated"|"cancelled_before_consume"|"refunded_before_allocation";allocationId:string|null;grantId:string|null;originalRequestId:string|null;createdAt:string };
const row=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const keys=(v:unknown,k:string[]):v is Record<string,unknown>=>row(v)&&Object.keys(v).length===k.length&&k.every(n=>Object.hasOwn(v,n));
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v);
const id=(v:unknown,p:string)=>typeof v==="string"&&v.startsWith(p)&&uuid(v.slice(p.length));
export function validNativeTerminalData(v:unknown,expected:{command:string;requestId:string;selectionId:unknown;status:unknown;dispatchAllowed:unknown}):boolean {
 if(!["cancel-preparation","terminal-recover"].includes(expected.command)||expected.dispatchAllowed!==false||!keys(v,["terminal","reason"]))return false;
 if(expected.status!=="ok")return v.terminal===null&&typeof v.reason==="string"&&/^[a-z][a-z0-9_]{0,95}$/u.test(v.reason)
  &&(expected.status==="held"||expected.status==="unknown"&&expected.command==="terminal-recover");
 const t=v.terminal;
 if(v.reason!==null||!keys(t,["id","selectionId","reservationId","kind","allocationId","grantId","originalRequestId","createdAt"])
 ||!id(t.id,"nssv1_terminal_")||t.selectionId!==expected.selectionId||!id(t.selectionId,"nssv1_selection_")
 ||typeof t.createdAt!=="string"||!/^\d{4}-\d\d-\d\dT/u.test(t.createdAt)||!Number.isFinite(Date.parse(t.createdAt)))return false;
 if(t.kind==="cancelled_before_consume")return (t.reservationId===null||id(t.reservationId,"nssv1_reservation_"))&&t.allocationId===null&&t.grantId===null&&uuid(t.originalRequestId)
  &&(expected.command!=="cancel-preparation"||t.originalRequestId===expected.requestId);
 if(!id(t.reservationId,"nssv1_reservation_")||t.originalRequestId!==null)return false;
 return t.kind==="allocated"?id(t.allocationId,"nssv1_allocation_")&&id(t.grantId,"scv1_grant_")
  :t.kind==="refunded_before_allocation"&&t.allocationId===null&&t.grantId===null;
}
