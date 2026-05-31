const normalizeErrorText = (error: unknown) => {
  if (error instanceof Error) return error.message.trim();
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return String(record.message ?? record.details ?? record.hint ?? record.code ?? "").trim();
  }
  return String(error ?? "").trim();
};

export function getUserFacingErrorMessage(error: unknown, fallback: string) {
  const rawMessage = normalizeErrorText(error);
  const message = rawMessage.toLowerCase();

  if (!message) return fallback;

  if (
    message.includes("network")
    || message.includes("failed to fetch")
    || message.includes("fetch failed")
    || message.includes("network request failed")
    || message.includes("offline")
    || message.includes("timeout")
    || message.includes("timed out")
  ) {
    return "Check your connection and try again.";
  }

  if (
    message.includes("jwt")
    || message.includes("auth")
    || message.includes("session")
    || message.includes("sign in")
    || message.includes("not authenticated")
    || message.includes("invalid login")
  ) {
    return "Sign in again, then try that action one more time.";
  }

  if (
    message.includes("permission")
    || message.includes("policy")
    || message.includes("rls")
    || message.includes("42501")
    || message.includes("denied")
    || message.includes("forbidden")
    || message.includes("not authorized")
    || message.includes("unauthorized")
  ) {
    return "This account does not have permission to complete that action.";
  }

  if (
    message.includes("storage")
    || message.includes("bucket")
    || message.includes("object")
    || message.includes("signed url")
    || message.includes("upload")
  ) {
    return "The file could not be saved right now. Try again in a moment.";
  }

  if (
    message.includes("too large")
    || message.includes("file size")
    || message.includes("maximum")
    || message.includes("exceeded")
  ) {
    return "That file is too large for this upload.";
  }

  if (
    message.includes("mime")
    || message.includes("unsupported")
    || message.includes("file type")
    || message.includes("extension")
  ) {
    return "That file type is not supported here.";
  }

  if (
    message.includes("no rows")
    || message.includes("duplicate key")
    || message.includes("foreign key")
    || message.includes("constraint")
    || message.includes("rpc")
    || message.includes("backend")
    || message.includes("undefined")
    || message.includes("null")
  ) {
    return fallback;
  }

  return rawMessage.length <= 140 ? rawMessage : fallback;
}
