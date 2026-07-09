/**
 * Detect ElevenLabs Free-tier quota exhaustion so we can fall back to Edge TTS.
 * Recent conversations often terminate with "exceeds your quota limit".
 */

const ELEVEN_API = "https://api.elevenlabs.io/v1";

export function isQuotaErrorMessage(msg: string): boolean {
  const m = (msg || "").toLowerCase();
  return (
    /quota/i.test(m) ||
    /credits remaining/i.test(m) ||
    /exceeds your quota/i.test(m) ||
    /payment_required/i.test(m) ||
    /free_user.*limit/i.test(m)
  );
}

export const QUOTA_USER_MESSAGE_AZ =
  "ElevenLabs Free plan kreditləri bitib — zəng kəsilir. Pulsuz ehtiyat (Edge) ilə davam edirik. Tam ElevenLabs üçün hesabı yeniləyin və ya yeni API açarı əlavə edin.";

/** Returns false when the key is out of credits / recent calls failed on quota. */
export async function elevenLabsQuotaAvailable(apiKey: string): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (!apiKey) return { ok: false, reason: "ELEVENLABS_API_KEY yoxdur" };

  // 1) Recent conversations — fastest signal from live failures
  try {
    const res = await fetch(`${ELEVEN_API}/convai/conversations?page_size=5`, {
      headers: { "xi-api-key": apiKey },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        conversations?: Array<{ status?: string; termination_reason?: string; start_time_unix_secs?: number }>;
      };
      const recent = data.conversations || [];
      const now = Math.floor(Date.now() / 1000);
      const quotaHits = recent.filter(
        (c) =>
          isQuotaErrorMessage(c.termination_reason || "") &&
          (c.start_time_unix_secs || 0) > now - 60 * 60, // last hour
      );
      if (quotaHits.length >= 1) {
        return { ok: false, reason: quotaHits[0].termination_reason || "quota" };
      }
    }
  } catch {
    /* ignore — fall through to TTS probe */
  }

  // 2) Tiny TTS probe (1–2 chars) — definitive credit check
  try {
    const voice =
      process.env.ELEVENLABS_VOICE_ID_FEMALE ||
      process.env.ELEVENLABS_VOICE_ID ||
      "cgSgspJ2msm6clMCkdW9";
    const model = (process.env.ELEVENLABS_SPEAK_MODEL || "eleven_multilingual_v2").trim();
    const res = await fetch(`${ELEVEN_API}/text-to-speech/${voice}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: "Salam",
        model_id: model,
      }),
    });
    if (res.ok) return { ok: true };
    const err = await res.json().catch(() => ({}));
    const msg =
      (err as any)?.detail?.message ||
      (err as any)?.detail ||
      JSON.stringify(err);
    if (isQuotaErrorMessage(String(msg))) {
      return { ok: false, reason: String(msg) };
    }
    // Other errors (model access etc.) — still try Agents path
    return { ok: true, reason: `probe_non_quota:${res.status}` };
  } catch (e: any) {
    return { ok: true, reason: `probe_error:${e?.message || e}` };
  }
}
