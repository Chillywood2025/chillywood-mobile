// Uses an explicitly provisioned, least-privilege Android Publisher service
// account. This code never creates credentials or reuses unrelated FCM keys.
export async function googlePlayReporterAccessToken(serviceAccountJson: string,
  transport: typeof fetch = fetch): Promise<string> {
  const account = JSON.parse(serviceAccountJson);
  if (account?.type !== "service_account" || typeof account.client_email !== "string"
    || !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(account.client_email)
    || typeof account.private_key !== "string" || !account.private_key.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new Error("google_reporter_credentials_invalid");
  }
  const encode = (value: Uint8Array | string) => btoa(typeof value === "string" ? value
    : String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${encode(JSON.stringify({
    iss: account.client_email, scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }))}`;
  const pem = account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const bytes = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", bytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const result = await transport("https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${encode(new Uint8Array(signature))}` }),
    signal: AbortSignal.timeout(15000), redirect: "error",
  });
  const body = await result.json();
  if (!result.ok || typeof body.access_token !== "string" || !body.access_token
    || body.token_type?.toLowerCase() !== "bearer") throw new Error("google_reporter_oauth_failed");
  return body.access_token;
}
