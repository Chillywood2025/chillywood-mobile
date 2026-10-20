// App-level logical-key retirement fence. No provider IO, credentials or deletion.
// A successful result supplements, never replaces, the caller's exact authority.
export type RetirementPurpose = "upload" | "read" | "inspection" | "publish";
export async function checkDeletedMediaRetirement(
  client: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> },
  input: { provider: string; bucket: string; objectKey: string; purpose: RetirementPurpose },
): Promise<{ allowed: boolean; expiresAt?: string }> {
  try {
    const { data, error } = await client.rpc("check_deleted_media_retirement", {
      p_provider: input.provider, p_bucket: input.bucket,
      p_object_key: input.objectKey, p_purpose: input.purpose,
    });
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return { allowed: false };
    const value = data as Record<string, unknown>;
    if (value.allowed !== true) return { allowed: false };
    if (value.expiresAt !== undefined) {
      if (typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt))) return { allowed: false };
      if (Date.parse(value.expiresAt) <= Date.now()) return { allowed: false };
      return { allowed: true, expiresAt: value.expiresAt };
    }
    return { allowed: true };
  } catch { return { allowed: false }; }
}
