export type NativeCallTransitionPlatform = "android" | "ios";
export type NativeCallTransitionSource = "android_native_action_store" | "ios_callkit_native_event";
export type NativeCallTransitionAction = "answer" | "decline" | "end" | "mute" | "unmute";

export type NativeCallTransitionClaimInput = {
  action: NativeCallTransitionAction;
  authenticatedUserId: string;
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
  clear(platform: NativeCallTransitionPlatform): boolean;
  create(input?: Partial<NativeCallTransitionClaimInput> | null): NativeCallTransitionClaimCreation;
  consume(input?: {
    action: NativeCallTransitionAction;
    authenticatedUserId: string;
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

export function createIosCallKitAnswerRouteHandler(input?: {
  completeAnswerFailure?: (callUuid: string) => Promise<unknown> | unknown;
  getAuthenticatedUserId?: () => string | null | undefined;
  isActive?: () => boolean;
  replace?: (destination: string) => void;
}): (event?: {
  callInviteId?: string;
  callType?: string;
  callUuid?: string;
  nativeEventGeneration?: number;
  platform?: string;
  threadId?: string;
  type?: string;
} | null) => Promise<"denied" | "duplicate" | "inactive" | "routed">;

export function consumeNativeCallTransitionClaim(
  input?: {
    action: NativeCallTransitionAction;
    authenticatedUserId: string;
    claimId: string;
    inviteId: string;
    nativeIdentity: string;
    platform: NativeCallTransitionPlatform;
    source: NativeCallTransitionSource;
    threadId: string;
  } | null,
): NativeCallTransitionClaim | null;
export function consumeTrustedIosCallKitNativeEventClaim(input?: {
  action: "answer";
  authenticatedUserId?: string;
  callUuid?: string;
  claimId?: string;
  inviteId?: string;
  threadId?: string;
} | null): NativeCallTransitionClaim | null;
export function consumeMountedIosNativeCallRoute(input?: {
  action: "answer";
  authenticatedUserId?: string;
  authLoading?: boolean;
  callUuid?: string;
  claimId?: string;
  inviteId?: string;
  isSignedIn?: boolean;
  platform?: string;
  threadId?: string;
} | null): NativeCallTransitionClaim | null;
export function isAttestedNativeCallTransitionClaim(value?: unknown): value is NativeCallTransitionClaim;

export type ForegroundAuthenticatedUiCallAction = "open_call" | "start_video" | "start_voice";
export type ForegroundAuthenticatedUiCallIntent = {
  action: ForegroundAuthenticatedUiCallAction;
  authenticatedUserId: string;
  claimId: string;
  consumed: true;
  consumedAtMonotonicMs: number;
  createdAtMonotonicMs: number;
  expiresAtMonotonicMs: number;
  inviteId: string;
  roomId: string;
  source: "foreground_authenticated_ui";
  threadId: string;
};
export function createForegroundAuthenticatedUiCallIntentRegistry(input?: {
  claimIdFactory?: () => string;
  maxActive?: number;
  now?: () => number;
  ttlMs?: number;
}): {
  create(input?: {
    action?: ForegroundAuthenticatedUiCallAction;
    authenticated?: boolean;
    authenticatedUserId?: string;
    inviteId?: string;
    roomId?: string;
    threadId?: string;
  } | null): Readonly<{
    action?: ForegroundAuthenticatedUiCallAction;
    claimId?: string;
    destination?: string;
    inviteId?: string;
    roomId?: string;
    status: "created" | "denied";
    threadId?: string;
  }>;
  consume(input?: {
    authenticatedUserId?: string;
    claimId?: string;
    threadId?: string;
  } | null): ForegroundAuthenticatedUiCallIntent | null;
};
export function createForegroundAuthenticatedUiCallIntent(input?: {
  action?: ForegroundAuthenticatedUiCallAction;
  authenticated?: boolean;
  authenticatedUserId?: string;
  inviteId?: string;
  roomId?: string;
  threadId?: string;
} | null): Readonly<{
  action?: ForegroundAuthenticatedUiCallAction;
  claimId?: string;
  inviteId?: string;
  roomId?: string;
  status: "created" | "denied";
  threadId?: string;
}>;
export function consumeMountedForegroundAuthenticatedUiCallRoute(input?: {
  authenticatedUserId?: string;
  authLoading?: boolean;
  claimId?: string;
  isSignedIn?: boolean;
  threadId?: string;
} | null): ForegroundAuthenticatedUiCallIntent | null;
export function isAttestedForegroundAuthenticatedUiCallIntent(value?: unknown): value is ForegroundAuthenticatedUiCallIntent;
export function containsSensitiveNativeCallClaimRouteParams(params?: unknown): boolean;
export function clearNativeCallTransitionClaims(platform: NativeCallTransitionPlatform): boolean;
export function sanitizeExternalIosNativeCallPath(value?: string | null): string;
export const nativeCallTransitionProvenancePolicy: Readonly<{
  claimIdPattern: RegExp;
  maxActive: 32;
  maxConsumed: 64;
  foregroundIntentTtlMs: 30000;
  ttlMs: 30000;
}>;
