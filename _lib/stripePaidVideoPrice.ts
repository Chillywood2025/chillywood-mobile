/** Decimal USD input, never floating-point rounding or silent truncation. */
export function parseStripePaidVideoPrice(value: string): number | null {
  if (!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [dollars, cents = ""] = value.trim().split(".");
  const amount = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount >= 50 && amount <= 99999999 ? amount : null;
}
