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

/**
 * Broad “tell me about the hotel / give info” — must open the whole sheet,
 * not fail because the word «otel» is not inside a cell.
 */
export const OVERVIEW_INTENT = new Set([
  "otel",
  "hotel",
  "haqqinda",
  "haqqında",
  "melumat",
  "məlumat",
  "etrafli",
  "ətraflı",
  "umumi",
  "ümumi",
  "info",
  "about",
  "nezaret",
  "bax",
  "goster",
  "göstər",
  "siyahi",
  "siyahı",
  "cedvel",
  "cədvəl",
  "fayl",
  "vereq",
  "vərəq",
]);

/** Tokens that carry no search meaning (AZ filler / request words). */
export const SEARCH_STOPWORDS = new Set([
  "bir",
  "saniye",
  "saniyə",
  "zehmet",
  "zəhmət",
  "olmasa",
  "verin",
  "ver",
  "deyin",
  "de",
  "haqqinda",
  "haqqında",
  "etrafli",
  "ətraflı",
  "melumat",
  "məlumat",
  "umumi",
  "ümumi",
  "men",
  "mən",
  "siz",
  "bu",
  "o",
  "ve",
  "və",
  "ile",
  "ilə",
  "ucun",
  "üçün",
  "nece",
  "necə",
  "nedir",
  "nədir",
  "var",
  "yox",
  "mi",
  "mı",
  "ki",
  "da",
  "də",
  "please",
  "the",
  "a",
  "an",
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

/** Drop filler words so «otel haqqında ətraflı məlumat» → meaningful tokens. */
export function contentSearchTokens(tokens: string[]): string[] {
  return tokens.filter((t) => t.length > 1 && !SEARCH_STOPWORDS.has(t));
}

export function isPriceIntent(tokens: string[]): boolean {
  return tokens.some((t) => PRICE_INTENT.has(t));
}

export function isRoomIntent(tokens: string[]): boolean {
  return tokens.some((t) => ROOM_INTENT.has(t));
}

export function isOverviewIntent(tokens: string[]): boolean {
  return tokens.some((t) => OVERVIEW_INTENT.has(t));
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
  "haqqında",
  "ətraflı",
  "məlumat",
  "saatlıq",
  "gecəlik",
  "günlük",
  "nömrə",
  "soyad",
  "telefon",
  "iyul",
  "avqust",
  "sentyabr",
] as const;
