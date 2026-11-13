// Source-only checkout proof. This is a trusted IP-country observation, not
// residence verification or permission to charge. Nonce consumption is backend-owned.
export const CHECKOUT_PATH = "/functions/v1/stripe-paid-video-checkout";
export const CHECKOUT_PURPOSE = "stripe-video-new-checkout";
export const CHECKOUT_BODY_LIMIT = 32768;
const encoder = new TextEncoder();
const hex = buffer => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
export const digest = async value => hex(await crypto.subtle.digest("SHA-256", typeof value === "string" ? encoder.encode(value) : value));

export async function readCheckoutBody(request) {
  if (!request.body) throw Error("checkout_body_required");
  const reader = request.body.getReader(), chunks = [];
  let length = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > CHECKOUT_BODY_LIMIT) throw Error("checkout_body_too_large");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

export async function signCheckoutProof(request, body, secret, targetOrigin) {
  const url = new URL(request.url);
  const authorization = request.headers.get("authorization") || "";
  if (request.method !== "POST" || url.pathname !== CHECKOUT_PATH || url.search
    || !/^Bearer [^\s]+$/.test(authorization) || body.byteLength > CHECKOUT_BODY_LIMIT) {
    throw Error("checkout_proof_request_invalid");
  }
  const audience = new URL(targetOrigin);
  if (audience.protocol !== "https:" || audience.origin !== targetOrigin) throw Error("checkout_proof_audience_invalid");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const payload = {version:"v2", purpose:CHECKOUT_PURPOSE, timestamp, nonce:crypto.randomUUID(),
    audience:targetOrigin, request_path:CHECKOUT_PATH, method:"POST",
    platform:request.headers.get('x-chillywood-platform'),
    body_sha256:await digest(body), authorization_sha256:await digest(authorization),
    country:request.cf?.country || null};
  const proof = btoa(JSON.stringify(payload)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
  const key = await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature = hex(await crypto.subtle.sign("HMAC",key,encoder.encode(`v2.${timestamp}.${proof}`)));
  return {proof, signature, timestamp};
}
