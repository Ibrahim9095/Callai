/**
 * Operator identity — production catalog.
 *
 * Active operators today: Leyla (female) and Samir (male).
 * Catalog is data-driven so future operators can be added without rewriting call flow.
 * Never invent random names (Aygün, Kamran, etc.) at runtime.
 */

export type OperatorGender = "female" | "male";

export interface OperatorPreset {
  /** Stable id for APIs / future admin CRUD (e.g. "leyla"). */
  id: string;
  /** Display + spoken name (exact). */
  name: string;
  gender: OperatorGender;
  /** Default catalog voice for this operator (ElevenLabs v3 by default). */
  voiceProvider: "elevenlabs" | "openai" | "edge_neural" | "azure";
  voiceId: string;
  label: string;
}

/**
 * Active operator catalog. Extend this list (or load from DB later) to add operators
 * without changing greeting / session code paths.
 *
 * Voice IDs: ElevenLabs Bella (female) / Chris (male) — override via env on API.
 */
export const OPERATOR_CATALOG: readonly OperatorPreset[] = [
  {
    id: "leyla",
    name: "Leyla",
    gender: "female",
    voiceProvider: "elevenlabs",
    voiceId: "hpp4J3VqNfWAUOO0d1Us",
    label: "Leyla — qadın",
  },
  {
    id: "samir",
    name: "Samir",
    gender: "male",
    voiceProvider: "elevenlabs",
    voiceId: "iP95p4xoKVk53GoZ742B",
    label: "Samir — kişi",
  },
] as const;

export const DEFAULT_OPERATOR_ID = "leyla";

const BY_ID = new Map(OPERATOR_CATALOG.map((o) => [o.id, o]));
const BY_NAME = new Map(OPERATOR_CATALOG.map((o) => [o.name.toLowerCase(), o]));

export function listOperators(): OperatorPreset[] {
  return [...OPERATOR_CATALOG];
}

export function getOperatorById(id: string | null | undefined): OperatorPreset | null {
  if (!id) return null;
  return BY_ID.get(String(id).trim().toLowerCase()) || null;
}

export function getOperatorByName(name: string | null | undefined): OperatorPreset | null {
  if (!name) return null;
  const raw = String(name).trim().toLowerCase();
  return BY_NAME.get(raw) || getOperatorById(raw);
}

/** Resolve any stored persona string to a catalog operator (fallback: Leyla). */
export function resolveOperator(personaOrId: string | null | undefined): OperatorPreset {
  return (
    getOperatorByName(personaOrId) ||
    getOperatorById(personaOrId) ||
    getOperatorById(DEFAULT_OPERATOR_ID)!
  );
}

export function isAllowedOperatorName(name: string | null | undefined): boolean {
  return Boolean(getOperatorByName(name));
}

/** Exact spoken/display name from catalog — never rewrite to a random name. */
export function exactPersonaName(persona: string | null | undefined): string {
  return resolveOperator(persona).name;
}

export function extractPersonaName(persona: string): string {
  return exactPersonaName(persona);
}

export function inferOperatorGender(
  persona: string,
  _voiceId?: string | null,
): OperatorGender {
  return resolveOperator(persona).gender;
}

/** @deprecated Use exactPersonaName */
export function formatOperatorDisplayName(persona: string, _gender?: OperatorGender): string {
  return exactPersonaName(persona);
}

/** "Leylayam" / "Samirəm" — first-person present for greeting. */
export function operatorSelfForm(persona: string | null | undefined): string {
  const op = resolveOperator(persona);
  if (op.id === "leyla") return "Leylayam";
  if (op.id === "samir") return "Samirəm";
  // Future operators: "{Name}əm" / "{Name}yam" heuristic
  const n = op.name;
  const last = n.slice(-1).toLowerCase();
  if ("aeıioöuüə".includes(last)) return `${n}yam`;
  return `${n}əm`;
}

/**
 * Ablative for company/project name in greeting.
 * Spec examples: "Premium Auto Service-dən", "Moon Hoteldən", "ABC Klinikasından", "Fashion Store-dan"
 */
export function companyAblative(companyName: string): string {
  const name = String(companyName || "").trim() || "şirkət";
  if (/(dan|dən|tan|tən)$/i.test(name)) return name;

  // Known Azerbaijani endings — attach without hyphen
  if (/klinikası$/i.test(name)) return name.replace(/klinikası$/i, "Klinikasından");
  if (/klinika$/i.test(name)) return `${name}dan`;
  if (/otel$/i.test(name) || /hotel$/i.test(name)) return `${name}dən`;
  if (/mağaza$/i.test(name) || /servis$/i.test(name)) return `${name}dən`;

  const last = name.slice(-1).toLowerCase();
  const frontVowels = "eəiöü";
  // Multi-word / Latin brands: hyphen + -dən/-dan (matches Premium Auto Service / Fashion Store)
  if (/\s/.test(name) || /[A-Za-z]/.test(name)) {
    if (/\bstore\b/i.test(name) || /a$/i.test(name)) return `${name}-dan`;
    const useDen =
      frontVowels.includes(last) ||
      /e$/i.test(name) ||
      /\b(service|hotel|clinic)\b/i.test(name);
    return useDen ? `${name}-dən` : `${name}-dan`;
  }
  if ("aıou".includes(last)) return `${name}dan`;
  return `${name}dən`;
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
 * Production greeting — company + operator self-form.
 * Example: "Salam. Premium Auto Service-dən mən Samirəm. Buyurun, sizə necə kömək edə bilərəm?"
 */
export function buildCallGreeting(opts: {
  persona: string;
  businessLabel: string;
  templateId?: string | null;
  voiceId?: string | null;
  customGreeting?: string | null;
  projectName?: string | null;
  /** Preferred company/brand name; defaults to projectName then businessLabel. */
  companyName?: string | null;
}): string {
  const op = resolveOperator(opts.persona);
  const company = (
    opts.companyName ||
    opts.projectName ||
    opts.businessLabel ||
    ""
  ).trim();

  const custom = (opts.customGreeting || "").trim();
  if (custom.length >= 8 && custom.toLowerCase().includes(op.name.toLowerCase())) {
    return custom.replace(/\s+/g, " ").trim();
  }

  const from = company ? `${companyAblative(company)} ` : "";
  const self = operatorSelfForm(op.name);
  return `Salam. ${from}mən ${self}. Buyurun, sizə necə kömək edə bilərəm?`;
}

export function buildIdentityPrompt(opts: {
  persona: string;
  businessLabel: string;
  templateId?: string | null;
  voiceId?: string | null;
  projectName?: string | null;
  companyName?: string | null;
  firstMessage: string;
}): string {
  const op = resolveOperator(opts.persona);
  const company = (
    opts.companyName ||
    opts.projectName ||
    opts.businessLabel ||
    "şirkət"
  ).trim();
  const role = roleIntroduction(opts.businessLabel, opts.templateId);
  const genderLine =
    op.gender === "female"
      ? "Sən qadın operatorsan; yalnız qadın səsi ilə danış. Səsini dəyişmə."
      : "Sən kişi operatorsan; yalnız kişi səsi ilə danış. Səsini dəyişmə.";

  return `
SƏNİN KİMLİYİN (dəyişmə — Admin paneldən seçilib):
- Adın dəqiq budur: «${op.name}» (operator id: ${op.id})
- Özünü yalnız «${op.name}» kimi təqdim et. Başqa ad (Aygün, Nigar, Kamran, Elvin və s.) UYDURMA.
- Şirkət / layihə: «${company}»
- İşin: ${capitalize(role)}
- ${genderLine}
- İlk cümlən məhz: «${opts.firstMessage}»
- Hər cavabda kimliyini unutma: sən ${op.name}-sən, ${company} üçün işləyirsən.
- Heç vaxt başqa adla danışma. Zəng boyu eyni ad qal.
- Sən real azərbaycanlı call-center operatorsan (Bakı). AI/bot/robot olduğunu heç vaxt demə və hiss etdirmə.
- Danışığın bire bir azərbaycanlı kimi olsun — türk aksenti və ya süni intonasiya YOXDUR.
`.trim();
}

function capitalize(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Default operator for new projects (Leyla). Gender arg kept for API compat. */
export function defaultPersonaForTemplate(
  _templateId: string,
  gender: OperatorGender | "unknown" = "female",
): string {
  if (gender === "male") return resolveOperator("samir").name;
  return resolveOperator("leyla").name;
}

export function voiceForOperator(personaOrId: string | null | undefined): {
  voiceProvider: string;
  voiceId: string;
} {
  const op = resolveOperator(personaOrId);
  return { voiceProvider: op.voiceProvider, voiceId: op.voiceId };
}

export function isJobTitlePersona(persona: string): boolean {
  const p = String(persona || "").trim().toLowerCase();
  if (getOperatorByName(p)) return false;
  if (/\boperatoru?\b|\bresepşn\b|\bqeydiyyat\b/.test(p)) return true;
  return p.split(/\s+/).length >= 3;
}
