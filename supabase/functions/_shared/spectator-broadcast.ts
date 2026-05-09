import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2";

export type AuthenticatedUser = {
  email: string | null;
  id: string;
};

export type SupabaseClientLike = ReturnType<typeof createClient>;

type AuthResult = { user: AuthenticatedUser } | { error: Response };
type JsonObject = Record<string, unknown>;

export type SpectatorBroadcastPayload = {
  broadcast_session_id?: unknown;
  broadcastSessionId?: unknown;
  create_d7d_test_session?: unknown;
  createD7dTestSession?: unknown;
  id?: unknown;
  max_broadcast_minutes?: unknown;
  maxBroadcastMinutes?: unknown;
  source_room_id?: unknown;
  sourceRoomId?: unknown;
  test_room_name?: unknown;
  testRoomName?: unknown;
};

export type BroadcastSessionRow = {
  access_type: string | null;
  ad_policy: string | null;
  broadcast_status: string | null;
  channel_user_id: string | null;
  cost_guard_status: string | null;
  created_at?: string | null;
  creator_event_id: string | null;
  egress_id: string | null;
  egress_provider: string | null;
  egress_status: string | null;
  hls_playback_url: string | null;
  host_user_id: string | null;
  id: string;
  is_publicly_watchable: boolean | null;
  is_spectator_playback_enabled: boolean | null;
  max_broadcast_minutes: number | null;
  metadata: Record<string, unknown> | null;
  playback_url_status: string | null;
  requires_premium: boolean | null;
  requires_ticket: boolean | null;
  rights_status: string | null;
  source_room_id: string | null;
  source_type: string | null;
  watch_party_room_id: string | null;
};

const JSON_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
} as const;

const FORBIDDEN_INPUT_KEY_FRAGMENTS = [
  "cdn",
  "egress",
  "hls",
  "livekit",
  "playback",
  "secret",
  "spectator_count",
  "token",
  "viewer_count",
];

export const jsonResponse = (status: number, payload: JsonObject) =>
  new Response(JSON.stringify(payload), {
    headers: JSON_HEADERS,
    status,
  });

export const optionsResponse = () => new Response("ok", { headers: JSON_HEADERS, status: 200 });

export const toText = (value: unknown) => String(value ?? "").trim();

export const sanitizeErrorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown spectator broadcast skeleton error.");

  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9._~+/=-]+/g, "[redacted-token]")
    .replace(/sk_(test|live)_[A-Za-z0-9_]+/gi, "sk_[redacted]")
    .replace(/whsec_[A-Za-z0-9_]+/gi, "whsec_[redacted]")
    .replace(/[A-Za-z0-9._~+/=-]{64,}/g, "[redacted]")
    .slice(0, 280);
};

export const parseJsonPayload = async <Payload extends object>(req: Request) => {
  const rawBody = await req.text();
  if (!rawBody.trim()) return { value: {} as Payload };

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: jsonResponse(400, { error: "invalid_body", message: "Request body must be a JSON object." }) };
    }

    return { value: parsed as Payload };
  } catch {
    return { error: jsonResponse(400, { error: "invalid_json", message: "Request body must be valid JSON." }) };
  }
};

export const readRequiredEnv = (key: string) => {
  const value = toText(Deno.env.get(key));
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

export const readOptionalEnv = (key: string) => toText(Deno.env.get(key)) || null;

const OUTPUT_SECRET_ALIASES = [
  { configKey: "bucket", preferredSecretName: "EGRESS_OUTPUT_BUCKET", fallbackSecretName: "S3_BUCKET" },
  { configKey: "endpoint", preferredSecretName: "EGRESS_OUTPUT_ENDPOINT", fallbackSecretName: "S3_ENDPOINT" },
  { configKey: "region", preferredSecretName: "EGRESS_OUTPUT_REGION", fallbackSecretName: "S3_REGION" },
  {
    configKey: "accessKeyId",
    preferredSecretName: "EGRESS_OUTPUT_ACCESS_KEY_ID",
    fallbackSecretName: "S3_ACCESS_KEY_ID",
  },
  {
    configKey: "secretAccessKey",
    preferredSecretName: "EGRESS_OUTPUT_SECRET_ACCESS_KEY",
    fallbackSecretName: "S3_SECRET_ACCESS_KEY",
  },
] as const;

const MAX_D7D_TEST_BROADCAST_MINUTES = 5;

const isTruthy = (value: unknown) => {
  const normalized = toText(value).toLowerCase();
  return value === true || normalized === "true" || normalized === "1" || normalized === "yes";
};

const toPositiveInteger = (value: unknown) => {
  const parsed = Number.parseInt(toText(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const resolveOutputSecretAlias = (alias: (typeof OUTPUT_SECRET_ALIASES)[number]) => {
  if (readOptionalEnv(alias.preferredSecretName)) {
    return {
      acceptedSecretNames: [alias.preferredSecretName, alias.fallbackSecretName],
      configured: true,
      configuredSecretName: alias.preferredSecretName,
      source: "egress_output" as const,
    };
  }

  if (readOptionalEnv(alias.fallbackSecretName)) {
    return {
      acceptedSecretNames: [alias.preferredSecretName, alias.fallbackSecretName],
      configured: true,
      configuredSecretName: alias.fallbackSecretName,
      source: "s3_alias" as const,
    };
  }

  return {
    acceptedSecretNames: [alias.preferredSecretName, alias.fallbackSecretName],
    configured: false,
    configuredSecretName: null,
    source: "missing" as const,
  };
};

export const readSpectatorBroadcastOutputConfigStatus = () => {
  const fields = Object.fromEntries(
    OUTPUT_SECRET_ALIASES.map((alias) => [alias.configKey, resolveOutputSecretAlias(alias)]),
  ) as Record<
    (typeof OUTPUT_SECRET_ALIASES)[number]["configKey"],
    ReturnType<typeof resolveOutputSecretAlias>
  >;
  const fieldStatuses = Object.entries(fields);
  const outputSecretsConfigured = fieldStatuses.every(([, field]) => field.configured);
  const configuredSecretNames = fieldStatuses
    .map(([, field]) => field.configuredSecretName)
    .filter((secretName): secretName is string => !!secretName);
  const fallbackSecretNamesUsed = fieldStatuses
    .filter(([, field]) => field.source === "s3_alias")
    .map(([, field]) => field.configuredSecretName)
    .filter((secretName): secretName is string => !!secretName);
  const missingAcceptedSecretGroups = fieldStatuses
    .filter(([, field]) => !field.configured)
    .map(([configKey, field]) => ({
      configKey,
      acceptedSecretNames: field.acceptedSecretNames,
    }));
  const publicHlsBaseUrlConfigured = !!readOptionalEnv("PUBLIC_HLS_BASE_URL");
  const distinctSources = new Set(fieldStatuses.map(([, field]) => field.source));
  const outputSecretSource = !outputSecretsConfigured
    ? "missing"
    : distinctSources.size === 1 && distinctSources.has("egress_output")
      ? "egress_output"
      : distinctSources.size === 1 && distinctSources.has("s3_alias")
        ? "s3_alias"
        : "mixed_alias";

  return {
    status: outputSecretsConfigured ? "output_config_names_present" : "output_config_names_missing",
    acceptedAliasPattern: "EGRESS_OUTPUT_* preferred; existing S3_* names accepted as D7D output aliases.",
    configuredSecretNames,
    egressOutputPreferredSecretNames: OUTPUT_SECRET_ALIASES.map((alias) => alias.preferredSecretName),
    fallbackSecretNamesUsed,
    fields,
    fullRoomTokenForSpectators: false,
    hlsEnabled: false,
    hlsPlaybackUrlGenerated: false,
    hlsUrlReturned: false,
    livekitApiCalled: false,
    missingAcceptedSecretGroups,
    outputSecretSource,
    outputSecretsConfigured,
    playbackEnabled: false,
    publicHlsBaseUrlConfigured,
    publicHlsBaseUrlReturned: false,
    publicHlsBaseUrlSecretName: publicHlsBaseUrlConfigured ? "PUBLIC_HLS_BASE_URL" : null,
    spectatorPlaybackEnabled: false,
  };
};

const resolveOutputSecretAliasValue = (alias: (typeof OUTPUT_SECRET_ALIASES)[number]) => {
  const preferredValue = readOptionalEnv(alias.preferredSecretName);
  if (preferredValue) {
    return {
      configuredSecretName: alias.preferredSecretName,
      source: "egress_output" as const,
      value: preferredValue,
    };
  }

  const fallbackValue = readOptionalEnv(alias.fallbackSecretName);
  if (fallbackValue) {
    return {
      configuredSecretName: alias.fallbackSecretName,
      source: "s3_alias" as const,
      value: fallbackValue,
    };
  }

  return {
    configuredSecretName: null,
    source: "missing" as const,
    value: null,
  };
};

const readSpectatorBroadcastOutputConfigValues = () => {
  const entries = OUTPUT_SECRET_ALIASES.map((alias) => [alias.configKey, resolveOutputSecretAliasValue(alias)] as const);
  const fields = Object.fromEntries(entries) as Record<
    (typeof OUTPUT_SECRET_ALIASES)[number]["configKey"],
    ReturnType<typeof resolveOutputSecretAliasValue>
  >;
  const missingFields = Object.entries(fields)
    .filter(([, field]) => !field.value)
    .map(([configKey]) => configKey);

  if (missingFields.length > 0) {
    return {
      configured: false as const,
      missingFields,
      values: null,
    };
  }

  return {
    configured: true as const,
    missingFields: [],
    values: {
      accessKeyId: fields.accessKeyId.value as string,
      bucket: fields.bucket.value as string,
      endpoint: fields.endpoint.value as string,
      region: fields.region.value as string,
      secretAccessKey: fields.secretAccessKey.value as string,
    },
  };
};

export const readD7DTestEgressReadiness = () => {
  const outputConfig = readSpectatorBroadcastOutputConfigStatus();
  const livekitUrlConfigured = !!readOptionalEnv("LIVEKIT_URL");
  const livekitApiKeyConfigured = !!readOptionalEnv("LIVEKIT_API_KEY");
  const livekitApiSecretConfigured = !!readOptionalEnv("LIVEKIT_API_SECRET");
  const testEgressEnabled = isTruthy(readOptionalEnv("D7D_TEST_EGRESS_ENABLED"));

  return {
    livekitApiKeyConfigured,
    livekitApiSecretConfigured,
    livekitUrlConfigured,
    outputConfig,
    readyForBackendTestCall: testEgressEnabled
      && livekitUrlConfigured
      && livekitApiKeyConfigured
      && livekitApiSecretConfigured
      && outputConfig.outputSecretsConfigured,
    testEgressEnabled,
    testEgressSecretName: "D7D_TEST_EGRESS_ENABLED",
  };
};

export const createAuthClient = () => {
  const supabaseUrl = readRequiredEnv("SUPABASE_URL");
  const supabaseAnonKey = readRequiredEnv("SUPABASE_ANON_KEY");

  return {
    supabaseAnonKey,
    supabaseUrl,
  };
};

export const createAdminClient = () => {
  const supabaseUrl = readRequiredEnv("SUPABASE_URL");
  const serviceRoleKey = readOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    return {
      configured: false as const,
      message: "Supabase service role secret is not configured for spectator broadcast skeleton writes.",
      reason: "service_role_missing",
    };
  }

  return {
    client: createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }),
    configured: true as const,
  };
};

export const authenticateRequest = async (
  req: Request,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<AuthResult> => {
  const authorization = toText(req.headers.get("Authorization"));
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return { error: jsonResponse(401, { error: "missing_authorization", message: "Bearer authorization is required." }) };
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });

  const { data, error } = await authClient.auth.getUser();
  const userId = toText(data.user?.id);
  if (error || !userId) {
    return { error: jsonResponse(401, { error: "invalid_session", message: "Supabase could not verify the current user session." }) };
  }

  return {
    user: {
      email: data.user?.email ?? null,
      id: userId,
    },
  };
};

export const userHasPlatformRole = async (
  adminClient: SupabaseClientLike,
  user: AuthenticatedUser,
  roles: string[],
) => {
  const normalizedEmail = toText(user.email).toLowerCase();
  const userQuery = await adminClient
    .from("platform_role_memberships")
    .select("id")
    .eq("status", "active")
    .in("role", roles)
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (userQuery.error) throw new Error(`Platform role lookup failed: ${userQuery.error.message}`);
  if ((userQuery.data as { id?: unknown } | null)?.id) return true;
  if (!normalizedEmail) return false;

  const emailQuery = await adminClient
    .from("platform_role_memberships")
    .select("id")
    .eq("status", "active")
    .in("role", roles)
    .ilike("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (emailQuery.error) throw new Error(`Platform role email lookup failed: ${emailQuery.error.message}`);
  return !!(emailQuery.data as { id?: unknown } | null)?.id;
};

export const requestedBroadcastSessionId = (payload: SpectatorBroadcastPayload) =>
  toText(payload.broadcast_session_id ?? payload.broadcastSessionId ?? payload.id) || null;

export const requestedSourceRoomId = (payload: SpectatorBroadcastPayload) =>
  toText(payload.source_room_id ?? payload.sourceRoomId ?? payload.test_room_name ?? payload.testRoomName).toUpperCase() || null;

export const shouldCreateD7DTestSession = (payload: SpectatorBroadcastPayload) =>
  isTruthy(payload.create_d7d_test_session ?? payload.createD7dTestSession);

export const requestedMaxBroadcastMinutes = (payload: SpectatorBroadcastPayload) =>
  Math.min(
    toPositiveInteger(payload.max_broadcast_minutes ?? payload.maxBroadcastMinutes) ?? 2,
    MAX_D7D_TEST_BROADCAST_MINUTES,
  );

export const hasForbiddenBroadcastInput = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasForbiddenBroadcastInput);
  if (!value || typeof value !== "object") return false;

  return Object.entries(value as JsonObject).some(([key, item]) => {
    const normalizedKey = key.toLowerCase();
    return FORBIDDEN_INPUT_KEY_FRAGMENTS.some((fragment) => normalizedKey.includes(fragment)) || hasForbiddenBroadcastInput(item);
  });
};

const redactValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactValue);
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? sanitizeErrorMessage(value) : value;
  }

  return Object.fromEntries(
    Object.entries(value as JsonObject).map(([key, item]) => {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes("secret") ||
        lowerKey.includes("token") ||
        lowerKey.includes("password") ||
        lowerKey.includes("credential") ||
        lowerKey.includes("card") ||
        lowerKey.includes("bank") ||
        lowerKey.includes("hls_playback_url")
      ) {
        return [key, "[redacted]"];
      }

      return [key, redactValue(item)];
    }),
  );
};

export const safeBroadcastStatus = (session: BroadcastSessionRow | null) => ({
  accessType: session?.access_type ?? "private",
  adPolicy: session?.ad_policy ?? "ads_not_allowed",
  broadcastSessionId: session?.id ?? null,
  broadcastStatus: session?.broadcast_status ?? "not_configured",
  costGuardStatus: session?.cost_guard_status ?? "not_configured",
  egressConnected: !!session?.egress_id && (
    session?.egress_status === "test_active"
    || session?.egress_status === "active_later"
    || session?.egress_status === "test_starting"
  ),
  egressIdPresent: !!session?.egress_id,
  egressProvider: session?.egress_provider ?? "not_connected",
  egressStatus: session?.egress_status ?? "not_connected",
  fullRoomTokenForSpectators: false,
  hlsEnabled: !!session?.hls_playback_url,
  hlsUrlGenerated: !!session?.hls_playback_url,
  hlsUrlReturned: false,
  isPubliclyWatchable: false,
  isSpectatorPlaybackEnabled: false,
  livekitApiCalled: false,
  maxBroadcastMinutes: session?.max_broadcast_minutes ?? null,
  playbackEnabled: false,
  playbackUrlAvailable: !!session?.hls_playback_url,
  playbackUrlStatus: session?.playback_url_status ?? "not_available",
  requiresPremium: session?.requires_premium ?? true,
  requiresTicket: session?.requires_ticket ?? false,
  rightsStatus: session?.rights_status ?? "unknown_block_public_spectator",
  sourceRoomId: session?.source_room_id ?? session?.watch_party_room_id ?? session?.creator_event_id ?? null,
  sourceType: session?.source_type ?? "manual_foundation",
});

export const notConfiguredPayload = (extra: JsonObject = {}) => ({
  status: "not_configured",
  mode: "foundation",
  reason: "egress_not_connected",
  message: "Live spectator broadcast Egress/HLS is not connected. Skeleton did not call LiveKit or enable playback.",
  broadcastStarted: false,
  broadcastStopped: false,
  egressConnected: false,
  egressIdWritten: false,
  egressProvider: "not_connected",
  egressStatus: "not_connected",
  fullRoomTokenForSpectators: false,
  hlsEnabled: false,
  hlsUrlGenerated: false,
  hlsUrlReturned: false,
  isPubliclyWatchable: false,
  isSpectatorPlaybackEnabled: false,
  livekitApiCalled: false,
  playbackEnabled: false,
  playbackUrlAvailable: false,
  providerCall: false,
  providerWrite: false,
  spectatorPlaybackEnabled: false,
  ...extra,
});

export const readBroadcastSession = async (
  adminClient: SupabaseClientLike,
  broadcastSessionId: string,
) => {
  const { data, error } = await adminClient
    .from("room_broadcast_sessions")
    .select(
      [
        "id",
        "source_type",
        "source_room_id",
        "watch_party_room_id",
        "creator_event_id",
        "host_user_id",
        "channel_user_id",
        "broadcast_status",
        "egress_provider",
        "egress_id",
        "egress_status",
        "hls_playback_url",
        "playback_url_status",
        "rights_status",
        "access_type",
        "ad_policy",
        "is_publicly_watchable",
        "is_spectator_playback_enabled",
        "requires_premium",
        "requires_ticket",
        "max_broadcast_minutes",
        "cost_guard_status",
        "metadata",
        "created_at",
      ].join(","),
    )
    .eq("id", broadcastSessionId)
    .maybeSingle();

  if (error) throw new Error(`Broadcast session read failed: ${error.message}`);
  return (data ?? null) as BroadcastSessionRow | null;
};

export const createD7DTestBroadcastSession = async (
  adminClient: SupabaseClientLike,
  payload: SpectatorBroadcastPayload,
  actorUserId: string,
) => {
  const sourceRoomId = requestedSourceRoomId(payload);
  if (!sourceRoomId || !sourceRoomId.startsWith("D7D_TEST_")) {
    throw new Error("D7D test sessions require a source room id beginning with D7D_TEST_.");
  }

  const maxBroadcastMinutes = requestedMaxBroadcastMinutes(payload);
  const { data, error } = await adminClient
    .from("room_broadcast_sessions")
    .insert({
      access_type: "private",
      ad_policy: "ads_not_allowed",
      broadcast_status: "test_ready",
      cost_guard_status: "test_cleanup_required",
      egress_provider: "livekit_egress_test",
      egress_status: "not_started",
      is_publicly_watchable: false,
      is_spectator_playback_enabled: false,
      max_broadcast_minutes: maxBroadcastMinutes,
      metadata: {
        created_by: "spectator-broadcast-start",
        d7d_test_proof: true,
        fake_egress_id: false,
        fake_hls_url: false,
        full_room_token_for_spectators: false,
        max_broadcast_minutes: maxBroadcastMinutes,
        public_playback_enabled: false,
        requested_by: actorUserId,
        spectator_playback_enabled: false,
      },
      playback_url_status: "not_available",
      requires_premium: true,
      requires_ticket: false,
      rights_status: "creator_owned",
      source_room_id: sourceRoomId,
      source_type: "manual_foundation",
    })
    .select("id")
    .single();

  if (error) throw new Error(`D7D test broadcast session create failed: ${error.message}`);

  const broadcastSessionId = toText((data as { id?: unknown } | null)?.id);
  if (!broadcastSessionId) throw new Error("D7D test broadcast session create returned no id.");
  return readBroadcastSession(adminClient, broadcastSessionId);
};

const assertD7DTestBroadcastSession = (session: BroadcastSessionRow) => {
  const metadata = session.metadata ?? {};
  const sourceRoomId = toText(session.source_room_id).toUpperCase();
  const maxBroadcastMinutes = session.max_broadcast_minutes ?? MAX_D7D_TEST_BROADCAST_MINUTES;
  const rightsStatus = session.rights_status ?? "unknown_block_public_spectator";

  if (metadata.d7d_test_proof !== true || !sourceRoomId.startsWith("D7D_TEST_")) {
    throw new Error("D7D Egress proof can only run for private D7D_TEST_ proof sessions.");
  }
  if (!["creator_owned", "chillywood_original", "licensed_for_public_stream"].includes(rightsStatus)) {
    throw new Error("D7D Egress proof requires rights-safe content status.");
  }
  if (session.is_publicly_watchable || session.is_spectator_playback_enabled) {
    throw new Error("D7D Egress proof cannot enable public watchability or spectator playback.");
  }
  if (maxBroadcastMinutes > MAX_D7D_TEST_BROADCAST_MINUTES) {
    throw new Error(`D7D Egress proof max duration is ${MAX_D7D_TEST_BROADCAST_MINUTES} minutes.`);
  }

  return {
    maxBroadcastMinutes,
    roomName: sourceRoomId,
  };
};

const normalizeLiveKitApiUrl = (rawUrl: string) => rawUrl
  .replace(/^wss:\/\//i, "https://")
  .replace(/^ws:\/\//i, "http://")
  .replace(/\/+$/g, "");

const liveKitEgressToken = async (roomName: string) => {
  const livekitApiKey = readRequiredEnv("LIVEKIT_API_KEY");
  const livekitApiSecret = readRequiredEnv("LIVEKIT_API_SECRET");
  const accessToken = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: `chillywood-d7d-egress-${crypto.randomUUID()}`,
    metadata: JSON.stringify({
      app: "chillywood-mobile",
      d7d_test_proof: true,
      full_room_token_for_spectators: false,
      public_playback_enabled: false,
      roomName,
    }),
    name: "Chi'llywood D7D Egress Proof",
    ttl: "10m",
  });

  accessToken.addGrant({
    room: roomName,
    roomRecord: true,
  });

  return accessToken.toJwt();
};

const liveKitEgressFetch = async (methodName: string, body: JsonObject, roomName: string) => {
  const livekitUrl = normalizeLiveKitApiUrl(readRequiredEnv("LIVEKIT_URL"));
  const token = await liveKitEgressToken(roomName);
  const response = await fetch(`${livekitUrl}/twirp/livekit.Egress/${methodName}`, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const responseText = await response.text();
  const parsed = responseText.trim() ? JSON.parse(responseText) as JsonObject : {};

  if (!response.ok) {
    throw new Error(`LiveKit Egress ${methodName} failed with status ${response.status}: ${sanitizeErrorMessage(parsed.msg ?? parsed.message ?? responseText)}`);
  }

  return parsed;
};

const egressStatusToDb = (status: unknown) => {
  const normalized = toText(status).toUpperCase();
  if (normalized === "0" || normalized.includes("STARTING")) return "test_starting";
  if (normalized === "1" || normalized.includes("ACTIVE")) return "test_active";
  if (normalized === "2" || normalized.includes("ENDING")) return "test_stopping";
  if (normalized === "3" || normalized.includes("COMPLETE") || normalized.includes("ABORT")) return "test_stopped";
  if (normalized === "4" || normalized === "6" || normalized.includes("FAILED") || normalized.includes("LIMIT")) return "test_failed";
  return "test_starting";
};

const broadcastStatusForEgressStatus = (egressStatus: string) => {
  if (egressStatus === "test_starting") return "test_starting";
  if (egressStatus === "test_active") return "test_active";
  if (egressStatus === "test_stopping") return "test_stopping";
  if (egressStatus === "test_stopped") return "test_proof_complete";
  if (egressStatus === "test_failed") return "test_failed";
  return "test_starting";
};

const d7dMetadata = (session: BroadcastSessionRow, extra: JsonObject = {}) => ({
  ...(session.metadata ?? {}),
  d7d_test_proof: true,
  fake_egress_id: false,
  fake_hls_url: false,
  full_room_token_for_spectators: false,
  public_playback_enabled: false,
  spectator_playback_enabled: false,
  ...extra,
});

export const startD7DTestEgress = async (
  adminClient: SupabaseClientLike,
  session: BroadcastSessionRow,
) => {
  const readiness = readD7DTestEgressReadiness();
  if (!readiness.readyForBackendTestCall) {
    return {
      result: null,
      status: "not_configured" as const,
      readiness,
    };
  }

  const { maxBroadcastMinutes, roomName } = assertD7DTestBroadcastSession(session);
  const outputValues = readSpectatorBroadcastOutputConfigValues();
  if (!outputValues.configured) {
    return {
      result: null,
      status: "not_configured" as const,
      readiness,
    };
  }

  const proofPrefix = `d7d-test/${session.id}/${Date.now()}`;
  await adminClient
    .from("room_broadcast_sessions")
    .update({
      broadcast_status: "test_starting",
      cost_guard_status: "test_cleanup_required",
      egress_provider: "livekit_egress_test",
      egress_status: "test_starting",
      last_health_checked_at: new Date().toISOString(),
      metadata: d7dMetadata(session, {
        max_broadcast_minutes: maxBroadcastMinutes,
        output_prefix: proofPrefix,
        start_requested_at: new Date().toISOString(),
      }),
      playback_url_status: "not_available",
      started_at: new Date().toISOString(),
    })
    .eq("id", session.id);

  const response = await liveKitEgressFetch("StartRoomCompositeEgress", {
    audio_only: false,
    layout: "grid",
    room_name: roomName,
    segment_outputs: [
      {
        filename_prefix: `${proofPrefix}/segment`,
        live_playlist_name: `${proofPrefix}/live.m3u8`,
        playlist_name: `${proofPrefix}/index.m3u8`,
        s3: {
          access_key: outputValues.values.accessKeyId,
          bucket: outputValues.values.bucket,
          endpoint: outputValues.values.endpoint,
          force_path_style: true,
          region: outputValues.values.region,
          secret: outputValues.values.secretAccessKey,
        },
        segment_duration: 2,
      },
    ],
    video_only: false,
  }, roomName);

  const egressId = toText(response.egress_id ?? response.egressId);
  if (!egressId) throw new Error("LiveKit Egress start returned no egress id.");

  const egressStatus = egressStatusToDb(response.status);
  const hlsPlaybackUrl = readOptionalEnv("PUBLIC_HLS_BASE_URL")
    ? `${readOptionalEnv("PUBLIC_HLS_BASE_URL")?.replace(/\/+$/g, "")}/${proofPrefix}/live.m3u8`
    : null;

  const { data, error } = await adminClient
    .from("room_broadcast_sessions")
    .update({
      broadcast_status: broadcastStatusForEgressStatus(egressStatus),
      cost_guard_status: "test_cleanup_required",
      egress_id: egressId,
      egress_provider: "livekit_egress_test",
      egress_status: egressStatus,
      hls_playback_url: hlsPlaybackUrl,
      last_health_checked_at: new Date().toISOString(),
      metadata: d7dMetadata(session, {
        livekit_api_called: true,
        output_prefix: proofPrefix,
        provider_status: toText(response.status),
        started_response_received_at: new Date().toISOString(),
      }),
      playback_url_status: hlsPlaybackUrl ? "test_private_available" : "test_private_playlist",
    })
    .eq("id", session.id)
    .select("id")
    .single();

  if (error || !(data as { id?: unknown } | null)?.id) {
    throw new Error(`D7D Egress session update failed: ${error?.message ?? "missing updated row"}`);
  }

  return {
    result: {
      broadcastSessionId: session.id,
      egressIdPresent: true,
      egressStatus,
      hlsPrivatePlaylistRequested: true,
      hlsUrlReturned: false,
      publicPlaybackEnabled: false,
      spectatorPlaybackEnabled: false,
    },
    status: "started" as const,
    readiness,
  };
};

export const stopD7DTestEgress = async (
  adminClient: SupabaseClientLike,
  session: BroadcastSessionRow,
) => {
  const readiness = readD7DTestEgressReadiness();
  if (!readiness.readyForBackendTestCall || !session.egress_id) {
    return {
      result: null,
      status: "not_configured" as const,
      readiness,
    };
  }

  assertD7DTestBroadcastSession(session);

  await adminClient
    .from("room_broadcast_sessions")
    .update({
      broadcast_status: "test_stopping",
      egress_status: "test_stopping",
      last_health_checked_at: new Date().toISOString(),
      metadata: d7dMetadata(session, {
        stop_requested_at: new Date().toISOString(),
      }),
    })
    .eq("id", session.id);

  const response = await liveKitEgressFetch("StopEgress", {
    egress_id: session.egress_id,
  }, session.source_room_id ?? "D7D_TEST_UNKNOWN");
  const egressStatus = egressStatusToDb(response.status);

  const { data, error } = await adminClient
    .from("room_broadcast_sessions")
    .update({
      broadcast_status: broadcastStatusForEgressStatus(egressStatus === "test_stopping" ? "test_stopped" : egressStatus),
      cost_guard_status: "test_cap_enforced",
      ended_at: new Date().toISOString(),
      egress_status: egressStatus === "test_stopping" ? "test_stopped" : egressStatus,
      last_health_checked_at: new Date().toISOString(),
      metadata: d7dMetadata(session, {
        livekit_api_called: true,
        provider_status: toText(response.status),
        stopped_response_received_at: new Date().toISOString(),
      }),
    })
    .eq("id", session.id)
    .select("id")
    .single();

  if (error || !(data as { id?: unknown } | null)?.id) {
    throw new Error(`D7D Egress stop update failed: ${error?.message ?? "missing updated row"}`);
  }

  return {
    result: {
      broadcastSessionId: session.id,
      egressIdPresent: true,
      egressStatus: egressStatus === "test_stopping" ? "test_stopped" : egressStatus,
      hlsUrlReturned: false,
      publicPlaybackEnabled: false,
      spectatorPlaybackEnabled: false,
    },
    status: "stopped" as const,
    readiness,
  };
};

export const writeAuditLog = async (
  adminClient: SupabaseClientLike,
  functionName: string,
  input: {
    action: string;
    actorEmail?: string | null;
    actorUserId?: string | null;
    afterState?: unknown;
    beforeState?: unknown;
    metadata?: JsonObject;
    reason: string;
    severity?: string;
    targetId?: string | null;
    targetType?: string | null;
  },
) => {
  const metadata = input.metadata ?? {};
  const { data, error } = await adminClient
    .from("platform_admin_audit_logs")
    .insert({
      action: input.action,
      action_category: "foundation",
      actor_email: input.actorEmail ?? null,
      actor_role: "operator",
      actor_user_id: input.actorUserId ?? null,
      after_state: input.afterState == null ? null : redactValue(input.afterState),
      before_state: input.beforeState == null ? null : redactValue(input.beforeState),
      metadata: redactValue({
        ...metadata,
        function_name: functionName,
        backend_only: true,
        egress_connected: metadata.egress_connected === true,
        egress_id_written: metadata.egress_id_written === true,
        foundation_only: metadata.foundation_only === false ? false : true,
        full_room_token_for_spectators: false,
        hls_enabled: metadata.hls_enabled === true,
        hls_url_generated: metadata.hls_url_generated === true,
        livekit_api_called: metadata.livekit_api_called === true,
        public_playback_enabled: false,
        spectator_playback_enabled: false,
      }),
      reason: input.reason,
      severity: input.severity ?? "notice",
      target_id: input.targetId ?? null,
      target_type: input.targetType ?? "spectator_broadcast_skeleton",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Audit log insert failed: ${error.message}`);
  return toText((data as { id?: unknown } | null)?.id) || null;
};

export const safeWriteAuditLog = async (
  adminClient: SupabaseClientLike | null,
  functionName: string,
  input: Parameters<typeof writeAuditLog>[2],
) => {
  if (!adminClient) return null;

  try {
    return await writeAuditLog(adminClient, functionName, input);
  } catch {
    return null;
  }
};
