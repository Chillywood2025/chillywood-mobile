import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2.110.6";
import {
  authorityOwnerForId,
  canonicalizeResearchUrl,
  type CanonicalResearchUrl,
  claimHasExtractiveSupport,
  type ClaimRequest,
  extractBoundedExcerpt,
  extractObservedPublicationDates,
  extractRetrievedCitationMetadata,
  ipAddressKey,
  isPrivateOrReservedIp,
  isRecord,
  type JsonObject,
  normalizeClaimRequest,
  normalizeSourceRequest,
  type PinnedResearchResponse,
  sha256Hex,
  type SourceRequest,
} from "./policy.ts";

type SupabaseClientLike = ReturnType<typeof createClient<any>>;

const INVOCATION_HEADER = "x-cognitive-research-broker-invocation";
const LOWER_HEX_64 = /^[a-f0-9]{64}$/u;
const MAX_REDIRECTS = 3;
const MAX_WIRE_BYTES = 1_048_576;
const TOTAL_TIMEOUT_MS = 15_000;
const CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Headers":
    `authorization, x-client-info, apikey, content-type, ${INVOCATION_HEADER}`,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
});

const json = (status: number, body: JsonObject): Response =>
  new Response(JSON.stringify(body), { headers: CORS_HEADERS, status });

const readRequiredSecret = (name: string): string => {
  const value = Deno.env.get(name)?.trim() ?? "";
  if (!value) throw new Error("server_configuration_missing");
  return value;
};

const constantTimeEqual = (left: string, right: string): boolean => {
  const maximum = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maximum; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^
      (right.charCodeAt(index) || 0);
  }
  return difference === 0;
};

const authenticateInvocation = async (request: Request): Promise<boolean> => {
  const expectedHash = Deno.env.get(
    "COGNITIVE_RESEARCH_BROKER_INVOKE_SHA256",
  )?.trim() ?? "";
  const token = request.headers.get(INVOCATION_HEADER)?.trim() ?? "";
  if (
    !LOWER_HEX_64.test(expectedHash) ||
    new TextEncoder().encode(token).byteLength < 32 ||
    new TextEncoder().encode(token).byteLength > 512
  ) {
    return false;
  }
  return constantTimeEqual(await sha256Hex(token), expectedHash);
};

const createServiceClient = (): SupabaseClientLike =>
  createClient(
    readRequiredSecret("SUPABASE_URL"),
    readRequiredSecret("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

const serviceIdentityToken = (): string => {
  const token = readRequiredSecret("COGNITIVE_RESEARCH_BROKER_SERVICE_TOKEN");
  const length = new TextEncoder().encode(token).byteLength;
  if (length < 32 || length > 512) {
    throw new Error("server_configuration_missing");
  }
  return token;
};

const findBytes = (
  haystack: Uint8Array,
  needle: readonly number[],
  start = 0,
): number => {
  for (
    let index = start;
    index <= haystack.length - needle.length;
    index += 1
  ) {
    if (needle.every((byte, offset) => haystack[index + offset] === byte)) {
      return index;
    }
  }
  return -1;
};

const concatBytes = (
  chunks: readonly Uint8Array[],
  total: number,
): Uint8Array => {
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
};

const decodeChunkedBody = (input: Uint8Array): Uint8Array => {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let offset = 0;
  while (offset < input.length) {
    const lineEnd = findBytes(input, [13, 10], offset);
    if (lineEnd < 0 || lineEnd - offset > 32) {
      throw new Error("research_chunked_response_rejected");
    }
    const sizeText = new TextDecoder().decode(input.slice(offset, lineEnd))
      .split(";", 1)[0].trim();
    if (!/^[a-f0-9]+$/iu.test(sizeText)) {
      throw new Error("research_chunked_response_rejected");
    }
    const size = Number.parseInt(sizeText, 16);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error("research_chunked_response_rejected");
    }
    offset = lineEnd + 2;
    if (size === 0) return concatBytes(chunks, total);
    if (
      size > MAX_WIRE_BYTES || total + size > MAX_WIRE_BYTES ||
      offset + size + 2 > input.length ||
      input[offset + size] !== 13 || input[offset + size + 1] !== 10
    ) {
      throw new Error("research_response_size_rejected");
    }
    chunks.push(input.slice(offset, offset + size));
    total += size;
    offset += size + 2;
  }
  throw new Error("research_chunked_response_rejected");
};

type ParsedHttpResponse = Readonly<{
  body: string;
  contentType: string;
  lastModified: string | null;
  location: string | null;
  status: number;
}>;

const parseHttpResponse = (wire: Uint8Array): ParsedHttpResponse => {
  const headerEnd = findBytes(wire, [13, 10, 13, 10]);
  if (headerEnd < 0 || headerEnd > 65_536) {
    throw new Error("research_http_headers_rejected");
  }
  const headerText = new TextDecoder("utf-8", { fatal: true }).decode(
    wire.slice(0, headerEnd),
  );
  const lines = headerText.split("\r\n");
  const statusMatch = lines.shift()?.match(/^HTTP\/1\.[01] ([0-9]{3})(?: |$)/u);
  if (!statusMatch) throw new Error("research_http_status_rejected");
  const status = Number(statusMatch[1]);
  const headers = new Map<string, string>();
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator < 1) throw new Error("research_http_headers_rejected");
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (!/^[a-z0-9-]+$/u.test(name) || /[\r\n]/u.test(value)) {
      throw new Error("research_http_headers_rejected");
    }
    headers.set(
      name,
      headers.has(name) ? `${headers.get(name)},${value}` : value,
    );
  }
  const encoding = headers.get("content-encoding")?.toLowerCase() ?? "identity";
  if (encoding !== "identity") {
    throw new Error("research_content_encoding_rejected");
  }
  let bodyBytes: Uint8Array<ArrayBufferLike> = wire.slice(headerEnd + 4);
  const transferEncoding = headers.get("transfer-encoding")?.toLowerCase() ??
    "";
  if (transferEncoding) {
    if (transferEncoding !== "chunked") {
      throw new Error("research_transfer_encoding_rejected");
    }
    bodyBytes = decodeChunkedBody(bodyBytes);
  } else if (headers.has("content-length")) {
    const contentLength = headers.get("content-length") ?? "";
    if (!/^(?:0|[1-9][0-9]{0,7})$/u.test(contentLength)) {
      throw new Error("research_content_length_rejected");
    }
    const expected = Number(contentLength);
    if (expected > MAX_WIRE_BYTES || bodyBytes.byteLength !== expected) {
      throw new Error("research_response_size_rejected");
    }
  }
  if (bodyBytes.byteLength > MAX_WIRE_BYTES) {
    throw new Error("research_response_size_rejected");
  }
  return Object.freeze({
    body: new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes),
    contentType: headers.get("content-type") ?? "",
    lastModified: headers.get("last-modified") ?? null,
    location: headers.get("location") ?? null,
    status,
  });
};

const resolvePublicAddresses = async (
  hostname: string,
  signal: AbortSignal,
): Promise<readonly string[]> => {
  const results = await Promise.allSettled([
    Deno.resolveDns(hostname, "A", { signal }),
    Deno.resolveDns(hostname, "AAAA", { signal }),
  ]);
  const addresses = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );
  const unique = [...new Set(addresses)].slice(0, 16);
  if (
    unique.length < 1 ||
    unique.some((address) =>
      !ipAddressKey(address) || isPrivateOrReservedIp(address)
    )
  ) {
    throw new Error("research_dns_scope_rejected");
  }
  return Object.freeze(unique);
};

const writeAll = async (
  connection: Deno.Conn,
  bytes: Uint8Array,
): Promise<void> => {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = await connection.write(bytes.subarray(offset));
    if (written <= 0) throw new Error("research_transport_write_failed");
    offset += written;
  }
};

const readAllBounded = async (connection: Deno.Conn): Promise<Uint8Array> => {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const buffer = new Uint8Array(32_768);
  while (true) {
    const count = await connection.read(buffer);
    if (count === null) break;
    total += count;
    if (total > MAX_WIRE_BYTES + 65_540) {
      throw new Error("research_response_size_rejected");
    }
    chunks.push(buffer.slice(0, count));
  }
  return concatBytes(chunks, total);
};

const requestPinnedAddress = async (
  target: CanonicalResearchUrl,
  address: string,
  signal: AbortSignal,
): Promise<{ response: ParsedHttpResponse; connectedAddress: string }> => {
  let connection: Deno.Conn | null = null;
  const closeOnAbort = () => {
    try {
      connection?.close();
    } catch {
      // A concurrent network operation can already have closed the connection.
    }
  };
  signal.addEventListener("abort", closeOnAbort, { once: true });
  try {
    const tcp = await Deno.connect({
      hostname: address,
      port: 443,
      signal,
      transport: "tcp",
    });
    connection = tcp;
    const remote = (tcp.remoteAddr as Deno.NetAddr).hostname;
    const expectedKey = ipAddressKey(address);
    if (
      !expectedKey || ipAddressKey(remote) !== expectedKey ||
      isPrivateOrReservedIp(remote)
    ) {
      throw new Error("research_connected_peer_mismatch");
    }
    const tls = await Deno.startTls(tcp, {
      hostname: target.hostname,
      alpnProtocols: ["http/1.1"],
    });
    connection = tls;
    const requestBytes = new TextEncoder().encode(
      `GET ${target.pathAndQuery} HTTP/1.1\r\n` +
        `Host: ${target.hostname}\r\n` +
        "Accept: text/html, text/plain, application/json\r\n" +
        "Accept-Encoding: identity\r\n" +
        "Connection: close\r\n" +
        "User-Agent: ChillywoodPublicResearchBroker/1\r\n\r\n",
    );
    await writeAll(tls, requestBytes);
    return {
      response: parseHttpResponse(await readAllBounded(tls)),
      connectedAddress: remote,
    };
  } finally {
    signal.removeEventListener("abort", closeOnAbort);
    try {
      connection?.close();
    } catch {
      // The connection can already be closed by timeout/cancellation.
    }
  }
};

const requestPinnedTarget = async (
  target: CanonicalResearchUrl,
  addresses: readonly string[],
  signal: AbortSignal,
): Promise<{ response: ParsedHttpResponse; connectedAddress: string }> => {
  let lastError: unknown = new Error("research_transport_unavailable");
  for (const address of addresses) {
    if (signal.aborted) throw new Error("research_cancelled");
    try {
      return await requestPinnedAddress(target, address, signal);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "research_connected_peer_mismatch"
      ) {
        throw error;
      }
      lastError = error;
    }
  }
  throw lastError;
};

export const fetchPinnedPublicResearch = async (
  initialUrl: string,
  callerSignal?: AbortSignal,
): Promise<PinnedResearchResponse> => {
  const initial = canonicalizeResearchUrl(initialUrl);
  if (!initial) throw new Error("research_url_rejected");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS);
  const cancel = () => controller.abort();
  callerSignal?.addEventListener("abort", cancel, { once: true });
  let target = initial;
  const allResolved = new Set<string>();
  try {
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      if (controller.signal.aborted) throw new Error("research_total_timeout");
      const addresses = await resolvePublicAddresses(
        target.hostname,
        controller.signal,
      );
      addresses.forEach((address) => allResolved.add(address));
      if (allResolved.size > 16) {
        throw new Error("research_dns_scope_rejected");
      }
      const { response, connectedAddress } = await requestPinnedTarget(
        target,
        addresses,
        controller.signal,
      );
      if (response.location !== null) {
        if (
          ![301, 302, 303, 307, 308].includes(response.status) ||
          redirect === MAX_REDIRECTS
        ) {
          throw new Error("research_redirect_rejected");
        }
        const redirected = canonicalizeResearchUrl(
          new URL(response.location, target.canonical).toString(),
        );
        if (!redirected || redirected.hostname !== initial.hostname) {
          throw new Error("research_redirect_scope_rejected");
        }
        target = redirected;
        continue;
      }
      if (response.status < 200 || response.status > 299) {
        throw new Error("research_http_status_rejected");
      }
      return Object.freeze({
        body: response.body,
        canonicalUrl: target.canonical,
        connectedAddress,
        contentType: response.contentType,
        lastModified: response.lastModified,
        resolvedAddresses: Object.freeze([...allResolved]),
        retrievalDate: new Date().toISOString(),
        status: response.status,
      });
    }
    throw new Error("research_redirect_rejected");
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        callerSignal?.aborted ? "research_cancelled" : "research_total_timeout",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", cancel);
  }
};

type ResearchRuntimeScope = Readonly<{
  environment: "production";
  platform: "shared";
  projectId: string;
  taskId: string;
}>;

export const researchRuntimeGateOpen = async (
  serviceClient: SupabaseClientLike,
  scope: ResearchRuntimeScope,
): Promise<boolean> => {
  const now = new Date().toISOString();
  const [switches, retention, task, emergency] = await Promise.all([
    serviceClient
      .from("cognitive_governance_switches")
      .select("switch_key,enabled")
      .eq("task_id", scope.taskId)
      .eq("project_id", scope.projectId)
      .eq("platform", scope.platform)
      .eq("environment", scope.environment)
      .in("switch_key", [
        "cognitive_research_enabled",
        "cognitive_memory_enabled",
        "cognitive_user_derived_memory_enabled",
      ]),
    serviceClient
      .from("cognitive_retention_policy_states")
      .select(
        "policy_state,user_derived_memory_allowed,raw_user_reports_allowed,raw_private_messages_allowed,raw_private_media_allowed,raw_user_analytics_allowed,private_model_input_allowed",
      )
      .eq("task_id", scope.taskId)
      .eq("project_id", scope.projectId)
      .eq("platform", scope.platform)
      .eq("environment", scope.environment)
      .maybeSingle(),
    serviceClient
      .from("intelligence_tasks")
      .select("id,cancelled_at,quarantined_at,deadman_at")
      .eq("id", scope.taskId)
      .eq("project_id", scope.projectId)
      .eq("platform", scope.platform)
      .eq("environment", scope.environment)
      .gt("deadman_at", now)
      .is("cancelled_at", null)
      .is("quarantined_at", null)
      .maybeSingle(),
    serviceClient
      .from("autonomous_system_emergency_states")
      .select("system_id,status")
      .eq("system_id", "product_intelligence_operator")
      .eq("status", "active")
      .maybeSingle(),
  ]);
  if (
    switches.error || retention.error || task.error || emergency.error ||
    !Array.isArray(switches.data) || switches.data.length !== 3 ||
    !retention.data || !task.data || !emergency.data
  ) {
    return false;
  }
  const switchState = new Map(
    switches.data.map((entry) => [entry.switch_key, entry.enabled === true]),
  );
  return switchState.get("cognitive_research_enabled") === true &&
    switchState.get("cognitive_memory_enabled") === true &&
    switchState.get("cognitive_user_derived_memory_enabled") === false &&
    retention.data.policy_state === "owner_counsel_decision_required" &&
    retention.data.user_derived_memory_allowed === false &&
    retention.data.raw_user_reports_allowed === false &&
    retention.data.raw_private_messages_allowed === false &&
    retention.data.raw_private_media_allowed === false &&
    retention.data.raw_user_analytics_allowed === false &&
    retention.data.private_model_input_allowed === false;
};

export const retrieveAndRecordSource = async (
  serviceClient: SupabaseClientLike,
  payload: SourceRequest,
  signal?: AbortSignal,
): Promise<Response> => {
  const authorityUrl = canonicalizeResearchUrl(payload.url);
  if (!authorityUrl) return json(400, { error: "research_source_rejected" });
  let retrieved: PinnedResearchResponse;
  try {
    retrieved = await fetchPinnedPublicResearch(payload.url, signal);
  } catch {
    return json(422, { error: "public_research_transport_blocked" });
  }
  const excerpt = extractBoundedExcerpt(retrieved.body, retrieved.contentType);
  if (!excerpt) {
    return json(422, { error: "public_research_content_rejected" });
  }
  const retrievalTime = Date.parse(retrieved.retrievalDate);
  const observedPublicationDates = extractObservedPublicationDates(
    retrieved.body,
    retrieved.contentType,
  );
  const headerPublicationTime = retrieved.lastModified === null
    ? Number.NaN
    : Date.parse(retrieved.lastModified);
  const allObservedPublicationDates = [
    ...observedPublicationDates,
    ...(Number.isFinite(headerPublicationTime)
      ? [new Date(headerPublicationTime).toISOString()]
      : []),
  ];
  if (!allObservedPublicationDates.includes(payload.publicationDate)) {
    return json(422, { error: "research_publication_date_unverified" });
  }
  const publicationDate = payload.publicationDate;
  if (Date.parse(publicationDate) > retrievalTime) {
    return json(400, { error: "research_publication_date_rejected" });
  }
  const freshnessDeadline = new Date(
    retrievalTime + payload.freshnessSeconds * 1_000,
  ).toISOString();
  const finalUrl = canonicalizeResearchUrl(retrieved.canonicalUrl);
  if (!finalUrl || finalUrl.hostname !== authorityUrl.hostname) {
    return json(422, { error: "public_research_redirect_rejected" });
  }
  const citationMetadata = extractRetrievedCitationMetadata(
    retrieved.body,
    retrieved.contentType,
    finalUrl.canonical,
    payload.publisher,
    payload.sourceType,
  );
  if (!citationMetadata) {
    return json(422, { error: "research_citation_metadata_unavailable" });
  }
  const [sourceReferenceHash, canonicalUrlHash, contentHash] = await Promise
    .all([
      sha256Hex(authorityUrl.canonical),
      sha256Hex(finalUrl.canonical),
      sha256Hex(excerpt),
    ]);
  const resolvedAddressHashes = await Promise.all(
    retrieved.resolvedAddresses.map((address) => sha256Hex(address)),
  );
  const result = await serviceClient.rpc(
    "cognitive_record_public_research_source",
    {
      p_authority_id: payload.authorityId,
      p_bounded_excerpt: excerpt,
      p_canonical_host: finalUrl.hostname,
      p_canonical_url_hash: canonicalUrlHash,
      p_citation_metadata: citationMetadata,
      p_content_hash: contentHash,
      p_environment: payload.environment,
      p_freshness_deadline: freshnessDeadline,
      p_is_primary: [
        "official_documentation",
        "security_advisory",
        "platform_policy",
        "store_policy",
      ].includes(payload.sourceType),
      // Derive the immutable owner from the reviewed registry, never caller JSON.
      p_ownership_identity: authorityOwnerForId(payload.authorityId),
      p_platform: payload.platform,
      p_project_id: payload.projectId,
      p_publication_date: publicationDate,
      p_publisher: payload.publisher,
      p_resolved_address_hashes: resolvedAddressHashes,
      p_retrieval_date: retrieved.retrievalDate,
      p_service_identity_token: serviceIdentityToken(),
      p_source_reference_hash: sourceReferenceHash,
      p_source_type: payload.sourceType,
      p_task_id: payload.taskId,
    },
  );
  if (result.error || !isRecord(result.data)) {
    return json(409, { error: "public_research_source_persistence_rejected" });
  }
  const sourceId = result.data.source_id;
  const retrievalId = result.data.retrieval_id;
  if (
    typeof sourceId !== "string" || typeof retrievalId !== "string" ||
    result.data.content_hash !== contentHash
  ) {
    return json(409, { error: "public_research_source_readback_mismatch" });
  }
  return json(200, {
    canonicalUrlHash,
    contentHash,
    citationLocatorHash: await sha256Hex(citationMetadata.locator),
    citationTitle: citationMetadata.title,
    freshnessDeadline,
    privateDataUsed: false,
    publisher: payload.publisher,
    retrievalId,
    sourceId,
    sourceType: payload.sourceType,
    trustedForToolExecution: false,
    userDerivedDataUsed: false,
  });
};

export const recordClaimEvidence = async (
  serviceClient: SupabaseClientLike,
  payload: ClaimRequest,
): Promise<Response> => {
  const now = new Date().toISOString();
  const sourceResult = await serviceClient
    .from("research_sources")
    .select(
      "id,bounded_excerpt,is_primary,ownership_identity,publication_date,source_type,freshness_deadline,retention_until,erased_at",
    )
    .in("id", [...payload.sourceIds])
    .eq("task_id", payload.taskId)
    .eq("project_id", payload.projectId)
    .eq("platform", payload.platform)
    .eq("environment", payload.environment)
    .gt("freshness_deadline", now)
    .gt("retention_until", now)
    .is("erased_at", null);
  if (
    sourceResult.error || !Array.isArray(sourceResult.data) ||
    sourceResult.data.length !== payload.sourceIds.length ||
    sourceResult.data.some((source) =>
      typeof source.bounded_excerpt !== "string" ||
      typeof source.publication_date !== "string" ||
      !claimHasExtractiveSupport(
        payload.boundedClaim,
        source.bounded_excerpt,
      )
    )
  ) {
    return json(409, { error: "public_research_claim_support_rejected" });
  }
  if (
    ["technical", "platform_policy", "security"].includes(payload.category) &&
    !sourceResult.data.some((source) =>
      source.is_primary === true &&
      [
        "official_documentation",
        "security_advisory",
        "platform_policy",
        "store_policy",
      ].includes(String(source.source_type))
    )
  ) {
    return json(409, { error: "public_research_primary_support_required" });
  }
  if (
    payload.category === "consequential_news" &&
    new Set(
        sourceResult.data.map((source) => String(source.ownership_identity)),
      ).size < 2
  ) {
    return json(409, { error: "public_research_corroboration_required" });
  }
  const expectedClaimHash = await sha256Hex(payload.boundedClaim);
  const result = await serviceClient.rpc(
    "cognitive_record_public_research_claim_evidence",
    {
      p_bounded_claim: payload.boundedClaim,
      p_canary_key: payload.canaryKey,
      p_category: payload.category,
      p_confidence: payload.confidence,
      p_contradiction_state: payload.contradictionState,
      p_environment: payload.environment,
      p_freshness_deadline: payload.freshnessDeadline,
      p_platform: payload.platform,
      p_project_id: payload.projectId,
      p_service_identity_token: serviceIdentityToken(),
      p_source_ids: payload.sourceIds,
      p_task_id: payload.taskId,
    },
  );
  if (result.error || typeof result.data !== "string") {
    return json(409, { error: "public_research_claim_persistence_rejected" });
  }
  const readback = await serviceClient
    .from("research_claims")
    .select("id,claim_hash,retention_until,erased_at")
    .eq("id", result.data)
    .eq("task_id", payload.taskId)
    .eq("project_id", payload.projectId)
    .eq("platform", payload.platform)
    .eq("environment", payload.environment)
    .maybeSingle();
  if (
    readback.error || !readback.data ||
    readback.data.claim_hash !== expectedClaimHash ||
    readback.data.erased_at !== null ||
    typeof readback.data.retention_until !== "string" ||
    Date.parse(readback.data.retention_until) >
      Date.now() + 30 * 86_400_000 + 300_000
  ) {
    return json(409, { error: "public_research_claim_readback_mismatch" });
  }
  return json(200, {
    canaryAccepted: false,
    canaryKey: payload.canaryKey,
    claimHash: expectedClaimHash,
    evaluatorRequired: true,
    privateDataUsed: false,
    researchClaimId: result.data,
    userDerivedDataUsed: false,
  });
};

export const handler = async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS, status: 200 });
  }
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }
  if (!await authenticateInvocation(request)) {
    return json(401, { error: "research_broker_invocation_required" });
  }
  try {
    const payload = await request.json().catch(() => null);
    if (!isRecord(payload)) {
      return json(400, { error: "research_broker_payload_rejected" });
    }
    if (payload.action === "retrieve_source") {
      const normalized = normalizeSourceRequest(payload);
      if (!normalized) {
        return json(400, { error: "research_source_payload_rejected" });
      }
      const serviceClient = createServiceClient();
      if (!await researchRuntimeGateOpen(serviceClient, normalized)) {
        return json(409, { error: "research_runtime_gate_closed" });
      }
      return await retrieveAndRecordSource(
        serviceClient,
        normalized,
        request.signal,
      );
    }
    if (payload.action === "record_claim") {
      const normalized = normalizeClaimRequest(payload);
      if (!normalized) {
        return json(400, { error: "research_claim_payload_rejected" });
      }
      const serviceClient = createServiceClient();
      if (!await researchRuntimeGateOpen(serviceClient, normalized)) {
        return json(409, { error: "research_runtime_gate_closed" });
      }
      return await recordClaimEvidence(serviceClient, normalized);
    }
    return json(400, { error: "unsupported_action" });
  } catch {
    return json(500, { error: "cognitive_public_research_broker_failed" });
  }
};

if (import.meta.main) Deno.serve(handler);
