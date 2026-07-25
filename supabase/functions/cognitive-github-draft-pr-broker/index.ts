import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2.110.6";
import {
  type CanonicalSecurityPolicy,
  classifyCanonicalSecurityPayload,
} from "../../../_lib/cognitivePolicyEngine.ts";
import securityPolicyJson from "../../../config/intelligence/cognitive-security-classification-policy.json" with {
  type: "json",
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };
type SupabaseClientLike = ReturnType<typeof createClient<any>>;

const REPOSITORY = "Chillywood2025/chillywood-mobile";
const REPOSITORY_OWNER = "Chillywood2025";
const REPOSITORY_NAME = "chillywood-mobile";
const ALLOWED_BASE_BRANCH = "codex/cognitive-level01-operationalization";
const INVOCATION_HEADER = "x-cognitive-github-broker-invocation";
const API_ROOT = "https://api.github.com";
const API_VERSION = "2026-03-10";
const USER_AGENT = "chillywood-cognitive-github-draft-pr-broker";
const PROVIDER_MERGE_DENIAL_BLOCKER =
  "GITHUB_NO_MERGE_PROVIDER_PROOF_REQUIRED";

const ALLOWED_PERMISSION_MANIFEST = Object.freeze({
  contents: "write",
  metadata: "read",
  pull_requests: "write",
});
export const APPROVED_SCOPE_MANIFEST_HASH =
  "ccb0b53a380c2a14bae99680105c60aa1c78267f3a96dff3cb22aaa258588554";
const EXPLICIT_RUNTIME_DENIES = Object.freeze([
  "actions",
  "administration",
  "branch_deletion",
  "deployment",
  "environment",
  "force_push",
  "main_write",
  "merge",
  "package",
  "protected_branch_bypass",
  "release",
  "secret",
  "tag",
  "workflow",
]);
const CANARY_KEYS = new Set([
  "documentation_draft_pr",
  "test_only_draft_pr",
  "low_risk_source_draft_pr",
]);
const EXACT_PAYLOAD_KEYS = new Set([
  "action",
  "approvalScopeHash",
  "baseCommit",
  "branchName",
  "callId",
  "canaryKey",
  "capabilityId",
  "capabilityNonce",
  "capabilityToken",
  "commitMessage",
  "content",
  "path",
  "planSnapshotHash",
  "preflightReceiptId",
  "priorBlobSha",
  "projectId",
  "requiredTestsHash",
  "resourceLeaseId",
  "taskId",
  "title",
]);
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BRANCH_PATTERN = /^codex\/cognitive-canary\/[a-z0-9][a-z0-9/_-]{2,80}$/;
const SAFE_PATH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{2,180}$/;
const SAFE_TITLE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 .,:;()/_'-]{7,120}$/;
const SAFE_COMMIT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 .,:;()/_'-]{7,120}$/;
const FORBIDDEN_PATH_PATTERN =
  /(^|\/)(?:\.github|android|ios|supabase\/migrations)(?:\/|$)|(^|\/)(?:auth|billing|entitlements?|legal|moderation|money|payments?|payouts?|pricing|providers?|ranking|releases?|rights?|rls|roles?|secrets?|transfers?|withdrawals?|workflows?)(?:[._/-]|$)|^(?:app\.json|app\.config\.[^/]+|eas\.json|package(?:-lock)?\.json|deno\.lock)$/i;
const EXPLICIT_SECRET_PATTERN =
  /(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:access|refresh|service[_-]?role|private|api|model|github|client)[_-]?(?:token|key|secret)\s*[:=]\s*["']?[A-Za-z0-9+/_=-]{20,})/i;
const HIGH_ENTROPY_CANDIDATE = /[A-Za-z0-9+/_=-]{32,}/g;
const SECURITY_POLICY = securityPolicyJson as CanonicalSecurityPolicy;

const CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Headers":
    `authorization, x-client-info, apikey, content-type, ${INVOCATION_HEADER}`,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
});

const json = (status: number, body: JsonObject): Response =>
  new Response(JSON.stringify(body), { headers: CORS_HEADERS, status });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const toText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const hasExactKeys = (
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean => Object.keys(value).every((key) => allowed.has(key));

const readSecret = (name: string): string => Deno.env.get(name)?.trim() ?? "";

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const hasUnlabeledHighEntropyCredential = (value: string): boolean => {
  const candidates = value.match(HIGH_ENTROPY_CANDIDATE) ?? [];
  return candidates.some((candidate) => {
    if (
      /^[a-f0-9]{40,128}$/i.test(candidate) ||
      /^([A-Za-z0-9])\1{31,}$/.test(candidate)
    ) {
      return false;
    }
    const categories = [
      /[a-z]/.test(candidate),
      /[A-Z]/.test(candidate),
      /[0-9]/.test(candidate),
      /[+/_=-]/.test(candidate),
    ].filter(Boolean).length;
    const diversity = new Set(candidate).size / candidate.length;
    return categories >= 3 && diversity >= 0.32;
  });
};

const hasSafePersistedGitHubText = (values: Record<string, string>): boolean =>
  classifyCanonicalSecurityPayload(values, SECURITY_POLICY) === "safe" &&
  Object.entries(values).every(([key, value]) =>
    !EXPLICIT_SECRET_PATTERN.test(value) &&
    (
      ["branchName", "path"].includes(key) ||
      !hasUnlabeledHighEntropyCredential(value)
    )
  );

const constantTimeEqual = (left: string, right: string): boolean => {
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
};

const authenticateInvocation = async (request: Request): Promise<boolean> => {
  const expectedHash = readSecret(
    "COGNITIVE_GITHUB_DRAFT_PR_BROKER_INVOKE_SHA256",
  );
  const invocation = request.headers.get(INVOCATION_HEADER)?.trim() ?? "";
  if (!expectedHash || !HASH_PATTERN.test(expectedHash) || !invocation) {
    return false;
  }
  return constantTimeEqual(await sha256Hex(invocation), expectedHash);
};

const hasGatewayAuthorization = (request: Request): boolean =>
  /^Bearer [A-Za-z0-9._~-]{20,}$/i.test(
    request.headers.get("authorization")?.trim() ?? "",
  );

const configuredCredentialState = (): "PRESENT" | "MISSING" => {
  const required = [
    "GITHUB_APP_ID",
    "GITHUB_APP_INSTALLATION_ID",
    "GITHUB_APP_PRIVATE_KEY",
    "GITHUB_REPOSITORY_ID",
  ];
  return required.every((name) => readSecret(name)) ? "PRESENT" : "MISSING";
};

const brokerServiceCredentialState = (): "PRESENT" | "MISSING" =>
  readSecret("COGNITIVE_GITHUB_DRAFT_PR_BROKER_SERVICE_TOKEN")
    ? "PRESENT"
    : "MISSING";

const hasProviderMergeDenialProof = (): boolean => false;

const base64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(
    /=+$/,
    "",
  );
};

const encodeDerLength = (length: number): Uint8Array => {
  if (length < 128) return new Uint8Array([length]);
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
};

const derElement = (tag: number, body: Uint8Array): Uint8Array => {
  const length = encodeDerLength(body.length);
  const output = new Uint8Array(1 + length.length + body.length);
  output[0] = tag;
  output.set(length, 1);
  output.set(body, 1 + length.length);
  return output;
};

const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

const pemDer = (pem: string): { der: Uint8Array; label: string } => {
  const match = pem.match(
    /^-----BEGIN (RSA PRIVATE KEY|PRIVATE KEY)-----\s*([A-Za-z0-9+/=\s]+)\s*-----END \1-----$/,
  );
  if (!match) throw new Error("github_private_key_format_rejected");
  const binary = atob(match[2].replace(/\s/g, ""));
  return {
    der: Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    label: match[1],
  };
};

const pkcs1ToPkcs8 = (pkcs1: Uint8Array): Uint8Array => {
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const rsaAlgorithm = new Uint8Array([
    0x30,
    0x0d,
    0x06,
    0x09,
    0x2a,
    0x86,
    0x48,
    0x86,
    0xf7,
    0x0d,
    0x01,
    0x01,
    0x01,
    0x05,
    0x00,
  ]);
  return derElement(
    0x30,
    concatBytes(version, rsaAlgorithm, derElement(0x04, pkcs1)),
  );
};

const signAppJwt = async (
  appId: string,
  privateKeyPem: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> => {
  if (!/^[1-9][0-9]{2,20}$/.test(appId)) {
    throw new Error("github_app_identity_rejected");
  }
  const parsed = pemDer(privateKeyPem);
  const pkcs8 = parsed.label === "RSA PRIVATE KEY"
    ? pkcs1ToPkcs8(parsed.der)
    : parsed.der;
  const keyData = new Uint8Array(pkcs8).buffer as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["sign"],
  );
  const header = base64Url(
    new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })),
  );
  const claims = base64Url(
    new TextEncoder().encode(JSON.stringify({
      exp: nowSeconds + 540,
      iat: nowSeconds - 30,
      iss: appId,
    })),
  );
  const signingInput = `${header}.${claims}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
};

type InstallationCredential = {
  expiresAt: string;
  fingerprintHash: string;
  scopeManifestHash: string;
  token: string;
};

export type DraftPlanContract = {
  baseBranchHash: string;
  branchHash: string;
  commitMessageHash: string;
  contentHash: string;
  pathHash: string;
  planContractHash: string;
  priorStateHash: string;
  prBody: string;
  prBodyHash: string;
  repositoryHash: string;
  titleHash: string;
};

const safeJson = async (
  response: Response,
): Promise<Record<string, unknown>> => {
  const text = await response.text();
  if (text.length > 131072) throw new Error("github_response_too_large");
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) throw new Error("github_response_rejected");
  return parsed;
};

const githubHeaders = (authorization: string): HeadersInit => ({
  Accept: "application/vnd.github+json",
  Authorization: authorization,
  "User-Agent": USER_AGENT,
  "X-GitHub-Api-Version": API_VERSION,
});

const readInstallationCredential = async (
  fetcher: typeof fetch = fetch,
): Promise<InstallationCredential> => {
  if (configuredCredentialState() !== "PRESENT") {
    throw new Error("GITHUB_DRAFT_PR_CREDENTIAL_REQUIRED");
  }
  const appId = readSecret("GITHUB_APP_ID");
  const installationId = readSecret("GITHUB_APP_INSTALLATION_ID");
  const repositoryIdText = readSecret("GITHUB_REPOSITORY_ID");
  if (
    !/^[1-9][0-9]{2,20}$/.test(installationId) ||
    !/^[1-9][0-9]{2,20}$/.test(repositoryIdText)
  ) {
    throw new Error("github_app_identity_rejected");
  }
  const repositoryId = Number(repositoryIdText);
  if (!Number.isSafeInteger(repositoryId)) {
    throw new Error("github_app_identity_rejected");
  }
  const appJwt = await signAppJwt(appId, readSecret("GITHUB_APP_PRIVATE_KEY"));
  const response = await fetcher(
    `${API_ROOT}/app/installations/${installationId}/access_tokens`,
    {
      body: JSON.stringify({
        permissions: { contents: "write", pull_requests: "write" },
        repository_ids: [repositoryId],
      }),
      headers: {
        ...githubHeaders(`Bearer ${appJwt}`),
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error("github_installation_token_rejected");
  const payload = await safeJson(response);
  const token = toText(payload.token);
  const expiresAt = toText(payload.expires_at);
  const repositories = Array.isArray(payload.repositories)
    ? payload.repositories
    : [];
  const permissions = isRecord(payload.permissions) ? payload.permissions : {};
  const permissionKeys = Object.keys(permissions).sort();
  const allowedKeys = Object.keys(ALLOWED_PERMISSION_MANIFEST).sort();
  const permissionShapeMatches =
    permissionKeys.every((key) => allowedKeys.includes(key)) &&
    permissions.contents === "write" &&
    permissions.pull_requests === "write" &&
    (permissions.metadata === undefined || permissions.metadata === "read");
  const repository = repositories.length === 1 && isRecord(repositories[0])
    ? repositories[0]
    : null;
  const expiryMs = Date.parse(expiresAt);
  const nowMs = Date.now();
  if (
    !token ||
    !Number.isFinite(expiryMs) ||
    expiryMs <= nowMs + 5 * 60_000 ||
    expiryMs > nowMs + 65 * 60_000 ||
    !permissionShapeMatches ||
    !repository ||
    repository.id !== repositoryId ||
    repository.full_name !== REPOSITORY
  ) {
    throw new Error("github_installation_scope_rejected");
  }
  const fingerprintHash = await sha256Hex(
    `github-app-installation|${appId}|${installationId}|${repositoryId}`,
  );
  const scopeManifestHash = await sha256Hex(JSON.stringify({
    baseBranch: ALLOWED_BASE_BRANCH,
    denies: EXPLICIT_RUNTIME_DENIES,
    permissions: ALLOWED_PERMISSION_MANIFEST,
    repository: REPOSITORY,
    version: 1,
  }));
  if (scopeManifestHash !== APPROVED_SCOPE_MANIFEST_HASH) {
    throw new Error("github_installation_scope_manifest_drift");
  }
  return { expiresAt, fingerprintHash, scopeManifestHash, token };
};

const createServiceClient = (): SupabaseClientLike =>
  createClient(
    readSecret("SUPABASE_URL"),
    readSecret("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

const validScope = (payload: Record<string, unknown>): boolean =>
  UUID_PATTERN.test(toText(payload.taskId)) &&
  UUID_PATTERN.test(toText(payload.projectId));

const recordProviderReadback = async (
  client: SupabaseClientLike,
  payload: Record<string, unknown>,
  credential: InstallationCredential,
): Promise<JsonObject> => {
  if (!validScope(payload)) throw new Error("github_scope_rejected");
  const token = readSecret("COGNITIVE_GITHUB_DRAFT_PR_BROKER_SERVICE_TOKEN");
  if (!token) throw new Error("github_draft_pr_broker_identity_required");
  const evidenceHash = await sha256Hex(
    `${credential.fingerprintHash}|${credential.scopeManifestHash}|configured|${credential.expiresAt}`,
  );
  const receipt = await client.rpc(
    "cognitive_record_github_draft_pr_provider_readback",
    {
      p_environment: "production",
      p_evidence_hash: evidenceHash,
      p_expires_at: credential.expiresAt,
      p_platform: "shared",
      p_project_id: toText(payload.projectId),
      p_public_fingerprint_hash: credential.fingerprintHash,
      p_scope_manifest_hash: credential.scopeManifestHash,
      p_service_identity_token: token,
      p_task_id: toText(payload.taskId),
    },
  );
  if (
    receipt.error ||
    !isRecord(receipt.data) ||
    typeof receipt.data.provider_readback_id !== "string"
  ) {
    throw new Error("github_provider_readback_rejected");
  }
  return {
    credentialKind: "github_draft_pr",
    evidenceHash,
    expiresAt: credential.expiresAt,
    providerReadbackId: receipt.data.provider_readback_id,
    result: "configured",
    scopeManifestHash: credential.scopeManifestHash,
  };
};

const pathMatchesCanary = (canaryKey: string, path: string): boolean => {
  if (
    !SAFE_PATH_PATTERN.test(path) || path.includes("..") || path.includes("//")
  ) {
    return false;
  }
  if (FORBIDDEN_PATH_PATTERN.test(path)) return false;
  if (canaryKey === "documentation_draft_pr") {
    return /^docs\/intelligence\/canaries\/[A-Za-z0-9][A-Za-z0-9._-]{2,80}\.md$/
      .test(
        path,
      );
  }
  if (canaryKey === "test_only_draft_pr") {
    return /^scripts\/cognitive-canaries\/[A-Za-z0-9][A-Za-z0-9._-]{2,80}\.(?:mjs|ts)$/
      .test(
        path,
      );
  }
  return /^(?:src|components|app)\/[A-Za-z0-9][A-Za-z0-9._/-]{2,160}\.(?:ts|tsx|js|jsx)$/
    .test(
      path,
    );
};

export type DraftPlan = {
  approvalScopeHash: string;
  baseCommit: string;
  branchName: string;
  callId: string;
  canaryKey: string;
  capabilityId: string;
  capabilityNonce: string;
  capabilityToken: string;
  commitMessage: string;
  content: string;
  path: string;
  planSnapshotHash: string;
  preflightReceiptId: string;
  priorBlobSha: string;
  projectId: string;
  requiredTestsHash: string;
  resourceLeaseId: string;
  taskId: string;
  title: string;
};

const draftPrBody = (canaryKey: string): string =>
  `Governed Chi'llywood Level 0/1 canary: ${canaryKey}. Draft only; evaluator review required. No merge authority.`;

export const deriveDraftPlanContract = async (
  plan: DraftPlan,
): Promise<DraftPlanContract> => {
  const contentHash = await sha256Hex(plan.content);
  const titleHash = await sha256Hex(plan.title);
  const commitMessageHash = await sha256Hex(plan.commitMessage);
  const prBody = draftPrBody(plan.canaryKey);
  const prBodyHash = await sha256Hex(prBody);
  const pathHash = await sha256Hex(plan.path);
  const baseBranchHash = await sha256Hex(ALLOWED_BASE_BRANCH);
  const branchHash = await sha256Hex(plan.branchName);
  const repositoryHash = await sha256Hex(REPOSITORY);
  const priorStateHash = await sha256Hex(
    `${plan.baseCommit}|${plan.path}|${plan.priorBlobSha}`,
  );
  const planContractHash = await sha256Hex([
    "github-draft-pr-plan-v2",
    repositoryHash,
    plan.canaryKey,
    baseBranchHash,
    plan.baseCommit,
    branchHash,
    pathHash,
    priorStateHash,
    contentHash,
    titleHash,
    commitMessageHash,
    prBodyHash,
    plan.requiredTestsHash,
    plan.taskId,
    plan.projectId,
    plan.approvalScopeHash,
  ].join("|"));
  return {
    baseBranchHash,
    branchHash,
    commitMessageHash,
    contentHash,
    pathHash,
    planContractHash,
    priorStateHash,
    prBody,
    prBodyHash,
    repositoryHash,
    titleHash,
  };
};

export const validateDraftPlan = (
  payload: Record<string, unknown>,
): DraftPlan | null => {
  if (!hasExactKeys(payload, EXACT_PAYLOAD_KEYS)) return null;
  const plan: DraftPlan = {
    approvalScopeHash: toText(payload.approvalScopeHash),
    baseCommit: toText(payload.baseCommit),
    branchName: toText(payload.branchName),
    callId: toText(payload.callId),
    canaryKey: toText(payload.canaryKey),
    capabilityId: toText(payload.capabilityId),
    capabilityNonce: toText(payload.capabilityNonce),
    capabilityToken: toText(payload.capabilityToken),
    commitMessage: toText(payload.commitMessage),
    content: typeof payload.content === "string" ? payload.content : "",
    path: toText(payload.path),
    planSnapshotHash: toText(payload.planSnapshotHash),
    preflightReceiptId: toText(payload.preflightReceiptId),
    priorBlobSha: toText(payload.priorBlobSha),
    projectId: toText(payload.projectId),
    requiredTestsHash: toText(payload.requiredTestsHash),
    resourceLeaseId: toText(payload.resourceLeaseId),
    taskId: toText(payload.taskId),
    title: toText(payload.title),
  };
  const contentBytes = new TextEncoder().encode(plan.content).length;
  const maximumBytes = plan.canaryKey === "documentation_draft_pr"
    ? 12288
    : 32768;
  if (
    !CANARY_KEYS.has(plan.canaryKey) ||
    !BRANCH_PATTERN.test(plan.branchName) ||
    plan.branchName === ALLOWED_BASE_BRANCH ||
    !pathMatchesCanary(plan.canaryKey, plan.path) ||
    !SAFE_TITLE_PATTERN.test(plan.title) ||
    !SAFE_COMMIT_PATTERN.test(plan.commitMessage) ||
    !/^[a-f0-9]{40}$/.test(plan.baseCommit) ||
    !(
      plan.priorBlobSha === "absent" ||
      /^[a-f0-9]{40}$/.test(plan.priorBlobSha)
    ) ||
    (
      plan.canaryKey === "low_risk_source_draft_pr"
        ? plan.priorBlobSha === "absent"
        : plan.priorBlobSha !== "absent"
    ) ||
    !HASH_PATTERN.test(plan.approvalScopeHash) ||
    !HASH_PATTERN.test(plan.planSnapshotHash) ||
    !HASH_PATTERN.test(plan.requiredTestsHash) ||
    !UUID_PATTERN.test(plan.taskId) ||
    !UUID_PATTERN.test(plan.projectId) ||
    !UUID_PATTERN.test(plan.preflightReceiptId) ||
    !UUID_PATTERN.test(plan.resourceLeaseId) ||
    !/^[A-Za-z0-9._:-]{8,128}$/.test(plan.callId) ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(plan.capabilityId) ||
    plan.capabilityToken.length < 32 ||
    plan.capabilityToken.length > 512 ||
    plan.capabilityNonce.length < 32 ||
    plan.capabilityNonce.length > 512 ||
    contentBytes < 1 ||
    contentBytes > maximumBytes ||
    !hasSafePersistedGitHubText({
      branchName: plan.branchName,
      commitMessage: plan.commitMessage,
      content: plan.content,
      path: plan.path,
      title: plan.title,
    })
  ) {
    return null;
  }
  return plan;
};

const githubApi = async (
  credential: InstallationCredential,
  path: string,
  method: string,
  body?: JsonObject,
  fetcher: typeof fetch = fetch,
): Promise<Record<string, unknown>> => {
  const response = await fetcher(`${API_ROOT}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...githubHeaders(`Bearer ${credential.token}`),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    method,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`github_api_${response.status}`);
  return await safeJson(response);
};

const acceptToolResult = async (
  plan: DraftPlan,
  credential: InstallationCredential,
  resultEnvelope: JsonObject,
  beforeStateHash: string,
  afterStateHash: string,
  diffHash: string | null,
  finalCommit: string | null,
): Promise<string> => {
  const audit = await createServiceClient().rpc(
    "cognitive_accept_github_draft_pr_tool_result",
    {
      p_after_state_hash: afterStateHash,
      p_before_state_hash: beforeStateHash,
      p_call_id: plan.callId,
      p_capability_id: plan.capabilityId,
      p_diff_hash: diffHash,
      p_final_commit: finalCommit,
      p_opaque_bearer: plan.capabilityToken,
      p_opaque_nonce: plan.capabilityNonce,
      p_result_envelope: resultEnvelope,
      p_runtime_public_fingerprint_hash: credential.fingerprintHash,
      p_runtime_scope_manifest_hash: credential.scopeManifestHash,
      p_service_identity_token: readSecret(
        "COGNITIVE_GITHUB_DRAFT_PR_BROKER_SERVICE_TOKEN",
      ),
    },
  );
  if (audit.error || typeof audit.data !== "string") {
    throw new Error("github_audit_record_rejected_external_branch_quarantined");
  }
  return audit.data;
};

const executeDraftPlan = async (
  plan: DraftPlan,
  fetcher: typeof fetch = fetch,
): Promise<JsonObject> => {
  if (
    configuredCredentialState() !== "PRESENT" ||
    brokerServiceCredentialState() !== "PRESENT"
  ) {
    throw new Error("GITHUB_DRAFT_PR_CREDENTIAL_REQUIRED");
  }
  const contentBytes = new TextEncoder().encode(plan.content).length;
  const credential = await readInstallationCredential(fetcher);
  const planContract = await deriveDraftPlanContract(plan);
  if (plan.planSnapshotHash !== planContract.planContractHash) {
    throw new Error("github_approved_plan_contract_mismatch");
  }
  const baseRef = await githubApi(
    credential,
    `/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/ref/heads/${
      encodeURIComponent(ALLOWED_BASE_BRANCH)
    }`,
    "GET",
    undefined,
    fetcher,
  );
  const baseObject = isRecord(baseRef.object) ? baseRef.object : {};
  const baseCommit = toText(baseObject.sha);
  if (baseCommit !== plan.baseCommit) {
    throw new Error("github_approved_base_state_changed");
  }
  const branchLookup = await fetcher(
    `${API_ROOT}/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/ref/heads/${
      encodeURIComponent(plan.branchName)
    }`,
    {
      headers: githubHeaders(`Bearer ${credential.token}`),
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (branchLookup.status !== 404) {
    throw new Error("github_canary_branch_not_fresh");
  }
  const pathLookup = await fetcher(
    `${API_ROOT}/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/contents/${
      plan.path.split("/").map(encodeURIComponent).join("/")
    }?ref=${encodeURIComponent(plan.baseCommit)}`,
    {
      headers: githubHeaders(`Bearer ${credential.token}`),
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    },
  );
  let observedPriorBlobSha = "absent";
  if (pathLookup.status === 200) {
    const pathState = await safeJson(pathLookup);
    observedPriorBlobSha = pathState.type === "file"
      ? toText(pathState.sha)
      : "";
  } else if (pathLookup.status !== 404) {
    throw new Error("github_canary_path_readback_rejected");
  }
  if (observedPriorBlobSha !== plan.priorBlobSha) {
    throw new Error("github_approved_path_state_changed");
  }
  const sourceStateHash = planContract.priorStateHash;
  const requestHash = await sha256Hex([
    "github-draft-pr-request-v2",
    planContract.planContractHash,
    credential.fingerprintHash,
    credential.scopeManifestHash,
    plan.approvalScopeHash,
    plan.capabilityId,
    plan.callId,
  ].join("|"));
  const authorization = await createServiceClient().rpc(
    "cognitive_consume_github_draft_pr_capability",
    {
      p_approval_scope_hash: plan.approvalScopeHash,
      p_base_commit: plan.baseCommit,
      p_branch_name: plan.branchName,
      p_bytes: contentBytes,
      p_call_id: plan.callId,
      p_capability_id: plan.capabilityId,
      p_cost: 0,
      p_content_hash: planContract.contentHash,
      p_title_hash: planContract.titleHash,
      p_commit_message_hash: planContract.commitMessageHash,
      p_pr_body_hash: planContract.prBodyHash,
      p_path_hash: planContract.pathHash,
      p_base_branch_hash: planContract.baseBranchHash,
      p_branch_hash: planContract.branchHash,
      p_repository_hash: planContract.repositoryHash,
      p_prior_state_hash: planContract.priorStateHash,
      p_plan_contract_hash: planContract.planContractHash,
      p_runtime_public_fingerprint_hash: credential.fingerprintHash,
      p_runtime_scope_manifest_hash: credential.scopeManifestHash,
      p_environment: "production",
      p_opaque_bearer: plan.capabilityToken,
      p_opaque_nonce: plan.capabilityNonce,
      p_operation: "github_open_draft_pr",
      p_path: plan.path,
      p_plan_snapshot_hash: plan.planSnapshotHash,
      p_platform: "shared",
      p_prior_blob_sha: plan.priorBlobSha,
      p_project_id: plan.projectId,
      p_provider: "github",
      p_repository_full_name: REPOSITORY,
      p_request_hash: requestHash,
      p_preflight_receipt_id: plan.preflightReceiptId,
      p_resource_lease_id: plan.resourceLeaseId,
      p_required_tests_hash: plan.requiredTestsHash,
      p_source_state_hash: sourceStateHash,
      p_service_identity_token: readSecret(
        "COGNITIVE_GITHUB_DRAFT_PR_BROKER_SERVICE_TOKEN",
      ),
      p_task_id: plan.taskId,
    },
  );
  if (
    authorization.error ||
    !Number.isInteger(authorization.data) ||
    authorization.data < 1
  ) {
    throw new Error("github_capability_authorization_rejected");
  }

  const baseCommitRecord = await githubApi(
    credential,
    `/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/commits/${baseCommit}`,
    "GET",
    undefined,
    fetcher,
  );
  const baseTree = isRecord(baseCommitRecord.tree)
    ? toText(baseCommitRecord.tree.sha)
    : "";
  if (!/^[a-f0-9]{40}$/.test(baseTree)) {
    throw new Error("github_base_tree_rejected");
  }
  const blob = await githubApi(
    credential,
    `/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/blobs`,
    "POST",
    { content: plan.content, encoding: "utf-8" },
    fetcher,
  );
  const blobSha = toText(blob.sha);
  if (!/^[a-f0-9]{40}$/.test(blobSha)) {
    throw new Error("github_blob_rejected");
  }
  const tree = await githubApi(
    credential,
    `/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/trees`,
    "POST",
    {
      base_tree: baseTree,
      tree: [{ mode: "100644", path: plan.path, sha: blobSha, type: "blob" }],
    },
    fetcher,
  );
  const treeSha = toText(tree.sha);
  if (!/^[a-f0-9]{40}$/.test(treeSha)) {
    throw new Error("github_tree_rejected");
  }
  const commit = await githubApi(
    credential,
    `/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/commits`,
    "POST",
    { message: plan.commitMessage, parents: [baseCommit], tree: treeSha },
    fetcher,
  );
  const commitSha = toText(commit.sha);
  if (!/^[a-f0-9]{40}$/.test(commitSha)) {
    throw new Error("github_commit_rejected");
  }
  await githubApi(
    credential,
    `/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/refs`,
    "POST",
    { ref: `refs/heads/${plan.branchName}`, sha: commitSha },
    fetcher,
  );
  const beforeStateHash = sourceStateHash;
  const afterStateHash = await sha256Hex(commitSha);
  const diffHash = await sha256Hex(
    `${baseCommit}|${commitSha}|${plan.path}|${blobSha}`,
  );
  let pull: Record<string, unknown>;
  try {
    pull = await githubApi(
      credential,
      `/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/pulls`,
      "POST",
      {
        base: ALLOWED_BASE_BRANCH,
        body: planContract.prBody,
        draft: true,
        head: plan.branchName,
        maintainer_can_modify: false,
        title: plan.title,
      },
      fetcher,
    );
    const pullBase = isRecord(pull.base) ? toText(pull.base.ref) : "";
    const pullHead = isRecord(pull.head) ? toText(pull.head.ref) : "";
    if (
      pull.draft !== true ||
      pull.merged === true ||
      pullBase !== ALLOWED_BASE_BRANCH ||
      pullHead !== plan.branchName ||
      !Number.isInteger(pull.number)
    ) {
      throw new Error("github_draft_pr_readback_rejected");
    }
  } catch {
    await acceptToolResult(
      plan,
      credential,
      {
        baseBranchHash: await sha256Hex(ALLOWED_BASE_BRANCH),
        branchCreated: true,
        branchHash: await sha256Hex(plan.branchName),
        canaryKey: plan.canaryKey,
        draftPrState: "unverified_or_failed",
        pathHash: await sha256Hex(plan.path),
        repositoryHash: await sha256Hex(REPOSITORY),
        sourceCommit: commitSha,
        status: "failed",
      },
      beforeStateHash,
      afterStateHash,
      diffHash,
      commitSha,
    );
    throw new Error("github_draft_pr_creation_rejected");
  }
  const pullNumber = pull.number;
  const prReferenceHash = await sha256Hex(
    `${REPOSITORY}|${String(pullNumber)}|${plan.branchName}|${commitSha}`,
  );
  const resultEnvelope: JsonObject = {
    baseBranchHash: await sha256Hex(ALLOWED_BASE_BRANCH),
    branchHash: await sha256Hex(plan.branchName),
    canaryKey: plan.canaryKey,
    draft: true,
    pathHash: await sha256Hex(plan.path),
    prNumber: pullNumber as number,
    prReferenceHash,
    repositoryHash: await sha256Hex(REPOSITORY),
    sourceCommit: commitSha,
    status: "draft_pr_opened",
  };
  const auditRecordId = await acceptToolResult(
    plan,
    credential,
    resultEnvelope,
    beforeStateHash,
    afterStateHash,
    diffHash,
    commitSha,
  );
  return {
    auditRecordId,
    canaryKey: plan.canaryKey,
    draft: true,
    prNumber: pullNumber as number,
    prReferenceHash,
    result: "draft_pr_opened",
    sourceCommit: commitSha,
  };
};

export const handler = async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS, status: 200 });
  }
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }
  if (
    !hasGatewayAuthorization(request) || !await authenticateInvocation(request)
  ) {
    return json(401, { error: "github_broker_invocation_required" });
  }
  const payload = await request.json().catch(() => null);
  if (!isRecord(payload)) {
    return json(400, { error: "github_broker_payload_rejected" });
  }
  const action = toText(payload.action);
  if (action === "status") {
    if (Object.keys(payload).length !== 1) {
      return json(400, { error: "github_broker_payload_rejected" });
    }
    const credentialState = configuredCredentialState();
    const identityState = brokerServiceCredentialState();
    return json(200, {
      blocker: credentialState === "PRESENT"
        ? identityState === "PRESENT"
          ? PROVIDER_MERGE_DENIAL_BLOCKER
          : "GITHUB_DRAFT_PR_BROKER_IDENTITY_REQUIRED"
        : "GITHUB_DRAFT_PR_CREDENTIAL_REQUIRED",
      brokerServiceIdentity: identityState,
      credential: credentialState,
      providerMergeEnforcement: "UNPROVED",
      providerTokenCapability: "CONTENTS_WRITE_MERGE_CAPABLE",
      repositoryScopeHash: await sha256Hex(REPOSITORY),
      runtimeAuthority: "blocked",
    });
  }
  try {
    if (action === "attest_provider_readback") {
      if (
        !hasExactKeys(payload, new Set(["action", "projectId", "taskId"])) ||
        !validScope(payload)
      ) {
        return json(400, { error: "github_scope_rejected" });
      }
      if (!hasProviderMergeDenialProof()) {
        throw new Error(PROVIDER_MERGE_DENIAL_BLOCKER);
      }
      const credential = await readInstallationCredential();
      return json(
        200,
        await recordProviderReadback(
          createServiceClient(),
          payload,
          credential,
        ),
      );
    }
    if (action === "execute_canary") {
      const plan = validateDraftPlan(payload);
      if (!plan) return json(400, { error: "github_draft_plan_rejected" });
      if (!hasProviderMergeDenialProof()) {
        throw new Error(PROVIDER_MERGE_DENIAL_BLOCKER);
      }
      return json(200, await executeDraftPlan(plan));
    }
    return json(400, { error: "unsupported_action" });
  } catch (error) {
    const category = error instanceof Error ? error.message : "";
    if (category === "GITHUB_DRAFT_PR_CREDENTIAL_REQUIRED") {
      return json(503, { error: "GITHUB_DRAFT_PR_CREDENTIAL_REQUIRED" });
    }
    if (category === PROVIDER_MERGE_DENIAL_BLOCKER) {
      return json(503, { error: PROVIDER_MERGE_DENIAL_BLOCKER });
    }
    if (
      category === "github_capability_authorization_rejected" ||
      category === "github_approved_plan_contract_mismatch" ||
      category === "github_canary_branch_not_fresh" ||
      category === "github_approved_base_state_changed" ||
      category === "github_approved_path_state_changed"
    ) {
      return json(409, { error: category });
    }
    if (
      category === "github_audit_record_rejected_external_branch_quarantined"
    ) {
      return json(502, { error: category });
    }
    return json(502, { error: "github_draft_pr_broker_failed" });
  }
};

if (import.meta.main) Deno.serve(handler);
