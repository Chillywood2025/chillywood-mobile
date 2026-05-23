const PROOF_VERSION = "v1";
const DEFAULT_MAX_BODYLESS_METHODS = new Set(["GET", "HEAD"]);

const STRIPPED_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "forwarded",
  "x-client-ip",
  "x-cluster-client-ip",
  "true-client-ip",
  "fastly-client-ip",
  "cf-connecting-ip",
  "x-chillywood-network-proof",
  "x-chillywood-network-proof-signature",
  "x-chillywood-network-proof-timestamp",
  "x-chillywood-network-proof-version",
];

const textEncoder = new TextEncoder();

const bytesToHex = (buffer) =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const base64Url = (value) =>
  btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8" },
    status,
  });

async function sha256Hex(value) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", textEncoder.encode(value)));
}

async function hmacSha256Hex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, textEncoder.encode(value)));
}

function maskIp(ip) {
  const clean = String(ip || "").trim();
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(clean)) {
    const [a, b, c] = clean.split(".");
    return `${a}.${b}.${c}.0/24`;
  }

  const parts = clean.toLowerCase().split(":").filter(Boolean);
  return `${parts.slice(0, 4).join(":") || "0000"}::/64`;
}

function backendTarget(requestUrl, backendOrigin) {
  const incoming = new URL(requestUrl);
  const origin = new URL(backendOrigin);
  return new URL(`${incoming.pathname}${incoming.search}`, origin);
}

function stripSpoofableHeaders(headers) {
  for (const header of STRIPPED_HEADERS) headers.delete(header);
}

function bodyFor(request) {
  return DEFAULT_MAX_BODYLESS_METHODS.has(request.method.toUpperCase()) ? undefined : request.body;
}

async function signedProofPayload(request, env, realIp) {
  const url = new URL(request.url);
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

  return { proof, signature, timestamp };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/__network-proof-health") {
      return json({
        ok: true,
        proofVersion: PROOF_VERSION,
        rawIpForwarded: false,
        signedProofHeaders: true,
      });
    }

    if (
      !env.CHILLYWOOD_BACKEND_ORIGIN_URL ||
      !env.CHILLYWOOD_NETWORK_PROOF_SECRET ||
      !env.CHILLYWOOD_NETWORK_PROOF_HASH_PEPPER
    ) {
      return json({ error: "network_proof_proxy_not_configured" }, 503);
    }

    const realIp = request.headers.get("cf-connecting-ip");
    if (!realIp) {
      return json({ error: "trusted_ingress_ip_unavailable" }, 502);
    }

    const target = backendTarget(request.url, env.CHILLYWOOD_BACKEND_ORIGIN_URL);
    const headers = new Headers(request.headers);
    stripSpoofableHeaders(headers);

    const signed = await signedProofPayload(request, env, realIp);
    headers.set("x-chillywood-network-proof", signed.proof);
    headers.set("x-chillywood-network-proof-signature", `sha256=${signed.signature}`);
    headers.set("x-chillywood-network-proof-timestamp", signed.timestamp);
    headers.set("x-chillywood-network-proof-version", PROOF_VERSION);

    return fetch(target, {
      body: bodyFor(request),
      headers,
      method: request.method,
      redirect: "manual",
    });
  },
};
