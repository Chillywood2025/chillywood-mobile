const normalizeIdentifier = (value) => String(value ?? "").trim().toLowerCase();

export const resolvePreparedWatchPartyRoomReuse = ({
  expectedPartyId,
  expectedRoomType,
  expectedSourceId,
  expectedTitleId,
  room,
  userId,
}) => {
  const targetPartyId = normalizeIdentifier(expectedPartyId);
  if (!targetPartyId || !room) return { allowed: false, reason: "room_unavailable" };
  if (normalizeIdentifier(room.partyId) !== targetPartyId) {
    return { allowed: false, reason: "party_id_mismatch" };
  }
  if (!normalizeIdentifier(userId) || normalizeIdentifier(room.hostUserId) !== normalizeIdentifier(userId)) {
    return { allowed: false, reason: "host_mismatch" };
  }
  if (expectedRoomType && room.roomType !== expectedRoomType) {
    return { allowed: false, reason: "room_type_mismatch" };
  }

  const expectedContentId = normalizeIdentifier(expectedSourceId || expectedTitleId);
  const roomContentId = normalizeIdentifier(room.sourceId || room.titleId);
  if (expectedContentId && expectedContentId !== roomContentId) {
    return { allowed: false, reason: "content_mismatch" };
  }

  return { allowed: true, reason: "exact_prepared_room" };
};
