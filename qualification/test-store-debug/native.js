import { requireOptionalNativeModule } from "expo-modules-core";

const row = value => !!value && typeof value === "object" && !Array.isArray(value);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const fail = () => { throw new Error("qualification_native_unavailable"); };
const keys = (value, expected) => row(value) && Object.keys(value).sort().join(",") === [...expected].sort().join(",");
const native = requireOptionalNativeModule("ChillywoodQualification");
export function parseInspection(value) {
  if (!keys(value, ["protocol", "configurationDigest", "installationId", "providerAppUserId", "runId", "closed", "configured", "activeInvocationId", "scenarios", "records"])
    || value.protocol !== "test-store-qualification-native-v1" || !digest(value.configurationDigest) || !uuid(value.installationId)
    || value.providerAppUserId !== `scq_teststore_${value.installationId}` || !uuid(value.runId) || typeof value.closed !== "boolean"
    || typeof value.configured !== "boolean" || !(value.activeInvocationId === null || uuid(value.activeInvocationId))
    || !Array.isArray(value.scenarios) || value.scenarios.length < 1 || value.scenarios.length > 8 || !Array.isArray(value.records) || value.records.length > 32) return fail();
  const scenarios = new Map();
  for (const scenario of value.scenarios) {
    if (!keys(scenario, ["id", "label", "providerOfferingId", "offeringIdentifier", "providerPackageId", "packageIdentifier", "providerProductId", "productId", "amountMinor", "currency", "intendedAction"])
      || !uuid(scenario.id) || scenarios.has(scenario.id) || typeof scenario.label !== "string" || !scenario.label || scenario.label.length > 80
      || !["providerOfferingId", "offeringIdentifier", "providerPackageId", "packageIdentifier", "providerProductId", "productId"].every(key => typeof scenario[key] === "string" && /^[A-Za-z0-9_.$:-]{1,160}$/u.test(scenario[key]))
      || !Number.isSafeInteger(scenario.amountMinor) || scenario.amountMinor < 1 || scenario.amountMinor > 10_000 || scenario.currency !== "usd"
      || !["purchase", "cancel"].includes(scenario.intendedAction)) return fail();
    scenarios.set(scenario.id, scenario);
  }
  const seen = new Set();
  for (const record of value.records) {
    parseRecord(record, value); if (seen.has(record.invocationId)) return fail(); seen.add(record.invocationId);
  }
  if (value.activeInvocationId !== null && !seen.has(value.activeInvocationId)) return fail();
  return value;
}
export function parseRecord(record, inspection) {
  if (!keys(record, ["protocol", "invocationId", "scenarioId", "runId", "configurationDigest", "providerAppUserId", "offeringIdentifier", "packageIdentifier", "productId", "amountMinor", "currency", "state", "outcome", "createdAt", "completedAt"])
    || record.protocol !== "test-store-qualification-record-v1" || !uuid(record.invocationId) || record.runId !== inspection.runId
    || record.configurationDigest !== inspection.configurationDigest || record.providerAppUserId !== inspection.providerAppUserId
    || !["prepared", "invoking", "completed", "unknown"].includes(record.state) || typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt))) return fail();
  const scenario = inspection.scenarios.find(s => s.id === record.scenarioId);
  if (!scenario || !["offeringIdentifier", "packageIdentifier", "productId", "amountMinor", "currency"].every(key => scenario[key] === record[key])) return fail();
  if (record.state === "completed") {
    if (!["sdk_success", "sdk_cancelled", "sdk_unknown"].includes(record.outcome) || typeof record.completedAt !== "string" || !Number.isFinite(Date.parse(record.completedAt))) return fail();
  } else if (record.outcome !== null || record.completedAt !== null) return fail();
  return record;
}
export function captureQualification() {
  if (!native) return fail();
  let retired = false, identity = null; const handles = new Map();
  const current = () => { if (retired) return fail(); };
  const inspect = async () => {
    current(); const value = parseInspection(await native.inspect()); current();
    const next = JSON.stringify([value.configurationDigest, value.installationId, value.providerAppUserId, value.runId]);
    if (identity !== null && next !== identity) { retired = true; return fail(); } identity = next; return value;
  };
  return Object.freeze({ dispose() { retired = true; handles.clear(); }, inspect,
    async configure() { current(); await native.configure(); current(); return inspect(); },
    async prepare(scenarioId) {
      const before = await inspect(); current();
      if (before.closed || !before.configured || before.activeInvocationId !== null || !before.scenarios.some(s => s.id === scenarioId)) return fail();
      const result = await native.prepare(scenarioId); current();
      if (!keys(result, ["status", "handleId", "record"])) return fail();
      if (result.status === "package_unavailable" && result.handleId === null && result.record === null) return null;
      if (result.status !== "prepared" || !uuid(result.handleId)) return fail();
      const record = parseRecord(result.record, before); if (record.state !== "prepared" || record.scenarioId !== scenarioId) return fail();
      handles.set(record.invocationId, { handle: result.handleId, record, inspection: before }); return record;
    },
    async purchase(invocationId) {
      current(); const ticket = handles.get(invocationId); if (!ticket) return fail(); handles.delete(invocationId);
      const result = await native.purchase(ticket.handle); current();
      const record = parseRecord(result, ticket.inspection);
      if (record.invocationId !== ticket.record.invocationId || record.scenarioId !== ticket.record.scenarioId || record.state !== "completed") return fail();
      return record;
    },
    async seal() { current(); handles.clear(); await native.seal(); current(); return inspect(); },
  });
}
