import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-get-random-values";

export type CreatorRoomAuctionCreationInput = {
  partyId: string; sourceKind: "stage_reserved_seat" | "party_admission"; roomSessionId: string;
  startingAmountMinor: number; minIncrementMinor: number; closesAt: string; paymentDeadline: string; environment: "test" | "live";
};
type Attempt = { creatorId: string; requestId: string; input: CreatorRoomAuctionCreationInput };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keyFor = (creatorId: string, partyId: string, sourceKind: string) =>
  `@chillywood:room-auction-create:v1:${creatorId}:${encodeURIComponent(partyId)}:${sourceKind}`;
const active = new Set<string>();
const newId = () => {
  const bytes = new Uint8Array(16); globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const h = [...bytes].map(n => n.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};
function validInput(input: CreatorRoomAuctionCreationInput): boolean {
  return !!input && typeof input.partyId === "string" && !!input.partyId && UUID.test(input.roomSessionId)
    && ["stage_reserved_seat", "party_admission"].includes(input.sourceKind)
    && Number.isSafeInteger(input.startingAmountMinor) && input.startingAmountMinor > 0
    && Number.isSafeInteger(input.minIncrementMinor) && input.minIncrementMinor > 0
    && Number.isFinite(Date.parse(input.closesAt)) && Number.isFinite(Date.parse(input.paymentDeadline))
    && ["test", "live"].includes(input.environment);
}
function parse(raw: string, creatorId: string, partyId: string, sourceKind: string): Attempt {
  const value = JSON.parse(raw) as Attempt;
  if (!value || value.creatorId !== creatorId || !UUID.test(value.requestId) || !validInput(value.input)
    || value.input.partyId !== partyId || value.input.sourceKind !== sourceKind) {
    throw new Error("The previous room auction request could not be verified. Check existing auctions before starting another.");
  }
  return value;
}
function sameTerms(a: CreatorRoomAuctionCreationInput, b: CreatorRoomAuctionCreationInput): boolean {
  return a.partyId === b.partyId && a.sourceKind === b.sourceKind && a.roomSessionId === b.roomSessionId
    && a.startingAmountMinor === b.startingAmountMinor && a.minIncrementMinor === b.minIncrementMinor
    && Date.parse(a.closesAt) === Date.parse(b.closesAt) && Date.parse(a.paymentDeadline) === Date.parse(b.paymentDeadline)
    && a.environment === b.environment;
}
export async function readPendingRoomAuctionCreation(creatorId: string, partyId: string, sourceKind: string): Promise<CreatorRoomAuctionCreationInput | null> {
  if (!UUID.test(creatorId) || !partyId || !["stage_reserved_seat", "party_admission"].includes(sourceKind)) throw new Error("Verify the creator and room before continuing.");
  const raw = await AsyncStorage.getItem(keyFor(creatorId, partyId, sourceKind));
  return raw === null ? null : parse(raw, creatorId, partyId, sourceKind).input;
}
/** A request is persisted before creation. Only its verified exact response
 * retires it; network failure or room reincarnation never generates a new ID. */
export async function withRoomAuctionCreationAttempt<T>(
  creatorId: string, input: CreatorRoomAuctionCreationInput,
  operation: (requestId: string) => Promise<T>,
): Promise<T> {
  if (!UUID.test(creatorId) || !validInput(input)) throw new Error("Review the exact room session and auction terms.");
  const key = keyFor(creatorId, input.partyId, input.sourceKind);
  if (active.has(key)) throw new Error("This auction request is already being checked.");
  active.add(key);
  try {
    const raw = await AsyncStorage.getItem(key);
    const existing = raw === null ? null : parse(raw, creatorId, input.partyId, input.sourceKind);
    if (existing && !sameTerms(existing.input, input)) throw new Error("A previous room auction request is unresolved. Check that request before creating different terms or using another room session.");
    const attempt = existing ?? { creatorId, requestId: newId(), input: { ...input } };
    if (!existing) await AsyncStorage.setItem(key, JSON.stringify(attempt));
    const result = await operation(attempt.requestId);
    const current = await AsyncStorage.getItem(key);
    if (current === null || parse(current, creatorId, input.partyId, input.sourceKind).requestId !== attempt.requestId) {
      throw new Error("Auction request identity changed. Check existing auctions before continuing.");
    }
    await AsyncStorage.removeItem(key);
    return result;
  } finally { active.delete(key); }
}
