// Negative-only fence: absence of revocation never grants media access. Callers
// retain all exact source, ownership, entitlement, moderation and scan checks.
export async function legacyMediaDeliveryNotRevoked(
  client: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> },
  input: { provider: string; bucket: string; objectKey: string },
): Promise<boolean> {
  try {
    const {data, error} = await client.rpc("check_legacy_media_delivery_revocation", {
      p_provider: input.provider, p_bucket: input.bucket, p_object_key: input.objectKey,
    });
    return !error && !!data && typeof data === "object" && !Array.isArray(data)
      && (data as Record<string, unknown>).revoked === false;
  } catch { return false; }
}
