/**
 * Operator display helpers for live calls (Azerbaijani).
 * "Leyla" → "Leyla xanım"; "Elnur" → "Elnur bəy".
 */

const FEMALE_NAMES = new Set(
  [
    "leyla", "aygun", "aygün", "gunel", "günel", "nigar", "sevil", "sevinc",
    "aysel", "aysəl", "narmin", "nərmin", "gunay", "günay", "lala", "lalə",
    "sabina", "kamala", "kamalə", "fatima", "fatimə", "maryam", "məryəm",
    "banu", "banü", "ulviyye", "ülviyyə", "ulviyyə", "mehriban", "zumrud",
    "zümrüd", "konul", "könül", "tarana", "təranə", "fidan", "gulnar", "gülnar",
    "gulnara", "gülnarə", "rena", "rena", "rena", "rena", "sofya", "anna",
    "marina", "elena", "nargiz", "nərgiz", "zumrud", "humay", "hümay",
  ].map((s) => s.toLowerCase()),
);

const MALE_NAMES = new Set(
  [
    "elvin", "elnur", "rasad", "rəşad", "rashad", "orxan", "orkhan", "tural",
    "kamran", "murad", "farid", "fərid", "ferid", "nijat", "nicat", "rufat",
    "rüfət", "babek", "babək", "anar", "vusala", "vusəl", "samir", "elchin",
    "elçin", "elcin", "javad", "cavad", "huseyn", "hüseyn", "ali", "əli",
    "ibrahim", "isa", "isa", "mahir", "nurlan", "tofig", "tofiq", "vusale",
  ].map((s) => s.toLowerCase()),
);

export type OperatorGender = "female" | "male" | "unknown";

export function inferOperatorGender(
  persona: string,
  voiceId?: string | null,
): OperatorGender {
  const p = (persona || "").trim().toLowerCase();
  if (/\bxanım\b|\bxanim\b|\bqadın\b|\bqizin\b/.test(p)) return "female";
  if (/\bbəy\b|\bbey\b|\bkişi\b|\bcənab\b/.test(p)) return "male";

  const first = p.split(/\s+/)[0]?.replace(/[^a-zəğıöüçşüiı]/gi, "") || "";
  const norm = first
    .replace(/ə/g, "e")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ç/g, "c")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g");

  if (FEMALE_NAMES.has(first) || FEMALE_NAMES.has(norm)) return "female";
  if (MALE_NAMES.has(first) || MALE_NAMES.has(norm)) return "male";

  const v = (voiceId || "").toLowerCase();
  if (v.includes("banu") || v.includes("female") || v.includes("woman")) return "female";
  if (v.includes("babek") || v.includes("babək") || v.includes("male") || v.includes("man")) {
    return "male";
  }
  // Default conversational premium voice used in PoC is female-leaning
  if (v.includes("eleven") || v.includes("agent_")) return "female";
  return "unknown";
}

/** "Leyla xanım" / "Elnur bəy" / "Leyla" */
export function formatOperatorDisplayName(
  persona: string,
  gender: OperatorGender,
): string {
  const raw = (persona || "").trim() || "Operator";
  // Strip existing honorifics to avoid "Leyla xanım xanım"
  const name = raw
    .replace(/\s+(xanım|xanim|bəy|bey|cənab|cenab)\s*$/i, "")
    .trim() || raw;
  if (gender === "female") return `${name} xanım`;
  if (gender === "male") return `${name} bəy`;
  return name;
}

/** Short role line for greeting, e.g. "otel resepşn operatoruyam" */
export function roleIntroduction(
  businessLabel: string,
  templateId?: string | null,
): string {
  const label = (businessLabel || "").trim() || "biznes";
  const map: Record<string, string> = {
    hotel: "otel resepşn operatoruyam",
    clinic: "klinika qeydiyyat operatoruyam",
    restaurant: "restoran operatoruyam",
    electronics: "elektronika mağazası satış operatoruyam",
    clothing_store: "geyim mağazası satış operatoruyam",
    pharmacy: "aptek operatoruyam",
    beauty_salon: "gözəllik salonu operatoruyam",
    education: "təhsil mərkəzi operatoruyam",
    auto_service: "avto servis operatoruyam",
  };
  if (templateId && map[templateId]) return map[templateId];
  return `${label} operatoruyam`;
}

/**
 * First words when the call connects:
 * "Salam, mən Leyla xanım. Otel resepşn operatoruyam. Buyurun, necə kömək edə bilərəm?"
 */
export function buildCallGreeting(opts: {
  persona: string;
  businessLabel: string;
  templateId?: string | null;
  voiceId?: string | null;
  customGreeting?: string | null;
}): string {
  const custom = (opts.customGreeting || "").trim();
  // Keep a carefully written custom greeting if it already introduces the role.
  if (custom.length >= 40 && /operator|resepşn|qeydiyyat|mağaza|restoran|otel|klinika/i.test(custom)) {
    return custom;
  }

  const gender = inferOperatorGender(opts.persona, opts.voiceId);
  const display = formatOperatorDisplayName(opts.persona || "Operator", gender);
  const role = roleIntroduction(opts.businessLabel, opts.templateId);
  return `Salam, mən ${display}. ${capitalize(role)}. Buyurun, necə kömək edə bilərəm?`;
}

function capitalize(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
