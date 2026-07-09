"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Conversation } from "@elevenlabs/client";
import { api, getToken } from "@/lib/api";

const TOOL_NAMES = ["list_collections", "search_records", "create_record", "update_record"] as const;

type Status = "idle" | "connecting" | "live" | "listening" | "speaking" | "tool" | "error";
type Line = { role: "user" | "assistant" | "system"; text: string };

export default function TestCallPage() {
  const router = useRouter();
  const { id: pid } = useParams<{ id: string }>();
  const [projectName, setProjectName] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [toolsLog, setToolsLog] = useState<string[]>([]);
  const conversationRef = useRef<Awaited<ReturnType<typeof Conversation.startSession>> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api
      .project(pid)
      .then((p) => setProjectName(p.name))
      .catch((e) => setError(e.message));
  }, [pid, router]);

  const stop = useCallback(async () => {
    try {
      await conversationRef.current?.endSession?.();
    } catch {
      /* ignore */
    }
    conversationRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setStatus("idle");
  }, []);

  useEffect(() => () => {
    void stop();
  }, [stop]);

  function pushLine(line: Line) {
    setLines((prev) => [...prev.slice(-40), line]);
  }

  function buildClientTools() {
    const tools: Record<string, (params?: Record<string, unknown>) => Promise<unknown>> = {};
    for (const name of TOOL_NAMES) {
      tools[name] = async (params = {}) => {
        setStatus("tool");
        setToolsLog((prev) => [...prev.slice(-20), `→ ${name}(${JSON.stringify(params).slice(0, 120)})`]);
        try {
          const result = await api.voiceTool(pid, name, params);
          setToolsLog((prev) => [
            ...prev.slice(-20),
            `✓ ${name}: ${JSON.stringify(result).slice(0, 160)}`,
          ]);
          setStatus("live");
          return result;
        } catch (err: any) {
          setToolsLog((prev) => [...prev.slice(-20), `✗ ${name}: ${err.message}`]);
          setStatus("live");
          return { error: err.message };
        }
      };
    }
    return tools;
  }

  async function start() {
    setError("");
    setLines([]);
    setToolsLog([]);
    setStatus("connecting");
    pushLine({ role: "system", text: "Sessiya açılır…" });

    try {
      const session = await api.voiceSession(pid);
      try {
        localStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        /* SDK may request mic */
      }

      conversationRef.current = await Conversation.startSession({
        conversationToken: session.token,
        connectionType: "webrtc",
        clientTools: buildClientTools(),
        onConnect: () => {
          setStatus("live");
          pushLine({ role: "system", text: "Bağlandı — danışa bilərsiniz" });
        },
        onDisconnect: () => {
          setStatus("idle");
          pushLine({ role: "system", text: "Zəng bitdi" });
        },
        onError: (err) => {
          const message = typeof err === "string" ? err : (err as Error)?.message || "Səs xətası";
          setError(message);
          setStatus("error");
        },
        onModeChange: ({ mode }) => {
          if (mode === "speaking") setStatus("speaking");
          else if (mode === "listening") setStatus("listening");
          else setStatus("live");
        },
        onMessage: (message) => {
          const role = message?.source === "user" ? "user" : "assistant";
          const text = String(message?.message || (message as any)?.text || "").trim();
          if (text) pushLine({ role, text });
        },
      });
    } catch (e: any) {
      setError(e.message || "Zəng başladılmadı");
      setStatus("error");
    }
  }

  const busy = status === "connecting" || status === "live" || status === "listening" || status === "speaking" || status === "tool";

  return (
    <>
      <div className="topbar">
        <div className="brand">AI Voice <span>OS</span></div>
        <Link href={`/projects/${pid}`} className="back">← Layihə</Link>
      </div>

      <div className="container grid" style={{ gap: "1.1rem", maxWidth: 720 }}>
        <div>
          <h1 className="title" style={{ margin: 0 }}>Test zəng</h1>
          <p className="muted" style={{ margin: "0.3rem 0 0" }}>
            {projectName || "…"} — agent yüklənmiş fayllardan oxuyub rezerv/sifariş yaza bilər.
            Mikrofon icazəsi lazımdır.
          </p>
        </div>

        <section className="card grid">
          <div className="row">
            <span className={`pill ${status === "error" ? "paused" : status === "idle" ? "draft" : "active"}`}>
              {statusLabel(status)}
            </span>
            <div className="spacer" />
            {!busy ? (
              <button className="btn primary" onClick={start}>
                Zəngi başlat
              </button>
            ) : (
              <button className="btn danger" onClick={() => void stop()}>
                Bitir
              </button>
            )}
          </div>
          {error ? <p className="error">{error}</p> : null}
          <p className="hint" style={{ margin: 0 }}>
            Nümunə: «Boş otaq varmı?» və ya «2 nəfərlik masa rezerv edim, sabah 19:00».
            Agent əvvəl dataya baxacaq, sonra «Rezervlər»ə yazacaq.
          </p>
        </section>

        <section className="card">
          <h2 className="title" style={{ fontSize: "1.05rem", marginTop: 0 }}>Transkript</h2>
          {lines.length === 0 ? (
            <p className="muted">Hələ söhbət yoxdur.</p>
          ) : (
            <div className="list" style={{ maxHeight: 320, overflowY: "auto" }}>
              {lines.map((l, i) => (
                <div key={i} style={{ padding: "0.35rem 0", borderBottom: "1px solid var(--line)" }}>
                  <small className="muted">
                    {l.role === "user" ? "Siz" : l.role === "assistant" ? "Agent" : "Sistem"}
                  </small>
                  <div>{l.text}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {toolsLog.length > 0 ? (
          <section className="card">
            <h2 className="title" style={{ fontSize: "1.05rem", marginTop: 0 }}>Alətlər (fayl oxu/yaz)</h2>
            <pre
              style={{
                margin: 0,
                fontSize: "0.75rem",
                whiteSpace: "pre-wrap",
                color: "var(--muted)",
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              {toolsLog.join("\n")}
            </pre>
          </section>
        ) : null}
      </div>
    </>
  );
}

function statusLabel(s: Status) {
  switch (s) {
    case "connecting":
      return "Qoşulur…";
    case "live":
      return "Canlı";
    case "listening":
      return "Dinləyir";
    case "speaking":
      return "Danışır";
    case "tool":
      return "Dataya baxır…";
    case "error":
      return "Xəta";
    default:
      return "Hazır";
  }
}
