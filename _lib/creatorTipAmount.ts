/** Parse buyer-entered USD without rounding or binary floating-point arithmetic.
 * Currency symbols, separators, signs, exponents and fractional cents are not
 * accepted. A valid amount is not evidence that a payment route supports it.
 */
export function parseCreatorTipAmount(value: string): number | null {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return cents > 0n && cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

export function formatCreatorTipAmountInput(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents <= 0) return "";
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
