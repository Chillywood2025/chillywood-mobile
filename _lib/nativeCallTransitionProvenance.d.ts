export type NativeCallTransitionPlatform = "android" | "ios";
export type NativeCallTransitionSource = "android_native_action_store" | "ios_callkit_native_event";
export type NativeCallTransitionAction = "answer" | "decline" | "end" | "mute" | "unmute";

export type NativeCallTransitionClaimInput = {
  action: NativeCallTransitionAction;
  inviteId: string;
  nativeEventGeneration: number;
  nativeIdentity: string;
  platform: NativeCallTransitionPlatform;
  source: NativeCallTransitionSource;
  threadId: string;
};

export type NativeCallTransitionClaim = NativeCallTransitionClaimInput & {
  claimId: string;
  consumed: true;
  consumedAtMonotonicMs: number;
  createdAtMonotonicMs: number;
  eventKey: string;
  expiresAtMonotonicMs: number;
};

export type NativeCallTransitionClaimCreation = {
  action?: NativeCallTransitionAction;
  claimId?: string;
  inviteId?: string;
  nativeIdentity?: string;
  platform?: NativeCallTransitionPlatform;
  status: "created" | "denied" | "duplicate" | "capacity_denied" | "claim_id_denied";
  threadId?: string;
};

export type NativeCallTransitionProvenanceRegistry = {
  clear(): void;
  create(input?: Partial<NativeCallTransitionClaimInput> | null): NativeCallTransitionClaimCreation;
  consume(input?: {
    claimId: string;
    inviteId: string;
    nativeIdentity: string;
    platform: NativeCallTransitionPlatform;
    source: NativeCallTransitionSource;
    threadId: string;
  } | null): NativeCallTransitionClaim | null;
  inspectCounts(): Readonly<{ active: number; consumed: number }>;
};

export function createNativeCallTransitionProvenanceRegistry(input?: {
  claimIdFactory?: () => string;
  maxActive?: number;
  maxConsumed?: number;
  now?: () => number;
  ttlMs?: number;
}): NativeCallTransitionProvenanceRegistry;

export function registerTrustedIosCallKitNativeEvent(event?: {
  authenticated?: boolean;
  callInviteId?: string;
  callType?: string;
  callUuid?: string;
  nativeEventGeneration?: number;
  platform?: string;
  threadId?: string;
  type?: string;
} | null): NativeCallTransitionClaimCreation;

export function consumeNativeCallTransitionClaim(
  input?: {
    claimId: string;
    inviteId: string;
    nativeIdentity: string;
    platform: NativeCallTransitionPlatform;
    source: NativeCallTransitionSource;
    threadId: string;
  } | null,
): NativeCallTransitionClaim | null;
export function consumeTrustedIosCallKitNativeEventClaim(input?: {
  callUuid?: string;
  claimId?: string;
  inviteId?: string;
  threadId?: string;
} | null): NativeCallTransitionClaim | null;
export function clearNativeCallTransitionClaims(): void;
export function sanitizeExternalIosNativeCallPath(value?: string | null): string;
export const nativeCallTransitionProvenancePolicy: Readonly<{
  claimIdPattern: RegExp;
  maxActive: 32;
  maxConsumed: 64;
  ttlMs: 30000;
}>;
