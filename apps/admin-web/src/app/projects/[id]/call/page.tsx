/**
 * CallAI live call — OpenAI Realtime WebRTC (primary) + pipeline fallback.
 *
 * Realtime path: mic → OpenAI speech-to-speech → speaker (target 1–2s latency).
 * Barge-in: server VAD interrupt_response + local audio ducking on speech_started.
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
  const [engineLabel, setEngineLabel] = useState("openai");
  const [modelLabel, setModelLabel] = useState("");
  const [connected, setConnected] = useState(false);

  const logRef = useRef<HTMLDivElement | null>(null);
  const aliveRef = useRef(true);
  const inCallRef = useRef(false);
  const sessionGenerationRef = useRef(0);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const greetedRef = useRef(false);
  const firstMessageRef = useRef("");
  const meterCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const mutedRef = useRef(false);

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
    if (meterCtxRef.current) {
      void meterCtxRef.current.close().catch(() => undefined);
      meterCtxRef.current = null;
    }
    setLevel(0);
  }, []);

  const startMeter = useCallback(
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

  const pushLine = useCallback((line: Omit<Line, "id">) => {
    if (!aliveRef.current) return;
    setLines((prev) => [...prev.slice(-40), { ...line, id: uid() }]);
  }, []);

  const sendEvent = useCallback((event: Record<string, unknown>) => {
    const dc = dcRef.current;
    if (dc?.readyState === "open") {
      dc.send(JSON.stringify(event));
    }
  }, []);

  const hangup = useCallback(async () => {
    inCallRef.current = false;
    sessionGenerationRef.current += 1;
    greetedRef.current = false;
    stopMeter();
    try {
      dcRef.current?.close();
    } catch {
      /* ignore */
    }
    try {
      pcRef.current?.getSenders().forEach((s) => s.track?.stop());
      pcRef.current?.close();
    } catch {
      /* ignore */
    }
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }
    pcRef.current = null;
    dcRef.current = null;
    localStreamRef.current = null;
    setConnected(false);
    setMuted(false);
    mutedRef.current = false;
    setPhase("idle");
  }, [stopMeter]);

  useEffect(() => {
    return () => {
      aliveRef.current = false;
      inCallRef.current = false;
      sessionGenerationRef.current += 1;
      try {
        dcRef.current?.close();
      } catch {
        /* ignore */
      }
      try {
        pcRef.current?.close();
      } catch {
        /* ignore */
      }
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(rafRef.current);
      if (meterCtxRef.current) void meterCtxRef.current.close().catch(() => undefined);
    };
  }, []);

  const handleToolCall = useCallback(
    async (event: { name?: string; call_id?: string; arguments?: string }) => {
      const name = String(event.name || "");
      const callId = String(event.call_id || "");
      let args: Record<string, unknown> = {};
      try {
        args = event.arguments ? JSON.parse(event.arguments) : {};
      } catch {
        args = {};
      }

      const toolId = uid();
      setTools((prev) => [...prev.slice(-19), { id: toolId, name, status: "running", args }]);
      setPhase("tool");

      let result: unknown;
      try {
        result = await api.voiceTool(pid, name, args);
        setTools((prev) =>
          prev.map((t) => (t.id === toolId ? { ...t, status: "done" as const } : t)),
        );
      } catch (e: unknown) {
        result = { error: errMessage(e) };
        setTools((prev) =>
          prev.map((t) => (t.id === toolId ? { ...t, status: "error" as const } : t)),
        );
      }

      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(result),
        },
      });
      sendEvent({ type: "response.create" });
    },
    [pid, sendEvent],
  );

  const handleServerEvent = useCallback(
    (raw: MessageEvent) => {
      let event: Record<string, any>;
      try {
        event = JSON.parse(String(raw.data));
      } catch {
        return;
      }

      switch (event.type) {
        case "input_audio_buffer.speech_started":
          // Barge-in: duck remote audio immediately
          if (remoteAudioRef.current) {
            try {
              remoteAudioRef.current.pause();
            } catch {
              /* ignore */
            }
          }
          setPhase("listening");
          break;
        case "input_audio_buffer.speech_stopped":
          setPhase("thinking");
          break;
        case "response.created":
        case "response.output_audio.delta":
        case "response.audio.delta":
          setPhase("speaking");
          if (remoteAudioRef.current?.paused) {
            void remoteAudioRef.current.play().catch(() => undefined);
          }
          break;
        case "response.done":
          setPhase("live");
          break;
        case "conversation.item.input_audio_transcription.completed":
          if (event.transcript) {
            pushLine({ role: "user", text: String(event.transcript).trim() });
          }
          break;
        case "response.output_audio_transcript.done":
        case "response.audio_transcript.done":
          if (event.transcript) {
            pushLine({ role: "assistant", text: String(event.transcript).trim() });
          }
          break;
        case "response.function_call_arguments.done":
          void handleToolCall(event);
          break;
        case "error":
          pushLine({
            role: "system",
            text: event.error?.message || "Realtime xətası",
          });
          break;
        default:
          break;
      }
    },
    [handleToolCall, pushLine],
  );

  const configureAndGreet = useCallback(() => {
    // Session already configured via client_secrets; reinforce low-latency VAD + barge-in
    sendEvent({
      type: "session.update",
      session: {
        type: "realtime",
        audio: {
          input: {
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 200,
              silence_duration_ms: 400,
              create_response: true,
              interrupt_response: true,
            },
          },
        },
      },
    });

    if (greetedRef.current) return;
    greetedRef.current = true;
    const greeting = firstMessageRef.current.trim();
    if (greeting) {
      pushLine({ role: "assistant", text: greeting });
    }
    sendEvent({
      type: "response.create",
      response: {
        output_modalities: ["audio"],
        instructions: greeting
          ? `Zəngi aç. İlk cümlən MƏHZ bu olsun (dəyişmə): «${greeting}». Sonra SUS və dinlə. Yenidən salamlaşma. Bot/AI demə.`
          : "Qısa peşəkar salamla, adını və şirkəti de, sonra dinlə. Bot/AI demə.",
      },
    });
  }, [pushLine, sendEvent]);

  async function startCall() {
    // Tear down any previous peer without flipping generation twice
    inCallRef.current = false;
    greetedRef.current = false;
    stopMeter();
    try {
      dcRef.current?.close();
    } catch {
      /* ignore */
    }
    try {
      pcRef.current?.getSenders().forEach((s) => s.track?.stop());
      pcRef.current?.close();
    } catch {
      /* ignore */
    }
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }
    pcRef.current = null;
    dcRef.current = null;
    localStreamRef.current = null;

    sessionGenerationRef.current += 1;
    const generation = sessionGenerationRef.current;

    setError("");
    setLines([]);
    setTools([]);
    setMuted(false);
    mutedRef.current = false;
    setPhase("connecting");
    setConnected(true);
    pushLine({ role: "system", text: "OpenAI Realtime qoşulur…" });

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
      setEngineLabel(session.engine || session.provider || "openai");
      setModelLabel(session.model || "");
      firstMessageRef.current = session.firstMessage || "";

      const ephemeralKey =
        session.value || session.token || session.client_secret?.value || "";
      if (!ephemeralKey || session.transport !== "webrtc") {
        throw new Error(
          "OpenAI Realtime token alınmadı. OPENAI_API_KEY və VOICE_PROVIDER=openai yoxlayın.",
        );
      }

      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      localStreamRef.current = localStream;
      startMeter(localStream);

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (!remoteAudioRef.current) {
          remoteAudioRef.current = new Audio();
          remoteAudioRef.current.autoplay = true;
        }
        remoteAudioRef.current.srcObject = stream;
        void remoteAudioRef.current.play().catch(() => undefined);
      };

      for (const track of localStream.getTracks()) {
        pc.addTrack(track, localStream);
      }

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onopen = () => {
        if (sessionGenerationRef.current !== generation) return;
        inCallRef.current = true;
        setPhase("live");
        configureAndGreet();
      };
      dc.onmessage = (ev) => handleServerEvent(ev);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp || "",
      });

      if (!sdpResponse.ok) {
        const errText = await sdpResponse.text();
        throw new Error(`WebRTC qoşulması uğursuz: ${errText.slice(0, 240) || sdpResponse.status}`);
      }

      await pc.setRemoteDescription({
        type: "answer",
        sdp: await sdpResponse.text(),
      });
    } catch (e: unknown) {
      inCallRef.current = false;
      setConnected(false);
      setError(errMessage(e) || "Zəng başladılmadı");
      setPhase("error");
      await hangup();
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
  }

  const live = connected && phase !== "error" && phase !== "idle";
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
          <span className="ok">
            {engineLabel === "openai"
              ? `OpenAI Realtime${modelLabel ? ` · ${modelLabel}` : ""}`
              : `${engineLabel} · hazır`}
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
            {operatorName} ilə real vaxtda danışın — OpenAI speech-to-speech, aşağı gecikmə,
            barge-in aktiv.
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
              data-live={live ? "true" : "false"}
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
                Zəngi başladın. Transkript Realtime STT ilə burada görünəcək.
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
                Axtarış və data alətləri burada izlənir. Cavab hədəfi: 1–2 saniyə.
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
            <span>{operatorName} · OpenAI Realtime · barge-in</span>
          </div>
        </div>
      </section>

      <footer className="callai-foot">
        <p>{projectName || "AI Voice OS"} · Azərbaycan dili · OpenAI Realtime</p>
      </footer>
    </div>
  );
}
