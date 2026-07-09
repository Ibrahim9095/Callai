/**
 * Prompt composer — System Prompt (platform + business rules) + User Prompt (per-call).
 * Modular for v2.0 / Enterprise: swap sources without changing session code.
 */

import { AZ_PREMIUM_STYLE, VOICE_RUNTIME_RULES } from "./prompt-style";

export interface PromptComposeInput {
  identityBlock: string;
  /** Admin "System Prompt" — durable business rules */
  systemPrompt: string;
  /** Admin "User Prompt" — injected at the start of every conversation */
  userPrompt?: string | null;
  persona: string;
  companyName: string;
}

export interface ComposedPrompt {
  /** Full prompt sent to the voice LLM */
  fullPrompt: string;
  /** Isolated user instruction (for contextual update / dynamic vars) */
  userInstruction: string | null;
}

export function composeVoicePrompt(input: PromptComposeInput): ComposedPrompt {
  const system = (input.systemPrompt || "").trim();
  const user = (input.userPrompt || "").trim();

  const userBlock = user
    ? `
BU ZƏNG ÜÇÜN İSTİFADƏÇİ TƏLIMATI (User Prompt — indi yerinə yetir):
${user}
`.trim()
    : null;

  const fullPrompt = [
    input.identityBlock,
    AZ_PREMIUM_STYLE,
    system ? `SİSTEM TƏLIMATI (System Prompt):\n${system}` : null,
    userBlock,
    VOICE_RUNTIME_RULES,
    `SƏNİN ADIN: «${input.persona}». ŞİRKƏT: «${input.companyName}». Başqa ad demə.`,
    "ZƏNGİ HEÇ VAXT KƏSMƏ. end_call YOXDUR. Salamdan sonra dinlə. Yalnız müştəri bitirir.",
    "Danışığı təbii call-center tempində apar — sözlər arasında süni uzun pauza qoyma.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { fullPrompt, userInstruction: user || null };
}
