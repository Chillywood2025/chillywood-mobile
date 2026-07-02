const PERCENT_ESCAPE_RUN_PATTERN = /(?:%[0-9A-Fa-f]{2})+/g;

export function decodeVisiblePercentEscapes(value: unknown): string {
  const text = String(value ?? "");
  if (!text.includes("%")) return text;

  return text.replace(PERCENT_ESCAPE_RUN_PATTERN, (encodedRun) => {
    try {
      return decodeURIComponent(encodedRun);
    } catch {
      return encodedRun;
    }
  });
}

export function maskEmailAddress(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text.includes("@")) return "";

  const [localPart, ...domainParts] = text.split("@");
  const domain = domainParts.join("@").trim().toLowerCase();
  const local = localPart.trim();
  if (!local || !domain) return "";

  return `${local.slice(0, 1)}***@${domain}`;
}
