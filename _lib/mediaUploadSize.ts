const exactPositiveSafeInteger = (value: unknown) => (
  typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null
);

export async function resolveMediaUploadSizeBytes(input: {
  providedSizeBytes?: number | null;
  readSizeBytes: () => Promise<unknown>;
  maximumSizeBytes?: number | null;
  tooLargeMessage?: string;
}): Promise<number> {
  const provided = exactPositiveSafeInteger(input.providedSizeBytes);
  let resolved = provided;
  if (resolved === null) {
    try {
      resolved = exactPositiveSafeInteger(await input.readSizeBytes());
    } catch {
      resolved = null;
    }
  }

  if (resolved === null) {
    throw new Error("Media file size could not be verified before upload.");
  }

  const maximum = exactPositiveSafeInteger(input.maximumSizeBytes);
  if (maximum !== null && resolved > maximum) {
    throw new Error(input.tooLargeMessage || "This media file is too large to upload.");
  }
  return resolved;
}
