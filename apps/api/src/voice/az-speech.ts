/**
 * AZ speech / search helpers — fix common ASR mishears and intent synonyms.
 * Example: customer says «qiymət» → STT often writes «niymet»; «qol» → «kol».
 */

/** Common ASR mis-transcriptions → canonical AZ tokens (already normalize()-safe). */
export const AZ_ASR_ALIASES: Record<string, string[]> = {
  // qiymət (+ common ASR / case endings)
  qiymet: ["qiymet", "niymet", "qimet", "qiymeti", "niymeti", "price", "mebleg"],
  qiymeti: ["qiymet", "niymet", "qimet", "qiymeti", "niymeti", "price", "mebleg"],
  niymet: ["qiymet", "niymet", "qimet", "qiymeti", "niymeti"],
  niymeti: ["qiymet", "niymet", "qimet", "qiymeti", "niymeti"],
  qimet: ["qiymet", "niymet", "qiymeti"],
  // qol / qol saatı
  qol: ["qol", "kol", "gol"],
  kol: ["qol", "kol"],
  // otaq
  otaq: ["otaq", "otag", "otaqi", "room"],
  otag: ["otaq", "otag"],
  otaqi: ["otaq", "otag", "otaqi", "room"],
  // rezerv
  rezerv: ["rezerv", "reserve", "reservation", "bron"],
  // manat
  manat: ["manat", "azn", "manati"],
  // standart / deluxe
  standart: ["standart", "standard"],
  deluxe: ["deluxe", "deluks", "luks"],
  suite: ["suite", "syuit", "suit"],
  aile: ["aile", "family"],
};

/** Intent words that mean "show prices / rates" even if not in cell text. */
export const PRICE_INTENT = new Set([
  "qiymet",
  "qiymeti",
  "niymet",
  "niymeti",
  "qimet",
  "price",
  "mebleg",
  "gecelik",
  "ucuz",
  "bahali",
  "tarif",
]);

/** Intent words that mean "rooms / availability". */
export const ROOM_INTENT = new Set([
  "otaq",
  "otag",
  "room",
  "nomre",
  "boş",
  "bos",
  "movcud",
]);

export function expandSearchTokens(tokens: string[]): string[] {
  const out = new Set<string>();
  for (const t of tokens) {
    if (!t) continue;
    out.add(t);
    const aliases = AZ_ASR_ALIASES[t];
    if (aliases) for (const a of aliases) out.add(a);
  }
  return [...out];
}

export function isPriceIntent(tokens: string[]): boolean {
  return tokens.some((t) => PRICE_INTENT.has(t));
}

export function isRoomIntent(tokens: string[]): boolean {
  return tokens.some((t) => ROOM_INTENT.has(t));
}

/** Field key/label looks like a price column. */
export function looksLikePriceField(key: string, label = ""): boolean {
  const s = `${key} ${label}`.toLowerCase();
  return /qiymet|price|mebleg|cemi|total|azn|gecelik|tarif/.test(s);
}

/** Default ASR keyword boost list for Azerbaijani call-center. */
export const AZ_ASR_KEYWORDS = [
  "Bakı",
  "Azərbaycan",
  "manat",
  "AZN",
  "qiymət",
  "qiymeti",
  "niymət",
  "gecəlik",
  "sifariş",
  "rezerv",
  "rezervasiya",
  "buyurun",
  "əlbəttə",
  "xahiş",
  "bir saniyə",
  "zəhmət olmasa",
  "necəsiz",
  "bilərəm",
  "qol",
  "qol saatı",
  "kol",
  "həkim",
  "klinika",
  "müştəri",
  "gözəllik",
  "otel",
  "otaq",
  "otağı",
  "standart",
  "deluxe",
  "suite",
  "ailə",
  "endirim",
  "sağ olun",
  "təşəkkür",
  "aydındır",
  "başa düşdüm",
  "narahat olmayın",
  "boş",
  "mövcud",
  "giriş",
  "çıxış",
] as const;
