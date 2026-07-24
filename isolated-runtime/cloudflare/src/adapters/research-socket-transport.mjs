const MAX_REDIRECTS = 3;
const MAX_WIRE_BYTES = 1_048_576;
const MAX_HEADER_BYTES = 65_536;
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

const normalizeSocketAddress = (raw) => {
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  if (value.startsWith("[")) {
    const closing = value.indexOf("]");
    return closing > 0 ? value.slice(1, closing) : value;
  }
  return /^\d{1,3}(?:\.\d{1,3}){3}:\d+$/u.test(value)
    ? value.slice(0, value.lastIndexOf(":"))
    : value;
};

export const ipAddressKey = (raw) => {
  const normalized = normalizeSocketAddress(raw)
    .toLowerCase()
    .replace(/^\[|\]$/gu, "")
    .split("%", 1)[0];
  if (normalized.startsWith("::ffff:") && normalized.slice(7).includes(".")) {
    const mapped = parseIpv4(normalized.slice(7));
    return mapped === null ? null : `4:${mapped.toString(16)}`;
  }
  const ipv4 = parseIpv4(normalized);
  if (ipv4 !== null) return `4:${ipv4.toString(16)}`;
  const ipv6 = parseIpv6(normalized);
  return ipv6 === null ? null : `6:${ipv6.toString(16)}`;
};

export const isPrivateOrReservedIp = (raw) => {
  const normalized = normalizeSocketAddress(raw)
    .toLowerCase()
    .replace(/^\[|\]$/gu, "")
    .split("%", 1)[0];
  if (normalized.startsWith("::ffff:") && normalized.slice(7).includes(".")) {
    return isPrivateOrReservedIp(normalized.slice(7));
  }
  const ipv4 = parseIpv4(normalized);
  if (ipv4 !== null) {
    return PRIVATE_V4.some(([base, prefix]) => ipv4InRange(ipv4, base, prefix));
  }
  const ipv6 = parseIpv6(normalized);
  if (ipv6 === null || !ipv6InRange(ipv6, "2000::", 3)) return true;
  return RESERVED_V6.some(([base, prefix]) =>
    ipv6InRange(ipv6, base, prefix)
  );
};

const findBytes = (haystack, needle, start = 0) => {
  for (
    let index = start;
    index <= haystack.length - needle.length;
    index += 1
  ) {
    if (needle.every((byte, offset) => haystack[index + offset] === byte)) {
      return index;
    }
  }
  return -1;
};

const concatBytes = (chunks, total) => {
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
};

const decodeChunkedBody = (input) => {
  const chunks = [];
  let total = 0;
  let offset = 0;
  while (offset < input.length) {
    const lineEnd = findBytes(input, [13, 10], offset);
    if (lineEnd < 0 || lineEnd - offset > 32) {
      throw new Error("research_chunked_response_rejected");
    }
    const sizeText = new TextDecoder().decode(input.slice(offset, lineEnd))
      .split(";", 1)[0].trim();
    if (!/^[a-f0-9]+$/iu.test(sizeText)) {
      throw new Error("research_chunked_response_rejected");
    }
    const size = Number.parseInt(sizeText, 16);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error("research_chunked_response_rejected");
    }
    offset = lineEnd + 2;
    if (size === 0) return concatBytes(chunks, total);
    if (
      size > MAX_WIRE_BYTES ||
      total + size > MAX_WIRE_BYTES ||
      offset + size + 2 > input.length ||
      input[offset + size] !== 13 ||
      input[offset + size + 1] !== 10
    ) {
      throw new Error("research_response_size_rejected");
    }
    chunks.push(input.slice(offset, offset + size));
    total += size;
    offset += size + 2;
  }
  throw new Error("research_chunked_response_rejected");
};

export const parseHttpResponse = (wire) => {
  const headerEnd = findBytes(wire, [13, 10, 13, 10]);
  if (headerEnd < 0 || headerEnd > MAX_HEADER_BYTES) {
    throw new Error("research_http_headers_rejected");
  }
  const headerText = new TextDecoder("utf-8", { fatal: true }).decode(
    wire.slice(0, headerEnd),
  );
  const lines = headerText.split("\r\n");
  const statusMatch = lines.shift()?.match(/^HTTP\/1\.[01] ([0-9]{3})(?: |$)/u);
  if (!statusMatch) throw new Error("research_http_status_rejected");
  const headers = new Map();
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator < 1) throw new Error("research_http_headers_rejected");
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (!/^[a-z0-9-]+$/u.test(name) || /[\r\n]/u.test(value)) {
      throw new Error("research_http_headers_rejected");
    }
    headers.set(
      name,
      headers.has(name) ? `${headers.get(name)},${value}` : value,
    );
  }
  if ((headers.get("content-encoding")?.toLowerCase() ?? "identity") !==
    "identity") {
    throw new Error("research_content_encoding_rejected");
  }
  let bodyBytes = wire.slice(headerEnd + 4);
  const transferEncoding = headers.get("transfer-encoding")?.toLowerCase() ??
    "";
  if (transferEncoding) {
    if (transferEncoding !== "chunked") {
      throw new Error("research_transfer_encoding_rejected");
    }
    bodyBytes = decodeChunkedBody(bodyBytes);
  } else if (headers.has("content-length")) {
    const length = headers.get("content-length") ?? "";
    if (!/^(?:0|[1-9][0-9]{0,7})$/u.test(length)) {
      throw new Error("research_content_length_rejected");
    }
    const expected = Number(length);
    if (expected > MAX_WIRE_BYTES || bodyBytes.byteLength !== expected) {
      throw new Error("research_response_size_rejected");
    }
  }
  if (bodyBytes.byteLength > MAX_WIRE_BYTES) {
    throw new Error("research_response_size_rejected");
  }
  return Object.freeze({
    body: new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes),
    contentType: headers.get("content-type") ?? "",
    lastModifiedHeader: headers.get("last-modified") ?? null,
    location: headers.get("location") ?? null,
    status: Number(statusMatch[1]),
  });
};

const withAbort = (promise, signal) =>
  new Promise((resolve, reject) => {
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

const defaultConnectSocket = async (address, options) => {
  const sockets = await import("cloudflare:sockets");
  return sockets.connect(address, options);
};

const resolvePublicAddresses = async (
  hostname,
  signal,
  resolveAddresses,
) => {
  const addresses = await withAbort(resolveAddresses(hostname, signal), signal);
  const unique = [...new Set(addresses)];
  if (
    unique.length < 1 ||
    unique.length > 16 ||
    unique.some((address) =>
      typeof address !== "string" ||
      !ipAddressKey(address) ||
      isPrivateOrReservedIp(address)
    )
  ) {
    throw new Error("research_dns_scope_rejected");
  }
  return Object.freeze(unique);
};

const closeSocket = (socket) => {
  try {
    Promise.resolve(socket?.close()).catch(() => {});
  } catch {
    // The connection can already be closed by timeout or EOF.
  }
};

const readAllBounded = async (readable, signal) => {
  const chunks = [];
  let total = 0;
  const reader = readable.getReader();
  try {
    while (true) {
      const result = await withAbort(reader.read(), signal);
      if (result.done) break;
      const chunk = result.value instanceof Uint8Array
        ? result.value
        : new Uint8Array(result.value);
      total += chunk.byteLength;
      if (total > MAX_WIRE_BYTES + MAX_HEADER_BYTES + 4) {
        throw new Error("research_response_size_rejected");
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return concatBytes(chunks, total);
};

const requestVerifiedPeer = async (
  target,
  addresses,
  signal,
  connectSocket,
) => {
  const expected = new Set(addresses.map(ipAddressKey));
  let lastError = new Error("research_transport_unavailable");
  for (let attempt = 0; attempt < addresses.length; attempt += 1) {
    if (signal.aborted) throw new Error("research_cancelled");
    let socket;
    let closeOnAbort;
    try {
      socket = await withAbort(
        connectSocket(
          { hostname: target.hostname, port: 443 },
          { allowHalfOpen: true, secureTransport: "on" },
        ),
        signal,
      );
      closeOnAbort = () => closeSocket(socket);
      signal.addEventListener("abort", closeOnAbort, { once: true });
      socket.closed?.catch(() => {});
      const info = await withAbort(socket.opened, signal);
      const connectedAddress = normalizeSocketAddress(info?.remoteAddress);
      const connectedKey = ipAddressKey(connectedAddress);
      if (
        !connectedKey ||
        !expected.has(connectedKey) ||
        isPrivateOrReservedIp(connectedAddress)
      ) {
        throw new Error("research_connected_peer_mismatch");
      }
      const request = new TextEncoder().encode(
        `GET ${target.pathAndQuery} HTTP/1.1\r\n` +
          `Host: ${target.hostname}\r\n` +
          "Accept: text/html, text/plain, application/json\r\n" +
          "Accept-Encoding: identity\r\n" +
          "Connection: close\r\n" +
          "User-Agent: ChillywoodPublicResearchBroker/1\r\n\r\n",
      );
      const writer = socket.writable.getWriter();
      try {
        await withAbort(writer.write(request), signal);
        await withAbort(writer.close(), signal);
      } finally {
        writer.releaseLock();
      }
      return Object.freeze({
        connectedAddress,
        response: parseHttpResponse(
          await readAllBounded(socket.readable, signal),
        ),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "research_connected_peer_mismatch"
      ) {
        throw error;
      }
      lastError = error;
    } finally {
      if (closeOnAbort) signal.removeEventListener("abort", closeOnAbort);
      closeSocket(socket);
    }
  }
  throw lastError;
};

export const createPinnedResearchTransport = ({
  canonicalizeUrl,
  connectSocket = defaultConnectSocket,
  now = Date.now,
  resolveAddresses = defaultResolveAddresses,
  totalTimeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) => {
  if (typeof canonicalizeUrl !== "function") {
    throw new Error("research_transport_configuration_rejected");
  }
  return async (initialUrl, callerSignal) => {
    const initial = canonicalizeUrl(initialUrl);
    if (!initial) throw new Error("research_url_rejected");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), totalTimeoutMs);
    const cancel = () => controller.abort();
    callerSignal?.addEventListener("abort", cancel, { once: true });
    let target = initial;
    const allResolved = new Set();
    try {
      for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
        if (controller.signal.aborted) {
          throw new Error("research_total_timeout");
        }
        const addresses = await resolvePublicAddresses(
          target.hostname,
          controller.signal,
          resolveAddresses,
        );
        addresses.forEach((address) => allResolved.add(address));
        if (allResolved.size > 16) {
          throw new Error("research_dns_scope_rejected");
        }
        const { connectedAddress, response } = await requestVerifiedPeer(
          target,
          addresses,
          controller.signal,
          connectSocket,
        );
        if (response.location !== null) {
          if (
            ![301, 302, 303, 307, 308].includes(response.status) ||
            redirect === MAX_REDIRECTS
          ) {
            throw new Error("research_redirect_rejected");
          }
          const redirected = canonicalizeUrl(
            new URL(response.location, target.canonical).toString(),
          );
          if (!redirected || redirected.hostname !== initial.hostname) {
            throw new Error("research_redirect_scope_rejected");
          }
          target = redirected;
          continue;
        }
        if (response.status < 200 || response.status > 299) {
          throw new Error("research_http_status_rejected");
        }
        return Object.freeze({
          body: response.body,
          canonicalUrl: target.canonical,
          connectedAddress,
          contentType: response.contentType,
          lastModifiedHeader: response.lastModifiedHeader,
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
