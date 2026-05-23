# Trusted Network Proof Proxy Sample

Date: 2026-05-23

Purpose: document the expected ingress layer for Chi'llywood signed network proof. This is a sample Cloudflare Worker-style proxy, not active app behavior. It should be deployed only after infrastructure ownership, routing, and secret management are approved.

## Contract

The mobile app must not send trusted IP/network proof. A trusted proxy in front of Supabase Edge creates four signed headers:

- `x-chillywood-network-proof`
- `x-chillywood-network-proof-signature`
- `x-chillywood-network-proof-timestamp`
- `x-chillywood-network-proof-version`

The backend verifies the HMAC signature using `CHILLYWOOD_NETWORK_PROOF_SECRET`. Only verified proof may set `network_proof_verified = true` and `trusted_header_source = signed_chillywood_proxy`.

Required backend env:

- `CHILLYWOOD_NETWORK_PROOF_SECRET`: server-only HMAC secret shared between the trusted proxy and Supabase Edge.
- `SECURITY_CONTEXT_HASH_PEPPER`: existing backend pepper for fallback session/user-agent hashing.
- `CHILLYWOOD_NETWORK_PROOF_MAX_AGE_SECONDS`: optional max age, default 300 seconds.

Expected proxy env:

- `CHILLYWOOD_NETWORK_PROOF_SECRET`: same server-only HMAC secret.
- `CHILLYWOOD_NETWORK_PROOF_HASH_PEPPER`: server-only pepper used by the proxy to hash IP/user-agent before forwarding.
- `CHILLYWOOD_BACKEND_ORIGIN_URL`: Supabase Edge origin, for example `https://PROJECT.supabase.co`.

## Cloudflare Worker Sample

```js
const PROOF_VERSION = "v1";
const STRIPPED_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "forwarded",
  "x-client-ip",
  "cf-connecting-ip",
  "x-chillywood-network-proof",
  "x-chillywood-network-proof-signature",
  "x-chillywood-network-proof-timestamp",
  "x-chillywood-network-proof-version",
];

const bytesToHex = (buffer) =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const base64Url = (value) =>
  btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

async function sha256Hex(value) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function hmacSha256Hex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function maskIp(ip) {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
    const [a, b, c] = ip.split(".");
    return `${a}.${b}.${c}.0/24`;
  }
  const parts = ip.toLowerCase().split(":").filter(Boolean);
  return `${parts.slice(0, 4).join(":") || "0000"}::/64`;
}

export default {
  async fetch(request, env) {
    if (!env.CHILLYWOOD_NETWORK_PROOF_SECRET || !env.CHILLYWOOD_NETWORK_PROOF_HASH_PEPPER) {
      return new Response("Network proof proxy is not configured", { status: 503 });
    }

    const url = new URL(request.url);
    const origin = new URL(env.CHILLYWOOD_BACKEND_ORIGIN_URL);
    const target = new URL(url.pathname + url.search, origin);
    const headers = new Headers(request.headers);

    for (const header of STRIPPED_HEADERS) headers.delete(header);

    const realIp = request.headers.get("cf-connecting-ip");
    if (!realIp) return new Response("Trusted ingress IP unavailable", { status: 502 });

    const userAgent = request.headers.get("user-agent") || "";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const payload = {
      version: PROOF_VERSION,
      timestamp,
      nonce: crypto.randomUUID(),
      request_path: url.pathname,
      ip_hash: await sha256Hex(`ip|${env.CHILLYWOOD_NETWORK_PROOF_HASH_PEPPER}|${realIp}`),
      masked_ip_or_prefix: maskIp(realIp),
      user_agent_hash: userAgent
        ? await sha256Hex(`ua|${env.CHILLYWOOD_NETWORK_PROOF_HASH_PEPPER}|${userAgent}`)
        : null,
      country: request.cf?.country || null,
      region: request.cf?.region || null,
      city_approx: request.cf?.city || null,
      asn_or_isp: request.cf?.asOrganization || null,
    };

    const proof = base64Url(JSON.stringify(payload));
    const signature = await hmacSha256Hex(
      env.CHILLYWOOD_NETWORK_PROOF_SECRET,
      `${PROOF_VERSION}.${timestamp}.${proof}`,
    );

    headers.set("x-chillywood-network-proof", proof);
    headers.set("x-chillywood-network-proof-signature", `sha256=${signature}`);
    headers.set("x-chillywood-network-proof-timestamp", timestamp);
    headers.set("x-chillywood-network-proof-version", PROOF_VERSION);

    return fetch(target, {
      body: request.body,
      headers,
      method: request.method,
    });
  },
};
```

## Deployment Requirements

- Route mobile/backend calls through the trusted proxy endpoint instead of direct Supabase Edge URLs.
- Prevent direct public bypass to Supabase Edge for surfaces that require verified network proof.
- Configure the same `CHILLYWOOD_NETWORK_PROOF_SECRET` in the trusted proxy and Supabase Edge.
- Never place the secret in React Native, public web, docs output, screenshots, or logs.
- Leave direct `x-forwarded-for`, `x-real-ip`, `forwarded`, `x-client-ip`, and `cf-connecting-ip` untrusted unless they are inside this signed proxy proof.

## Proof Expectations

- Spoofed direct proxy headers alone produce `network_proof_verified = false`.
- Missing proof produces `network_proof_error = missing_trusted_proxy_proof`.
- Invalid signatures produce `network_proof_error = invalid_trusted_proxy_proof_signature`.
- Expired signatures produce `network_proof_error = expired_trusted_proxy_proof`.
- Verified proxy proof may show masked IP/prefix only in Owner Security and Audit Explorer for authorized owner/admin/operator users.
