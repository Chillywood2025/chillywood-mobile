const toText = (value: unknown) => String(value ?? "").trim();

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

export const isSafeProfileMediaObjectKey = (ownerUserIdInput: unknown, objectKeyInput: unknown) => {
  const ownerUserId = toText(ownerUserIdInput);
  const objectKey = toText(objectKeyInput);
  return !!ownerUserId
    && ownerUserId.length <= 128
    && /^[A-Za-z0-9_-]+$/u.test(ownerUserId)
    && !!objectKey
    && objectKey.length <= 1024
    && !objectKey.startsWith("/")
    && !objectKey.includes("..")
    && !/[\u0000-\u001F\u007F]/u.test(objectKey)
    && (
      new RegExp(`^${escapeRegExp(ownerUserId)}\/(avatar|background)\/[A-Za-z0-9._-]+$`, "u").test(objectKey)
      || (ownerUserId === "platform_rachi_official" && /^official\/rachi\/avatar\/[A-Za-z0-9._-]+$/u.test(objectKey))
    );
};

export const canonicalProfileMediaUrl = (
  supabaseUrlInput: unknown,
  ownerUserIdInput: unknown,
  objectKeyInput: unknown,
) => {
  const supabaseUrl = toText(supabaseUrlInput).replace(/\/+$/gu, "");
  const ownerUserId = toText(ownerUserIdInput);
  const objectKey = toText(objectKeyInput);
  if (!supabaseUrl || !isSafeProfileMediaObjectKey(ownerUserId, objectKey)) return "";
  return `${supabaseUrl}/functions/v1/profile-media-public?ownerUserId=${ownerUserId}&objectKey=${objectKey}`;
};

export const profileRowAuthorizesExactObject = (input: {
  avatarUrl: unknown;
  backgroundUrl: unknown;
  objectKey: unknown;
  ownerUserId: unknown;
  supabaseUrl: unknown;
}) => {
  const canonicalUrl = canonicalProfileMediaUrl(
    input.supabaseUrl,
    input.ownerUserId,
    input.objectKey,
  );
  return !!canonicalUrl
    && [toText(input.avatarUrl), toText(input.backgroundUrl)].includes(canonicalUrl);
};

export const profileMediaDeliveryResolutionAllows = (input: {
  value: unknown;
  ownerUserId: unknown;
  objectKey: unknown;
}) => {
  if (!input.value || typeof input.value !== "object" || Array.isArray(input.value)) return false;
  const value = input.value as Record<string, unknown>;
  return value.authoritative === true
    && value.allowed === true
    && value.reason === "profile_media_exact_clean"
    && value.scanStatus === "clean"
    && (value.mediaKind === "avatar" || value.mediaKind === "background")
    && toText(value.ownerUserId) === toText(input.ownerUserId)
    && toText(value.objectKey) === toText(input.objectKey);
};
