/**
 * Professional CallAI voice call UI (ported from legacy client).
 *
 * Transport: pipeline
 *   STT  = Web Speech API (az-AZ, free)
 *   LLM  = cheap chat model via API
 *   TTS  = Edge neural az-AZ Banu/Babek (free)
 *
 * Spoken greeting = session.firstMessage ONLY (never User Prompt).
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken } from "@/lib/api";

type Phase =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "tool"
  | "error";

type Line = { id: string; role: "user" | "assistant" | "system"; text: string };
type ToolRow = {
  id: string;
  name: string;
  status: "running" | "done" | "error";
  args?: Record<string, unknown>;
};
type HistoryItem = { role: "user" | "assistant"; content: string };

const STATUS_LABELS: Record<Phase, string> = {
  idle: "Hazır",
  connecting: "Zəng bağlanır…",
  listening: "Dinləyir…",
  thinking: "Bir saniyə…",
  speaking: "Danışır…",
  tool: "Yoxlayır…",
  error: "Xəta",
};

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

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
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

async function playBase64Audio(
  audioBase64: string,
  mimeType: string,
  audioRef: { current: HTMLAudioElement | null },
): Promise<void> {
  if (!audioBase64) return;
  if (audioRef.current) {
    audioRef.current.pause();
    audioRef.current.src = "";
    audioRef.current = null;
  }
  const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mimeType || "audio/webm" });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audioRef.current = audio;
  await new Promise<void>((resolve, reject) => {
    audio.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Audio oxunmadı"));
    };
    void audio.play().catch(reject);
  });
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
  const [engineLabel, setEngineLabel] = useState("edge_neural");
  const [connected, setConnected] = useState(false);

  const logRef = useRef<HTMLDivElement | null>(null);
  const aliveRef = useRef(true);
  const inCallRef = useRef(false);
  const sessionGenerationRef = useRef(0);
  const historyRef = useRef<HistoryItem[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const playbackRef = useRef<HTMLAudioElement | null>(null);
  const processingRef = useRef(false);
  const mutedRef = useRef(false);
  const meterRef = useRef<{
    ctx: AudioContext;
    analyser: AnalyserNode;
    stream: MediaStream;
  } | null>(null);
  const rafRef = useRef(0);

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

  const stopMeter = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (meterRef.current) {
      meterRef.current.stream.getTracks().forEach((t) => t.stop());
      void meterRef.current.ctx.close().catch(() => undefined);
      meterRef.current = null;
    }
    setLevel(0);
  }, []);

  const startMeter = useCallback(async () => {
    stopMeter();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      if (ctx.state === "suspended") await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      meterRef.current = { ctx, analyser, stream };
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
        setLevel(avg);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* meter optional */
    }
  }, [stopMeter]);

  const stopRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      try {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const stopPlayback = useCallback(() => {
    if (playbackRef.current) {
      playbackRef.current.pause();
      playbackRef.current.src = "";
      playbackRef.current = null;
    }
  }, []);

  const hangup = useCallback(async () => {
    inCallRef.current = false;
    sessionGenerationRef.current += 1;
    stopRecognition();
    stopPlayback();
    stopMeter();
    setConnected(false);
    setMuted(false);
    mutedRef.current = false;
    setPhase("idle");
  }, [stopMeter, stopPlayback, stopRecognition]);

  useEffect(() => {
    return () => {
      aliveRef.current = false;
      inCallRef.current = false;
      sessionGenerationRef.current += 1;
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      if (playbackRef.current) playbackRef.current.pause();
      cancelAnimationFrame(rafRef.current);
      if (meterRef.current) {
        meterRef.current.stream.getTracks().forEach((t) => t.stop());
        void meterRef.current.ctx.close().catch(() => undefined);
      }
    };
  }, []);

  function pushLine(line: Omit<Line, "id">) {
    if (!aliveRef.current) return;
    setLines((prev) => [...prev.slice(-40), { ...line, id: uid() }]);
  }

  const startListening = useCallback(
    (generation: number) => {
      if (!inCallRef.current || sessionGenerationRef.current !== generation) return;
      if (mutedRef.current) {
        if (aliveRef.current) setPhase("listening");
        return;
      }
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        setError("Brauzer nitq tanımanı dəstəkləmir. Chrome / Edge istifadə edin.");
        setPhase("error");
        return;
      }

      stopRecognition();
      const rec = new Ctor();
      recognitionRef.current = rec;
      rec.lang = "az-AZ";
      rec.continuous = true;
      rec.interimResults = false;
      rec.maxAlternatives = 1;

      rec.onresult = (event: SpeechRecognitionEvent) => {
        if (!inCallRef.current || sessionGenerationRef.current !== generation) return;
        if (processingRef.current || mutedRef.current) return;

        let finalText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i];
          if (r.isFinal) finalText += r[0]?.transcript || "";
        }
        finalText = finalText.trim();
        if (!finalText) return;
        void handleUserUtterance(generation, finalText);
      };

      rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
        if (ev.error === "no-speech" || ev.error === "aborted") return;
        if (ev.error === "not-allowed") {
          setError("Mikrofon icazəsi lazımdır.");
          setPhase("error");
          inCallRef.current = false;
          setConnected(false);
        }
      };

      rec.onend = () => {
        if (
          inCallRef.current &&
          sessionGenerationRef.current === generation &&
          !processingRef.current &&
          !mutedRef.current
        ) {
          try {
            rec.start();
          } catch {
            /* already started */
          }
        }
      };

      try {
        rec.start();
        if (aliveRef.current) setPhase("listening");
      } catch (e: unknown) {
        setError(errMessage(e) || "Dinləmə başladıla bilmədi");
        setPhase("error");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stopRecognition],
  );

  async function handleUserUtterance(generation: number, userText: string) {
    if (processingRef.current) return;
    if (!inCallRef.current || sessionGenerationRef.current !== generation) return;
    processingRef.current = true;
    stopRecognition();
    pushLine({ role: "user", text: userText });
    setPhase("thinking");

    try {
      const result = await api.voiceTurn(pid, {
        userText,
        history: historyRef.current,
      });
      if (sessionGenerationRef.current !== generation || !inCallRef.current) return;

      historyRef.current = [
        ...historyRef.current.slice(-10),
        { role: "user", content: userText },
        { role: "assistant", content: result.replyText },
      ];
      pushLine({ role: "assistant", text: result.replyText });
      setPhase("speaking");
      await playBase64Audio(result.audioBase64, result.mimeType, playbackRef);
    } catch (e: unknown) {
      if (sessionGenerationRef.current === generation && aliveRef.current) {
        pushLine({ role: "system", text: `Cavab alınmadı: ${errMessage(e)}` });
      }
    } finally {
      processingRef.current = false;
      if (inCallRef.current && sessionGenerationRef.current === generation) {
        startListening(generation);
      }
    }
  }

  async function startCall() {
    processingRef.current = false;
    sessionGenerationRef.current += 1;
    const generation = sessionGenerationRef.current;
    historyRef.current = [];

    stopRecognition();
    stopPlayback();
    stopMeter();
    setError("");
    setLines([]);
    setTools([]);
    setMuted(false);
    mutedRef.current = false;
    setPhase("connecting");
    setConnected(true);
    pushLine({ role: "system", text: "Zəng bağlanır…" });

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
            : "Bu layihə müvəqqəti deaktiv edilib. Zəng qəbul olunmur.",
        );
        setPhase("error");
        setConnected(false);
        return;
      }
    } catch (e: unknown) {
      setError(errMessage(e) || "Layihə yüklənmədi");
      setPhase("error");
      setConnected(false);
      return;
    }

    if (!getSpeechRecognitionCtor()) {
      setError("Nitq tanıma üçün Chrome və ya Edge brauzeri lazımdır.");
      setPhase("error");
      setConnected(false);
      return;
    }

    try {
      await startMeter();

      const session = await api.voiceSession(pid);
      if (sessionGenerationRef.current !== generation || !aliveRef.current) return;

      const spokenGreeting = String(session.firstMessage || "").trim();
      // Hard guard: never speak userPrompt
      if (session.userPrompt && spokenGreeting === session.userPrompt.trim()) {
        throw new Error("Salamlama konfiqurasiya xətası — User Prompt səslənməməlidir.");
      }

      setOperatorName(session.operatorName || operatorName);
      setBusinessLabel(session.companyName || session.businessLabel || businessLabel);
      setProjectName(session.projectName || projectName);
      setEngineLabel(session.engine || session.provider || "edge_neural");

      inCallRef.current = true;
      if (spokenGreeting) {
        pushLine({ role: "assistant", text: spokenGreeting });
        historyRef.current = [{ role: "assistant", content: spokenGreeting }];
      }

      setPhase("speaking");
      const spoken = await api.voiceSpeak(pid, { text: spokenGreeting });
      if (sessionGenerationRef.current !== generation || !inCallRef.current) return;
      await playBase64Audio(spoken.audioBase64, spoken.mimeType, playbackRef);

      if (sessionGenerationRef.current !== generation || !inCallRef.current) return;
      startListening(generation);
    } catch (e: unknown) {
      inCallRef.current = false;
      stopRecognition();
      stopMeter();
      setConnected(false);
      setError(errMessage(e) || "Zəng başladılmadı");
      setPhase("error");
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    if (next) {
      stopRecognition();
    } else if (inCallRef.current && !processingRef.current) {
      startListening(sessionGenerationRef.current);
    }
  }

  const live = connected && phase !== "error";
  const ringScale = 1 + level * 0.55;
  const speakingLabel =
    phase === "speaking" ? `${operatorName} danışır…` : STATUS_LABELS[phase];

  return (
    <div className="callai-page">
      <div className="callai-atmosphere" aria-hidden="true" />
      <div className="callai-grain" aria-hidden="true" />

      <header className="callai-topbar">
        <div className="callai-brand-mark">AI Voice OS</div>
        <div className="callai-top-meta">
          <span className="ok">{engineLabel === "edge_neural" ? "Neural AZ · hazır" : `${engineLabel} · hazır`}</span>
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
            {operatorName} ilə telefon kimi danışın — canlı səs, az gözləmə. Salam yalnız
            peşəkar təqdimatdır; User Prompt səslənmir.
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
            <div
              className={`callai-orb ${phase}`}
              data-live={live && phase !== "idle" ? "true" : "false"}
            >
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
                Zəngi başladın və mikrofonla danışın. Transkript burada görünəcək.
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
                Axtarış və data alətləri burada izlənir. Zəng zamanı bilik bazasından oxunur.
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
            <span>{operatorName} · pulsuz neural AZ</span>
          </div>
        </div>
      </section>

      <footer className="callai-foot">
        <p>
          {projectName || "AI Voice OS"} · Azərbaycan dili · satış və operator xətti
        </p>
      </footer>
    </div>
  );
}
