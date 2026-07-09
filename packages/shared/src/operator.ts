/**
 * Operator display helpers for live calls (Azerbaijani).
 * Manual control: persona name is what the operator typed (Leyla / Kamran).
 * Gender follows the name first, then the selected voice catalog.
 */

const FEMALE_NAMES = new Set(
  [
    "leyla", "aygun", "aygün", "gunel", "günel", "nigar", "sevil", "sevinc",
    "aysel", "aysəl", "narmin", "nərmin", "gunay", "günay", "lala", "lalə",
    "sabina", "kamala", "kamalə", "fatima", "fatimə", "maryam", "məryəm",
    "banu", "ulviyye", "ülviyyə", "ulviyyə", "mehriban", "zumrud", "zümrüd",
    "konul", "könül", "tarana", "təranə", "fidan", "gulnar", "gülnar",
    "gulnara", "gülnarə", "rena", "sofya", "anna", "marina", "elena",
    "nargiz", "nərgiz", "humay", "hümay", "aysu", "səidə", "seide",
    "dilarə", "dilare", "afaq", "afag", "tünzalə", "tunzale",
  ].map((s) => s.toLowerCase()),
);

const MALE_NAMES = new Set(
  [
    "elvin", "elnur", "rasad", "rəşad", "rashad", "orxan", "orkhan", "tural",
    "kamran", "murad", "farid", "fərid", "ferid", "nijat", "nicat", "rufat",
    "rüfət", "babek", "babək", "anar", "samir", "elchin", "elçin", "elcin",
    "javad", "cavad", "huseyn", "hüseyn", "ali", "əli", "ibrahim", "isa",
    "mahir", "nurlan", "tofig", "tofiq", "tahir", "tahır", "rasim",
    "elshan", "elşən", "elsad", "elşad", "fuad", "kenan", "kənan",
    "zahir", "zahid", "namig", "namiq", "qabil", "ilkin", "ilham",
    "ramil", "ramiz", "sadiq", "sadıq", "emil", "ahmad", "əhməd", "ahmed",
    "mehman", "orkhan", "vusale",
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

/** True if persona looks like a job title, not a personal name. */
export function isJobTitlePersona(persona: string): boolean {
  const p = (persona || "").trim().toLowerCase();
  if (!p) return true;
  if (/\boperatoru?\b|\bresepşn\b|\bqeydiyyat\b|\bservis\b|\bmağaza\b/.test(p)) return true;
  if (p.split(/\s+/).length >= 3) return true;
  return false;
}

/** First personal name token from persona ("Kamran bəy" → "Kamran"). */
export function extractPersonaName(persona: string): string {
  const raw = (persona || "").trim() || "Operator";
  if (isJobTitlePersona(raw)) return "";
  return (
    raw
      .replace(/\s+(xanım|xanim|bəy|bey|cənab|cenab)\s*$/i, "")
      .trim()
      .split(/\s+/)[0] || ""
  );
}

/**
 * Gender: 1) explicit honorific in persona, 2) known first name,
 * 3) selected voice catalog, 4) unknown.
 * Never invent a name — only classify what the operator typed.
 */
export function inferOperatorGender(
  persona: string,
  voiceId?: string | null,
): OperatorGender {
  const p = (persona || "").trim().toLowerCase();
  if (/\bxanım\b|\bxanim\b|\bqadın\b/.test(p)) return "female";
  if (/\bbəy\b|\bbey\b|\bkişi\b|\bcənab\b/.test(p)) return "male";

  const first = extractPersonaName(persona).toLowerCase().replace(/[^a-zəğıöüçşüiı]/gi, "");
  if (first) {
    const norm = normalizeAz(first);
    if (FEMALE_NAMES.has(first) || FEMALE_NAMES.has(norm)) return "female";
    if (MALE_NAMES.has(first) || MALE_NAMES.has(norm)) return "male";
  }

  const v = (voiceId || "").toLowerCase();
  if (v.includes("banu") || v.includes("female") || v.includes("woman")) return "female";
  if (v.includes("babek") || v.includes("babək") || v.includes("male") || v.includes("man")) {
    return "male";
  }
  return "unknown";
}

/**
 * Display on call screen. If persona is a job title, show it as-is (no fake name).
 * If personal name: "Leyla xanım" / "Kamran bəy".
 */
export function formatOperatorDisplayName(
  persona: string,
  gender: OperatorGender,
): string {
  const raw = (persona || "").trim() || "Operator";
  if (isJobTitlePersona(raw)) return raw;
  const name = extractPersonaName(raw) || raw;
  if (gender === "female") return `${name} xanım`;
  if (gender === "male") return `${name} bəy`;
  return name;
}

/** Short role line for greeting */
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
 * Greeting always uses the CURRENT manual persona.
 * Custom greeting kept only if it already contains the current personal name.
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
  if (custom.length >= 20 && name && custom.toLowerCase().includes(name.toLowerCase())) {
    return custom;
  }

  const where = place ? `${place}-dən ` : "";
  return `Salam, ${where}mən ${display}. ${capitalize(role)}. Buyurun, necə kömək edə bilərəm?`;
}

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
  const name = extractPersonaName(opts.persona) || display;
  const role = roleIntroduction(opts.businessLabel, opts.templateId);
  const genderLine =
    gender === "female"
      ? "Sən qadın operatorsan; səsin və xitabın qadın olmalıdır (xanım)."
      : gender === "male"
        ? "Sən kişi operatorsan; səsin və xitabın kişi olmalıdır (bəy)."
        : "Cinsiyyətinə uyğun xitab et.";

  return `
SƏNİN KİMLİYİN (operator panelindən əl ilə təyin olunub — dəyişmə):
- Adın / persona: ${opts.persona || "Operator"}
- Özünü belə təqdim et: ${display}
- İşin: ${capitalize(role)}
- Layihə: ${opts.projectName || opts.businessLabel || "biznes"}
- ${genderLine}
- İlk salamlaman məhz budur: «${opts.firstMessage}»
- Başqa ad uydurma. Yalnız paneldə yazılan persona ilə danış.
`.trim();
}

function capitalize(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Suggested default personal name when creating a project (operator can change). */
export function defaultPersonaForTemplate(templateId: string, gender: OperatorGender = "female"): string {
  if (gender === "male") return "Kamran";
  return "Leyla";
}
