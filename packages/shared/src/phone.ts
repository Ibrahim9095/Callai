/**
 * Azerbaijani phone number helpers (+994). Numbers are normalized to E.164.
 * Live PSTN routing requires a SIP-trunk provider (ADR-0004); this module only
 * validates/normalizes and detects the operator for display.
 */
export const AZ_COUNTRY_CODE = "+994";

/** Operator code (2 digits, trunk "0" removed) → operator name. */
export const AZ_OPERATORS: Record<string, string> = {
  "50": "Azercell",
  "51": "Azercell",
  "10": "Azercell",
  "55": "Bakcell",
  "99": "Bakcell",
  "70": "Nar",
  "77": "Nar",
  "60": "Naxtel / mobil",
  "12": "Bakı (şəhər)",
};

/** Strip formatting and convert to E.164 (+994XXXXXXXXX). Returns null if not AZ-valid. */
export function normalizeAzPhone(input: string): string | null {
  if (!input) return null;
  let digits = input.replace(/[^\d+]/g, "");

  if (digits.startsWith("+994")) digits = digits.slice(4);
  else if (digits.startsWith("994")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);

  digits = digits.replace(/\D/g, "");
  if (digits.length !== 9) return null; // AZ national number = 9 digits
  return `${AZ_COUNTRY_CODE}${digits}`;
}

export function isValidAzPhone(input: string): boolean {
  return normalizeAzPhone(input) !== null;
}

/** Operator name for an E.164 AZ number, or null. */
export function getAzOperator(e164: string): string | null {
  const n = normalizeAzPhone(e164);
  if (!n) return null;
  const code = n.slice(4, 6);
  return AZ_OPERATORS[code] || null;
}

/** Pretty format: +994 50 123 45 67 */
export function formatAzPhone(e164: string): string {
  const n = normalizeAzPhone(e164);
  if (!n) return e164;
  const d = n.slice(4);
  return `${AZ_COUNTRY_CODE} ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
}
