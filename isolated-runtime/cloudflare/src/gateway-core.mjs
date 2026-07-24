import { validateEnvelope } from "./contracts.mjs";
import { PRINCIPAL_BY_ID, RUNTIME_MANIFEST } from "./manifest.mjs";

const JSON_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "content-type": "application/json",
});
const MAX_GATEWAY_BODY_BYTES = 131_072;

const json = (status, body) =>
  new Response(JSON.stringify(body), { headers: JSON_HEADERS, status });

const readBoundedJson = async (request) => {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^[0-9]+$/u.test(declaredLength) ||
      Number(declaredLength) > MAX_GATEWAY_BODY_BYTES)
  ) {
    throw new Error("request_body_too_large");
  }
  if (!request.body) throw new Error("request_body_invalid");

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_GATEWAY_BODY_BYTES) {
        await reader.cancel();
        throw new Error("request_body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("request_body_invalid");
  }
};

export const createGatewayHandler = ({
  now = () => Date.now(),
  verifyAccess,
}) =>
  async (request, env) => {
    if (request.method !== "POST") {
      return json(405, { error: "method_not_allowed" });
    }
    if (RUNTIME_MANIFEST.gateway.databaseBindings.length !== 0) {
      return json(503, { error: "gateway_credential_domain_invalid" });
    }
    const access = await verifyAccess(request, env);
    if (!access) return json(401, { error: "access_service_auth_required" });
    const invocationToken =
      request.headers.get("x-cognitive-principal-invocation")?.trim() ?? "";
    if (
      new TextEncoder().encode(invocationToken).byteLength < 32 ||
      new TextEncoder().encode(invocationToken).byteLength > 512
    ) {
      return json(401, { error: "principal_invocation_required" });
    }
    let body;
    try {
      body = await readBoundedJson(request);
    } catch (error) {
      return error instanceof Error &&
          error.message === "request_body_too_large"
        ? json(413, { error: "request_body_too_large" })
        : json(400, { error: "request_body_invalid" });
    }
    const validation = await validateEnvelope(
      body,
      now(),
      60_000,
      (principal) => PRINCIPAL_BY_ID.get(principal),
    );
    if (!validation.ok) return json(400, { error: validation.error });
    const principal = PRINCIPAL_BY_ID.get(body.principal);
    const service = principal ? env[principal.binding] : null;
    if (!service || typeof service.invoke !== "function") {
      return json(503, { error: "principal_service_binding_missing" });
    }
    try {
      const result = await service.invoke(body, invocationToken);
      return json(200, result);
    } catch (error) {
      const category = error instanceof Error ? error.message : "";
      return json(
        ["invocation_rejected", "revocation_rejected"].includes(category)
          ? 401
          : 409,
        { error: category || "principal_operation_rejected" },
      );
    }
  };
