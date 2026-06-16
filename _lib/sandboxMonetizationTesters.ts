import { supabase } from "./supabase";

export type SandboxMonetizationTesterRow = {
  id: string;
  userId: string | null;
  email: string | null;
  status: "active" | "revoked";
  note: string | null;
  expiresAt: string | null;
  createdBy: string | null;
  revokedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const toText = (value: unknown) => String(value ?? "").trim();

const sandboxTesterClient = supabase as unknown as {
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<{ data: T | null; error: unknown }>;
};

const normalizeTesterRow = (value: unknown): SandboxMonetizationTesterRow | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = toText(row.id);
  if (!id) return null;
  return {
    id,
    userId: toText(row.userId) || null,
    email: toText(row.email) || null,
    status: toText(row.status) === "revoked" ? "revoked" : "active",
    note: toText(row.note) || null,
    expiresAt: toText(row.expiresAt) || null,
    createdBy: toText(row.createdBy) || null,
    revokedAt: toText(row.revokedAt) || null,
    createdAt: toText(row.createdAt) || null,
    updatedAt: toText(row.updatedAt) || null,
  };
};

export async function resolveSandboxMonetizationTester(
  viewerUserId?: string | null,
  viewerEmail?: string | null,
): Promise<boolean> {
  const { data, error } = await sandboxTesterClient.rpc("resolve_sandbox_monetization_tester", {
    p_email: toText(viewerEmail) || null,
    p_user_id: toText(viewerUserId) || null,
  });
  if (error) return false;
  return data === true;
}

export async function listSandboxMonetizationTesters(): Promise<SandboxMonetizationTesterRow[]> {
  const { data, error } = await sandboxTesterClient.rpc("list_sandbox_monetization_testers");
  if (error) return [];
  return (Array.isArray(data) ? data : [])
    .map(normalizeTesterRow)
    .filter((row): row is SandboxMonetizationTesterRow => !!row);
}

export async function grantSandboxMonetizationTester(input: {
  email?: string | null;
  userId?: string | null;
  expiresAt?: string | null;
  note?: string | null;
}) {
  const { data, error } = await sandboxTesterClient.rpc("grant_sandbox_monetization_tester", {
    p_email: toText(input.email) || null,
    p_expires_at: toText(input.expiresAt) || null,
    p_note: toText(input.note) || null,
    p_user_id: toText(input.userId) || null,
  });
  if (error) throw new Error("Sandbox money tester access could not be granted.");
  return data;
}

export async function revokeSandboxMonetizationTester(input: {
  id?: string | null;
  email?: string | null;
  userId?: string | null;
}) {
  const { data, error } = await sandboxTesterClient.rpc("revoke_sandbox_monetization_tester", {
    p_email: toText(input.email) || null,
    p_id: toText(input.id) || null,
    p_user_id: toText(input.userId) || null,
  });
  if (error) throw new Error("Sandbox money tester access could not be revoked.");
  return data;
}
