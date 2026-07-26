import { classifyExpoPushReceipt } from "./expo-push-receipt-policy.mjs";

type JsonObject = Record<string, unknown>;
type SupabaseClientLike = any;
type DeliveryAttempt = {
  id: string;
  provider_message_id: string | null;
  push_token_id: string | null;
};

const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

const toText = (value: unknown) => String(value ?? "").trim();

const sanitizeReceiptError = (value: unknown) => {
  const raw = value instanceof Error ? value.message : String(value ?? "Expo receipt error.");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer [redacted]")
    .replace(/Expo(nent)?PushToken\[[^\]]+\]/giu, "ExpoPushToken[redacted]")
    .replace(/[A-Za-z0-9._~+/=-]{48,}/gu, "[redacted]")
    .slice(0, 260);
};

export async function reconcileRecentExpoPushReceipts(
  adminClient: SupabaseClientLike,
  recipientUserId: string,
) {
  const { data, error } = await adminClient
    .from("notification_delivery_attempts")
    .select("id,provider_message_id,push_token_id")
    .eq("recipient_user_id", recipientUserId)
    .eq("provider", "expo")
    .eq("status", "sent")
    .not("provider_message_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return { checked: 0, failed: 0, revoked: 0 };

  const attempts = ((data ?? []) as DeliveryAttempt[])
    .filter((attempt) => toText(attempt.provider_message_id));
  if (!attempts.length) return { checked: 0, failed: 0, revoked: 0 };

  let response: Response;
  try {
    response = await fetch(EXPO_RECEIPTS_URL, {
      body: JSON.stringify({ ids: attempts.map((attempt) => attempt.provider_message_id) }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  } catch {
    return { checked: 0, failed: 0, revoked: 0 };
  }
  if (!response.ok) return { checked: 0, failed: 0, revoked: 0 };

  const payload = await response.json().catch(() => ({}));
  const receipts = payload && typeof payload === "object" && "data" in payload
    ? (payload as { data?: Record<string, JsonObject> }).data ?? {}
    : {};

  let failed = 0;
  let revoked = 0;
  for (const attempt of attempts) {
    const providerMessageId = toText(attempt.provider_message_id);
    const classification = classifyExpoPushReceipt(receipts[providerMessageId]);
    if (!classification.isError) continue;

    failed += 1;
    await adminClient
      .from("notification_delivery_attempts")
      .update({
        error_code: classification.errorCode,
        error_message: sanitizeReceiptError(classification.errorMessage),
        status: "failed",
      })
      .eq("id", attempt.id);

    if (classification.shouldRevokeToken && attempt.push_token_id) {
      revoked += 1;
      await adminClient
        .from("user_push_tokens")
        .update({
          enabled: false,
          revoked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", attempt.push_token_id);
    }
  }

  return { checked: attempts.length, failed, revoked };
}
