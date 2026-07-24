import { importPKCS8, SignJWT } from "jose";
import {
  assertInvocationActive,
  providerSignal,
} from "../abort.mjs";
import { sha256Hex } from "../contracts.mjs";
import { ready } from "./helpers.mjs";

const REPOSITORY = "Chillywood2025/chillywood-mobile";
const REPOSITORY_OWNER = "Chillywood2025";
const REPOSITORY_NAME = "chillywood-mobile";
const ALLOWED_BASE_BRANCH = "codex/cognitive-level01-operationalization";
const API_ROOT = "https://api.github.com";
const API_VERSION = "2026-03-10";
const USER_AGENT = "chillywood-cognitive-github-draft-pr-broker";
const SERVICE_IDENTITY = "cognitive_github_draft_pr_broker";
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
const HASH = /^[a-f0-9]{64}$/u;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const BRANCH =
  /^codex\/cognitive-canary\/[a-z0-9][a-z0-9/_-]{2,80}$/u;
const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9._/-]{2,180}$/u;
const SAFE_TITLE = /^[A-Za-z0-9][A-Za-z0-9 .,:;()/_'-]{7,120}$/u;
const FORBIDDEN_PATH =
  /(^|\/)(?:\.github|android|ios|supabase\/migrations)(?:\/|$)|(^|\/)(?:auth|billing|entitlements?|legal|moderation|money|payments?|payouts?|pricing|providers?|ranking|releases?|rights?|rls|roles?|secrets?|transfers?|withdrawals?|workflows?)(?:[._/-]|$)|^(?:app\.json|app\.config\.[^/]+|eas\.json|package(?:-lock)?\.json|deno\.lock)$/iu;
const EXPLICIT_SECRET =
  /(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:access|refresh|service[_-]?role|private|api|model|github|client)[_-]?(?:token|key|secret)\s*[:=]\s*["']?[A-Za-z0-9+/_=-]{20,})/iu;
const HIGH_ENTROPY = /[A-Za-z0-9+/_=-]{32,}/gu;
const PLAN_KEYS = Object.freeze([
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

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value, expected) => {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index]);
};

const text = (value) => typeof value === "string" ? value.trim() : "";

const credentialState = (env) =>
  [
      "GITHUB_APP_ID",
      "GITHUB_APP_INSTALLATION_ID",
      "GITHUB_APP_PRIVATE_KEY",
      "GITHUB_REPOSITORY_ID",
    ].every((name) => text(env[name]))
    ? "PRESENT"
    : "MISSING";

const serviceIdentityState = (env) =>
  text(env.COGNITIVE_GITHUB_DRAFT_PR_BROKER_SERVICE_TOKEN)
    ? "PRESENT"
    : "MISSING";

const hasUnlabeledCredential = (value) =>
  (value.match(HIGH_ENTROPY) ?? []).some((candidate) => {
    if (
      /^[a-f0-9]{40,128}$/iu.test(candidate) ||
      /^([A-Za-z0-9])\1{31,}$/u.test(candidate)
    ) {
      return false;
    }
    const categories = [
      /[a-z]/u.test(candidate),
      /[A-Z]/u.test(candidate),
      /[0-9]/u.test(candidate),
      /[+/_=-]/u.test(candidate),
    ].filter(Boolean).length;
    return categories >= 3 &&
      new Set(candidate).size / candidate.length >= 0.32;
  });

const persistedTextIsSafe = (values) =>
  Object.entries(values).every(([key, value]) =>
    typeof value === "string" &&
    !EXPLICIT_SECRET.test(value) &&
    (
      ["branchName", "path"].includes(key) ||
      !hasUnlabeledCredential(value)
    )
  );

const encodeDerLength = (length) => {
  if (length < 128) return new Uint8Array([length]);
  const bytes = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
};

const derElement = (tag, body) => {
  const length = encodeDerLength(body.length);
  const output = new Uint8Array(1 + length.length + body.length);
  output[0] = tag;
  output.set(length, 1);
  output.set(body, 1 + length.length);
  return output;
};

const concatBytes = (...parts) => {
  const output = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

const pkcs1ToPkcs8 = (pkcs1) => {
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

const bytesToPem = (bytes) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  const lines = base64.match(/.{1,64}/gu) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${
    lines.join("\n")
  }\n-----END PRIVATE KEY-----`;
};

const normalizePrivateKey = (pem) => {
  const match = text(pem).match(
    /^-----BEGIN (RSA PRIVATE KEY|PRIVATE KEY)-----\s*([A-Za-z0-9+/=\s]+)\s*-----END \1-----$/u,
  );
  if (!match) throw new Error("github_private_key_format_rejected");
  if (match[1] === "PRIVATE KEY") return text(pem);
  const binary = atob(match[2].replace(/\s/gu, ""));
  const pkcs1 = Uint8Array.from(
    binary,
    (character) => character.charCodeAt(0),
  );
  return bytesToPem(pkcs1ToPkcs8(pkcs1));
};

const signAppJwt = async (appId, privateKey, nowSeconds) => {
  if (!/^[1-9][0-9]{2,20}$/u.test(appId)) {
    throw new Error("github_app_identity_rejected");
  }
  const key = await importPKCS8(normalizePrivateKey(privateKey), "RS256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(appId)
    .setIssuedAt(nowSeconds - 30)
    .setExpirationTime(nowSeconds + 540)
    .sign(key);
};

const responseJson = async (response, signal) => {
  const maximumBytes = 131_072;
  const declared = response.headers.get("content-length");
  if (
    declared !== null &&
    (!/^[0-9]+$/u.test(declared) || Number(declared) > maximumBytes)
  ) {
    await response.body?.cancel("github_response_rejected").catch(
      () => undefined,
    );
    throw new Error("github_response_rejected");
  }
  if (!response.body) throw new Error("github_response_rejected");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const result = await reader.read();
      signal?.throwIfAborted();
      if (result.done) break;
      const chunk = result.value instanceof Uint8Array
        ? result.value
        : new Uint8Array(result.value);
      total += chunk.byteLength;
      if (total > maximumBytes) {
        await reader.cancel("github_response_rejected");
        throw new Error("github_response_rejected");
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  if (total < 2) throw new Error("github_response_rejected");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const parsed = JSON.parse(body);
  if (!isRecord(parsed)) throw new Error("github_response_rejected");
  return parsed;
};

const githubHeaders = (authorization) => ({
  Accept: "application/vnd.github+json",
  Authorization: authorization,
  "User-Agent": USER_AGENT,
  "X-GitHub-Api-Version": API_VERSION,
});

const createCredentialReader = ({ fetcher, now }) =>
  async (env, invocation = {}) => {
    if (credentialState(env) !== "PRESENT") {
      throw new Error("GITHUB_DRAFT_PR_CREDENTIAL_REQUIRED");
    }
    const appId = text(env.GITHUB_APP_ID);
    const installationId = text(env.GITHUB_APP_INSTALLATION_ID);
    const repositoryIdText = text(env.GITHUB_REPOSITORY_ID);
    if (
      !/^[1-9][0-9]{2,20}$/u.test(installationId) ||
      !/^[1-9][0-9]{2,20}$/u.test(repositoryIdText)
    ) {
      throw new Error("github_app_identity_rejected");
    }
    const repositoryId = Number(repositoryIdText);
    if (!Number.isSafeInteger(repositoryId)) {
      throw new Error("github_app_identity_rejected");
    }
    const nowMillis = now();
    const appJwt = await signAppJwt(
      appId,
      env.GITHUB_APP_PRIVATE_KEY,
      Math.floor(nowMillis / 1_000),
    );
    await assertInvocationActive(invocation);
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
        redirect: "error",
        signal: providerSignal(invocation.signal, 10_000),
      },
    );
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("github_installation_token_rejected");
    }
    const payload = await responseJson(response, invocation.signal);
    const token = text(payload.token);
    const expiresAt = text(payload.expires_at);
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
    const expiryMillis = Date.parse(expiresAt);
    if (
      token.length < 20 ||
      token.length > 4_096 ||
      !Number.isFinite(expiryMillis) ||
      expiryMillis <= nowMillis + 5 * 60_000 ||
      expiryMillis > nowMillis + 65 * 60_000 ||
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
    return Object.freeze({
      expiresAt,
      fingerprintHash,
      scopeManifestHash,
      token,
    });
  };

const pathMatchesCanary = (canaryKey, path) => {
  if (
    !SAFE_PATH.test(path) || path.includes("..") || path.includes("//") ||
    FORBIDDEN_PATH.test(path)
  ) {
    return false;
  }
  if (canaryKey === "documentation_draft_pr") {
    return /^docs\/intelligence\/canaries\/[A-Za-z0-9][A-Za-z0-9._-]{2,80}\.md$/u
      .test(path);
  }
  if (canaryKey === "test_only_draft_pr") {
    return /^scripts\/cognitive-canaries\/[A-Za-z0-9][A-Za-z0-9._-]{2,80}\.(?:mjs|ts)$/u
      .test(path);
  }
  return /^(?:src|components|app)\/[A-Za-z0-9][A-Za-z0-9._/-]{2,160}\.(?:ts|tsx|js|jsx)$/u
    .test(path);
};

export const validateDraftPlan = (payload) => {
  if (!exactKeys(payload, PLAN_KEYS) || payload.action !== "execute_canary") {
    return null;
  }
  const plan = Object.fromEntries(
    PLAN_KEYS
      .filter((key) => key !== "action")
      .map((key) => [
        key,
        key === "content" && typeof payload[key] === "string"
          ? payload[key]
          : text(payload[key]),
      ]),
  );
  const contentBytes = new TextEncoder().encode(plan.content).length;
  const maximumBytes = plan.canaryKey === "documentation_draft_pr"
    ? 12_288
    : 32_768;
  if (
    !CANARY_KEYS.has(plan.canaryKey) ||
    !BRANCH.test(plan.branchName) ||
    plan.branchName === ALLOWED_BASE_BRANCH ||
    !pathMatchesCanary(plan.canaryKey, plan.path) ||
    !SAFE_TITLE.test(plan.title) ||
    !SAFE_TITLE.test(plan.commitMessage) ||
    !/^[a-f0-9]{40}$/u.test(plan.baseCommit) ||
    !(
      plan.priorBlobSha === "absent" ||
      /^[a-f0-9]{40}$/u.test(plan.priorBlobSha)
    ) ||
    (
      plan.canaryKey === "low_risk_source_draft_pr"
        ? plan.priorBlobSha === "absent"
        : plan.priorBlobSha !== "absent"
    ) ||
    !HASH.test(plan.approvalScopeHash) ||
    !HASH.test(plan.planSnapshotHash) ||
    !HASH.test(plan.requiredTestsHash) ||
    !UUID.test(plan.taskId) ||
    !UUID.test(plan.projectId) ||
    !UUID.test(plan.preflightReceiptId) ||
    !UUID.test(plan.resourceLeaseId) ||
    !/^[A-Za-z0-9._:-]{8,128}$/u.test(plan.callId) ||
    !/^[A-Za-z0-9_-]{8,128}$/u.test(plan.capabilityId) ||
    plan.capabilityToken.length < 32 ||
    plan.capabilityToken.length > 512 ||
    plan.capabilityNonce.length < 32 ||
    plan.capabilityNonce.length > 512 ||
    contentBytes < 1 ||
    contentBytes > maximumBytes ||
    !persistedTextIsSafe({
      branchName: plan.branchName,
      commitMessage: plan.commitMessage,
      content: plan.content,
      path: plan.path,
      title: plan.title,
    })
  ) {
    return null;
  }
  return Object.freeze(plan);
};

const draftPrBody = (canaryKey) =>
  `Governed Chi'llywood Level 0/1 canary: ${canaryKey}. Draft only; evaluator review required. No merge authority.`;

export const deriveDraftPlanContract = async (plan) => {
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
  return Object.freeze({
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
  });
};

const createGithubApi = ({ fetcher }) =>
  async (credential, path, method, body, invocation = {}) => {
    if (
      !path.startsWith(
        `/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/`,
      ) || /(?:merge|releases?|deployments?|actions|workflows?)/iu.test(path)
    ) {
      throw new Error("github_endpoint_rejected");
    }
    if (method === "GET") invocation.signal?.throwIfAborted();
    else await assertInvocationActive(invocation);
    const response = await fetcher(`${API_ROOT}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        ...githubHeaders(`Bearer ${credential.token}`),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      method,
      redirect: "error",
      signal: providerSignal(invocation.signal, 10_000),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`github_api_${response.status}`);
    }
    return responseJson(response, invocation.signal);
  };

const acceptToolResult = async (
  database,
  env,
  plan,
  credential,
  resultEnvelope,
  beforeStateHash,
  afterStateHash,
  diffHash,
  finalCommit,
) => {
  const result = await database.call("acceptGithubToolResult", [
    plan.capabilityId,
    plan.callId,
    plan.capabilityToken,
    plan.capabilityNonce,
    JSON.stringify(resultEnvelope),
    beforeStateHash,
    afterStateHash,
    diffHash,
    finalCommit,
    credential.fingerprintHash,
    credential.scopeManifestHash,
    env.COGNITIVE_GITHUB_DRAFT_PR_BROKER_SERVICE_TOKEN,
  ]);
  if (typeof result !== "string" || !UUID.test(result)) {
    throw new Error("github_audit_record_rejected_external_branch_quarantined");
  }
  return result;
};

export const createGitHubBrokerAdapters = ({
  fetcher = globalThis.fetch,
  now = () => Date.now(),
} = {}) => {
  const readInstallationCredential = createCredentialReader({ fetcher, now });
  const githubApi = createGithubApi({ fetcher });

  const status = async ({ env }) => {
    const credential = credentialState(env);
    const identity = serviceIdentityState(env);
    return Object.freeze({
      blocker: credential === "PRESENT"
        ? identity === "PRESENT"
          ? null
          : "GITHUB_DRAFT_PR_BROKER_IDENTITY_REQUIRED"
        : "GITHUB_DRAFT_PR_CREDENTIAL_REQUIRED",
      brokerServiceIdentity: identity,
      credential,
      repositoryScopeHash: await sha256Hex(REPOSITORY),
      runtimeAuthority: "draft_pr_only",
    });
  };

  const attest = async ({
    assertActive,
    context,
    database,
    env,
    signal,
  }) => {
    const invocation = { assertActive, signal };
    const credential = await readInstallationCredential(env, invocation);
    const evidenceHash = await sha256Hex(
      `${credential.fingerprintHash}|${credential.scopeManifestHash}|configured|${credential.expiresAt}`,
    );
    const receipt = await database.call("recordGithubProviderReadback", [
      context.taskId,
      context.projectId,
      "shared",
      "production",
      credential.fingerprintHash,
      credential.scopeManifestHash,
      evidenceHash,
      credential.expiresAt,
      env.COGNITIVE_GITHUB_DRAFT_PR_BROKER_SERVICE_TOKEN,
    ]);
    const providerReadbackId = isRecord(receipt)
        ? text(receipt.provider_readback_id)
        : "";
    if (!UUID.test(providerReadbackId)) {
      throw new Error("github_provider_readback_rejected");
    }
    return Object.freeze({
      credentialKind: "github_draft_pr",
      evidenceHash,
      expiresAt: credential.expiresAt,
      providerReadbackId,
      result: "configured",
      scopeManifestHash: credential.scopeManifestHash,
    });
  };

  const execute = async ({
    assertActive,
    database,
    env,
    payload,
    signal,
  }) => {
    if (
      credentialState(env) !== "PRESENT" ||
      serviceIdentityState(env) !== "PRESENT"
    ) {
      throw new Error("GITHUB_DRAFT_PR_CREDENTIAL_REQUIRED");
    }
    const plan = validateDraftPlan(payload);
    if (!plan) throw new Error("github_draft_plan_rejected");
    const invocation = { assertActive, signal };
    const credential = await readInstallationCredential(env, invocation);
    const contract = await deriveDraftPlanContract(plan);
    if (plan.planSnapshotHash !== contract.planContractHash) {
      throw new Error("github_approved_plan_contract_mismatch");
    }
    const encodedBase = encodeURIComponent(ALLOWED_BASE_BRANCH);
    const baseRef = await githubApi(
      credential,
      `/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/ref/heads/${encodedBase}`,
      "GET",
      undefined,
      invocation,
    );
    const baseObject = isRecord(baseRef.object) ? baseRef.object : {};
    const baseCommit = text(baseObject.sha);
    if (baseCommit !== plan.baseCommit) {
      throw new Error("github_approved_base_state_changed");
    }
    const branchResponse = await fetcher(
      `${API_ROOT}/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/ref/heads/${
        encodeURIComponent(plan.branchName)
      }`,
      {
        headers: githubHeaders(`Bearer ${credential.token}`),
        method: "GET",
        redirect: "error",
        signal: providerSignal(signal, 10_000),
      },
    );
    if (branchResponse.status !== 404) {
      await branchResponse.body?.cancel().catch(() => undefined);
      throw new Error("github_canary_branch_not_fresh");
    }
    await branchResponse.body?.cancel().catch(() => undefined);
    const encodedPath = plan.path.split("/").map(encodeURIComponent).join("/");
    const pathResponse = await fetcher(
      `${API_ROOT}/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/contents/${encodedPath}?ref=${
        encodeURIComponent(plan.baseCommit)
      }`,
      {
        headers: githubHeaders(`Bearer ${credential.token}`),
        method: "GET",
        redirect: "error",
        signal: providerSignal(signal, 10_000),
      },
    );
    let priorBlobSha = "absent";
    if (pathResponse.status === 200) {
      const pathState = await responseJson(pathResponse, signal);
      priorBlobSha = pathState.type === "file" ? text(pathState.sha) : "";
    } else if (pathResponse.status !== 404) {
      await pathResponse.body?.cancel().catch(() => undefined);
      throw new Error("github_canary_path_readback_rejected");
    } else {
      await pathResponse.body?.cancel().catch(() => undefined);
    }
    if (priorBlobSha !== plan.priorBlobSha) {
      throw new Error("github_approved_path_state_changed");
    }
    await assertInvocationActive(invocation);
    const requestHash = await sha256Hex([
      "github-draft-pr-request-v2",
      contract.planContractHash,
      credential.fingerprintHash,
      credential.scopeManifestHash,
      plan.approvalScopeHash,
      plan.capabilityId,
      plan.callId,
    ].join("|"));
    const authorization = await database.call("consumeGithubCapability", [
      plan.capabilityId,
      plan.capabilityToken,
      plan.capabilityNonce,
      plan.callId,
      plan.taskId,
      plan.projectId,
      REPOSITORY,
      plan.branchName,
      "shared",
      "production",
      "github",
      "github_open_draft_pr",
      plan.path,
      plan.resourceLeaseId,
      new TextEncoder().encode(plan.content).length,
      0,
      plan.approvalScopeHash,
      plan.planSnapshotHash,
      requestHash,
      plan.preflightReceiptId,
      plan.requiredTestsHash,
      contract.priorStateHash,
      plan.baseCommit,
      plan.priorBlobSha,
      contract.contentHash,
      contract.titleHash,
      contract.commitMessageHash,
      contract.prBodyHash,
      contract.pathHash,
      contract.baseBranchHash,
      contract.branchHash,
      contract.repositoryHash,
      contract.priorStateHash,
      contract.planContractHash,
      credential.fingerprintHash,
      credential.scopeManifestHash,
      env.COGNITIVE_GITHUB_DRAFT_PR_BROKER_SERVICE_TOKEN,
    ]);
    if (!Number.isInteger(authorization) || authorization < 1) {
      throw new Error("github_capability_authorization_rejected");
    }

    const baseCommitRecord = await githubApi(
      credential,
      `/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/commits/${baseCommit}`,
      "GET",
      undefined,
      invocation,
    );
    const baseTree = isRecord(baseCommitRecord.tree)
      ? text(baseCommitRecord.tree.sha)
      : "";
    if (!/^[a-f0-9]{40}$/u.test(baseTree)) {
      throw new Error("github_base_tree_rejected");
    }
    const blob = await githubApi(
      credential,
      `/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/blobs`,
      "POST",
      { content: plan.content, encoding: "utf-8" },
      invocation,
    );
    const blobSha = text(blob.sha);
    if (!/^[a-f0-9]{40}$/u.test(blobSha)) {
      throw new Error("github_blob_rejected");
    }
    const tree = await githubApi(
      credential,
      `/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/trees`,
      "POST",
      {
        base_tree: baseTree,
        tree: [{
          mode: "100644",
          path: plan.path,
          sha: blobSha,
          type: "blob",
        }],
      },
      invocation,
    );
    const treeSha = text(tree.sha);
    if (!/^[a-f0-9]{40}$/u.test(treeSha)) {
      throw new Error("github_tree_rejected");
    }
    const commit = await githubApi(
      credential,
      `/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/commits`,
      "POST",
      { message: plan.commitMessage, parents: [baseCommit], tree: treeSha },
      invocation,
    );
    const commitSha = text(commit.sha);
    if (!/^[a-f0-9]{40}$/u.test(commitSha)) {
      throw new Error("github_commit_rejected");
    }
    await githubApi(
      credential,
      `/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/refs`,
      "POST",
      { ref: `refs/heads/${plan.branchName}`, sha: commitSha },
      invocation,
    );
    const beforeStateHash = contract.priorStateHash;
    const afterStateHash = await sha256Hex(commitSha);
    const diffHash = await sha256Hex(
      `${baseCommit}|${commitSha}|${plan.path}|${blobSha}`,
    );
    let pull;
    try {
      pull = await githubApi(
        credential,
        `/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/pulls`,
        "POST",
        {
          base: ALLOWED_BASE_BRANCH,
          body: contract.prBody,
          draft: true,
          head: plan.branchName,
          maintainer_can_modify: false,
          title: plan.title,
        },
        invocation,
      );
      const pullBase = isRecord(pull.base) ? text(pull.base.ref) : "";
      const pullHead = isRecord(pull.head) ? text(pull.head.ref) : "";
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
        database,
        env,
        plan,
        credential,
        {
          baseBranchHash: contract.baseBranchHash,
          branchCreated: true,
          branchHash: contract.branchHash,
          canaryKey: plan.canaryKey,
          draftPrState: "unverified_or_failed",
          pathHash: contract.pathHash,
          repositoryHash: contract.repositoryHash,
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
    const prReferenceHash = await sha256Hex(
      `${REPOSITORY}|${String(pull.number)}|${plan.branchName}|${commitSha}`,
    );
    const resultEnvelope = {
      baseBranchHash: contract.baseBranchHash,
      branchHash: contract.branchHash,
      canaryKey: plan.canaryKey,
      draft: true,
      pathHash: contract.pathHash,
      prNumber: pull.number,
      prReferenceHash,
      repositoryHash: contract.repositoryHash,
      sourceCommit: commitSha,
      status: "draft_pr_opened",
    };
    const auditRecordId = await acceptToolResult(
      database,
      env,
      plan,
      credential,
      resultEnvelope,
      beforeStateHash,
      afterStateHash,
      diffHash,
      commitSha,
    );
    return Object.freeze({
      auditRecordId,
      canaryKey: plan.canaryKey,
      draft: true,
      prNumber: pull.number,
      prReferenceHash,
      result: "draft_pr_opened",
      sourceCommit: commitSha,
    });
  };

  return Object.freeze({
    attest_provider_readback: ready(
      ["record_github_provider_readback"],
      attest,
    ),
    execute_canary: ready(
      ["consume_github_capability", "accept_github_tool_result"],
      execute,
    ),
    status: ready([], status),
  });
};

export const GITHUB_BROKER_ADAPTERS = createGitHubBrokerAdapters();
