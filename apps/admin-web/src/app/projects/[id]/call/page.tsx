/**
 * Browser voice call — provider-agnostic pipeline.
 *
 * Transport: pipeline (NOT ElevenLabs)
 *   STT  = Web Speech API (az-AZ, free, on-device)
 *   LLM  = cheap chat model (gpt-4o-mini) via API
 *   TTS  = Microsoft Edge neural az-AZ Banu/Babek (free)
 *
 * Session ends only when the user hangs up or a hard error occurs.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken } from "@/lib/api";

type Phase =
  | "idle"
  | "ringing"
  | "connecting"
  | "live"
  | "listening"
  | "speaking"
  | "thinking"
  | "ended"
  | "error";
type Line = { role: "user" | "assistant" | "system"; text: string };
type HistoryItem = { role: "user" | "assistant"; content: string };

function createRingtone(ctx: AudioContext) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const beep = () => {
    if (stopped) return;
    const now = ctx.currentTime;
    for (const [freq, gain] of [
      [440, 0.08],
      [480, 0.07],
    ] as const) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(gain, now + 0.05);
      g.gain.setValueAtTime(gain, now + 0.9);
      g.gain.linearRampToValueAtTime(0, now + 1.15);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.2);
    }
    timer = setTimeout(beep, 2800);
  };
  beep();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function errMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as any;
    return e.message || e.error || e.reason || JSON.stringify(err).slice(0, 200);
  }
  return "Naməlum xəta";
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

async function playBase64Audio(
  audioBase64: string,
  mimeType: string,
  audioRef: { current: HTMLAudioElement | null },
): Promise<void> {
  if (!audioBase64) return;
  // Stop previous playback
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
  const [operatorGender, setOperatorGender] = useState<"female" | "male" | "unknown">("unknown");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [engineLabel, setEngineLabel] = useState("edge_neural");

  const stopRingRef = useRef<(() => void) | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const liveSinceRef = useRef<number | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const intentionalHangupRef = useRef(false);
  const sessionGenerationRef = useRef(0);
  const aliveRef = useRef(true);
  const inCallRef = useRef(false);
  const historyRef = useRef<HistoryItem[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const playbackRef = useRef<HTMLAudioElement | null>(null);
  const processingRef = useRef(false);
  const ttsVoiceRef = useRef("az-AZ-BanuNeural");
  const firstMessageRef = useRef("");

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
    if (phase !== "live" && phase !== "listening" && phase !== "speaking" && phase !== "thinking") {
      return;
    }
    const t = setInterval(() => {
      if (liveSinceRef.current) {
        setElapsed(Math.floor((Date.now() - liveSinceRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const stopRingtone = useCallback(() => {
    stopRingRef.current?.();
    stopRingRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
  }, []);

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
    intentionalHangupRef.current = true;
    inCallRef.current = false;
    sessionGenerationRef.current += 1;
    stopRingtone();
    stopRecognition();
    stopPlayback();
    liveSinceRef.current = null;
    setPhase((p) => (p === "idle" ? "idle" : "ended"));
  }, [stopPlayback, stopRecognition, stopRingtone]);

  useEffect(() => {
    return () => {
      aliveRef.current = false;
      inCallRef.current = false;
      sessionGenerationRef.current += 1;
      stopRingRef.current?.();
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      if (playbackRef.current) {
        playbackRef.current.pause();
      }
    };
  }, []);

  function pushLine(line: Line) {
    if (!aliveRef.current) return;
    setLines((prev) => [...prev.slice(-50), line]);
  }

  const startListening = useCallback(
    (generation: number) => {
      if (!inCallRef.current || sessionGenerationRef.current !== generation) return;
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
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (event: SpeechRecognitionEvent) => {
        if (!inCallRef.current || sessionGenerationRef.current !== generation) return;
        if (processingRef.current) return;

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
        // Soft: no-speech / aborted are normal during silence
        if (ev.error === "no-speech" || ev.error === "aborted") return;
        if (ev.error === "not-allowed") {
          setError("Mikrofon icazəsi lazımdır.");
          setPhase("error");
          inCallRef.current = false;
        }
      };

      rec.onend = () => {
        // Keep listening while call is live (browser stops after silence)
        if (inCallRef.current && sessionGenerationRef.current === generation && !processingRef.current) {
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
      } catch (e: any) {
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
    } catch (e: any) {
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
    intentionalHangupRef.current = false;
    processingRef.current = false;
    sessionGenerationRef.current += 1;
    const generation = sessionGenerationRef.current;
    historyRef.current = [];

    stopRingtone();
    stopRecognition();
    stopPlayback();
    setError("");
    setLines([]);
    setElapsed(0);
    setPhase("ringing");
    pushLine({ role: "system", text: "Zəng edilir…" });

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
        return;
      }
    } catch (e: any) {
      setError(e?.message || "Layihə yüklənmədi");
      setPhase("error");
      return;
    }

    if (!getSpeechRecognitionCtor()) {
      setError("Nitq tanıma üçün Chrome və ya Edge brauzeri lazımdır.");
      setPhase("error");
      return;
    }

    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (Ctx) {
        const ctx: AudioContext = new Ctx();
        audioCtxRef.current = ctx;
        if (ctx.state === "suspended") await ctx.resume();
        stopRingRef.current = createRingtone(ctx);
      }
    } catch {
      /* optional */
    }

    await new Promise((r) => setTimeout(r, 700));
    if (sessionGenerationRef.current !== generation || !aliveRef.current) return;

    setPhase("connecting");
    pushLine({ role: "system", text: "Qoşulur…" });
    stopRingtone();

    try {
      // Mic permission early
      await navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
        s.getTracks().forEach((t) => t.stop());
      });

      const session = await api.voiceSession(pid);
      if (sessionGenerationRef.current !== generation || !aliveRef.current) return;

      setOperatorName(session.operatorName || operatorName);
      setOperatorGender(session.operatorGender || "unknown");
      setBusinessLabel(session.companyName || session.businessLabel || businessLabel);
      setProjectName(session.projectName || projectName);
      setEngineLabel(session.engine || session.provider || "edge_neural");
      ttsVoiceRef.current = session.ttsVoiceId || "az-AZ-BanuNeural";
      firstMessageRef.current = session.firstMessage || "";

      inCallRef.current = true;
      liveSinceRef.current = Date.now();
      setPhase("speaking");
      pushLine({ role: "system", text: "Zəng açıldı" });
      if (session.firstMessage) {
        pushLine({ role: "assistant", text: session.firstMessage });
        historyRef.current = [{ role: "assistant", content: session.firstMessage }];
      }

      // Speak greeting via free Edge neural TTS
      const spoken = await api.voiceSpeak(pid, { text: session.firstMessage });
      if (sessionGenerationRef.current !== generation || !inCallRef.current) return;
      await playBase64Audio(spoken.audioBase64, spoken.mimeType, playbackRef);

      if (sessionGenerationRef.current !== generation || !inCallRef.current) return;
      startListening(generation);
    } catch (e: any) {
      inCallRef.current = false;
      stopRingtone();
      stopRecognition();
      const msg = errMessage(e);
      setError(msg || "Zəng başladılmadı");
      setPhase("error");
    }
  }

  const inCall =
    phase === "ringing" ||
    phase === "connecting" ||
    phase === "live" ||
    phase === "listening" ||
    phase === "speaking" ||
    phase === "thinking";

  const avatarLetter = (operatorName || "O").charAt(0).toUpperCase();

  return (
    <div className="call-page">
      <div className="topbar">
        <div className="brand">
          AI Voice <span>OS</span>
        </div>
        <Link href={`/projects/${pid}`} className="back">
          ← Layihə
        </Link>
      </div>

      <div className="call-shell">
        <div className={`call-stage ${inCall ? "active" : ""} ${phase === "ringing" ? "ringing" : ""}`}>
          <div className="call-aura" aria-hidden />
          <div className={`call-avatar ${operatorGender}`}>
            <span>{avatarLetter}</span>
          </div>

          <div className="call-identity">
            <p className="muted" style={{ margin: "0 0 0.25rem", fontSize: "0.8rem" }}>
              Operator · {engineLabel}
            </p>
            <h1 className="call-name">{operatorName}</h1>
            <p className="call-role">
              {businessLabel || "Operator"}
              {projectName ? ` · ${projectName}` : ""}
            </p>
            <p className={`call-status-line phase-${phase}`}>{phaseLabel(phase)}</p>
            {inCall && phase !== "ringing" && phase !== "connecting" ? (
              <p className="call-timer">{formatDuration(elapsed)}</p>
            ) : null}
          </div>

          {phase === "ringing" ? (
            <div className="ring-waves" aria-hidden>
              <span />
              <span />
              <span />
            </div>
          ) : null}

          {error ? <p className="error call-error">{error}</p> : null}

          <div className="call-actions">
            {!inCall ? (
              <button className="call-btn start" onClick={() => void startCall()} type="button">
                <span className="call-btn-icon" aria-hidden>
                  ☎
                </span>
                Zəng et
              </button>
            ) : (
              <button className="call-btn hangup" onClick={() => void hangup()} type="button">
                <span className="call-btn-icon" aria-hidden>
                  ✕
                </span>
                Zəngi bitir
              </button>
            )}
          </div>

          {phase === "idle" || phase === "ended" || phase === "error" ? (
            <p className="call-hint">
              Pulsuz neural səs (Banu/Babək). Chrome/Edge ilə zəng edin. Salamdan sonra danışın —
              zəngi yalnız siz bitirin.
            </p>
          ) : null}
        </div>

        <section className="call-transcript card">
          <div className="row" style={{ marginBottom: "0.5rem" }}>
            <h2 className="title" style={{ fontSize: "1.05rem", margin: 0 }}>
              Söhbət
            </h2>
            {phase === "thinking" ? <span className="pill active">Düşünür…</span> : null}
          </div>
          {lines.length === 0 ? (
            <p className="muted">Zəng başlayanda söhbət burada görünəcək.</p>
          ) : (
            <div className="transcript-list">
              {lines.map((l, i) => (
                <div key={i} className={`bubble ${l.role}`}>
                  <small>
                    {l.role === "user" ? "Siz" : l.role === "assistant" ? operatorName : "Sistem"}
                  </small>
                  <div>{l.text}</div>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function phaseLabel(p: Phase) {
  switch (p) {
    case "ringing":
      return "Zəng gəlir…";
    case "connecting":
      return "Qoşulur…";
    case "live":
      return "Danışıqda";
    case "listening":
      return "Dinləyir";
    case "speaking":
      return "Danışır";
    case "thinking":
      return "Cavab hazırlanır…";
    case "ended":
      return "Zəng bitdi";
    case "error":
      return "Xəta";
    default:
      return "Zəngə hazır";
  }
}
