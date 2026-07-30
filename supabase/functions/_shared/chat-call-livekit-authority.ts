export type ChatCallLiveKitAuthorityMembership = {
  role: string;
  userId: string;
};

export type ChatCallLiveKitAuthorityInput = {
  activeMemberships: ChatCallLiveKitAuthorityMembership[];
  invite: {
    acceptedAt: string;
    callType: string;
    calleeUserId: string;
    callerUserId: string;
    communicationRoomId: string;
    endedAt: string;
    mediaProvider: string;
    status: string;
    threadId: string;
  };
  requestedCallType: string;
  requestedMediaProvider: string;
  requestedThreadId: string;
  roomActiveRoomId: string;
  roomCallType: string;
  roomName: string;
  roomThreadId: string;
  threadMemberIds: string[];
  userId: string;
};

export type ChatCallLiveKitAuthorityResult =
  | {
      ok: true;
      canPublish: true;
      grants: {
        canPublish: true;
        canPublishData: true;
        canSubscribe: true;
        roomJoin: true;
      };
      participantRole: "speaker";
      reason: "accepted_chat_call_participant";
    }
  | {
      ok: false;
      error:
        | "chat_call_authority_mismatch"
        | "chat_call_exact_membership_required"
        | "chat_call_third_participant_denied"
        | "insufficient_role";
      message: string;
      status: 403;
    };

const normalize = (value: unknown) => String(value ?? "").trim();
const normalizeRoom = (value: unknown) => normalize(value).toUpperCase();
const normalizeLower = (value: unknown) => normalize(value).toLowerCase();

export const resolveChatCallLiveKitAuthority = (
  input: ChatCallLiveKitAuthorityInput,
): ChatCallLiveKitAuthorityResult => {
  const inviteThreadId = normalize(input.invite.threadId);
  const inviteRoomId = normalizeRoom(input.invite.communicationRoomId);
  const callerUserId = normalize(input.invite.callerUserId);
  const calleeUserId = normalize(input.invite.calleeUserId);
  const inviteCallType = normalizeLower(input.invite.callType);
  const inviteStatus = normalizeLower(input.invite.status);
  const inviteMediaProvider = normalizeLower(input.invite.mediaProvider);
  const userId = normalize(input.userId);
  const roomName = normalizeRoom(input.roomName);
  if (
    inviteThreadId !== normalize(input.roomThreadId)
    || inviteThreadId !== normalize(input.requestedThreadId)
    || inviteRoomId !== roomName
    || normalizeRoom(input.roomActiveRoomId) !== roomName
    || inviteCallType !== normalizeLower(input.requestedCallType)
    || normalizeLower(input.roomCallType) !== inviteCallType
    || inviteStatus !== "accepted"
    || !normalize(input.invite.acceptedAt)
    || !!normalize(input.invite.endedAt)
    || inviteMediaProvider !== "livekit"
    || normalizeLower(input.requestedMediaProvider) !== "livekit"
    || callerUserId === calleeUserId
    || (userId !== callerUserId && userId !== calleeUserId)
  ) {
    return {
      ok: false,
      error: "chat_call_authority_mismatch",
      message: "This account is not authorized for the exact accepted Chi'lly Chat LiveKit call.",
      status: 403,
    };
  }

  const exactParticipantIds = new Set([callerUserId, calleeUserId]);
  const threadMemberIds = new Set(input.threadMemberIds.map(normalize).filter(Boolean));
  if (
    threadMemberIds.size !== 2
    || [...exactParticipantIds].some((participantId) => !threadMemberIds.has(participantId))
    || [...threadMemberIds].some((participantId) => !exactParticipantIds.has(participantId))
  ) {
    return {
      ok: false,
      error: "chat_call_exact_membership_required",
      message: "The direct-thread participant set does not match this accepted call.",
      status: 403,
    };
  }

  const normalizedActiveMemberships = input.activeMemberships.map((membership) => ({
    role: normalizeLower(membership.role),
    userId: normalize(membership.userId),
  }));
  const currentMembership = normalizedActiveMemberships.find(
    (membership) => membership.userId === userId,
  );
  const hasThirdPartyMembership = normalizedActiveMemberships.some(
    (membership) => !exactParticipantIds.has(membership.userId),
  );
  if (
    !currentMembership
    || hasThirdPartyMembership
    || (currentMembership.role !== "host" && currentMembership.role !== "participant")
  ) {
    return {
      ok: false,
      error: hasThirdPartyMembership ? "chat_call_third_participant_denied" : "insufficient_role",
      message: "A fresh exact accepted-participant membership is required for this call.",
      status: 403,
    };
  }

  return {
    ok: true,
    canPublish: true,
    grants: {
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
      roomJoin: true,
    },
    participantRole: "speaker",
    reason: "accepted_chat_call_participant",
  };
};
