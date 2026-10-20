// Dedicated inspection transport policy. Consumer media authority is unchanged.
export const INSPECTION_MAX_RANGE_BYTES = 4 * 1024 * 1024;
export const INSPECTION_MAX_IMAGE_BYTES = 16 * 1024 * 1024;
export const INSPECTION_REQUEST_TIMEOUT_MS = 15_000;

export class InspectionMediaError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
  }
}

export const inspectionMediaKind = (
  mime: string,
): "image" | "video" | "audio" | null => {
  if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime)) {
    return "image";
  }
  if (["video/mp4", "video/quicktime", "video/webm"].includes(mime)) {
    return "video";
  }
  if (
    [
      "audio/mpeg",
      "audio/mp4",
      "audio/wav",
      "audio/x-wav",
      "audio/webm",
      "audio/ogg",
    ].includes(mime)
  ) return "audio";
  return null;
};

// Signature checks are an extra content-type boundary, not a malware scanner.
// Exact scanner-owned clean provenance is independently mandatory.
export const matchesInspectionMediaSignature = (
  mime: string,
  bytes: Uint8Array,
): boolean => {
  const ascii = (offset: number, value: string) =>
    bytes.length >= offset + value.length &&
    [...value].every((c, index) => bytes[offset + index] === c.charCodeAt(0));
  if (mime === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mime === "image/png") {
    return [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  }
  if (mime === "image/gif") return ascii(0, "GIF87a") || ascii(0, "GIF89a");
  if (mime === "image/webp") return ascii(0, "RIFF") && ascii(8, "WEBP");
  if (["audio/wav", "audio/x-wav"].includes(mime)) {
    return ascii(0, "RIFF") && ascii(8, "WAVE");
  }
  if (["video/mp4", "audio/mp4", "video/quicktime"].includes(mime)) {
    return ascii(4, "ftyp");
  }
  if (["video/webm", "audio/webm"].includes(mime)) {
    return [0x1a, 0x45, 0xdf, 0xa3].every((v, i) => bytes[i] === v);
  }
  if (mime === "audio/ogg") return ascii(0, "OggS");
  if (mime === "audio/mpeg") {
    return ascii(0, "ID3") || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  }
  return false;
};

export type InspectionRange = { start: number; end: number; partial: boolean };
export function parseInspectionRange(
  header: string | null,
  size: number,
  mime: string,
): InspectionRange {
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new InspectionMediaError(409, "unavailable_original");
  }
  const kind = inspectionMediaKind(mime);
  if (!kind) throw new InspectionMediaError(415, "unsupported_format");
  if (!header) {
    if (kind === "image" && size > INSPECTION_MAX_IMAGE_BYTES) {
      throw new InspectionMediaError(413, "unsupported_size");
    }
    const end = Math.min(
      size,
      kind === "image"
        ? INSPECTION_MAX_IMAGE_BYTES
        : INSPECTION_MAX_RANGE_BYTES,
    ) - 1;
    return { start: 0, end, partial: end < size - 1 };
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) {
    throw new InspectionMediaError(416, "invalid_range");
  }
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) {
      throw new InspectionMediaError(416, "invalid_range");
    }
    start = Math.max(0, size - Math.min(suffix, INSPECTION_MAX_RANGE_BYTES));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (
      !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      start >= size || end < start
    ) {
      throw new InspectionMediaError(416, "invalid_range");
    }
    end = Math.min(end, size - 1, start + INSPECTION_MAX_RANGE_BYTES - 1);
  }
  return { start, end, partial: true };
}

export const inspectionResponseHeaders = () =>
  new Headers({
    "Cache-Control": "private, no-store, max-age=0",
    "Pragma": "no-cache",
    "Vary": "Authorization, X-Inspection-Receipt, Range",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-site",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-inspection-receipt, range",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Expose-Headers":
      "Content-Range, Content-Length, Accept-Ranges",
  });

export async function readInspectionBytes(
  response: Response,
  expectedLength: number,
): Promise<Uint8Array> {
  if (
    !response.body || expectedLength <= 0 ||
    expectedLength > INSPECTION_MAX_IMAGE_BYTES
  ) {
    await response.body?.cancel();
    throw new InspectionMediaError(502, "origin_response_invalid");
  }
  const reader = response.body.getReader();
  const output = new Uint8Array(expectedLength);
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (length + value.length > expectedLength) {
        throw new InspectionMediaError(502, "origin_response_invalid");
      }
      output.set(value, length);
      length += value.length;
    }
    if (length !== expectedLength) {
      throw new InspectionMediaError(502, "origin_response_invalid");
    }
    return output;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export function validateInspectionOriginResponse(
  response: Response,
  start: number,
  end: number,
  size: number,
  mime: string,
  etag: string,
) {
  if (
    response.status !== 206 ||
    response.headers.get("content-range") !== `bytes ${start}-${end}/${size}` ||
    response.headers.get("content-length") !== String(end - start + 1) ||
    response.headers.get("content-type")?.split(";", 1)[0].trim()
        .toLowerCase() !== mime ||
    response.headers.get("etag") !== etag ||
    response.headers.get("content-encoding")
  ) {
    throw new InspectionMediaError(409, "stale_or_invalid_original");
  }
}

export type InspectionOriginal = {
  provider: string;
  bucket: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  // Server-only deadline from the retirement fence; never client supplied.
  originReadExpiresAt?: string;
};

/**
 * Transport only. The caller must first authenticate and resolve a currently
 * authorized, exact clean/provenanced binding. finalize must persist required
 * audit (with the exact-Owner view exception) and recheck that SAME source,
 * session, context and grant before this returns any bytes.
 * This buffers one bounded response: no authority is cached across requests.
 */
export async function deliverInspectionOriginal(input: {
  original: InspectionOriginal;
  range: string | null;
  signal: AbortSignal;
  origin: (
    binding: InspectionOriginal,
    method: "GET" | "HEAD",
    headers: Record<string, string>,
    signal: AbortSignal,
  ) => Promise<Response>;
  finalize: () => Promise<void>;
}): Promise<Response> {
  const { original } = input;
  const range = parseInspectionRange(
    input.range,
    original.sizeBytes,
    original.mimeType,
  );
  const signal = AbortSignal.any([
    input.signal,
    AbortSignal.timeout(INSPECTION_REQUEST_TIMEOUT_MS),
  ]);
  const head = await input.origin(original, "HEAD", {}, signal);
  const etag = head.headers.get("etag");
  if (
    head.status !== 200 || !etag || !/^"[^"\r\n]+"$/.test(etag) ||
    head.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !==
      original.mimeType ||
    head.headers.get("content-length") !== String(original.sizeBytes) ||
    head.headers.get("content-encoding")
  ) {
    await head.body?.cancel();
    throw new InspectionMediaError(409, "stale_or_invalid_original");
  }
  await head.body?.cancel();
  const readRange = async (start: number, end: number) => {
    const response = await input.origin(original, "GET", {
      range: `bytes=${start}-${end}`,
      "if-match": etag,
    }, signal);
    try {
      validateInspectionOriginResponse(
        response,
        start,
        end,
        original.sizeBytes,
        original.mimeType,
        etag,
      );
    } catch (error) {
      await response.body?.cancel();
      throw error;
    }
    return readInspectionBytes(response, end - start + 1);
  };
  // Every request, including a later nonzero range, verifies the header of the
  // same If-Match-protected original rather than trusting a MIME extension.
  const prefix = await readRange(0, Math.min(63, original.sizeBytes - 1));
  if (!matchesInspectionMediaSignature(original.mimeType, prefix)) {
    throw new InspectionMediaError(415, "unsupported_format");
  }
  const payload = range.start === 0 && range.end === prefix.length - 1
    ? prefix
    : await readRange(range.start, range.end);
  signal.throwIfAborted();
  await input.finalize();
  signal.throwIfAborted();
  const headers = inspectionResponseHeaders();
  headers.set("Content-Type", original.mimeType);
  headers.set("Content-Length", String(payload.length));
  headers.set("Accept-Ranges", "bytes");
  if (range.partial) {
    headers.set(
      "Content-Range",
      `bytes ${range.start}-${range.end}/${original.sizeBytes}`,
    );
  }
  return new Response(new Uint8Array(payload).buffer, {
    status: range.partial ? 206 : 200,
    headers,
  });
}
