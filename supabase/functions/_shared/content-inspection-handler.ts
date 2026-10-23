import {
  deliverInspectionOriginal,
  InspectionMediaError,
  inspectionMediaKind,
  type InspectionOriginal,
  inspectionResponseHeaders,
} from "./content-inspection-media.ts";

type RpcResult = {
  data: unknown;
  error: { message?: string; code?: string } | null;
};
type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<RpcResult>;
export type InspectionActor = {
  userId: string;
  sessionGeneration: string;
  rpc: Rpc;
};
export type InspectionDependencies = {
  // Trusted server configuration, never request/forwarded host headers.
  supabaseUrl: string;
  authenticate: (request: Request) => Promise<InspectionActor | null>;
  resolve: Rpc;
  origin: (
    binding: InspectionOriginal,
    method: "GET" | "HEAD",
    headers: Record<string, string>,
    signal: AbortSignal,
  ) => Promise<Response>;
};

const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
const version = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{32,64}$/.test(value);
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
const json = (status: number, body: Record<string, unknown>) => {
  const headers = inspectionResponseHeaders();
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
};
function publicInspectionEndpoint(supabaseUrl: string): URL {
  const base = new URL(supabaseUrl);
  // Require a canonical HTTPS origin (with at most its root slash). Reject
  // credentials, paths, query, fragments and URL-parser normalization rather
  // than silently incorporating or stripping unsafe configuration.
  if (
    base.protocol !== "https:" ||
    (supabaseUrl !== base.origin && supabaseUrl !== `${base.origin}/`)
  ) {
    throw new InspectionMediaError(503, "content_inspection_unavailable");
  }
  return new URL("/functions/v1/admin-content-inspection", base);
}
async function rpc(client: Rpc, name: string, args: Record<string, unknown>) {
  const result = await client(name, args);
  if (result.error) {
    const message = result.error.message ?? "";
    if (message.includes("content_inspection_disabled")) {
      throw new InspectionMediaError(503, "content_inspection_disabled");
    }
    if (message.includes("stale_version")) {
      throw new InspectionMediaError(409, "stale_version");
    }
    if (result.error.code === "42501") {
      throw new InspectionMediaError(403, "content_inspection_denied");
    }
    // Missing migrations/RPCs and audit failures are unavailable, never allow.
    throw new InspectionMediaError(503, "content_inspection_unavailable");
  }
  return object(result.data);
}

async function readPayload(request: Request) {
  if (!request.body) throw new InspectionMediaError(400, "invalid_request");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 8192) throw new InspectionMediaError(413, "invalid_request");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return object(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new InspectionMediaError(400, "invalid_request");
  }
}

export function createContentInspectionHandler(
  dependencies: InspectionDependencies,
) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: inspectionResponseHeaders(),
      });
    }
    try {
      if (!["GET", "POST"].includes(request.method)) {
        return json(405, { error: "method_not_allowed" });
      }
      const url = new URL(request.url);
      // Version is a noncredential cache discriminator. No access/session or
      // receipt token is ever accepted in the URL or returned as an origin URL.
      if (
        [...url.searchParams.keys()].some((key) => key !== "v") ||
        url.searchParams.getAll("v").length > 1
      ) {
        throw new InspectionMediaError(400, "invalid_request");
      }
      const actor = await dependencies.authenticate(request);
      if (!actor || !uuid(actor.userId) || !uuid(actor.sessionGeneration)) {
        throw new InspectionMediaError(401, "invalid_auth");
      }
      if (request.method === "POST") {
        const payload = await readPayload(request);
        if (
          Object.keys(payload).some((key) =>
            ![
              "action",
              "contextId",
              "targetType",
              "targetId",
              "reason",
              "requestId",
            ].includes(key)
          ) ||
          payload.action !== "prepare_media" || !uuid(payload.contextId) ||
          !uuid(payload.targetId) || !uuid(payload.requestId) ||
          !["creator_video", "social_attachment"].includes(
            String(payload.targetType),
          ) ||
          typeof payload.reason !== "string" ||
          payload.reason.trim().length < 6 || payload.reason.trim().length > 500
        ) {
          throw new InspectionMediaError(400, "invalid_request");
        }
        // Gateways may rewrite request.url to an internal origin/path. The
        // client only accepts the configured public function endpoint.
        const streamUrl = publicInspectionEndpoint(dependencies.supabaseUrl);
        const prepared = await rpc(
          actor.rpc,
          "admin_prepare_content_inspection_media",
          {
            p_context_id: payload.contextId,
            p_target_type: payload.targetType,
            p_target_id: payload.targetId,
            p_reason: payload.reason,
            p_request_id: payload.requestId,
          },
        );
        if (prepared.availability !== "ready") {
          const allowed = [
            "unsupported_media_inspection",
            "unavailable_original",
            "unsupported_format",
            "quarantined_unrenderable",
          ];
          const availability = allowed.includes(String(prepared.availability))
            ? prepared.availability
            : "unavailable_original";
          return json(200, { availability });
        }
        const mime = String(prepared.mimeType ?? "");
        if (
          !uuid(prepared.receiptId) || !version(prepared.storedVersion) ||
          !inspectionMediaKind(mime) ||
          !Number.isSafeInteger(prepared.sizeBytes) ||
          Number(prepared.sizeBytes) <= 0 ||
          !Number.isFinite(Date.parse(String(prepared.expiresAt))) ||
          Date.parse(String(prepared.expiresAt)) <= Date.now()
        ) {
          throw new InspectionMediaError(503, "content_inspection_unavailable");
        }
        streamUrl.searchParams.set("v", prepared.storedVersion);
        return json(200, {
          availability: "ready",
          receiptId: prepared.receiptId,
          storedVersion: prepared.storedVersion,
          mediaKind: inspectionMediaKind(mime),
          mimeType: mime,
          sizeBytes: prepared.sizeBytes,
          expiresAt: prepared.expiresAt,
          streamUrl: streamUrl.toString(),
        });
      }
      const receipt = request.headers.get("X-Inspection-Receipt");
      const expectedVersion = url.searchParams.get("v");
      if (!uuid(receipt) || !version(expectedVersion)) {
        throw new InspectionMediaError(400, "invalid_request");
      }
      const authorize = async () => {
        const authorization = await rpc(
          actor.rpc,
          "admin_authorize_content_inspection_media",
          {
            p_receipt_id: receipt,
            p_request_id: crypto.randomUUID(),
            p_expected_version: expectedVersion,
          },
        );
        if (
          authorization.allowed !== true ||
          !uuid(authorization.authorizationId) ||
          authorization.receiptId !== receipt ||
          authorization.storedVersion !== expectedVersion
        ) {
          throw new InspectionMediaError(403, "content_inspection_denied");
        }
        return authorization;
      };
      const authorization = await authorize();
      const resolved = await rpc(
        dependencies.resolve,
        "admin_resolve_content_inspection_media",
        {
          p_authorization_id: authorization.authorizationId,
          p_actor_id: actor.userId,
          p_session_generation: actor.sessionGeneration,
        },
      );
      if (
        resolved.storedVersion !== expectedVersion ||
        !["s3", "cloudflare_r2"].includes(String(resolved.provider)) ||
        typeof resolved.bucket !== "string" ||
        typeof resolved.objectKey !== "string" ||
        typeof resolved.mimeType !== "string" ||
        !inspectionMediaKind(resolved.mimeType) ||
        !Number.isSafeInteger(resolved.sizeBytes) ||
        Number(resolved.sizeBytes) <= 0
      ) {
        throw new InspectionMediaError(409, "unavailable_original");
      }
      const checkRetirement = async (): Promise<string | undefined> => {
        const fence = await rpc(
          dependencies.resolve,
          "check_deleted_media_retirement",
          {
            p_provider: resolved.provider,
            p_bucket: resolved.bucket,
            p_object_key: resolved.objectKey,
            p_purpose: "inspection",
          },
        );
        if (fence.allowed !== true) {
          throw new InspectionMediaError(403, "media_retired_or_expired");
        }
        if (fence.expiresAt === undefined) return undefined;
        if (
          typeof fence.expiresAt !== "string" ||
          !Number.isFinite(Date.parse(fence.expiresAt)) ||
          Date.parse(fence.expiresAt) <= Date.now()
        ) {
          throw new InspectionMediaError(403, "media_retired_or_expired");
        }
        return fence.expiresAt;
      };
      return await deliverInspectionOriginal({
        original: resolved as InspectionOriginal,
        range: request.headers.get("Range"),
        signal: request.signal,
        origin: async (binding, method, headers, signal) => {
          // Recheck each HEAD/probe/range fetch, not just receipt preparation.
          const originReadExpiresAt = await checkRetirement();
          return dependencies.origin(
            { ...binding, originReadExpiresAt },
            method,
            headers,
            signal,
          );
        },
        finalize: async () => {
          // The retirement RPC may wait on a database lock. Actor/source
          // authority must be checked after that wait, immediately before bytes.
          await checkRetirement();
          await authorize();
        },
      });
    } catch (error) {
      return error instanceof InspectionMediaError
        ? json(error.status, { error: error.code })
        : json(503, { error: "content_inspection_unavailable" });
    }
  };
}
