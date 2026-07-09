/**
 * Prompt composer — System Prompt (platform + business rules) + User Prompt (per-call).
 * Modular for v2.0 / Enterprise: swap sources without changing session code.
 *
 * CRITICAL: User Prompt is NEVER spoken aloud. It is a silent instruction only.
 * The spoken greeting is always `firstMessage` (Salamlama field / auto greeting).
 */

import { AZ_PREMIUM_STYLE, VOICE_RUNTIME_RULES } from "./prompt-style";

export interface PromptComposeInput {
  identityBlock: string;
  /** Admin "System Prompt" — durable business rules */
  systemPrompt: string;
  /** Admin "User Prompt" — silent per-call instruction (never TTS) */
  userPrompt?: string | null;
  /** Canonical spoken greeting already delivered via TTS */
  firstMessage?: string | null;
  persona: string;
  companyName: string;
}

export interface ComposedPrompt {
  /** Full prompt sent to the voice LLM */
  fullPrompt: string;
  /** Isolated user instruction (for contextual update / dynamic vars) */
  userInstruction: string | null;
}

/** True when text looks like a spoken greeting the admin mistyped into User Prompt. */
export function looksLikeSpokenGreeting(text: string | null | undefined): boolean {
  const t = String(text || "").trim().toLowerCase();
  if (t.length < 8) return false;
  if (/^salam\b/.test(t)) return true;
  if (/\bmən\b/.test(t) && /(yam|əm|am)\b/.test(t) && /\bbuyur/.test(t)) return true;
  if (/\b(leyayam|leylayam|samirəm|samirem)\b/.test(t)) return true;
  return false;
}

export function composeVoicePrompt(input: PromptComposeInput): ComposedPrompt {
  const system = (input.systemPrompt || "").trim();
  let user = (input.userPrompt || "").trim();
  const first = (input.firstMessage || "").trim();

  // If admin pasted a greeting into User Prompt, do not treat it as speech script.
  if (user && looksLikeSpokenGreeting(user)) {
    user = `Daxili qeyd (səslə OXUMA): admin əvvəl belə yazmışdı — «${user}». Bu mətn salamlama DEYİL. Salamlama artıq deyilib. Bundan sonra yalnız müştəriyə kömək et; özünü yenidən təqdim etmə.`;
  }

  const userBlock = user
    ? `
BU ZƏNG ÜÇÜN SƏSSİZ TƏLIMAT (User Prompt — səslə OXUMA, yalnız davranış):
${user}
`.trim()
    : null;

  const greetingLock = first
    ? `SALAMLAMA QƏTİ QAYDA:
- Zəngin ilk səsli cümləsi artıq deyilib: «${first}»
- User Prompt-u heç vaxt səslə oxuma.
- Özünü yenidən «Salam…», «mən …yam», «buyurun» ilə təqdim etmə — artıq salamlaşmısan.
- Növbəti cavabın birbaşa müştərinin sualına olsun. Yenidən adını demə.
- Qısa cavab: 1–2 cümlə.`
    : "User Prompt-u heç vaxt səslə oxuma. Salamlama yalnız platformanın firstMessage-idir.";

  const fullPrompt = [
    input.identityBlock,
    AZ_PREMIUM_STYLE,
    system ? `SİSTEM TƏLIMATI (System Prompt):\n${system}` : null,
    userBlock,
    greetingLock,
    VOICE_RUNTIME_RULES,
    `SƏNİN ADIN: «${input.persona}». ŞİRKƏT: «${input.companyName}». Başqa ad demə.`,
    "ZƏNGİ HEÇ VAXT KƏSMƏ. end_call YOXDUR. Salamdan sonra dinlə. Yalnız müştəri bitirir.",
    "Danışığı təbii Bakı call-center tempində apar — sözlər arasında süni uzun pauza qoyma.",
    "Cavablar QISA: 1–2 cümlə, aydın, peşəkar, yalnız Azərbaycan dili (Bakı).",
    "Tələffüz: əsl Bakı — türkcə söz və aksent QADAĞANDIR.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { fullPrompt, userInstruction: (input.userPrompt || "").trim() || null };
}
