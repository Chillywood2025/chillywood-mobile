import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-get-random-values";

export type CreatorTipCheckoutAttempt = {
  requestId: string; buyerId: string; creatorId: string; amountCents: number; currency: "usd";
  tipId: string | null; createdAt: string;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const storageKey = (buyerId: string, creatorId: string) => `@chillywood/stripe-tip-attempt:v1:${buyerId}:${creatorId}`;
const locks = new Map<string, Promise<void>>();
async function exclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const lock = new Promise<void>(resolve => { release = resolve; }); locks.set(key, lock);
  await previous;
  try { return await operation(); } finally { release(); if (locks.get(key) === lock) locks.delete(key); }
}
const newRequestId = () => {
  const bytes = new Uint8Array(16); globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
function parseAttempt(raw: string, buyerId: string, creatorId: string): CreatorTipCheckoutAttempt {
  const row = JSON.parse(raw) as CreatorTipCheckoutAttempt;
  if (!row || row.buyerId !== buyerId || row.creatorId !== creatorId || !UUID.test(row.requestId)
    || !Number.isSafeInteger(row.amountCents) || row.amountCents <= 0 || row.currency !== "usd"
    || !(row.tipId === null || UUID.test(row.tipId)) || !Number.isFinite(Date.parse(row.createdAt))) {
    throw new Error("Previous tip checkout could not be verified. Check purchase history before starting another tip.");
  }
  return row;
}

/** Persist before transport. Unknown outcomes must reuse the same ID after remount/retry. */
export async function withCreatorTipCheckoutAttempt<T>(
  input: Pick<CreatorTipCheckoutAttempt, "buyerId" | "creatorId" | "amountCents" | "currency"> & { selectedActionId?: string },
  operation: (attempt: CreatorTipCheckoutAttempt) => Promise<T>,
  prepareEligibility?: (attempt: CreatorTipCheckoutAttempt) => Promise<void>,
): Promise<T> {
  if (!UUID.test(input.buyerId) || !UUID.test(input.creatorId) || input.buyerId === input.creatorId
    || !Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.currency !== "usd") throw new Error("The exact tip amount and recipient are required.");
  if (input.selectedActionId !== undefined && !UUID.test(input.selectedActionId)) throw new Error("Tip action identity is invalid.");
  const key = storageKey(input.buyerId, input.creatorId);
  return exclusive(key, async () => {
    const raw = await AsyncStorage.getItem(key);
    const existing = raw !== null ? parseAttempt(raw, input.buyerId, input.creatorId) : null;
    if (existing && input.selectedActionId && existing.requestId !== input.selectedActionId) throw new Error("A previous tip payment remains unresolved. Check Purchases & My Tickets.");
    if (existing && (existing.amountCents !== input.amountCents || existing.currency !== input.currency)) {
      throw new Error("A previous tip to this creator is unresolved. Refresh Purchases & My Tickets before choosing another amount.");
    }
    const attempt = existing ?? { ...input, requestId: input.selectedActionId ?? newRequestId(), tipId: null, createdAt: new Date().toISOString() };
    // Eligibility-only checks cannot create a provider payment. A failed check
    // must not leave a new amount permanently "pending". Existing uncertain
    // attempts remain immutable and are never removed by this preparation.
    if (prepareEligibility) await prepareEligibility(attempt);
    if (!existing) await AsyncStorage.setItem(key, JSON.stringify(attempt));
    return operation(attempt);
  });
}

/** Called inside the serialized checkout after exact server receipt validation. */
export async function rememberCreatorTipCheckoutReceipt(attempt: CreatorTipCheckoutAttempt, tipId: string) {
  if (!UUID.test(tipId)) throw new Error("Tip receipt could not be verified.");
  const key = storageKey(attempt.buyerId, attempt.creatorId);
  const raw = await AsyncStorage.getItem(key);
  const current = raw !== null ? parseAttempt(raw, attempt.buyerId, attempt.creatorId) : null;
  if (!current || current.requestId !== attempt.requestId || (current.tipId && current.tipId !== tipId)) throw new Error("Tip checkout identity changed.");
  await AsyncStorage.setItem(key, JSON.stringify({ ...current, tipId }));
}

/** Only an independently authorized exact terminal status may retire an attempt. */
export async function retireConfirmedCreatorTipCheckoutAttempt(input: { buyerId: string; creatorId: string; tipId: string; status: string }) {
  if (!UUID.test(input.buyerId) || !UUID.test(input.creatorId) || !UUID.test(input.tipId)
    // A failed PaymentIntent may still belong to a retryable open Checkout Session.
    || !["paid", "canceled", "refunded"].includes(input.status)) return;
  const key = storageKey(input.buyerId, input.creatorId);
  await exclusive(key, async () => {
    const raw = await AsyncStorage.getItem(key); if (raw === null) return;
    const current = parseAttempt(raw, input.buyerId, input.creatorId);
    if (current.tipId === input.tipId) await AsyncStorage.removeItem(key);
  });
}

/** Local historical attempt inspection; server reconciliation remains authority. */
export async function readSavedCreatorTipCheckoutAttempt(buyerId: string, creatorId: string) {
  const raw = await AsyncStorage.getItem(storageKey(buyerId, creatorId));
  return raw === null ? null : parseAttempt(raw, buyerId, creatorId);
}

/** Call only with an exact authenticated server no-dispatch tombstone receipt. */
export async function retireAbandonedCreatorTipCheckoutAttempt(buyerId: string, creatorId: string, receipt: Record<string, unknown>) {
  if (receipt.buyerId !== buyerId || receipt.dispatched !== false || receipt.abandoned !== true || !UUID.test(String(receipt.actionId ?? ""))) return;
  const key = storageKey(buyerId, creatorId);
  await exclusive(key, async () => {
    const raw = await AsyncStorage.getItem(key); if (raw === null) return;
    const current = parseAttempt(raw, buyerId, creatorId);
    if (current.requestId === receipt.actionId) await AsyncStorage.removeItem(key);
  });
}

/** Exact server action reconciliation also covers a lost initial tipId response. */
export async function retireReconciledCreatorTipCheckoutAttempt(buyerId: string, creatorId: string, receipt: Record<string, unknown>) {
  if (receipt.buyerId !== buyerId || receipt.provider !== "stripe_connect" || receipt.terminal !== true
    || !["paid", "canceled", "refunded"].includes(String(receipt.paymentStatus))
    || !UUID.test(String(receipt.actionId ?? "")) || !UUID.test(String(receipt.providerReferenceId ?? ""))) return;
  const key = storageKey(buyerId, creatorId);
  await exclusive(key, async () => {
    const raw = await AsyncStorage.getItem(key); if (raw === null) return;
    const current = parseAttempt(raw, buyerId, creatorId);
    if (current.requestId === receipt.actionId && (current.tipId === null || current.tipId === receipt.providerReferenceId)) await AsyncStorage.removeItem(key);
  });
}
