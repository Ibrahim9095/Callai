/**
 * Operator display helpers for live calls (Azerbaijani).
 * "Leyla" → "Leyla xanım"; "Tahir" → "Tahir bəy".
 */

const FEMALE_NAMES = new Set(
  [
    "leyla", "aygun", "aygün", "gunel", "günel", "nigar", "sevil", "sevinc",
    "aysel", "aysəl", "narmin", "nərmin", "gunay", "günay", "lala", "lalə",
    "sabina", "kamala", "kamalə", "fatima", "fatimə", "maryam", "məryəm",
    "banu", "ulviyye", "ülviyyə", "ulviyyə", "mehriban", "zumrud", "zümrüd",
    "konul", "könül", "tarana", "təranə", "fidan", "gulnar", "gülnar",
    "gulnara", "gülnarə", "rena", "sofya", "anna", "marina", "elena",
    "nargiz", "nərgiz", "humay", "hümay", "aysu", "aysu", "gunel", "seide",
    "səidə", "seide", "dilare", "dilarə", "afag", "afaq", "tunzale", "tünzalə",
  ].map((s) => s.toLowerCase()),
);

const MALE_NAMES = new Set(
  [
    "elvin", "elnur", "rasad", "rəşad", "rashad", "orxan", "orkhan", "tural",
    "kamran", "murad", "farid", "fərid", "ferid", "nijat", "nicat", "rufat",
    "rüfət", "babek", "babək", "anar", "samir", "elchin", "elçin", "elcin",
    "javad", "cavad", "huseyn", "hüseyn", "ali", "əli", "ibrahim", "isa",
    "mahir", "nurlan", "tofig", "tofiq", "tahir", "tahır", "vusale", "rasim",
    "rasim", "elshan", "elşən", "elsad", "elşad", "fuad", "kenan", "kənan",
    "resad", "rəşad", "zahir", "zahid", "namig", "namiq", "qabil", "qurban",
    "ilkin", "ilham", "ramil", "ramiz", "sadiq", "sadıq", "vusale", "emil",
    "david", "john", "ahmad", "əhməd", "ahmed", "mehman", "mehman",
  ].map((s) => s.toLowerCase()),
);

export type OperatorGender = "female" | "male" | "unknown";

function normalizeAz(s: string): string {
  return s
    .toLowerCase()
    .replace(/ə/g, "e")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ç/g, "c")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g");
}

/** First personal name token from persona ("Tahir bəy" → "Tahir"). */
export function extractPersonaName(persona: string): string {
  const raw = (persona || "").trim() || "Operator";
  return (
    raw
      .replace(/\s+(xanım|xanim|bəy|bey|cənab|cenab)\s*$/i, "")
      .trim()
      .split(/\s+/)[0] || raw
  );
}

export function inferOperatorGender(
  persona: string,
  voiceId?: string | null,
): OperatorGender {
  const p = (persona || "").trim().toLowerCase();
  if (/\bxanım\b|\bxanim\b|\bqadın\b/.test(p)) return "female";
  if (/\bbəy\b|\bbey\b|\bkişi\b|\bcənab\b/.test(p)) return "male";

  const first = extractPersonaName(persona)
    .toLowerCase()
    .replace(/[^a-zəğıöüçşüiı]/gi, "");
  const norm = normalizeAz(first);

  if (FEMALE_NAMES.has(first) || FEMALE_NAMES.has(norm)) return "female";
  if (MALE_NAMES.has(first) || MALE_NAMES.has(norm)) return "male";

  // Heuristic: many AZ male names end with these; female with a/ə often — weak, skip.

  const v = (voiceId || "").toLowerCase();
  if (v.includes("banu") || v.includes("female") || v.includes("woman")) return "female";
  if (v.includes("babek") || v.includes("babək") || v.includes("male")) return "male";
  // Do NOT assume ElevenLabs default voice gender — persona name wins when known.
  return "unknown";
}

/** "Leyla xanım" / "Tahir bəy" / "Leyla" */
export function formatOperatorDisplayName(
  persona: string,
  gender: OperatorGender,
): string {
  const name = extractPersonaName(persona) || "Operator";
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
 * First words when the call connects — always reflects CURRENT persona name.
 * Custom greeting is used only if it already contains the current name.
 */
export function buildCallGreeting(opts: {
  persona: string;
  businessLabel: string;
  templateId?: string | null;
  voiceId?: string | null;
  customGreeting?: string | null;
  projectName?: string | null;
}): string {
  const gender = inferOperatorGender(opts.persona, opts.voiceId);
  const display = formatOperatorDisplayName(opts.persona || "Operator", gender);
  const name = extractPersonaName(opts.persona);
  const role = roleIntroduction(opts.businessLabel, opts.templateId);
  const place = (opts.projectName || opts.businessLabel || "").trim();

  const custom = (opts.customGreeting || "").trim();
  // Only keep custom if it mentions the current operator name (so Leyla→Tahir updates).
  if (
    custom.length >= 20 &&
    name &&
    custom.toLowerCase().includes(name.toLowerCase())
  ) {
    return custom;
  }

  const where = place ? `${place}-dən ` : "";
  return `Salam, ${where}mən ${display}. ${capitalize(role)}. Buyurun, necə kömək edə bilərəm?`;
}

/** Identity block injected at the top of the live system prompt. */
export function buildIdentityPrompt(opts: {
  persona: string;
  businessLabel: string;
  templateId?: string | null;
  voiceId?: string | null;
  projectName?: string | null;
  firstMessage: string;
}): string {
  const gender = inferOperatorGender(opts.persona, opts.voiceId);
  const display = formatOperatorDisplayName(opts.persona || "Operator", gender);
  const name = extractPersonaName(opts.persona);
  const role = roleIntroduction(opts.businessLabel, opts.templateId);
  const genderLine =
    gender === "female"
      ? "Sən qadın operatorsan; özünə «xanım» de."
      : gender === "male"
        ? "Sən kişi operatorsan; özünə «bəy» de."
        : "Cinsiyyətinə uyğun xitab et.";

  return `
SƏNİN KİMLİYİN (dəyişmə — bu ən vacibdir):
- Adın: ${name}
- Özünü belə təqdim et: ${display}
- İşin: ${capitalize(role)}
- Layihə / yer: ${opts.projectName || opts.businessLabel || "biznes"}
- ${genderLine}
- İlk salamlaman: «${opts.firstMessage}»
- Heç vaxt başqa adla (məs. köhnə adla) danışma. Yalnız «${name}» / «${display}».
`.trim();
}

function capitalize(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
