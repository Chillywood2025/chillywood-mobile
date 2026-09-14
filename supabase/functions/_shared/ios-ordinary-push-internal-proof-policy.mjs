const SHA256_HEX = /^[a-f0-9]{64}$/u;
const MAX_INTERNAL_PROOF_RECIPIENTS = 4;

export const normalizeIosOrdinaryPushInternalProofTargetHashes = (value) => {
  const entries = String(value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (
    entries.length < 1
    || entries.length > MAX_INTERNAL_PROOF_RECIPIENTS
    || entries.some((entry) => !SHA256_HEX.test(entry))
  ) {
    return new Set();
  }
  return new Set(entries);
};

export const isIosOrdinaryPushDeliveryAllowed = ({
  internalProofEnabled,
  internalProofTargetHashes,
  publicRolloutEnabled,
  targetHash,
}) => {
  if (publicRolloutEnabled === true) return true;
  if (internalProofEnabled !== true || !SHA256_HEX.test(String(targetHash ?? ""))) return false;
  return normalizeIosOrdinaryPushInternalProofTargetHashes(internalProofTargetHashes).has(targetHash);
};

export const isInternalIosOrdinaryPushProofRequestAllowed = ({
  internalProofEnabled,
  operatorAuthenticated,
  publicRolloutEnabled,
  recipientUserId,
  serviceRoleAuthenticated,
}) => (serviceRoleAuthenticated === true || operatorAuthenticated === true)
  && internalProofEnabled === true
  && publicRolloutEnabled === true
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    String(recipientUserId ?? "").trim(),
  );
