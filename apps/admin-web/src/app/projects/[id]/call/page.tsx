/**
 * Professional CallAI voice call UI.
 *
 * Mic + barge-in:
 * - SpeechRecognition runs continuously while the call is live (including during TTS).
 * - Any user speech while AI is talking immediately stops playback (barge-in).
 * - Level meter uses AnalyserNode without holding a second exclusive mic stream
 *   that would starve STT on mobile.
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

const BARGE_ACK = [
  "Buyurun, sizi dinləyirəm.",
  "Bəli, buyurun.",
  "Aydındır, davam edin.",
  "Başa düşdüm.",
];

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

async function playBase64Audio(
  audioBase64: string,
  mimeType: string,
  audioRef: { current: HTMLAudioElement | null },
  onPlaying?: () => void,
): Promise<"finished" | "interrupted"> {
  if (!audioBase64) return "finished";
  if (audioRef.current) {
    audioRef.current.pause();
    audioRef.current.src = "";
    audioRef.current = null;
  }
  const bytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mimeType || "audio/mpeg" });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audioRef.current = audio;
  onPlaying?.();

  return new Promise<"finished" | "interrupted">((resolve) => {
    let settled = false;
    const finish = (result: "finished" | "interrupted") => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      if (audioRef.current === audio) audioRef.current = null;
      resolve(result);
    };
    audio.onended = () => finish("finished");
    audio.onerror = () => finish("finished");
    audio.onpause = () => {
      // Barge-in pauses/stops mid-play
      if (!audio.ended && audio.currentTime > 0 && audio.paused) {
        finish("interrupted");
      }
    };
    void audio.play().catch(() => finish("finished"));
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
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [engineLabel, setEngineLabel] = useState("edge_neural");
  const [connected, setConnected] = useState(false);
  const [interim, setInterim] = useState("");

  const logRef = useRef<HTMLDivElement | null>(null);
  const aliveRef = useRef(true);
  const inCallRef = useRef(false);
  const sessionGenerationRef = useRef(0);
  const historyRef = useRef<HistoryItem[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const playbackRef = useRef<HTMLAudioElement | null>(null);
  const processingRef = useRef(false);
  const mutedRef = useRef(false);
  const speakingRef = useRef(false);
  const bargeInRef = useRef(false);
  const pendingFinalRef = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const meterCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const handleUtteranceRef = useRef<(generation: number, text: string) => Promise<void>>(
    async () => undefined,
  );

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
  }, [lines, interim]);

  const stopPlayback = useCallback(() => {
    if (playbackRef.current) {
      try {
        playbackRef.current.pause();
        playbackRef.current.src = "";
      } catch {
        /* ignore */
      }
      playbackRef.current = null;
    }
    speakingRef.current = false;
  }, []);

  const stopMeter = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (meterCtxRef.current) {
      void meterCtxRef.current.close().catch(() => undefined);
      meterCtxRef.current = null;
    }
    setLevel(0);
  }, []);

  const stopMic = useCallback(() => {
    stopMeter();
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
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
        rec.abort();
      } catch {
        /* ignore */
      }
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    pendingFinalRef.current = "";
    setInterim("");
  }, []);

  const hangup = useCallback(async () => {
    inCallRef.current = false;
    sessionGenerationRef.current += 1;
    stopRecognition();
    stopPlayback();
    stopMic();
    setConnected(false);
    setMuted(false);
    mutedRef.current = false;
    speakingRef.current = false;
    bargeInRef.current = false;
    processingRef.current = false;
    setPhase("idle");
    setInterim("");
  }, [stopMic, stopPlayback, stopRecognition]);

  useEffect(() => {
    return () => {
      aliveRef.current = false;
      inCallRef.current = false;
      sessionGenerationRef.current += 1;
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
      if (playbackRef.current) playbackRef.current.pause();
      cancelAnimationFrame(rafRef.current);
      if (meterCtxRef.current) void meterCtxRef.current.close().catch(() => undefined);
      if (micStreamRef.current) micStreamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function pushLine(line: Omit<Line, "id">) {
    if (!aliveRef.current) return;
    setLines((prev) => [...prev.slice(-40), { ...line, id: uid() }]);
  }

  /** Soft visual meter from the SAME mic stream used for permission (not exclusive lock). */
  const startMeterFromStream = useCallback(
    (stream: MediaStream) => {
      stopMeter();
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
          setLevel(avg);
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        /* optional */
      }
    },
    [stopMeter],
  );

  const interruptSpeaking = useCallback(() => {
    if (!speakingRef.current && !playbackRef.current) return;
    bargeInRef.current = true;
    stopPlayback();
    speakingRef.current = false;
    if (aliveRef.current) setPhase("listening");
  }, [stopPlayback]);

  const flushPendingUtterance = useCallback(
    (generation: number) => {
      const text = pendingFinalRef.current.trim();
      pendingFinalRef.current = "";
      setInterim("");
      if (!text) return;
      if (!inCallRef.current || sessionGenerationRef.current !== generation) return;
      if (processingRef.current || mutedRef.current) return;
      void handleUtteranceRef.current(generation, text);
    },
    [],
  );

  const startListening = useCallback(
    (generation: number) => {
      if (!inCallRef.current || sessionGenerationRef.current !== generation) return;
      if (mutedRef.current) {
        if (aliveRef.current) setPhase("listening");
        return;
      }
      // Already running
      if (recognitionRef.current) {
        if (aliveRef.current && !speakingRef.current && !processingRef.current) {
          setPhase("listening");
        }
        return;
      }

      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        setError("Brauzer nitq tanımanı dəstəkləmir. Chrome / Edge istifadə edin.");
        setPhase("error");
        return;
      }

      const rec = new Ctor();
      recognitionRef.current = rec;
      rec.lang = "az-AZ";
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (event: SpeechRecognitionEvent) => {
        if (!inCallRef.current || sessionGenerationRef.current !== generation) return;
        if (mutedRef.current || processingRef.current) return;

        let interimText = "";
        let finalChunk = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i];
          const t = (r[0]?.transcript || "").trim();
          if (!t) continue;
          if (r.isFinal) finalChunk += (finalChunk ? " " : "") + t;
          else interimText += (interimText ? " " : "") + t;
        }

        // Barge-in: any speech while AI talks → stop TTS immediately
        if ((interimText || finalChunk) && speakingRef.current) {
          interruptSpeaking();
        }

        if (interimText) setInterim(interimText);

        if (finalChunk) {
          pendingFinalRef.current = `${pendingFinalRef.current} ${finalChunk}`.trim();
          setInterim("");
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          // Short pause after final → send turn (allows multi-phrase)
          silenceTimerRef.current = setTimeout(() => {
            flushPendingUtterance(generation);
          }, 650);
        }
      };

      rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
        if (ev.error === "no-speech" || ev.error === "aborted") return;
        if (ev.error === "not-allowed") {
          setError("Mikrofon icazəsi lazımdır. Brauzerdə mikrofonu açın.");
          setPhase("error");
          inCallRef.current = false;
          setConnected(false);
          return;
        }
        // network / other — soft restart below via onend
      };

      rec.onend = () => {
        recognitionRef.current = null;
        if (
          inCallRef.current &&
          sessionGenerationRef.current === generation &&
          !mutedRef.current
        ) {
          // Keep STT alive for the whole call
          setTimeout(() => {
            if (
              inCallRef.current &&
              sessionGenerationRef.current === generation &&
              !recognitionRef.current
            ) {
              startListening(generation);
            }
          }, 120);
        }
      };

      try {
        rec.start();
        if (aliveRef.current && !speakingRef.current && !processingRef.current) {
          setPhase("listening");
        }
      } catch (e: unknown) {
        recognitionRef.current = null;
        // InvalidStateError = already started — ignore
        const msg = errMessage(e);
        if (!/already started|InvalidState/i.test(msg)) {
          setError(msg || "Dinləmə başladıla bilmədi");
          setPhase("error");
        }
      }
    },
    [flushPendingUtterance, interruptSpeaking],
  );

  handleUtteranceRef.current = async (generation: number, userText: string) => {
    if (processingRef.current) return;
    if (!inCallRef.current || sessionGenerationRef.current !== generation) return;
    processingRef.current = true;
    bargeInRef.current = false;
    stopPlayback();
    speakingRef.current = false;
    pushLine({ role: "user", text: userText });
    setPhase("thinking");
    setInterim("");

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
      speakingRef.current = true;
      bargeInRef.current = false;

      // Keep STT running during TTS for barge-in
      startListening(generation);

      const outcome = await playBase64Audio(
        result.audioBase64,
        result.mimeType,
        playbackRef,
        () => {
          speakingRef.current = true;
        },
      );

      speakingRef.current = false;
      if (outcome === "interrupted" && bargeInRef.current) {
        // Optional soft ack is skipped — user is already speaking; wait for their final
        if (aliveRef.current) setPhase("listening");
      } else if (inCallRef.current && sessionGenerationRef.current === generation) {
        setPhase("listening");
      }
    } catch (e: unknown) {
      speakingRef.current = false;
      if (sessionGenerationRef.current === generation && aliveRef.current) {
        pushLine({ role: "system", text: `Cavab alınmadı: ${errMessage(e)}` });
        setPhase("listening");
      }
    } finally {
      processingRef.current = false;
      if (inCallRef.current && sessionGenerationRef.current === generation) {
        startListening(generation);
      }
    }
  };

  async function startCall() {
    processingRef.current = false;
    sessionGenerationRef.current += 1;
    const generation = sessionGenerationRef.current;
    historyRef.current = [];
    pendingFinalRef.current = "";
    bargeInRef.current = false;
    speakingRef.current = false;

    stopRecognition();
    stopPlayback();
    stopMic();
    setError("");
    setLines([]);
    setMuted(false);
    mutedRef.current = false;
    setPhase("connecting");
    setConnected(true);
    setInterim("");
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
      // Single mic permission — keep stream alive for meter; STT uses browser speech service
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;
      startMeterFromStream(stream);

      const session = await api.voiceSession(pid);
      if (sessionGenerationRef.current !== generation || !aliveRef.current) return;

      const spokenGreeting = String(session.firstMessage || "").trim();
      if (session.userPrompt && spokenGreeting === session.userPrompt.trim()) {
        throw new Error("Salamlama konfiqurasiya xətası — User Prompt səslənməməlidir.");
      }

      setOperatorName(session.operatorName || operatorName);
      setBusinessLabel(session.companyName || session.businessLabel || businessLabel);
      setProjectName(session.projectName || projectName);
      setEngineLabel(session.engine || session.provider || "edge_neural");

      inCallRef.current = true;

      // Start STT BEFORE greeting so barge-in works from the first second
      startListening(generation);

      if (spokenGreeting) {
        pushLine({ role: "assistant", text: spokenGreeting });
        historyRef.current = [{ role: "assistant", content: spokenGreeting }];
      }

      setPhase("speaking");
      speakingRef.current = true;
      const spoken = await api.voiceSpeak(pid, { text: spokenGreeting });
      if (sessionGenerationRef.current !== generation || !inCallRef.current) return;

      const outcome = await playBase64Audio(
        spoken.audioBase64,
        spoken.mimeType,
        playbackRef,
        () => {
          speakingRef.current = true;
        },
      );
      speakingRef.current = false;

      if (sessionGenerationRef.current !== generation || !inCallRef.current) return;
      if (outcome === "interrupted") {
        setPhase("listening");
      } else {
        setPhase("listening");
        startListening(generation);
      }
    } catch (e: unknown) {
      inCallRef.current = false;
      stopRecognition();
      stopMic();
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
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    } else if (inCallRef.current) {
      startListening(sessionGenerationRef.current);
    }
  }

  const live = connected && phase !== "error";
  const ringScale = 1 + level * 0.55;
  const speakingLabel =
    phase === "speaking"
      ? `${operatorName} danışır…`
      : interim
        ? "Sizi eşidir…"
        : STATUS_LABELS[phase];

  return (
    <div className="callai-page">
      <div className="callai-atmosphere" aria-hidden="true" />
      <div className="callai-grain" aria-hidden="true" />

      <header className="callai-topbar">
        <div className="callai-brand-mark">AI Voice OS</div>
        <div className="callai-top-meta">
          <span className="ok">
            {engineLabel === "edge_neural" ? "Neural AZ · hazır" : `${engineLabel} · hazır`}
          </span>
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
            {operatorName} ilə telefon kimi danışın. Danışanda AI dərhal dayanır (barge-in).
            Mikrofon Chrome/Edge-də açıq olmalıdır.
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
          {interim ? (
            <p className="callai-agent-name" style={{ fontStyle: "italic", opacity: 0.85 }}>
              «{interim}»
            </p>
          ) : (
            <p className="callai-agent-name">
              {operatorName} · {projectName || businessLabel || "AI Voice OS"}
            </p>
          )}
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
            <p className="callai-empty">
              Barge-in aktivdir: danışanda AI dayanır. İfadələr: «{BARGE_ACK[0]}»
            </p>
          </div>
          <div className="callai-store-chip">
            <span>{projectName || "Layihə"}</span>
            <span>{businessLabel || "Operator xətti"}</span>
            <span>{operatorName} · neural AZ · barge-in</span>
          </div>
        </div>
      </section>

      <footer className="callai-foot">
        <p>{projectName || "AI Voice OS"} · Azərbaycan dili · satış və operator xətti</p>
      </footer>
    </div>
  );
}
