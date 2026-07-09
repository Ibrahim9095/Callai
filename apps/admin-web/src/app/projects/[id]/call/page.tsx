"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Conversation } from "@elevenlabs/client";
import { api, getToken } from "@/lib/api";

const TOOL_NAMES = ["list_collections", "search_records", "create_record", "update_record"] as const;

type Phase = "idle" | "ringing" | "connecting" | "live" | "listening" | "speaking" | "tool" | "ended" | "error";
type Line = { role: "user" | "assistant" | "system"; text: string };

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
  const [toolsLog, setToolsLog] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const conversationRef = useRef<Awaited<ReturnType<typeof Conversation.startSession>> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const stopRingRef = useRef<(() => void) | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const liveSinceRef = useRef<number | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const intentionalHangupRef = useRef(false);
  const aliveRef = useRef(true);

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
        // Show exactly what operator saved — do not invent honorifics here
        setOperatorName(p.agent?.persona || "Operator");
      })
      .catch((e) => setError(e.message));
  }, [pid, router]);

  useEffect(() => {
    if (phase !== "live" && phase !== "listening" && phase !== "speaking" && phase !== "tool") return;
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

  const teardownMedia = useCallback(() => {
    stopRingtone();
    try {
      void conversationRef.current?.endSession?.();
    } catch {
      /* ignore */
    }
    conversationRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    liveSinceRef.current = null;
  }, [stopRingtone]);

  const hangup = useCallback(async () => {
    intentionalHangupRef.current = true;
    teardownMedia();
    setPhase((p) => (p === "idle" ? "idle" : "ended"));
  }, [teardownMedia]);

  // Unmount cleanup only — never re-run during a live call
  useEffect(() => {
    return () => {
      aliveRef.current = false;
      stopRingRef.current?.();
      try {
        void conversationRef.current?.endSession?.();
      } catch {
        /* ignore */
      }
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function pushLine(line: Line) {
    if (!aliveRef.current) return;
    setLines((prev) => [...prev.slice(-50), line]);
  }

  function buildClientTools() {
    const tools: Record<string, (params?: Record<string, unknown>) => Promise<unknown>> = {};
    for (const name of TOOL_NAMES) {
      tools[name] = async (params = {}) => {
        if (aliveRef.current) setPhase("tool");
        setToolsLog((prev) => [...prev.slice(-24), `→ ${name}`]);
        try {
          const result = await api.voiceTool(pid, name, params || {});
          setToolsLog((prev) => [
            ...prev.slice(-24),
            `✓ ${name}: ${JSON.stringify(result).slice(0, 140)}`,
          ]);
          if (aliveRef.current) setPhase("live");
          return result ?? { ok: true };
        } catch (err: any) {
          setToolsLog((prev) => [...prev.slice(-24), `✗ ${name}: ${err?.message || err}`]);
          if (aliveRef.current) setPhase("live");
          // Always return a plain object so the SDK never sees undefined
          return { error: err?.message || "Alət xətası" };
        }
      };
    }
    return tools;
  }

  function isSoftVoiceError(message: string): boolean {
    const m = (message || "").trim();
    if (!m || m === "{}" || m === "[object Object]") return true;
    return (
      /unknown error/i.test(m) ||
      /error_type/i.test(m) ||
      /^server error:\s*unknown error/i.test(m) ||
      /^server error:\s*\{\s*\}$/i.test(m)
    );
  }

  async function startCall() {
    // Hard reset previous WebRTC/mic so 2nd call is clean
    intentionalHangupRef.current = false;
    teardownMedia();
    setError("");
    setLines([]);
    setToolsLog([]);
    setElapsed(0);
    setPhase("ringing");
    pushLine({ role: "system", text: "Zəng edilir…" });

    // Always reload saved persona from DB before dialing
    try {
      const p = await api.project(pid);
      const name = String(p.agent?.persona || "").trim() || "Operator";
      setOperatorName(name);
      setProjectName(p.name);
      setBusinessLabel(p.businessLabel || p.businessTemplate || "");
      if (!String(p.agent?.persona || "").trim()) {
        setError("Əvvəl layihədə operator adını yazıb «Yadda saxla» basın.");
        setPhase("error");
        return;
      }
    } catch {
      /* keep existing */
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
      /* ringtone optional */
    }

    await new Promise((r) => setTimeout(r, 900));
    if (!aliveRef.current) return;

    setPhase("connecting");
    pushLine({ role: "system", text: "Qoşulur…" });

    try {
      // Fresh mic each call (avoids dead tracks after hangup)
      const mic = await navigator.mediaDevices
        .getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        })
        .catch(() => null);

      const session = await api.voiceSession(pid);
      if (!aliveRef.current) {
        mic?.getTracks().forEach((t) => t.stop());
        return;
      }

      const liveName = String(session.operatorName || "").trim();
      if (liveName) setOperatorName(liveName);
      setOperatorGender(session.operatorGender || "unknown");
      setBusinessLabel(session.businessLabel || businessLabel);
      setProjectName(session.projectName || projectName);

      localStreamRef.current = mic;
      stopRingtone();

      if (!session.token) throw new Error("Səs token alınmadı — yenidən yoxlayın");

      conversationRef.current = await Conversation.startSession({
        conversationToken: session.token,
        connectionType: "webrtc",
        clientTools: buildClientTools(),
        onConnect: () => {
          liveSinceRef.current = Date.now();
          if (!aliveRef.current) return;
          setPhase("live");
          pushLine({ role: "system", text: "Zəng açıldı — danışa bilərsiniz" });
          if (session.firstMessage) {
            pushLine({ role: "assistant", text: session.firstMessage });
          }
        },
        onDisconnect: () => {
          stopRingtone();
          liveSinceRef.current = null;
          localStreamRef.current?.getTracks().forEach((t) => t.stop());
          localStreamRef.current = null;
          conversationRef.current = null;
          if (!aliveRef.current) return;
          setPhase("ended");
          pushLine({
            role: "system",
            text: intentionalHangupRef.current
              ? "Zəngi bitirdiniz"
              : "Bağlantı kəsildi — yenidən «Zəng et» basın",
          });
        },
        onError: (err: unknown, _ctx?: unknown) => {
          const message = typeof err === "string" ? err : errMessage(err);
          if (!aliveRef.current) return;
          // Soft provider noise — never kill call / never Next overlay
          if (isSoftVoiceError(message)) return;
          console.warn("ElevenLabs onError:", message);
          setError(message);
        },
        onModeChange: ({ mode }) => {
          if (!aliveRef.current) return;
          if (mode === "speaking") setPhase("speaking");
          else if (mode === "listening") setPhase("listening");
          else setPhase("live");
        },
        onMessage: (message) => {
          const role = message?.source === "user" ? "user" : "assistant";
          const text = String(message?.message || (message as any)?.text || "").trim();
          if (text) pushLine({ role, text });
        },
      });
    } catch (e: any) {
      teardownMedia();
      const msg = errMessage(e);
      setError(
        isSoftVoiceError(msg)
          ? "Səs bağlantısı alınmadı. Səhifəni yeniləyib yenidən yoxlayın."
          : msg || "Zəng başladılmadı",
      );
      setPhase("error");
    }
  }

  const inCall =
    phase === "ringing" ||
    phase === "connecting" ||
    phase === "live" ||
    phase === "listening" ||
    phase === "speaking" ||
    phase === "tool";

  const avatarLetter = (operatorName || "O").replace(/\s+(xanım|bəy)$/i, "").charAt(0).toUpperCase();

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
              Saxlanmış operator adı
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
              Layihədə operator adını yazın (Kamran, İbrahim, Leyla…) → Yadda saxla → burada zəng edin.
              Ekranda və salamlamada məhz o ad görünəcək. Zəngi yalnız siz bitirin.
            </p>
          ) : null}
        </div>

        <section className="call-transcript card">
          <div className="row" style={{ marginBottom: "0.5rem" }}>
            <h2 className="title" style={{ fontSize: "1.05rem", margin: 0 }}>
              Söhbət
            </h2>
            {phase === "tool" ? <span className="pill active">Dataya baxır…</span> : null}
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

        {toolsLog.length > 0 ? (
          <section className="card call-tools">
            <h2 className="title" style={{ fontSize: "0.95rem", marginTop: 0 }}>
              Siyahı oxu / yaz
            </h2>
            <pre>{toolsLog.join("\n")}</pre>
          </section>
        ) : null}
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
    case "tool":
      return "Siyahılara baxır…";
    case "ended":
      return "Zəng bitdi";
    case "error":
      return "Xəta";
    default:
      return "Zəngə hazır";
  }
}
