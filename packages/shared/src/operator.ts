/**
 * Operator helpers — persona is EXACTLY what the operator typed in the panel.
 * UI and greeting never invent "xanım"/"bəy" or a default name like Leyla.
 * Gender is only used to pick male/female voice + prompt tone.
 */

const FEMALE_NAMES = new Set(
  [
    "leyla", "aygun", "aygün", "gunel", "günel", "nigar", "sevil", "sevinc",
    "aysel", "aysəl", "narmin", "nərmin", "gunay", "günay", "lala", "lalə",
    "sabina", "kamala", "kamalə", "fatima", "fatimə", "maryam", "məryəm",
    "banu", "ulviyye", "ülviyyə", "mehriban", "zumrud", "zümrüd", "konul",
    "könül", "tarana", "təranə", "fidan", "gulnar", "gülnar", "gulnara",
    "gülnarə", "rena", "sofya", "anna", "marina", "elena", "nargiz", "nərgiz",
    "humay", "hümay", "aysu", "səidə", "seide", "dilarə", "dilare", "afaq",
  ].map((s) => s.toLowerCase()),
);

const MALE_NAMES = new Set(
  [
    "elvin", "elnur", "rasad", "rəşad", "rashad", "orxan", "orkhan", "tural",
    "kamran", "murad", "farid", "fərid", "ferid", "nijat", "nicat", "rufat",
    "rüfət", "babek", "babək", "anar", "samir", "elchin", "elçin", "elcin",
    "javad", "cavad", "huseyn", "hüseyn", "ali", "əli", "ibrahim", "isa",
    "mahir", "nurlan", "tofig", "tofiq", "tahir", "tahır", "rasim", "elshan",
    "elşən", "elsad", "elşad", "fuad", "kenan", "kənan", "zahir", "zahid",
    "namig", "namiq", "ilkin", "ilham", "ramil", "ramiz", "sadiq", "sadıq",
    "emil", "ahmad", "əhməd", "ahmed", "mehman", "orkhan",
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

/** Exact trimmed persona as typed — never rewrite. */
export function exactPersonaName(persona: string | null | undefined): string {
  const raw = String(persona ?? "").trim();
  return raw || "Operator";
}

/** First token for gender lookup only (strips trailing honorific if user typed it). */
export function extractPersonaName(persona: string): string {
  return exactPersonaName(persona)
    .replace(/\s+(xanım|xanim|bəy|bey|cənab|cenab)\s*$/i, "")
    .trim()
    .split(/\s+/)[0] || "";
}

export function inferOperatorGender(
  persona: string,
  voiceId?: string | null,
): OperatorGender {
  const p = exactPersonaName(persona).toLowerCase();
  if (/\bxanım\b|\bxanim\b|\bqadın\b/.test(p)) return "female";
  if (/\bbəy\b|\bbey\b|\bkişi\b|\bcənab\b/.test(p)) return "male";

  const first = extractPersonaName(persona).toLowerCase().replace(/[^a-zəğıöüçşüiı]/gi, "");
  if (first) {
    const norm = normalizeAz(first);
    if (FEMALE_NAMES.has(first) || FEMALE_NAMES.has(norm)) return "female";
    if (MALE_NAMES.has(first) || MALE_NAMES.has(norm)) return "male";
  }

  const v = (voiceId || "").toLowerCase();
  if (v.includes("banu") || v.includes("female")) return "female";
  if (v.includes("babek") || v.includes("babək") || v.includes("male")) return "male";
  return "unknown";
}

/**
 * @deprecated Use exactPersonaName — call UI must show the typed name only.
 * Kept for compatibility; returns exact name WITHOUT xanım/bəy.
 */
export function formatOperatorDisplayName(persona: string, _gender?: OperatorGender): string {
  return exactPersonaName(persona);
}

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
 * Greeting uses EXACT persona (Kamran / İbrahim / Leyla) — no auto honorific.
 * Ignores stale custom greeting that mentions a different name.
 */
export function buildCallGreeting(opts: {
  persona: string;
  businessLabel: string;
  templateId?: string | null;
  voiceId?: string | null;
  customGreeting?: string | null;
  projectName?: string | null;
}): string {
  const name = exactPersonaName(opts.persona);
  const role = roleIntroduction(opts.businessLabel, opts.templateId);
  const place = (opts.projectName || opts.businessLabel || "").trim();

  const custom = (opts.customGreeting || "").trim();
  // Keep custom only if it clearly contains THIS exact name (case-insensitive)
  if (custom.length >= 12 && custom.toLowerCase().includes(name.toLowerCase())) {
    return custom;
  }

  const where = place ? `${place}-dən ` : "";
  return `Salam, ${where}mən ${name}. ${capitalize(role)}. Buyurun, necə kömək edə bilərəm?`;
}

export function buildIdentityPrompt(opts: {
  persona: string;
  businessLabel: string;
  templateId?: string | null;
  voiceId?: string | null;
  projectName?: string | null;
  firstMessage: string;
}): string {
  const name = exactPersonaName(opts.persona);
  const gender = inferOperatorGender(opts.persona, opts.voiceId);
  const role = roleIntroduction(opts.businessLabel, opts.templateId);
  const genderLine =
    gender === "female"
      ? "Sən qadın operatorsan; qadın səsi ilə danış."
      : gender === "male"
        ? "Sən kişi operatorsan; kişi səsi ilə danış."
        : "Paneldə seçilmiş səslə danış.";

  return `
SƏNİN ADIN (dəyişmə — panelden əl ilə yazılıb):
- Adın dəqiq budur: «${name}»
- Özünü yalnız «${name}» kimi təqdim et. «Leyla», «xanım», «bəy» və ya başqa ad UYDURMA.
- İşin: ${capitalize(role)}
- Layihə: ${opts.projectName || opts.businessLabel || "biznes"}
- ${genderLine}
- İlk cümlən məhz: «${opts.firstMessage}»
- Heç vaxt başqa adla danışma.
`.trim();
}

function capitalize(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function defaultPersonaForTemplate(
  _templateId: string,
  gender: OperatorGender = "female",
): string {
  return gender === "male" ? "Kamran" : "Leyla";
}

export function isJobTitlePersona(persona: string): boolean {
  const p = exactPersonaName(persona).toLowerCase();
  if (/\boperatoru?\b|\bresepşn\b|\bqeydiyyat\b/.test(p)) return true;
  return p.split(/\s+/).length >= 3;
}
