import { useEffect, useRef, useState } from "react";
import { fetchHealth, fetchStore } from "./api.js";
import { VoiceAgent } from "./voiceAgent.js";

const STATUS_LABELS = {
  idle: "Hazır",
  connecting: "Zəng bağlanır…",
  live: "Xəttdəsiniz — danışın",
  listening: "Dinləyir…",
  thinking: "Bir saniyə…",
  speaking: "Leyla danışır…",
  tool: "Yoxlayır…",
  error: "Xəta",
};

export default function App() {
  const [status, setStatus] = useState("idle");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [transcripts, setTranscripts] = useState([]);
  const [tools, setTools] = useState([]);
  const [store, setStore] = useState(null);
  const [health, setHealth] = useState(null);
  const [level, setLevel] = useState(0);
  const [connected, setConnected] = useState(false);
  const agentRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(0);
  const logRef = useRef(null);

  useEffect(() => {
    fetchStore().then(setStore).catch(() => {});
    fetchHealth().then(setHealth).catch(() => {});
    return () => {
      cancelAnimationFrame(rafRef.current);
      agentRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [transcripts, tools]);

  function startMeter(stream) {
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = { ctx, analyser };
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
  }

  async function handleStart() {
    setError("");
    setTranscripts([]);
    setTools([]);
    setConnected(true);
    const agent = new VoiceAgent({
      onStatus: (s) => {
        setStatus(s);
        if (s === "idle" || s === "error") setConnected(false);
      },
      onTranscript: (item) => setTranscripts((prev) => [...prev.slice(-40), { ...item, id: crypto.randomUUID() }]),
      onTool: (item) =>
        setTools((prev) => {
          const next = [...prev];
          const idx = next.findIndex((t) => t.name === item.name && t.status === "running");
          if (idx >= 0 && item.status !== "running") next[idx] = { ...item, id: next[idx].id };
          else next.push({ ...item, id: crypto.randomUUID() });
          return next.slice(-20);
        }),
      onError: (err) => setError(err.message || String(err)),
      onRemoteStream: startMeter,
    });
    agentRef.current = agent;
    try {
      await agent.start();
    } catch (err) {
      setError(err.message || String(err));
      setConnected(false);
    }
  }

  async function handleStop() {
    cancelAnimationFrame(rafRef.current);
    if (analyserRef.current?.ctx) {
      void analyserRef.current.ctx.close();
      analyserRef.current = null;
    }
    setLevel(0);
    await agentRef.current?.stop();
    agentRef.current = null;
    setConnected(false);
    setMuted(false);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    agentRef.current?.setMuted(next);
  }

  const live = connected && status !== "error";
  const ringScale = 1 + level * 0.55;

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <header className="topbar">
        <div className="brand-mark">CallAI</div>
        <div className="top-meta">
          {store ? <span>{store.hours}</span> : null}
          {health ? (
            <span className={health.hasApiKey ? "ok" : "warn"}>
              {health.hasApiKey ? "API hazır" : "API açarı lazımdır"}
            </span>
          ) : null}
        </div>
      </header>

      <main className="hero">
        <section className="hero-copy">
          <p className="brand-hero">CallAI</p>
          <h1>Mağaza satışı və operator xətti</h1>
          <p className="lede">
            Leyla ilə telefon kimi danışın — məhsul seçin, sifariş verin, status öyrənin. Canlı səs,
            az gözləmə.
          </p>

          <div className="cta-row">
            {!live ? (
              <button className="btn primary" onClick={handleStart} type="button">
                Zəngi başlat
              </button>
            ) : (
              <>
                <button className="btn danger" onClick={handleStop} type="button">
                  Zəngi bitir
                </button>
                <button className="btn ghost" onClick={toggleMute} type="button">
                  {muted ? "Səsi aç" : "Səssiz"}
                </button>
              </>
            )}
          </div>

          {error ? <p className="error">{error}</p> : null}
        </section>

        <section className="stage" aria-label="Səsli agent">
          <div className="orb-wrap">
            <div className="orb-ring" style={{ transform: `scale(${ringScale})` }} />
            <div className={`orb ${status}`} data-live={live && status !== "idle"}>
              <span className="orb-core" />
            </div>
          </div>
          <p className="status-line">{STATUS_LABELS[status] || status}</p>
          <p className="agent-name">Leyla · CallAI Market</p>
        </section>
      </main>

      <section className="workspace">
        <div className="panel transcript-panel">
          <h2>Danışıq</h2>
          <div className="log" ref={logRef}>
            {transcripts.length === 0 ? (
              <p className="empty">Zəngi başladın və mikrofonla danışın. Transkript burada görünəcək.</p>
            ) : (
              transcripts.map((t) => (
                <div key={t.id} className={`bubble ${t.role}`}>
                  <span className="who">{t.role === "user" ? "Siz" : "Leyla"}</span>
                  <p>{t.text}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel tools-panel">
          <h2>Operator hərəkətləri</h2>
          <div className="log">
            {tools.length === 0 ? (
              <p className="empty">Axtarış, stok, sifariş və dəstək alətləri burada izlənir.</p>
            ) : (
              tools.map((t) => (
                <div key={t.id} className={`tool-row ${t.status}`}>
                  <div className="tool-head">
                    <strong>{labelTool(t.name)}</strong>
                    <span>{t.status}</span>
                  </div>
                  {t.args && Object.keys(t.args).length > 0 ? (
                    <pre>{JSON.stringify(t.args, null, 0)}</pre>
                  ) : null}
                </div>
              ))
            )}
          </div>
          {store ? (
            <div className="store-chip">
              <span>{store.name}</span>
              <span>{store.address}</span>
              <span>{store.phone}</span>
            </div>
          ) : null}
        </div>
      </section>

      <footer className="foot">
        <p>CallAI Market · Azərbaycan dili · satış və operator xətti</p>
      </footer>
    </div>
  );
}

function labelTool(name) {
  const map = {
    get_store_info: "Mağaza məlumatı",
    search_products: "Məhsul axtarışı",
    get_product: "Məhsul detalları",
    check_availability: "Stok yoxlaması",
    calculate_delivery: "Çatdırılma",
    create_order: "Sifariş yaratma",
    get_order_status: "Sifariş statusu",
    create_support_ticket: "Dəstək bileti",
    transfer_to_human: "Operatora ötürülmə",
  };
  return map[name] || name;
}
