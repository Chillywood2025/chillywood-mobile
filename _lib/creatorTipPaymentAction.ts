import { retireReconciledCreatorTipCheckoutAttempt, readSavedCreatorTipCheckoutAttempt, retireAbandonedCreatorTipCheckoutAttempt } from "./creatorTipCheckoutAttempt";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import "react-native-get-random-values";
import { captureAccountBoundSupabaseMutationSubject, invokeAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "./accountSessionAuthority";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type CreatorTipPaymentSelection = { actionId: string; routeId: string; provider: "app_store" | "google_play" | "stripe_connect"; purchaseBindingId: string };
const locks = new Map<string, Promise<void>>();
const id = () => { const b = new Uint8Array(16); globalThis.crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
 const h = [...b].map(n => n.toString(16).padStart(2, "0")).join(""); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; };

/** Explicit user action only. Retire the preceding identity by authoritative
 * reconciliation or an atomic no-dispatch tombstone, never by timeout. */
export async function selectLowestCostCreatorTipAction(input: { creatorId: string; amountCents: number }): Promise<CreatorTipPaymentSelection> {
 const authority = getCurrentAccountSessionAuthoritySnapshot();
 if (!authority || authority.restoreOnly || !UUID.test(input.creatorId) || !Number.isSafeInteger(input.amountCents) || input.amountCents <= 0)
  throw new Error("Verify the current account, creator and exact tip amount.");
 const key = `@chillywood/tip-payment-action:v1:${authority.userId}:${input.creatorId}`;
 const previous = locks.get(key) ?? Promise.resolve(); let release!: () => void;
 const lock = new Promise<void>(resolve => { release = resolve; }); locks.set(key,lock); await previous;
 try {
  const subject = await captureAccountBoundSupabaseMutationSubject(authority.userId);
  const current = () => sameAccountSessionAuthority(authority,getCurrentAccountSessionAuthoritySnapshot()) && sameAccountSessionAuthority(authority,subject.authority);
  if (!current()) throw new Error("Account changed before tip selection.");
  const legacy = await readSavedCreatorTipCheckoutAttempt(authority.userId,input.creatorId);
  if (legacy) {
   const outcome = await invokeAccountBoundSupabaseMutationRpc<Record<string, unknown>>(subject,"resolve_creator_tip_payment_action",{p_action_id:legacy.requestId,p_abandon_if_undispatched:true});
   const receipt = outcome.data;
   if (outcome.error || !current() || !receipt || receipt.actionId !== legacy.requestId || receipt.buyerId !== authority.userId
    || !(receipt.terminal === true || (receipt.dispatched === false && receipt.abandoned === true)))
    throw new Error("The previous external tip is unresolved. No different payment route was started.");
   if (receipt.abandoned === true) await retireAbandonedCreatorTipCheckoutAttempt(authority.userId,input.creatorId,receipt);
   else await retireReconciledCreatorTipCheckoutAttempt(authority.userId,input.creatorId,receipt);
  }
  const saved = await AsyncStorage.getItem(key);
  if (saved !== null) {
   const prior = JSON.parse(saved) as { actionId?: string; buyerId?: string; creatorId?: string };
   if (!UUID.test(prior.actionId ?? "") || prior.buyerId !== authority.userId || prior.creatorId !== input.creatorId) throw new Error("The previous tip action needs reconciliation.");
   const resolved = await invokeAccountBoundSupabaseMutationRpc<Record<string, unknown>>(subject,"resolve_creator_tip_payment_action",{ p_action_id: prior.actionId, p_abandon_if_undispatched: true });
   if (resolved.error || !current() || resolved.data?.actionId !== prior.actionId || resolved.data?.buyerId !== authority.userId
    || !(resolved.data.terminal === true || (resolved.data.dispatched === false && resolved.data.abandoned === true)))
    throw new Error("The previous tip payment is unresolved. Check Purchases & My Tickets; no different payment route was started.");
   if (resolved.data.provider === "stripe_connect" && resolved.data.terminal === true) {
    await retireReconciledCreatorTipCheckoutAttempt(authority.userId,input.creatorId,resolved.data);
   }
  }
  const actionId = id();
  await AsyncStorage.setItem(key,JSON.stringify({ actionId,buyerId:authority.userId,creatorId:input.creatorId,amountCents:input.amountCents,sessionId:authority.sessionGeneration }));
  if (!current()) throw new Error("Account changed before tip selection.");
  const selected = await invokeAccountBoundSupabaseMutationRpc<Record<string, unknown>>(subject,"select_creator_tip_payment_route",{
   p_action_id:actionId,p_creator_id:input.creatorId,p_amount_minor:input.amountCents,p_platform:Platform.OS,
  });
  const row = selected.data;
  if (selected.error || !current() || !row || row.actionId !== actionId || row.buyerId !== authority.userId
   || row.sessionId !== authority.sessionGeneration || row.creatorId !== input.creatorId || row.amountMinor !== input.amountCents
   || row.currency !== "usd" || row.dispatchAuthorized !== false || !UUID.test(String(row.purchaseBindingId ?? ""))
   || !["app_store","google_play","stripe_connect"].includes(String(row.provider))
   || row.routeId !== `${row.provider === "app_store" ? "revenuecat_app_store" : row.provider === "google_play" ? "revenuecat_google_play" : "stripe_connect"}:${row.purchaseBindingId}`)
   throw new Error("The lowest-cost route could not be confirmed. No fallback payment was started; retry to reconcile this action.");
  return { actionId,routeId:String(row.routeId),provider:row.provider as CreatorTipPaymentSelection["provider"],purchaseBindingId:String(row.purchaseBindingId) };
 } finally { release(); if (locks.get(key) === lock) locks.delete(key); }
}
