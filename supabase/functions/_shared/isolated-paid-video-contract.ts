import schema from "../../../isolated-runtime/sandbox-commerce-v1/paid-video-contract-v1.json" with { type: "json" };
import { exact, row, uuid, type PaidVideoRow } from "./isolated-paid-video-boundary.ts";

// A closed evaluator for this checked-in schema only. Unknown schema keywords
// fail closed; no user schema, remote reference or generated code is accepted.
const keywords = new Set(["$schema", "title", "definitions", "$ref", "oneOf", "anyOf", "type", "const", "enum", "properties", "required", "additionalProperties", "items", "maxItems", "format", "pattern", "minLength", "maxLength", "minimum", "maximum"]);
const root = schema as unknown as PaidVideoRow;
function matches(rule: unknown, value: unknown): boolean {
  if (!row(rule) || Object.keys(rule).some(key => !keywords.has(key))) throw Error("paid_video_schema_invalid");
  if (rule.$ref) {
    if (typeof rule.$ref !== "string" || !/^#\/definitions\/[A-Za-z]+$/u.test(rule.$ref)) throw Error("paid_video_schema_invalid");
    return matches((root.definitions as PaidVideoRow)[rule.$ref.slice(14)], value);
  }
  if (Array.isArray(rule.oneOf) && rule.oneOf.filter(item => matches(item, value)).length !== 1) return false;
  if (Array.isArray(rule.anyOf) && !rule.anyOf.some(item => matches(item, value))) return false;
  if (Object.hasOwn(rule, "const") && rule.const !== value) return false;
  if (Array.isArray(rule.enum) && !rule.enum.includes(value)) return false;
  if (rule.type === "object") {
    if (!row(value)) return false;
    if (Array.isArray(rule.required) && rule.required.some(key => typeof key !== "string" || !Object.hasOwn(value, key))) return false;
    const properties = row(rule.properties) ? rule.properties : {};
    if (rule.additionalProperties === false && Object.keys(value).some(key => !Object.hasOwn(properties, key))) return false;
    if (Object.entries(properties).some(([key, child]) => Object.hasOwn(value, key) && !matches(child, value[key]))) return false;
  } else if (rule.type === "array") {
    if (!Array.isArray(value) || (typeof rule.maxItems === "number" && value.length > rule.maxItems)) return false;
    if (rule.items && value.some(item => !matches(rule.items, item))) return false;
  } else if (rule.type === "string") {
    if (typeof value !== "string" || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) return false;
    const length = [...value].length;
    if (typeof rule.minLength === "number" && length < rule.minLength || typeof rule.maxLength === "number" && length > rule.maxLength) return false;
    if (typeof rule.pattern === "string" && !new RegExp(rule.pattern, "u").test(value)) return false;
    if (rule.format === "uuid" && !uuid(value)) return false;
    if (rule.format === "date-time" && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/u.test(value) || !Number.isFinite(Date.parse(value)))) return false;
  } else if (rule.type === "integer") {
    if (!Number.isSafeInteger(value) || typeof value !== "number") return false;
    if (typeof rule.minimum === "number" && value < rule.minimum || typeof rule.maximum === "number" && value > rule.maximum) return false;
  } else if (rule.type === "boolean" && typeof value !== "boolean" || rule.type === "null" && value !== null) return false;
  else if (rule.type && !["integer", "boolean", "null"].includes(String(rule.type))) throw Error("paid_video_schema_invalid");
  return true;
}
export const validPaidVideoPrivateRequest = (value: unknown) => matches((root.definitions as PaidVideoRow).request, value);
export function validPaidVideoV2Result(value: unknown): value is PaidVideoRow {
  if (!exact(value, ["protocol", "command", "requestId", "status", "actor", "data", "configurationDigest", "capabilityExpiresAtMs"])
    || value.protocol !== "isolated-paid-video-v2" || typeof value.configurationDigest !== "string" || !/^[a-f0-9]{64}$/u.test(value.configurationDigest)
    || !Number.isSafeInteger(value.capabilityExpiresAtMs) || !row(value.data)) return false;
  const copy = structuredClone(value); delete copy.configurationDigest; delete copy.capabilityExpiresAtMs; copy.protocol = "isolated-paid-video-v1";
  const data = copy.data as PaidVideoRow;
  // Native authoring extends only this held publication reason. The frozen v1
  // schema still validates the complete actor/request/result envelope.
  if (copy.command === "offer.publish" && copy.status === "held" && data.reason === "native_catalog_unavailable") {
    if (value.configurationDigest !== "8e5c534276f2e9cc279cd5dbd629964c49124b6551d7829c3a29dbb6635f0dc0") return false;
    data.reason = "protocol3_catalog_unavailable";
  }
  for (const target of [data, data.upload, data.offer, ...(Array.isArray(data.uploads) ? data.uploads : [])]) {
    if (!row(target)) continue;
    for (const key of ["transferAvailable", "checkoutAvailable"]) if (Object.hasOwn(target, key)) {
      if (typeof target[key] !== "boolean") return false; target[key] = false;
    }
  }
  if (copy.command === "resource.read" && Object.hasOwn(data, "offer")) {
    if (!matches((root.definitions as PaidVideoRow).offer, data.offer)) return false;
    delete data.offer;
  }
  if (copy.command === "upload.recover" && row(data.recovery) && data.recovery.state === "recorded") {
    if (typeof data.recovery.originalConfigurationDigest !== "string" || !/^[a-f0-9]{64}$/u.test(data.recovery.originalConfigurationDigest)) return false;
    delete data.recovery.originalConfigurationDigest;
  }
  if (copy.command === "upload.read") {
    if (!Object.hasOwn(data, "transfer") || (data.transfer !== null && (!exact(data.transfer, ["requestId", "originalSessionId", "configurationDigest"])
      || !uuid(data.transfer.requestId) || !uuid(data.transfer.originalSessionId) || typeof data.transfer.configurationDigest !== "string"
      || !/^[a-f0-9]{64}$/u.test(data.transfer.configurationDigest)))) return false;
    delete data.transfer;
  }
  return matches(root, copy);
}
