/**
 * CallAI live call — ElevenLabs v3 Conversational (WebSocket signed URL).
 *
 * Prefer websocket over LiveKit WebRTC: after first_message the agent can leave
 * the LiveKit room and DataChannel errors kill the session. WebSocket stays up
 * until the user hangs up.
 *
 * Speech: eleven_v3_conversational + az language + Bakı dialect prompts.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Conversation } from "@elevenlabs/client";
import { api, getToken } from "@/lib/api";

const TOOL_NAMES = [
  "list_collections",
  "search_records",
  "create_record",
  "update_record",
] as const;

type Phase =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "tool"
  | "live"
  | "error";

type Line = { id: string; role: "user" | "assistant" | "system"; text: string };
type ToolRow = {
  id: string;
  name: string;
  status: "running" | "done" | "error";
  args?: Record<string, unknown>;
};

const STATUS_LABELS: Record<Phase, string> = {
  idle: "Hazır",
  connecting: "Zəng bağlanır…",
  listening: "Dinləyir…",
  thinking: "Bir saniyə…",
  speaking: "Danışır…",
  tool: "Yoxlayır…",
  live: "Xəttdəsiniz — danışın",
  error: "Xəta",
};

/**
 * Barge-in: mic stays OPEN while the operator speaks so ElevenLabs can
 * hear the caller and stop TTS. Local gate only tracks speech for UI.
 */
const BARGE_IN_GATE = {
  speechLevelThreshold: 0.12,
  speechHoldMs: 180,
  silenceReleaseMs: 220,
  vadScoreThreshold: 0.45,
} as const;

/** Louder playback — real phone-operator presence */
const PLAYBACK_VOLUME = 1.45;

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function errMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as { message?: string; error?: string; reason?: string };
    return e.message || e.error || e.reason || JSON.stringify(err).slice(0, 200);
  }
  return "Naməlum xəta";
}

function isSoftVoiceError(message: string): boolean {
  const m = (message || "").trim();
  if (!m || m === "{}" || m === "[object Object]") return true;
  return (
    /unknown error/i.test(m) ||
    /error_type/i.test(m) ||
    /datachannel/i.test(m) ||
    /^server error:\s*unknown error/i.test(m) ||
    /^server error:\s*\{\s*\}$/i.test(m)
  );
}

function labelTool(name: string) {
  const map: Record<string, string> = {
    list_collections: "Kolleksiyalar",
    search_records: "Axtarış",
    create_record: "Yazı yaratma",
    update_record: "Yazı yeniləmə",
  };
  return map[name] || name;
}

export default function TestCallPage() {
  const router = useRouter();
  const { id: pid } = useParams<{ id: string }>();

  const [projectName, setProjectName] = useState("");
  const [businessLabel, setBusinessLabel] = useState("");
  const [operatorName, setOperatorName] = useState("Operator");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [tools, setTools] = useState<ToolRow[]>([]);
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [engineLabel, setEngineLabel] = useState("elevenlabs");
  const [modelLabel, setModelLabel] = useState("");
  const [connected, setConnected] = useState(false);

  const logRef = useRef<HTMLDivElement | null>(null);
  const aliveRef = useRef(true);
  const inCallRef = useRef(false);
  const sessionGenerationRef = useRef(0);
  const conversationRef = useRef<Awaited<
    ReturnType<typeof Conversation.startSession>
  > | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const meterCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const mutedRef = useRef(false);
  const intentionalHangupRef = useRef(false);
  /** True while ElevenLabs agent is producing speech */
  const agentSpeakingRef = useRef(false);
  /** Mic currently open for barge-in (only while agent speaking) */
  const bargeOpenRef = useRef(false);
  const speechAboveSinceRef = useRef<number | null>(null);
  const speechBelowSinceRef = useRef<number | null>(null);
  const lastVadScoreRef = useRef(0);
  const levelRef = useRef(0);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api
      .project(pid)
      .then((p) => {
        setProjectName(p.name);
        setBusinessLabel(p.businessLabel || p.businessTemplate || "");
        setOperatorName(p.agent?.persona || "Operator");
      })
      .catch((e) => setError(e.message));
  }, [pid, router]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines, tools]);

  const applyMicTransmit = useCallback((transmit: boolean) => {
    if (mutedRef.current) {
      try {
        conversationRef.current?.setMicMuted?.(true);
      } catch {
        /* ignore */
      }
      localStreamRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = false;
      });
      return;
    }
    // Always keep mic open (unless user muted) so barge-in works
    try {
      conversationRef.current?.setMicMuted?.(false);
    } catch {
      /* ignore */
    }
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = true;
    });
    void transmit;
  }, []);

  const setAgentSpeaking = useCallback(
    (speaking: boolean) => {
      agentSpeakingRef.current = speaking;
      bargeOpenRef.current = false;
      speechAboveSinceRef.current = null;
      speechBelowSinceRef.current = null;
      // Mic stays open so caller can interrupt and operator stops
      applyMicTransmit(true);
    },
    [applyMicTransmit],
  );

  const evaluateBargeInGate = useCallback(() => {
    if (!agentSpeakingRef.current || mutedRef.current) return;
    // Mic already open — track sustained speech only for UI / diagnostics
    const now = performance.now();
    const level = levelRef.current;
    const vad = lastVadScoreRef.current;
    const loudEnough =
      level >= BARGE_IN_GATE.speechLevelThreshold ||
      vad >= BARGE_IN_GATE.vadScoreThreshold;

    if (loudEnough) {
      speechBelowSinceRef.current = null;
      if (speechAboveSinceRef.current == null) speechAboveSinceRef.current = now;
      const held = now - speechAboveSinceRef.current;
      if (!bargeOpenRef.current && held >= BARGE_IN_GATE.speechHoldMs) {
        bargeOpenRef.current = true;
      }
    } else {
      speechAboveSinceRef.current = null;
      if (bargeOpenRef.current) {
        if (speechBelowSinceRef.current == null) speechBelowSinceRef.current = now;
        if (now - speechBelowSinceRef.current >= BARGE_IN_GATE.silenceReleaseMs) {
          bargeOpenRef.current = false;
          speechBelowSinceRef.current = null;
        }
      }
    }
  }, []);

  const stopMeter = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (meterCtxRef.current) {
      void meterCtxRef.current.close().catch(() => undefined);
      meterCtxRef.current = null;
    }
    levelRef.current = 0;
    setLevel(0);
  }, []);

  const startMeter = useCallback(
    (stream: MediaStream) => {
      stopMeter();
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new Ctx();
        meterCtxRef.current = ctx;
        if (ctx.state === "suspended") void ctx.resume();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
          levelRef.current = avg;
          setLevel(avg);
          evaluateBargeInGate();
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        /* optional */
      }
    },
    [evaluateBargeInGate, stopMeter],
  );

  const pushLine = useCallback((line: Omit<Line, "id">) => {
    if (!aliveRef.current) return;
    setLines((prev) => [...prev.slice(-40), { ...line, id: uid() }]);
  }, []);

  const endConversation = useCallback(async () => {
    const conv = conversationRef.current;
    conversationRef.current = null;
    if (!conv) return;
    try {
      await conv.endSession?.();
    } catch {
      /* ignore */
    }
  }, []);

  const hangup = useCallback(async () => {
    intentionalHangupRef.current = true;
    inCallRef.current = false;
    sessionGenerationRef.current += 1;
    agentSpeakingRef.current = false;
    bargeOpenRef.current = false;
    speechAboveSinceRef.current = null;
    speechBelowSinceRef.current = null;
    lastVadScoreRef.current = 0;
    stopMeter();
    await endConversation();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setConnected(false);
    setMuted(false);
    mutedRef.current = false;
    setPhase("idle");
  }, [endConversation, stopMeter]);

  useEffect(() => {
    return () => {
      aliveRef.current = false;
      inCallRef.current = false;
      sessionGenerationRef.current += 1;
      stopMeter();
      const conv = conversationRef.current;
      conversationRef.current = null;
      if (conv) void conv.endSession?.().catch(() => undefined);
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [stopMeter]);

  function buildClientTools(generation: number) {
    const tools: Record<
      string,
      (params?: Record<string, unknown>) => Promise<string>
    > = {};
    for (const name of TOOL_NAMES) {
      tools[name] = async (params = {}) => {
        if (!aliveRef.current || sessionGenerationRef.current !== generation) {
          return JSON.stringify({ error: "Sessiya bitib" });
        }
        const toolId = uid();
        setTools((prev) => [
          ...prev.slice(-19),
          { id: toolId, name, status: "running", args: params },
        ]);
        setPhase("tool");
        try {
          const result = await api.voiceTool(pid, name, params || {});
          setTools((prev) =>
            prev.map((t) => (t.id === toolId ? { ...t, status: "done" as const } : t)),
          );
          if (aliveRef.current && sessionGenerationRef.current === generation) {
            setPhase("live");
          }
          return typeof result === "string" ? result : JSON.stringify(result ?? { ok: true });
        } catch (e: unknown) {
          setTools((prev) =>
            prev.map((t) => (t.id === toolId ? { ...t, status: "error" as const } : t)),
          );
          if (aliveRef.current && sessionGenerationRef.current === generation) {
            setPhase("live");
          }
          return JSON.stringify({ error: errMessage(e) });
        }
      };
    }
    return tools;
  }

  async function startCall() {
    intentionalHangupRef.current = false;
    inCallRef.current = false;
    stopMeter();
    await endConversation();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;

    sessionGenerationRef.current += 1;
    const generation = sessionGenerationRef.current;

    setError("");
    setLines([]);
    setTools([]);
    setMuted(false);
    mutedRef.current = false;
    agentSpeakingRef.current = false;
    bargeOpenRef.current = false;
    speechAboveSinceRef.current = null;
    speechBelowSinceRef.current = null;
    lastVadScoreRef.current = 0;
    setPhase("connecting");
    setConnected(true);
    pushLine({ role: "system", text: "ElevenLabs v3 qoşulur…" });

    try {
      const p = await api.project(pid);
      if (sessionGenerationRef.current !== generation || !aliveRef.current) return;
      setOperatorName(String(p.agent?.persona || "").trim() || "Operator");
      setProjectName(p.name);
      setBusinessLabel(p.businessLabel || p.businessTemplate || "");
      if (p.status !== "active") {
        setError(
          p.status === "draft"
            ? "Bu layihə hələ aktiv deyil. Admin paneldən «Aktiv et» basın."
            : "Bu layihə müvəqqəti deaktiv edilib.",
        );
        setPhase("error");
        setConnected(false);
        return;
      }

      const session = await api.voiceSession(pid);
      if (sessionGenerationRef.current !== generation || !aliveRef.current) return;

      setOperatorName(session.operatorName || operatorName);
      setBusinessLabel(session.companyName || session.businessLabel || businessLabel);
      setProjectName(session.projectName || projectName);
      setEngineLabel(session.engine || session.provider || "elevenlabs");
      setModelLabel(session.model || "eleven_v3_conversational");

      const signedUrl = session.signedUrl as string | undefined;
      const conversationToken =
        (session.token as string | undefined) ||
        (session.value as string | undefined) ||
        undefined;

      if (!signedUrl && !conversationToken) {
        throw new Error(
          "ElevenLabs sessiya alınmadı. ELEVENLABS_API_KEY və VOICE_PROVIDER=elevenlabs yoxlayın.",
        );
      }

      try {
        const localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            // Prefer less AGC boost of quiet noise while operator speaks
            autoGainControl: false,
          },
        });
        localStreamRef.current = localStream;
        startMeter(localStream);
      } catch {
        /* SDK requests mic */
      }

      const sessionOpts = signedUrl
        ? {
            signedUrl,
            connectionType: "websocket" as const,
          }
        : {
            conversationToken: conversationToken!,
            connectionType: "webrtc" as const,
          };

      conversationRef.current = await Conversation.startSession({
        ...sessionOpts,
        clientTools: buildClientTools(generation),
        onConnect: () => {
          if (sessionGenerationRef.current !== generation || !aliveRef.current) return;
          inCallRef.current = true;
          setPhase("live");
          try {
            conversationRef.current?.setVolume?.({ volume: PLAYBACK_VOLUME });
            conversationRef.current?.setMicMuted?.(false);
          } catch {
            /* ignore */
          }
          applyMicTransmit(true);
          pushLine({
            role: "system",
            text: "Zəng açıldı — salamdan sonra danışa bilərsiniz",
          });
          if (session.firstMessage) {
            pushLine({ role: "assistant", text: String(session.firstMessage) });
          }
        },
        onDisconnect: (details?: {
          reason?: string;
          context?: { type?: string; reason?: string };
        }) => {
          if (sessionGenerationRef.current !== generation) return;
          inCallRef.current = false;
          conversationRef.current = null;
          if (!aliveRef.current) return;
          setConnected(false);
          setPhase("idle");
          const reason = details?.reason || details?.context?.type || "";
          pushLine({
            role: "system",
            text: intentionalHangupRef.current
              ? "Zəngi bitirdiniz"
              : reason === "agent"
                ? "Sessiya gözlənilmədən bağlandı — yenidən «Zəngi başlat» basın"
                : "Bağlantı kəsildi — yenidən «Zəngi başlat» basın",
          });
        },
        onError: (err: unknown) => {
          if (sessionGenerationRef.current !== generation || !aliveRef.current) return;
          const message = typeof err === "string" ? err : errMessage(err);
          if (isSoftVoiceError(message)) {
            console.debug("Soft voice error (ignored):", message);
            return;
          }
          setError(message);
          setPhase("error");
        },
        onModeChange: ({ mode }) => {
          if (sessionGenerationRef.current !== generation || !aliveRef.current) return;
          if (mode === "speaking") {
            setAgentSpeaking(true);
            setPhase("speaking");
          } else if (mode === "listening") {
            setAgentSpeaking(false);
            setPhase("listening");
          } else {
            setAgentSpeaking(false);
            setPhase("live");
          }
        },
        onVadScore: ({ vadScore }) => {
          if (sessionGenerationRef.current !== generation || !aliveRef.current) return;
          lastVadScoreRef.current = Number(vadScore) || 0;
          evaluateBargeInGate();
        },
        onInterruption: () => {
          // Real barge-in accepted by ElevenLabs — treat as listening
          if (sessionGenerationRef.current !== generation || !aliveRef.current) return;
          setAgentSpeaking(false);
          setPhase("listening");
        },
        onMessage: (message) => {
          if (sessionGenerationRef.current !== generation || !aliveRef.current) return;
          const role = message?.source === "user" ? "user" : "assistant";
          const text = String(
            message?.message || (message as { text?: string })?.text || "",
          ).trim();
          if (text) pushLine({ role, text });
        },
      });
    } catch (e: unknown) {
      inCallRef.current = false;
      setConnected(false);
      const msg = errMessage(e);
      setError(
        isSoftVoiceError(msg)
          ? "Səs bağlantısı alınmadı. Səhifəni yeniləyib yenidən yoxlayın."
          : msg || "Zəng başladılmadı",
      );
      setPhase("error");
      await hangup();
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    if (next) {
      applyMicTransmit(false);
      return;
    }
    applyMicTransmit(true);
  }

  const live = connected && phase !== "error" && phase !== "idle";
  const ringScale = 1 + level * 0.55;
  const speakingLabel =
    phase === "speaking" ? `${operatorName} danışır…` : STATUS_LABELS[phase];
  const engineDisplay =
    engineLabel === "elevenlabs"
      ? `ElevenLabs v3${modelLabel ? ` · ${modelLabel}` : ""}`
      : `${engineLabel}${modelLabel ? ` · ${modelLabel}` : ""}`;

  return (
    <div className="callai-page">
      <div className="callai-atmosphere" aria-hidden="true" />
      <div className="callai-grain" aria-hidden="true" />

      <header className="callai-topbar">
        <div className="callai-brand-mark">AI Voice OS</div>
        <div className="callai-top-meta">
          <span className="ok">{engineDisplay}</span>
          <Link href={`/projects/${pid}`} className="callai-back">
            ← Layihə
          </Link>
        </div>
      </header>

      <main className="callai-hero">
        <section className="callai-hero-copy">
          <p className="callai-brand-hero">CallAI</p>
          <h1>{businessLabel || projectName || "Operator xətti"}</h1>
          <p className="callai-lede">
            {operatorName} ilə real vaxtda danışın — Bakı azərbaycanlısı kimi təbii səs.
            Operator danışarkən yalnız aydın nitq kəsir (fon/küy yox).
          </p>

          <div className="callai-cta-row">
            {!live ? (
              <button className="callai-btn primary" onClick={() => void startCall()} type="button">
                Zəngi başlat
              </button>
            ) : (
              <>
                <button className="callai-btn danger" onClick={() => void hangup()} type="button">
                  Zəngi bitir
                </button>
                <button className="callai-btn ghost" onClick={toggleMute} type="button">
                  {muted ? "Səsi aç" : "Səssiz"}
                </button>
              </>
            )}
          </div>

          {error ? <p className="callai-error">{error}</p> : null}
        </section>

        <section className="callai-stage" aria-label="Səsli agent">
          <div className="callai-orb-wrap">
            <div className="callai-orb-ring" style={{ transform: `scale(${ringScale})` }} />
            <div className={`callai-orb ${phase}`} data-live={live ? "true" : "false"}>
              <span className="callai-orb-core" />
            </div>
          </div>
          <p className="callai-status-line">{speakingLabel}</p>
          <p className="callai-agent-name">
            {operatorName} · {projectName || businessLabel || "AI Voice OS"}
          </p>
        </section>
      </main>

      <section className="callai-workspace">
        <div className="callai-panel callai-transcript-panel">
          <h2>Danışıq</h2>
          <div className="callai-log" ref={logRef}>
            {lines.length === 0 ? (
              <p className="callai-empty">
                Zəngi başladın. Transkript burada görünəcək.
              </p>
            ) : (
              lines.map((t) => (
                <div key={t.id} className={`callai-bubble ${t.role}`}>
                  <span className="who">
                    {t.role === "user" ? "Siz" : t.role === "assistant" ? operatorName : "Sistem"}
                  </span>
                  <p>{t.text}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="callai-panel callai-tools-panel">
          <h2>Operator hərəkətləri</h2>
          <div className="callai-log">
            {tools.length === 0 ? (
              <p className="callai-empty">
                Axtarış və data alətləri burada izlənir.
              </p>
            ) : (
              tools.map((t) => (
                <div key={t.id} className={`callai-tool-row ${t.status}`}>
                  <div className="callai-tool-head">
                    <strong>{labelTool(t.name)}</strong>
                    <span>{t.status}</span>
                  </div>
                  {t.args && Object.keys(t.args).length > 0 ? (
                    <pre>{JSON.stringify(t.args)}</pre>
                  ) : null}
                </div>
              ))
            )}
          </div>
          <div className="callai-store-chip">
            <span>{projectName || "Layihə"}</span>
            <span>{businessLabel || "Operator xətti"}</span>
            <span>{operatorName} · ElevenLabs v3 · sabit barge-in</span>
          </div>
        </div>
      </section>

      <footer className="callai-foot">
        <p>{projectName || "AI Voice OS"} · Azərbaycan dili · ElevenLabs v3</p>
      </footer>
    </div>
  );
}
