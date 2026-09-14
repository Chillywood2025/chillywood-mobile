const SHA256_HEX = /^[a-f0-9]{64}$/u;
const MAX_INTERNAL_PROOF_RECIPIENTS = 4;

export const normalizeIosOrdinaryPushInternalProofHashes = (value) => {
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
  internalProofRecipientHashes,
  publicRolloutEnabled,
  recipientHash,
}) => {
  if (publicRolloutEnabled === true) return true;
  if (internalProofEnabled !== true || !SHA256_HEX.test(String(recipientHash ?? ""))) return false;
  return normalizeIosOrdinaryPushInternalProofHashes(internalProofRecipientHashes).has(recipientHash);
};
