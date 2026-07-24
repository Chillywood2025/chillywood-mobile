const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 1_048_576;
const DEFAULT_TIMEOUT_MS = 15_000;

const parseIpv4 = (raw) => {
  const parts = raw.split(".");
  if (
    parts.length !== 4 ||
    parts.some((part) =>
      !/^(?:0|[1-9][0-9]{0,2})$/u.test(part) || Number(part) > 255
    )
  ) {
    return null;
  }
  return parts.reduce(
    (value, part) => (value << 8n) | BigInt(Number(part)),
    0n,
  );
};

const parseIpv6 = (raw) => {
  const value = raw.toLowerCase().replace(/^\[|\]$/gu, "").split("%", 1)[0];
  if (value.startsWith("::ffff:") && value.slice(7).includes(".")) {
    const ipv4 = parseIpv4(value.slice(7));
    return ipv4 === null ? null : (0xffffn << 32n) | ipv4;
  }
  if (value.includes(".")) return null;
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ];
  if (
    groups.length !== 8 ||
    groups.some((group) => !/^[a-f0-9]{1,4}$/u.test(group))
  ) {
    return null;
  }
  return groups.reduce(
    (result, group) => (result << 16n) | BigInt(`0x${group}`),
    0n,
  );
};

const ipv4InRange = (value, base, prefix) => {
  const parsedBase = parseIpv4(base);
  if (parsedBase === null) return true;
  const shift = BigInt(32 - prefix);
  return (value >> shift) === (parsedBase >> shift);
};

const ipv6InRange = (value, base, prefix) => {
  const parsedBase = parseIpv6(base);
  if (parsedBase === null) return true;
  const shift = BigInt(128 - prefix);
  return (value >> shift) === (parsedBase >> shift);
};

const PRIVATE_V4 = Object.freeze([
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]);
const RESERVED_V6 = Object.freeze([
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
]);

export const isPrivateOrReservedIp = (raw) => {
  if (typeof raw !== "string") return true;
  const ipv4 = parseIpv4(raw);
  if (ipv4 !== null) {
    return PRIVATE_V4.some(([base, prefix]) =>
      ipv4InRange(ipv4, base, prefix)
    );
  }
  const ipv6 = parseIpv6(raw);
  if (ipv6 === null) return true;
  return RESERVED_V6.some(([base, prefix]) =>
    ipv6InRange(ipv6, base, prefix)
  );
};

const withAbort = (promise, signal) => {
  if (signal.aborted) {
    Promise.resolve(promise).catch(() => undefined);
    return Promise.reject(new Error("research_cancelled"));
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("research_cancelled"));
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
};

const defaultResolveAddresses = async (hostname, signal) => {
  const dns = await import("node:dns/promises");
  const results = await withAbort(
    Promise.allSettled([dns.resolve4(hostname), dns.resolve6(hostname)]),
    signal,
  );
  return results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );
};

const resolvePublicAddresses = async (
  hostname,
  signal,
  resolveAddresses,
) => {
  signal.throwIfAborted();
  const addresses = await withAbort(resolveAddresses(hostname, signal), signal);
  signal.throwIfAborted();
  const unique = [...new Set(addresses)];
  if (
    unique.length < 1 ||
    unique.length > 16 ||
    unique.some((address) =>
      typeof address !== "string" || isPrivateOrReservedIp(address)
    )
  ) {
    throw new Error("research_dns_scope_rejected");
  }
  return Object.freeze(unique);
};

const readBoundedBody = async (response, signal) => {
  const declared = response.headers.get("content-length");
  if (
    declared !== null &&
    (!/^[0-9]+$/u.test(declared) || Number(declared) > MAX_BODY_BYTES)
  ) {
    throw new Error("research_response_size_rejected");
  }
  if (!response.body) return "";
  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const result = await withAbort(reader.read(), signal);
      if (result.done) break;
      const chunk = result.value instanceof Uint8Array
        ? result.value
        : new Uint8Array(result.value);
      total += chunk.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel("research_response_size_rejected");
        throw new Error("research_response_size_rejected");
      }
      chunks.push(chunk);
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
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
};

export const createMediatedResearchTransport = ({
  canonicalizeUrl,
  fetcher = globalThis.fetch,
  now = Date.now,
  resolveAddresses = defaultResolveAddresses,
  totalTimeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) => {
  if (
    typeof canonicalizeUrl !== "function" ||
    typeof fetcher !== "function" ||
    typeof resolveAddresses !== "function"
  ) {
    throw new Error("research_transport_configuration_rejected");
  }
  return async (initialUrl, callerSignal) => {
    const initial = canonicalizeUrl(initialUrl);
    if (!initial) throw new Error("research_url_rejected");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), totalTimeoutMs);
    const cancel = () => controller.abort();
    if (callerSignal?.aborted) {
      controller.abort(callerSignal.reason);
    } else {
      callerSignal?.addEventListener("abort", cancel, { once: true });
    }
    let target = initial;
    const allResolved = new Set();
    try {
      for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
        if (controller.signal.aborted) throw new Error("research_total_timeout");
        const addresses = await resolvePublicAddresses(
          target.hostname,
          controller.signal,
          resolveAddresses,
        );
        addresses.forEach((address) => allResolved.add(address));
        if (allResolved.size > 16) throw new Error("research_dns_scope_rejected");

        const response = await withAbort(fetcher(target.canonical, {
          headers: {
            Accept: "text/html, text/plain, application/json",
            "Accept-Encoding": "identity",
            "User-Agent": "ChillywoodPublicResearchBroker/1",
          },
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
        }), controller.signal);
        if (!(response instanceof Response)) {
          throw new Error("research_transport_response_rejected");
        }
        const location = response.headers.get("location");
        if (location !== null) {
          if (
            ![301, 302, 303, 307, 308].includes(response.status) ||
            redirect === MAX_REDIRECTS
          ) {
            throw new Error("research_redirect_rejected");
          }
          const redirected = canonicalizeUrl(
            new URL(location, target.canonical).toString(),
          );
          if (!redirected || redirected.hostname !== initial.hostname) {
            throw new Error("research_redirect_scope_rejected");
          }
          await response.body?.cancel().catch(() => undefined);
          target = redirected;
          continue;
        }
        if (response.status < 200 || response.status > 299) {
          throw new Error("research_http_status_rejected");
        }
        return Object.freeze({
          body: await readBoundedBody(response, controller.signal),
          canonicalUrl: target.canonical,
          contentType: response.headers.get("content-type") ?? "",
          lastModifiedHeader: response.headers.get("last-modified"),
          networkBoundary: "cloudflare_public_fetch_proxy",
          resolvedAddresses: Object.freeze([...allResolved]),
          retrievalDate: new Date(now()).toISOString(),
          status: response.status,
        });
      }
      throw new Error("research_redirect_rejected");
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          callerSignal?.aborted ? "research_cancelled" : "research_total_timeout",
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", cancel);
    }
  };
};
