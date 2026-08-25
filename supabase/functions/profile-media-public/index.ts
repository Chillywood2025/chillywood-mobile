import { createClient } from "npm:@supabase/supabase-js@2";
import {
  isSafeProfileMediaObjectKey,
  profileMediaDeliveryResolutionAllows,
} from "../_shared/profile-media-authority.ts";

const PROFILE_MEDIA_BUCKET = "profile-media";
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const toText = (value: unknown) => String(value ?? "").trim();
const deny = (status: number, error: string) => new Response(JSON.stringify({ error }), {
  status,
  headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

Deno.serve(async (request): Promise<Response> => {
  if (request.method === "OPTIONS") return new Response("ok", { status: 200, headers: CORS_HEADERS });
  if (request.method !== "GET") return deny(405, "method_not_allowed");

  try {
    const supabaseUrl = toText(Deno.env.get("SUPABASE_URL"));
    const anonKey = toText(Deno.env.get("SUPABASE_ANON_KEY"));
    const serviceRoleKey = toText(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return deny(503, "profile_media_unavailable");

    const requestUrl = new URL(request.url);
    const ownerUserId = toText(requestUrl.searchParams.get("ownerUserId"));
    const objectKey = toText(requestUrl.searchParams.get("objectKey"));
    if (!isSafeProfileMediaObjectKey(ownerUserId, objectKey)) return deny(400, "invalid_object_key");

    const authorization = toText(request.headers.get("Authorization"));
    const viewerClient = createClient(supabaseUrl, anonKey, {
      global: authorization ? { headers: { Authorization: authorization } } : undefined,
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: deliveryResolution, error: profileError } = await viewerClient.rpc("resolve_profile_media_delivery", {
      p_object_key: objectKey,
      p_owner_user_id: ownerUserId,
    });
    if (profileError || !profileMediaDeliveryResolutionAllows({
      value: deliveryResolution,
      ownerUserId,
      objectKey,
    })) {
      return deny(404, "profile_media_not_found");
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: objectBlob, error: downloadError } = await adminClient.storage
      .from(PROFILE_MEDIA_BUCKET)
      .download(objectKey);
    if (downloadError || !objectBlob) return deny(404, "profile_media_not_found");

    const contentType = toText(objectBlob.type).toLowerCase().split(";", 1)[0]?.trim();
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) return deny(415, "profile_media_type_blocked");
    const body = await objectBlob.arrayBuffer();
    if (!body.byteLength) return deny(404, "profile_media_not_found");

    return new Response(body, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": contentType,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("profile-media-public failure", error instanceof Error ? error.message : "unknown_error");
    return deny(500, "profile_media_unavailable");
  }
});
