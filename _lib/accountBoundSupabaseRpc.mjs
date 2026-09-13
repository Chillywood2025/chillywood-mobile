const RPC_NAME_PATTERN = /^[a-z][a-z0-9_]{0,127}$/u;

const normalizedText = (value) => String(value ?? "").trim();

const isAllowedSupabaseOrigin = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      || (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname));
  } catch {
    return false;
  }
};

export async function invokeAccountBoundSupabaseRpc({
  supabaseUrl,
  anonKey,
  accessToken,
  functionName,
  args = {},
  clientPlatform,
  fetchImpl = globalThis.fetch,
}) {
  const baseUrl = normalizedText(supabaseUrl).replace(/\/+$/u, "");
  const safeAnonKey = normalizedText(anonKey);
  const safeAccessToken = normalizedText(accessToken);
  const safeFunctionName = normalizedText(functionName);
  const safeClientPlatform = ["android", "ios", "web"].includes(normalizedText(clientPlatform).toLowerCase())
    ? normalizedText(clientPlatform).toLowerCase()
    : "";
  if (
    !isAllowedSupabaseOrigin(baseUrl)
    || !safeAnonKey
    || !safeAccessToken
    || /[\r\n]/u.test(safeAnonKey)
    || /[\r\n]/u.test(safeAccessToken)
    || !RPC_NAME_PATTERN.test(safeFunctionName)
    || typeof fetchImpl !== "function"
  ) {
    return { data: null, error: { message: "account_bound_rpc_invalid" } };
  }

  try {
    const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/${safeFunctionName}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        apikey: safeAnonKey,
        Authorization: `Bearer ${safeAccessToken}`,
        "Content-Profile": "public",
        "Content-Type": "application/json",
        ...(safeClientPlatform ? { "x-chillywood-platform": safeClientPlatform } : {}),
      },
      body: JSON.stringify(args),
    });
    if (!response?.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      const message = payload && typeof payload === "object" && !Array.isArray(payload)
        ? normalizedText(payload.message ?? payload.error ?? payload.code)
        : "";
      const code = payload && typeof payload === "object" && !Array.isArray(payload)
        ? normalizedText(payload.code)
        : "";
      return {
        data: null,
        error: {
          message: message || "account_bound_rpc_failed",
          ...(code ? { code } : {}),
        },
      };
    }
    const data = response.status === 204 ? null : await response.json();
    return { data, error: null };
  } catch {
    return { data: null, error: { message: "account_bound_rpc_unavailable" } };
  }
}
