import { createClient } from "npm:@supabase/supabase-js@2";

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
  id?: unknown;
  source_room_id?: unknown;
  sourceRoomId?: unknown;
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
  egressConnected: false,
  egressProvider: session?.egress_provider ?? "not_connected",
  egressStatus: session?.egress_status ?? "not_connected",
  fullRoomTokenForSpectators: false,
  hlsEnabled: false,
  hlsUrlGenerated: false,
  hlsUrlReturned: false,
  isPubliclyWatchable: false,
  isSpectatorPlaybackEnabled: false,
  livekitApiCalled: false,
  playbackEnabled: false,
  playbackUrlAvailable: false,
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
        "cost_guard_status",
        "created_at",
      ].join(","),
    )
    .eq("id", broadcastSessionId)
    .maybeSingle();

  if (error) throw new Error(`Broadcast session read failed: ${error.message}`);
  return (data ?? null) as BroadcastSessionRow | null;
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
        ...input.metadata,
        function_name: functionName,
        backend_only: true,
        egress_connected: false,
        egress_id_written: false,
        foundation_only: true,
        full_room_token_for_spectators: false,
        hls_enabled: false,
        hls_url_generated: false,
        livekit_api_called: false,
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
