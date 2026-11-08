/** Source-only privileged transport. Tests use synthetic provider bytes.
 * A consumed SQL ticket permits one request; parser facts never register an
 * Offering, authenticate a buyer, grant access, or qualify a real provider.
 */
export const PROVISIONER_PROTOCOL = "isolated-test-store-v3-provisioning" as const;
export const EVIDENCE_PROTOCOL = "isolated-test-store-v3-provisioning-evidence" as const;
const ORIGIN = "https://api.revenuecat.com";
export type ProvisioningOperation = "create_offering" | "create_package" | "attach_product"
  | "read_offering" | "list_offerings" | "read_package" | "list_packages"
  | "read_product" | "list_package_products";
export type ProvisioningSelector = {
  planId: string; operation: ProvisioningOperation; requestId: string; cursor: string | null;
};
export type ProvisioningPlan = {
  offeringLookupKey: string; offeringDisplayName: string;
  packageLookupKey: string; packageDisplayName: string;
  providerOfferingId: string | null; providerPackageId: string | null;
  providerProductId: string; storeIdentifier: string;
  qualifiedProductType: "consumable" | "one_time";
  qualifiedProductState: string; qualifiedOneTimeConsumable: boolean | null;
};
export type ProvisioningTicket = ProvisioningSelector & {
  protocol: typeof PROVISIONER_PROTOCOL; ticketId: string;
  connectionId: string; connectionRevision: number;
  providerConfigurationDigest: string; projectId: string; appId: string;
  credentialVersion: string; validUntil: string; plan: ProvisioningPlan;
};
export type ProvisioningConfig = {
  enabled: boolean; qualification: "qualified";
  connectionId: string; connectionRevision: number; providerConfigurationDigest: string;
  projectId: string; appId: string; qualificationEvidenceSha256: string;
  credentialRef: string; credentialVersion: string; secret: string;
  encryption: { keyId: string; key: Uint8Array };
  limits: { timeoutMs: number; maxResponseBytes: number; pageSize: number; maxPages: number; maxItems: number };
};
export type OfferingFact = {
  kind: "offering"; id: string; lookupKey: string; displayName: string;
  projectId: string; state: string; isCurrent: boolean; createdAt: number;
};
export type PackageFact = {
  kind: "package"; id: string; lookupKey: string; displayName: string; position: number; createdAt: number;
};
export type ProductFact = {
  kind: "product"; id: string; storeIdentifier: string; appId: string; state: string;
  productType: string; oneTimeConsumable: boolean | null;
};
export type AttachmentFact = { kind: "attachment"; product: ProductFact; eligibilityCriteria: string };
export type ProvisioningFact = OfferingFact | PackageFact | ProductFact | AttachmentFact;
export type ProvisioningObservation = {
  kind: "resource" | "list" | "provider_error" | "invalid" | "transport";
  resourceKind: ProvisioningFact["kind"] | null; items: ProvisioningFact[];
  nextCursor: string | null; complete: boolean; issue: string | null; httpStatus: number | null;
};
export type ProvisioningEvidence = {
  protocol: typeof EVIDENCE_PROTOCOL; ticketId: string; requestId: string; planId: string;
  connectionId: string; connectionRevision: number; providerConfigurationDigest: string;
  credentialVersion: string; operation: ProvisioningOperation; method: "GET" | "POST";
  pathAndQuery: string; requestSha256: string; startedAt: string; endedAt: string;
  httpStatus: number | null; responseHeaders: Record<string, string>;
  transportOutcome: "complete" | "timeout" | "connection_error" | "body_incomplete" | "body_too_large";
  rawSha256: string; rawByteLength: number;
  encryption: { algorithm: "AES-256-GCM"; keyId: string; nonce: string; ciphertext: string };
};
export type ProvisioningRecord = {
  ticketId: string; connectionId: string; connectionRevision: number;
  evidence: ProvisioningEvidence; observation: ProvisioningObservation;
};
export type ProvisioningDependencies = {
  /** Atomic SQL claim consumes send authority AND budget before returning it. */
  claim: (selector: ProvisioningSelector) => Promise<unknown>;
  /** Must atomically retain exact encrypted evidence before acknowledgement. */
  record: (record: ProvisioningRecord) => Promise<unknown>;
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  now?: () => number;
};
export type ProvisioningResult = {
  status: "recorded" | "unavailable" | "outcome_unknown";
  reason: string; ticketId: string | null; evidenceSha256: string | null;
  observation: ProvisioningObservation | null; retryProviderMutation: false; grantsAccess: false;
};
const encoder = new TextEncoder();
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const exactKeys = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const representable = (v: string): boolean => !v.includes("\u0000")
  && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v);
const text = (v: unknown, max = 512): v is string => typeof v === "string" && v.length > 0 && v.length <= max
  && v === v.trim() && !/[\u0000-\u001f\u007f]/u.test(v) && representable(v);
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,200}$/u.test(v);
const uuid = (v: unknown): v is string => typeof v === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v);
const digest = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/u.test(v);
const integer = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
// SQL timestamptz JSON uses the session timezone and microseconds. Preserve the
// instant without requiring a UTC spelling, while rejecting normalized dates.
const iso = (v: unknown): v is string => {
  if (typeof v !== "string") return false;
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/u.exec(v);
  if (!m || !Number.isFinite(Date.parse(v))) return false;
  const local = `${m[1]}.${(m[2] ?? "").padEnd(3, "0").slice(0, 3)}Z`;
  if (!Number.isFinite(Date.parse(local)) || new Date(local).toISOString() !== local) return false;
  if (m[3] === "Z") return Date.parse(v) === Date.parse(local);
  const hours = Number(m[5]), minutes = Number(m[6]);
  if (hours > 23 || minutes > 59) return false;
  const offset = (hours * 60 + minutes) * (m[4] === "+" ? 1 : -1);
  return Date.parse(v) === Date.parse(local) - offset * 60000;
};
const operations: ProvisioningOperation[] = ["create_offering", "create_package", "attach_product", "read_offering", "list_offerings", "read_package", "list_packages", "read_product", "list_package_products"];
const lists: ProvisioningOperation[] = ["list_offerings", "list_packages", "list_package_products"];
const mutations: ProvisioningOperation[] = ["create_offering", "create_package", "attach_product"];
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => object(item)
  ? Object.fromEntries(Object.keys(item).sort().map(k => [k, item[k]])) : item);
const sha = async (bytes: Uint8Array): Promise<string> => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)))].map(v => v.toString(16).padStart(2, "0")).join("");
const hashJson = (v: unknown) => sha(encoder.encode(canonical(v)));
const base64 = (bytes: Uint8Array) => btoa(Array.from(bytes, v => String.fromCharCode(v)).join(""));
const unbase64 = (s: string) => {
  if (typeof s !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(s)) throw Error("invalid_ciphertext");
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
};
const outcome = (status: ProvisioningResult["status"], reason: string, ticketId: string | null = null,
  evidenceSha256: string | null = null, observation: ProvisioningObservation | null = null): ProvisioningResult =>
  ({ status, reason, ticketId, evidenceSha256, observation, retryProviderMutation: false, grantsAccess: false });

function snapshotConfig(c: ProvisioningConfig | null, requireEnabled = true): ProvisioningConfig {
  if (!c || (requireEnabled && c.enabled !== true) || typeof c.enabled !== "boolean" || c.qualification !== "qualified" || !uuid(c.connectionId)
    || !integer(c.connectionRevision, 1, Number.MAX_SAFE_INTEGER) || !digest(c.providerConfigurationDigest)
    || !digest(c.qualificationEvidenceSha256) || !id(c.projectId) || !id(c.appId)
    || !text(c.credentialRef) || !text(c.credentialVersion) || !text(c.secret, 4096) || c.secret.length < 16
    || !c.encryption || !text(c.encryption.keyId) || !(c.encryption.key instanceof Uint8Array) || c.encryption.key.length !== 32
    || !c.limits || !integer(c.limits.timeoutMs, 1, 5000) || !integer(c.limits.maxResponseBytes, 1, 1024 * 1024)
    || !integer(c.limits.pageSize, 1, 100) || !integer(c.limits.maxPages, 1, 100) || !integer(c.limits.maxItems, 1, 10000))
    throw Error("configuration_unavailable");
  return { ...c, encryption: { keyId: c.encryption.keyId, key: new Uint8Array(c.encryption.key) }, limits: { ...c.limits } };
}
function selector(v: unknown): ProvisioningSelector {
  if (!object(v) || !exactKeys(v, ["planId", "operation", "requestId", "cursor"]) || !uuid(v.planId) || !uuid(v.requestId)
    || typeof v.operation !== "string" || !operations.includes(v.operation as ProvisioningOperation)
    || (v.cursor !== null && !id(v.cursor)) || (!lists.includes(v.operation as ProvisioningOperation) && v.cursor !== null))
    throw Error("invalid_selector");
  return { planId: v.planId, requestId: v.requestId, operation: v.operation as ProvisioningOperation, cursor: v.cursor as string | null };
}
function checkedTicket(value: unknown, s: ProvisioningSelector, c: ProvisioningConfig, now: number): ProvisioningTicket {
  if (!object(value) || !exactKeys(value, ["protocol", "ticketId", "planId", "operation", "requestId", "cursor", "connectionId", "connectionRevision", "providerConfigurationDigest", "projectId", "appId", "credentialVersion", "validUntil", "plan"]))
    throw Error("invalid_ticket");
  const t = value as unknown as ProvisioningTicket, p = t.plan;
  if (t.protocol !== PROVISIONER_PROTOCOL || !uuid(t.ticketId) || canonical(selector({ planId: t.planId, operation: t.operation, requestId: t.requestId, cursor: t.cursor })) !== canonical(s)
    || t.connectionId !== c.connectionId || t.connectionRevision !== c.connectionRevision || t.providerConfigurationDigest !== c.providerConfigurationDigest
    || t.projectId !== c.projectId || t.appId !== c.appId || t.credentialVersion !== c.credentialVersion
    || !iso(t.validUntil) || Date.parse(t.validUntil) <= now || Date.parse(t.validUntil) > now + 5000
    || !object(p) || !exactKeys(p, ["offeringLookupKey", "offeringDisplayName", "packageLookupKey", "packageDisplayName", "providerOfferingId", "providerPackageId", "providerProductId", "storeIdentifier", "qualifiedProductType", "qualifiedProductState", "qualifiedOneTimeConsumable"])
    || !text(p.offeringLookupKey, 200) || !text(p.packageLookupKey, 200) || !text(p.offeringDisplayName, 1500) || !text(p.packageDisplayName, 1500)
    || (p.providerOfferingId !== null && !id(p.providerOfferingId)) || (p.providerPackageId !== null && !id(p.providerPackageId))
    || !id(p.providerProductId) || !text(p.storeIdentifier) || !text(p.qualifiedProductState)
    || !["consumable", "one_time"].includes(p.qualifiedProductType) || (p.qualifiedOneTimeConsumable !== null && typeof p.qualifiedOneTimeConsumable !== "boolean")
    || (["create_package", "read_offering", "list_packages"].includes(t.operation) && p.providerOfferingId === null)
    || (["attach_product", "read_package", "list_package_products"].includes(t.operation) && p.providerPackageId === null)) throw Error("invalid_ticket");
  return { ...t, plan: { ...p } };
}
function request(t: ProvisioningTicket, pageSize: number): { method: "GET" | "POST"; pathAndQuery: string; body: string | null } {
  const root = `/v2/projects/${encodeURIComponent(t.projectId)}`, p = t.plan;
  let path: string, body: unknown = null;
  switch (t.operation) {
    case "create_offering": path = `${root}/offerings`; body = { lookup_key: p.offeringLookupKey, display_name: p.offeringDisplayName }; break;
    case "create_package": path = `${root}/offerings/${encodeURIComponent(p.providerOfferingId!)}/packages`; body = { lookup_key: p.packageLookupKey, display_name: p.packageDisplayName }; break;
    case "attach_product": path = `${root}/packages/${encodeURIComponent(p.providerPackageId!)}/actions/attach_products`; body = { products: [{ product_id: p.providerProductId, eligibility_criteria: "all" }] }; break;
    case "read_offering": path = `${root}/offerings/${encodeURIComponent(p.providerOfferingId!)}`; break;
    case "list_offerings": path = `${root}/offerings`; break;
    case "read_package": path = `${root}/packages/${encodeURIComponent(p.providerPackageId!)}`; break;
    case "list_packages": path = `${root}/offerings/${encodeURIComponent(p.providerOfferingId!)}/packages`; break;
    case "read_product": path = `${root}/products/${encodeURIComponent(p.providerProductId)}`; break;
    case "list_package_products": path = `${root}/packages/${encodeURIComponent(p.providerPackageId!)}/products`; break;
  }
  if (lists.includes(t.operation)) path += `?limit=${pageSize}${t.cursor === null ? "" : `&starting_after=${encodeURIComponent(t.cursor)}`}`;
  return { method: mutations.includes(t.operation) ? "POST" : "GET", pathAndQuery: path, body: body === null ? null : canonical(body) };
}

// Bounded duplicate-aware JSON parser. Unknown fields are retained in encrypted
// bytes; even duplicate unknown keys are rejected rather than silently selected.
function parseJson(bytes: Uint8Array): unknown {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  let i = 0, nodes = 0;
  const whitespace = () => { while (i < source.length && /[ \n\r\t]/u.test(source[i])) i++; };
  const string = (): string => {
    const start = i++;
    while (i < source.length) { if (source[i] === "\\") { i += 2; continue; } if (source[i++] === '"') {
      const decoded = JSON.parse(source.slice(start, i)) as string;
      if (!representable(decoded)) throw Error("invalid_unicode_scalar"); return decoded;
    } }
    throw Error("invalid_json");
  };
  const value = (depth: number): void => {
    if (depth > 24 || ++nodes > 20000) throw Error("json_structure_limit"); whitespace();
    if (source[i] === '{') {
      i++; whitespace(); const keys = new Set<string>(); if (source[i] === '}') { i++; return; }
      for (;;) { if (source[i] !== '"') throw Error("invalid_json"); const key = string(); if (keys.has(key)) throw Error("duplicate_json_key"); keys.add(key);
        whitespace(); if (source[i++] !== ':') throw Error("invalid_json"); value(depth + 1); whitespace(); const end = source[i++];
        if (end === '}') return; if (end !== ',') throw Error("invalid_json"); whitespace(); }
    }
    if (source[i] === '[') {
      i++; whitespace(); if (source[i] === ']') { i++; return; }
      for (;;) { value(depth + 1); whitespace(); const end = source[i++]; if (end === ']') return; if (end !== ',') throw Error("invalid_json"); }
    }
    if (source[i] === '"') { string(); return; }
    const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/u.exec(source.slice(i));
    if (!token) throw Error("invalid_json"); i += token[0].length;
  };
  value(0); whitespace(); if (i !== source.length) throw Error("invalid_json"); return JSON.parse(source);
}
function fact(v: unknown, kind: ProvisioningFact["kind"]): ProvisioningFact {
  if (!object(v)) throw Error("invalid_resource");
  if (kind === "attachment") {
    if (!text(v.eligibility_criteria)) throw Error("invalid_attachment");
    return { kind, product: fact(v.product, "product") as ProductFact, eligibilityCriteria: v.eligibility_criteria };
  }
  if (v.object !== kind || !id(v.id)) throw Error("invalid_resource_identity");
  if (kind === "product") {
    if (!text(v.store_identifier) || !id(v.app_id) || !text(v.state) || !text(v.type)) throw Error("invalid_product");
    let consumable: boolean | null = null;
    if (v.one_time !== undefined && v.one_time !== null) {
      if (!object(v.one_time) || typeof v.one_time.is_consumable !== "boolean") throw Error("invalid_product_consumability");
      consumable = v.one_time.is_consumable;
    }
    return { kind, id: v.id, storeIdentifier: v.store_identifier, appId: v.app_id, state: v.state, productType: v.type, oneTimeConsumable: consumable };
  }
  if (!text(v.lookup_key, 200) || !text(v.display_name, 1500) || !integer(v.created_at, 0, Number.MAX_SAFE_INTEGER)) throw Error("invalid_resource_fields");
  if (kind === "offering") {
    if (!id(v.project_id) || !text(v.state) || typeof v.is_current !== "boolean") throw Error("invalid_offering");
    return { kind, id: v.id, lookupKey: v.lookup_key, displayName: v.display_name, projectId: v.project_id, state: v.state, isCurrent: v.is_current, createdAt: v.created_at };
  }
  if (!integer(v.position, 1, 32767)) throw Error("invalid_package_position");
  return { kind, id: v.id, lookupKey: v.lookup_key, displayName: v.display_name, position: v.position, createdAt: v.created_at };
}
const factId = (f: ProvisioningFact) => f.kind === "attachment" ? f.product.id : f.id;
function collectionUrl(value: unknown, path: string, pageSize: number): URL {
  if (typeof value !== "string") throw Error("invalid_collection_url");
  const u = new URL(value);
  if (u.origin !== ORIGIN || u.username || u.password || u.hash || u.pathname !== path
    || [...u.searchParams.keys()].some(k => k !== "limit" && k !== "starting_after")
    || u.searchParams.getAll("limit").length > 1 || u.searchParams.getAll("starting_after").length > 1
    || (u.searchParams.has("limit") && u.searchParams.get("limit") !== String(pageSize))
    || (u.searchParams.has("starting_after") && !id(u.searchParams.get("starting_after")))) throw Error("invalid_collection_url");
  return u;
}
function expectedKind(op: ProvisioningOperation): ProvisioningFact["kind"] {
  return op === "read_product" ? "product" : op === "list_package_products" ? "attachment"
    : ["create_offering", "read_offering", "list_offerings"].includes(op) ? "offering" : "package";
}
function matchesProduct(f: ProductFact, t: ProvisioningTicket) {
  const p = t.plan;
  return f.id === p.providerProductId && f.storeIdentifier === p.storeIdentifier && f.appId === t.appId
    && f.state === p.qualifiedProductState && f.productType === p.qualifiedProductType && f.oneTimeConsumable === p.qualifiedOneTimeConsumable;
}
/** Parse raw authenticated transport bytes. This does not establish registration. */
export function parseProvisioningResponse(raw: Uint8Array, status: number, t: ProvisioningTicket, pageSize: number): ProvisioningObservation {
  const base: ProvisioningObservation = { kind: "invalid", resourceKind: null, items: [], nextCursor: null, complete: false, issue: null, httpStatus: status };
  try {
    if (!(raw instanceof Uint8Array) || raw.length > 1024 * 1024 || !integer(status, 100, 599) || !integer(pageSize, 1, 100)) throw Error("parser_bound");
    const parsed = parseJson(raw);
    const success = ["create_offering", "create_package"].includes(t.operation) ? 201 : 200;
    if (status !== success) {
      if (!object(parsed) || !text(parsed.type) || !text(parsed.message, 4096)
        || (parsed.retryable !== undefined && typeof parsed.retryable !== "boolean")) throw Error("invalid_error_response");
      return { ...base, kind: "provider_error", issue: `provider_http_${status}` };
    }
    const kind = expectedKind(t.operation);
    if (lists.includes(t.operation)) {
      if (!object(parsed) || parsed.object !== "list" || !Array.isArray(parsed.items) || parsed.items.length > pageSize) throw Error("invalid_list");
      const path = request(t, pageSize).pathAndQuery.split("?")[0];
      const current = collectionUrl(parsed.url, path, pageSize);
      if (current.searchParams.get("starting_after") !== t.cursor) throw Error("page_cursor_mismatch");
      const items = parsed.items.map(v => fact(v, kind));
      if (items.some(item => item.kind === "offering" && item.projectId !== t.projectId)) throw Error("project_mismatch");
      if (new Set(items.map(factId)).size !== items.length) throw Error("duplicate_resource_identity");
      let nextCursor: string | null = null;
      if (Object.hasOwn(parsed, "next_page")) {
        const next = collectionUrl(parsed.next_page, path, pageSize);
        nextCursor = next.searchParams.get("starting_after");
        if (!nextCursor || items.length === 0 || nextCursor !== factId(items[items.length - 1]) || nextCursor === t.cursor) throw Error("invalid_next_cursor");
      }
      return { ...base, kind: "list", resourceKind: kind, items, nextCursor, complete: nextCursor === null };
    }
    const item = fact(parsed, kind), p = t.plan;
    if (item.kind === "offering" && (item.projectId !== t.projectId || item.lookupKey !== p.offeringLookupKey || item.displayName !== p.offeringDisplayName
      || (p.providerOfferingId !== null && item.id !== p.providerOfferingId))) throw Error("offering_mismatch");
    if (item.kind === "package" && (item.lookupKey !== p.packageLookupKey || item.displayName !== p.packageDisplayName
      || (p.providerPackageId !== null && item.id !== p.providerPackageId))) throw Error("package_mismatch");
    if (item.kind === "product" && !matchesProduct(item, t)) throw Error("product_mismatch");
    return { ...base, kind: "resource", resourceKind: kind, items: [item], complete: true };
  } catch (e) {
    const issue = e instanceof Error && /^[a-z_]+$/u.test(e.message) ? e.message : "invalid_json";
    return { ...base, issue };
  }
}
async function bounded<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("deadline")), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
const keptHeaders = ["content-type", "content-length", "retry-after", "revenuecat-rate-limit-current-usage", "revenuecat-rate-limit-current-limit"];
type Captured = { raw: Uint8Array; status: number | null; headers: Record<string, string>; transportOutcome: ProvisioningEvidence["transportOutcome"] };
async function transport(url: string, init: RequestInit, fetcher: ProvisioningDependencies["fetch"], c: ProvisioningConfig): Promise<Captured> {
  const controller = new AbortController();
  let timedOut = false, reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let status: number | null = null, headers: Record<string, string> = {}, total = 0;
  const chunks: Uint8Array[] = [];
  const collected = () => { const raw = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.length; } return raw; };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { timedOut = true; controller.abort(); reject(Error("deadline")); }, c.limits.timeoutMs); });
  try {
    const response = await Promise.race([fetcher(url, { ...init, redirect: "error", signal: controller.signal }), deadline]);
    status = response.status;
    headers = Object.fromEntries(keptHeaders.flatMap(k => response.headers.has(k) ? [[k, response.headers.get(k)!]] : []));
    if (response.redirected || (response.url !== "" && response.url !== url)) throw Error("response_origin_mismatch");
    if (Object.values(headers).some(v => v.length > 4096)) throw Error("invalid_headers");
    if (!response.body) return { raw: collected(), status, headers, transportOutcome: "complete" };
    reader = response.body.getReader();
    for (;;) {
      const part = await Promise.race([reader.read(), deadline]); if (part.done) break;
      if (!(part.value instanceof Uint8Array)) throw Error("invalid_chunk");
      const remaining = c.limits.maxResponseBytes - total;
      if (part.value.length > remaining) {
        if (remaining > 0) { chunks.push(part.value.slice(0, remaining)); total += remaining; }
        controller.abort(); return { raw: collected(), status, headers, transportOutcome: "body_too_large" };
      }
      chunks.push(part.value.slice()); total += part.value.length;
    }
    return { raw: collected(), status, headers, transportOutcome: "complete" };
  } catch {
    return { raw: collected(), status, headers, transportOutcome: timedOut ? "timeout" : status === null ? "connection_error" : "body_incomplete" };
  } finally {
    clearTimeout(timer); controller.abort();
    if (reader) { void reader.cancel().catch(() => {}); try { reader.releaseLock(); } catch { /* pending read will settle after abort */ } }
  }
}
type EvidenceMetadata = Omit<ProvisioningEvidence, "encryption">;
const aad = (metadata: EvidenceMetadata, observation: ProvisioningObservation, keyId: string) => encoder.encode(canonical({ metadata, observation, keyId }));
async function encryptEvidence(metadata: EvidenceMetadata, raw: Uint8Array, observation: ProvisioningObservation, c: ProvisioningConfig): Promise<ProvisioningEvidence> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", new Uint8Array(c.encryption.key), "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: aad(metadata, observation, c.encryption.keyId) }, key, new Uint8Array(raw)));
  return { ...metadata, encryption: { algorithm: "AES-256-GCM", keyId: c.encryption.keyId, nonce: base64(nonce), ciphertext: base64(ciphertext) } };
}
function transportObservation(captured: Captured, ticket: ProvisioningTicket, pageSize: number): ProvisioningObservation {
  return captured.transportOutcome === "complete" && captured.status !== null
    ? parseProvisioningResponse(captured.raw, captured.status, ticket, pageSize)
    : { kind: "transport", resourceKind: null, items: [], nextCursor: null, complete: false, issue: captured.transportOutcome, httpStatus: captured.status };
}
/** Trusted worker-only replay. Decryption plus reparse binds exact response bytes
 * to a consumed ticket; its result still does not grant registration authority. */
export async function decryptProvisioningEvidence(evidence: ProvisioningEvidence, observation: ProvisioningObservation,
  ticket: ProvisioningTicket, configuration: ProvisioningConfig): Promise<Uint8Array> {
  const c = snapshotConfig(configuration, false), { encryption, ...metadata } = evidence;
  checkedTicket(ticket, selector({ planId: ticket.planId, operation: ticket.operation, requestId: ticket.requestId, cursor: ticket.cursor }), c, Date.parse(ticket.validUntil) - 1);
  const req = request(ticket, c.limits.pageSize);
  if (evidence.protocol !== EVIDENCE_PROTOCOL || evidence.ticketId !== ticket.ticketId || evidence.requestId !== ticket.requestId
    || evidence.planId !== ticket.planId || evidence.connectionId !== c.connectionId || evidence.connectionRevision !== c.connectionRevision
    || evidence.providerConfigurationDigest !== c.providerConfigurationDigest || evidence.credentialVersion !== c.credentialVersion
    || evidence.operation !== ticket.operation || evidence.method !== req.method || evidence.pathAndQuery !== req.pathAndQuery
    || evidence.requestSha256 !== await hashJson(req) || !digest(evidence.rawSha256)
    || !integer(evidence.rawByteLength, 0, c.limits.maxResponseBytes) || !iso(evidence.startedAt) || !iso(evidence.endedAt)
    || Date.parse(evidence.startedAt) >= Date.parse(ticket.validUntil) || Date.parse(evidence.endedAt) < Date.parse(evidence.startedAt)
    || encryption.algorithm !== "AES-256-GCM" || encryption.keyId !== c.encryption.keyId) throw Error("stored_evidence_mismatch");
  try {
    const nonce = unbase64(encryption.nonce); if (nonce.length !== 12) throw Error("nonce");
    const key = await crypto.subtle.importKey("raw", new Uint8Array(c.encryption.key), "AES-GCM", false, ["decrypt"]);
    const raw = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, additionalData: aad(metadata, observation, c.encryption.keyId) }, key, unbase64(encryption.ciphertext)));
    if (raw.length !== evidence.rawByteLength || await sha(raw) !== evidence.rawSha256
      || canonical(transportObservation({ raw, status: evidence.httpStatus, headers: evidence.responseHeaders, transportOutcome: evidence.transportOutcome }, ticket, c.limits.pageSize)) !== canonical(observation)) throw Error("raw");
    return raw;
  } catch { throw Error("stored_evidence_mismatch"); }
}

/** Every invocation first asks SQL for a newly consumed capability. No provider
 * request is retried, including after timeout or a lost storage acknowledgement. */
export async function runProvisioningStep(input: ProvisioningSelector, configuration: ProvisioningConfig | null,
  dependencies: ProvisioningDependencies): Promise<ProvisioningResult> {
  let c: ProvisioningConfig, s: ProvisioningSelector;
  try { c = snapshotConfig(configuration); s = selector(input); } catch { return outcome("unavailable", "configuration_or_selector_unavailable"); }
  const claim = dependencies.claim, record = dependencies.record, fetcher = dependencies.fetch, now = dependencies.now ?? Date.now;
  let ticket: ProvisioningTicket;
  try {
    const claimed = await bounded(claim({ ...s }), c.limits.timeoutMs);
    if (!object(claimed) || !exactKeys(claimed, ["status", "ticket"]) || claimed.status !== "send_permit_consumed") return outcome("unavailable", "no_send_permit");
    const clock = now(); if (!integer(clock, 0, 8640000000000000)) throw Error("clock");
    ticket = checkedTicket(claimed.ticket, s, c, clock);
  } catch { return outcome("outcome_unknown", "claim_outcome_unknown"); }
  const req = request(ticket, c.limits.pageSize), requestSha256 = await hashJson(req);
  const started = now();
  if (!integer(started, 0, 8640000000000000) || started >= Date.parse(ticket.validUntil)) return outcome("outcome_unknown", "send_permit_expired", ticket.ticketId);
  const captured = await transport(ORIGIN + req.pathAndQuery, { method: req.method, headers: {
    authorization: `Bearer ${c.secret}`, accept: "application/json", ...(req.body === null ? {} : { "content-type": "application/json" }),
  }, ...(req.body === null ? {} : { body: req.body }) }, fetcher, c);
  try {
    const ended = now(); if (!integer(ended, started, 8640000000000000)) throw Error("clock");
    const observation = transportObservation(captured, ticket, c.limits.pageSize);
    const evidence = await encryptEvidence({ protocol: EVIDENCE_PROTOCOL, ticketId: ticket.ticketId, requestId: ticket.requestId,
      planId: ticket.planId, connectionId: ticket.connectionId, connectionRevision: ticket.connectionRevision,
      providerConfigurationDigest: ticket.providerConfigurationDigest, credentialVersion: ticket.credentialVersion,
      operation: ticket.operation, method: req.method, pathAndQuery: req.pathAndQuery, requestSha256,
      startedAt: new Date(started).toISOString(), endedAt: new Date(ended).toISOString(), httpStatus: captured.status,
      responseHeaders: captured.headers, transportOutcome: captured.transportOutcome,
      rawSha256: await sha(captured.raw), rawByteLength: captured.raw.length }, captured.raw, observation, c);
    const evidenceSha256 = await hashJson(evidence);
    const acknowledgement = await bounded(record({ ticketId: ticket.ticketId, connectionId: ticket.connectionId,
      connectionRevision: ticket.connectionRevision, evidence: structuredClone(evidence), observation: structuredClone(observation) }), c.limits.timeoutMs);
    if (!object(acknowledgement) || !exactKeys(acknowledgement, ["status", "ticketId", "evidenceSha256", "ackAllowed"])
      || acknowledgement.status !== "recorded" || acknowledgement.ticketId !== ticket.ticketId || acknowledgement.evidenceSha256 !== evidenceSha256
      || acknowledgement.ackAllowed !== true) throw Error("storage");
    return outcome("recorded", "transport_evidence_recorded", ticket.ticketId, evidenceSha256, observation);
  } catch { return outcome("outcome_unknown", "evidence_outcome_unknown", ticket.ticketId); }
}

/** Bounded read-only reconciliation. Each page obtains its own budgeted SQL
 * ticket. A candidate is only evidence for SQL, never registration authority. */
export async function reconcileProvisioningPages(input: Omit<ProvisioningSelector, "requestId" | "cursor">,
  configuration: ProvisioningConfig | null, dependencies: ProvisioningDependencies,
  requestId: () => string = () => crypto.randomUUID()): Promise<{ status: "observed" | "unknown" | "held"; reason: string; candidateId: string | null; pages: number; retryProviderMutation: false }> {
  const result = (status: "observed" | "unknown" | "held", reason: string, pages: number, candidateId: string | null = null) => ({ status, reason, candidateId, pages, retryProviderMutation: false as const });
  let c: ProvisioningConfig; try { c = snapshotConfig(configuration); } catch { return result("unknown", "configuration_unavailable", 0); }
  if (!object(input) || !exactKeys(input, ["planId", "operation"]) || !uuid(input.planId)
    || typeof input.operation !== "string" || !lists.includes(input.operation)) return result("held", "not_a_collection_read", 0);
  const selected = { planId: input.planId, operation: input.operation };
  const seen = new Set<string>(), cursors = new Set<string>(), candidates = new Set<string>();
  let cursor: string | null = null, count = 0;
  // Capture the exact trusted plan returned for each page, and require it to
  // remain unchanged while the read sequence is in progress.
  let immutablePlan: string | null = null;
  const claim = dependencies.claim;
  let pageTicket: ProvisioningTicket | null = null;
  const wrapped: ProvisioningDependencies = { ...dependencies, claim: async s => {
    const response = await claim(s);
    if (object(response) && response.status === "send_permit_consumed" && object(response.ticket)) {
      pageTicket = structuredClone(response.ticket) as ProvisioningTicket;
      const binding = canonical({ planId: pageTicket.planId, operation: pageTicket.operation, plan: pageTicket.plan, projectId: pageTicket.projectId, appId: pageTicket.appId, connectionId: pageTicket.connectionId,
        connectionRevision: pageTicket.connectionRevision, providerConfigurationDigest: pageTicket.providerConfigurationDigest });
      if (immutablePlan !== null && immutablePlan !== binding) throw Error("plan_changed");
      immutablePlan = binding;
    }
    return response;
  } };
  for (let page = 0; page < c.limits.maxPages; page++) {
    pageTicket = null;
    const step = await runProvisioningStep({ ...selected, requestId: requestId(), cursor }, c, wrapped);
    const observation = step.observation, ticket = pageTicket as ProvisioningTicket | null;
    if (step.status !== "recorded" || !observation || !ticket) return result("unknown", "page_outcome_unknown", page + 1);
    if (observation.kind !== "list") return result("held", "invalid_page", page + 1);
    for (const item of observation.items) {
      const resourceId = factId(item);
      if (seen.has(resourceId)) return result("held", "repeated_resource", page + 1);
      seen.add(resourceId); if (++count > c.limits.maxItems) return result("unknown", "item_budget_exhausted", page + 1);
      if (item.kind === "offering" && item.lookupKey === ticket.plan.offeringLookupKey) {
        if (item.projectId !== ticket.projectId || item.displayName !== ticket.plan.offeringDisplayName) return result("held", "candidate_mismatch", page + 1);
        candidates.add(item.id);
      } else if (item.kind === "package" && item.lookupKey === ticket.plan.packageLookupKey) {
        if (item.displayName !== ticket.plan.packageDisplayName) return result("held", "candidate_mismatch", page + 1);
        candidates.add(item.id);
      } else if (item.kind === "attachment") {
        if (!matchesProduct(item.product, ticket) || item.eligibilityCriteria !== "all") return result("held", "attachment_mismatch", page + 1);
        candidates.add(item.product.id);
      }
      if (candidates.size > 1) return result("held", "ambiguous_candidates", page + 1);
    }
    if (observation.complete) return candidates.size === 1 ? result("observed", "candidate_requires_sql_readback", page + 1, [...candidates][0])
      : result("unknown", "no_candidate_is_not_absence_proof", page + 1);
    if (!observation.nextCursor || cursors.has(observation.nextCursor)) return result("held", "cursor_cycle", page + 1);
    cursors.add(observation.nextCursor); cursor = observation.nextCursor;
  }
  return result("unknown", "page_budget_exhausted", c.limits.maxPages);
}

export type ProvisioningWorkerDependencies = ProvisioningDependencies & {
  next: (planId: string) => Promise<unknown>;
};
const workerResponse = (status: number, state: string, steps = 0) => new Response(JSON.stringify({
  protocol: "isolated-test-store-v3-provision-worker", status: state, steps,
  retryProviderMutation: false, grantsAccess: false,
}), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
async function workerBody(req: Request): Promise<unknown> {
  if (!req.body || (req.headers.has("content-encoding") && req.headers.get("content-encoding") !== "identity")) throw Error("invalid_body");
  const reader = req.body.getReader(); let size = 0; const parts: Uint8Array[] = [];
  try {
    return await bounded((async () => {
      for (;;) { const part = await reader.read(); if (part.done) break;
        size += part.value.length; if (size > 2048) throw Error("body_limit"); parts.push(part.value.slice()); }
      const bytes = new Uint8Array(size); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; }
      return parseJson(bytes);
    })(), 5000);
  } finally { void reader.cancel().catch(() => {}); try { reader.releaseLock(); } catch { /* pending body read is cancelled */ } }
}
/** Internal service-only worker. A caller supplies only a plan ID; SQL chooses
 * each operation. Default-off, eight requests at most, no unknown-outcome retry.
 */
export function createProvisioningWorker(configuration: () => ProvisioningConfig | null,
  serviceCredential: () => string | null, dependencies: ProvisioningWorkerDependencies) {
  const next = dependencies.next;
  return async (req: Request): Promise<Response> => {
    let c: ProvisioningConfig;
    try { c = snapshotConfig(configuration()); } catch { return workerResponse(503, "unavailable"); }
    if (req.method !== "POST") return workerResponse(405, "method_not_allowed");
    const key = serviceCredential(), authorization = req.headers.get("authorization") ?? "";
    if (typeof key !== "string" || key.length < 32 || key.length > 4096 || /[\r\n]/u.test(key)) return workerResponse(503, "unavailable");
    if (authorization.length > 8192) return workerResponse(401, "unauthorized");
    const actual = encoder.encode(authorization), expected = encoder.encode(`Bearer ${key}`);
    let different = actual.length ^ expected.length;
    for (let i = 0; i < Math.max(actual.length, expected.length); i++) different |= (actual[i] ?? 0) ^ (expected[i] ?? 0);
    if (different !== 0) return workerResponse(401, "unauthorized");
    let planId: string;
    try {
      const body = await workerBody(req);
      if (!object(body) || !exactKeys(body, ["protocol", "planId"]) || body.protocol !== "isolated-test-store-v3-provision-worker" || !uuid(body.planId)) throw Error("body");
      planId = body.planId;
    } catch { return workerResponse(400, "invalid_body"); }
    let steps = 0;
    const started = performance.now();
    for (;;) {
      // Reserve 5s for next and 15s for one claim/transport/record. Never start
      // another step after the remaining invocation budget becomes uncertain.
      if (performance.now() - started > 10000) return workerResponse(202, "waiting", steps);
      let selected: unknown;
      try { selected = await bounded(next(planId), 5000); } catch { return workerResponse(503, "outcome_unknown", steps); }
      if (!object(selected) || typeof selected.status !== "string") return workerResponse(503, "outcome_unknown", steps);
      if (["registered", "held", "waiting", "unavailable"].includes(selected.status)) {
        if (!exactKeys(selected, ["status"])) return workerResponse(503, "outcome_unknown", steps);
        return workerResponse(selected.status === "waiting" ? 202 : selected.status === "unavailable" ? 503 : 200, selected.status, steps);
      }
      if (steps >= 8) return workerResponse(202, "waiting", steps);
      let s: ProvisioningSelector;
      try {
        if (selected.status !== "step" || !exactKeys(selected, ["status", "selector"])) throw Error("selector");
        s = selector(selected.selector); if (s.planId !== planId) throw Error("plan");
      } catch { return workerResponse(503, "outcome_unknown", steps); }
      const result = await runProvisioningStep(s, c, dependencies); steps++;
      if (result.status !== "recorded") return workerResponse(result.status === "unavailable" ? 202 : 503, result.status === "unavailable" ? "waiting" : "outcome_unknown", steps);
      if (result.observation?.kind !== "resource" && result.observation?.kind !== "list") return workerResponse(503, "outcome_unknown", steps);
    }
  };
}
