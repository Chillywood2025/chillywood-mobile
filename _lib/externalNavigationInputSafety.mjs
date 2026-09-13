export const MAX_EXTERNAL_NAVIGATION_INPUT_LENGTH = 8_192;

export function sanitizeExternalNavigationInput(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (
    !normalized
    || normalized.length > MAX_EXTERNAL_NAVIGATION_INPUT_LENGTH
    || /[\u0000-\u001F\u007F]/u.test(normalized)
  ) {
    return null;
  }

  // Validate the complete encoded input with the platform decoder before
  // Expo Router's transitive query decoder sees it. This is a bounded,
  // single-pass rejection of malformed percent encodings; the original input
  // is preserved so route semantics do not change.
  try {
    decodeURIComponent(normalized);
  } catch {
    return null;
  }
  return normalized;
}
