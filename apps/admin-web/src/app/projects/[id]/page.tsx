"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken } from "@/lib/api";

function formatPhone(e164: string): string {
  const d = String(e164 || "").replace(/[^\d]/g, "").replace(/^994/, "");
  if (d.length !== 9) return e164;
  return `+994 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
}

const VOICES = [
  { provider: "azure", voiceId: "az-AZ-BanuNeural", label: "Banu — Azərbaycan (qadın) · Azure" },
  { provider: "azure", voiceId: "az-AZ-BabekNeural", label: "Babək — Azərbaycan (kişi) · Azure" },
  { provider: "elevenlabs", voiceId: "eleven_v3_conversational", label: "ElevenLabs v3 (premium)" },
];

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [project, setProject] = useState<any>(null);
  const [agent, setAgent] = useState<any>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api
      .project(id)
      .then((p) => {
        setProject(p);
        setAgent(p.agent);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, router]);

  function voiceKey(a: any) {
    return `${a.voiceProvider}::${a.voiceId}`;
  }

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const updated = await api.updateAgent(id, {
        persona: agent.persona,
        prompt: agent.prompt,
        language: agent.language,
        voiceProvider: agent.voiceProvider,
        voiceId: agent.voiceId,
        greeting: agent.greeting || "",
      });
      setProject(updated);
      setAgent(updated.agent);
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    const next = project.status === "active" ? "paused" : "active";
    try {
      const updated = await api.setStatus(id, next);
      setProject(updated);
      setAgent(updated.agent);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function assignPhone() {
    if (!phoneInput.trim()) return;
    setPhoneBusy(true);
    setError("");
    try {
      const updated = await api.assignPhone(id, phoneInput.trim());
      setProject(updated);
      setPhoneInput("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPhoneBusy(false);
    }
  }

  async function removePhone() {
    setPhoneBusy(true);
    setError("");
    try {
      const updated = await api.removePhone(id);
      setProject(updated);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPhoneBusy(false);
    }
  }

  async function removeProject() {
    if (!window.confirm(`"${project.name}" layihəsi silinsin? Bu geri qaytarıla bilməz.`)) return;
    setDeleting(true);
    setError("");
    try {
      await api.deleteProject(id);
      router.replace("/projects");
    } catch (e: any) {
      setError(e.message);
      setDeleting(false);
    }
  }

  if (loading) return <div className="center-screen muted">Yüklənir…</div>;
  if (!project) return <div className="center-screen error">{error || "Tapılmadı"}</div>;

  return (
    <>
      <div className="topbar">
        <div className="brand">AI Voice <span>OS</span></div>
        <Link href="/projects" className="back">← Layihələr</Link>
      </div>

      <div className="container grid" style={{ gap: "1.2rem" }}>
        <div className="row">
          <div>
            <h1 className="title" style={{ margin: 0 }}>{project.name}</h1>
            <span className="muted">{project.businessTemplate}</span>
          </div>
          <div className="spacer" />
          <span className={`pill ${project.status}`}>
            {project.status === "active" ? "Aktiv" : project.status === "paused" ? "Dayandırılıb" : "Qaralama"}
          </span>
          <button className="btn" onClick={toggleStatus}>
            {project.status === "active" ? "Dayandır" : "Aktiv et"}
          </button>
          <button className="btn danger" onClick={removeProject} disabled={deleting}>
            {deleting ? "Silinir…" : "Sil"}
          </button>
        </div>

        <section className="card grid">
          <h2 className="title" style={{ fontSize: "1.1rem", margin: 0 }}>AI Agent</h2>

          <div className="grid cols-2">
            <div>
              <label>Persona</label>
              <input value={agent.persona || ""} onChange={(e) => setAgent({ ...agent, persona: e.target.value })} />
            </div>
            <div>
              <label>Dil</label>
              <select value={agent.language} onChange={(e) => setAgent({ ...agent, language: e.target.value })}>
                <option value="az">Azərbaycan (az)</option>
                <option value="tr">Türk (tr)</option>
                <option value="en">İngilis (en)</option>
                <option value="ru">Rus (ru)</option>
              </select>
            </div>
          </div>

          <div className="grid cols-2">
            <div>
              <label>Səs</label>
              <select
                value={voiceKey(agent)}
                onChange={(e) => {
                  const [provider, voiceId] = e.target.value.split("::");
                  setAgent({ ...agent, voiceProvider: provider, voiceId });
                }}
              >
                {VOICES.map((v) => (
                  <option key={`${v.provider}::${v.voiceId}`} value={`${v.provider}::${v.voiceId}`}>
                    {v.label}
                  </option>
                ))}
              </select>
              <p className="hint">Default: Azure Banu (doğma Azərbaycan, ucuz). Premium: ElevenLabs.</p>
            </div>
            <div>
              <label>Salamlama (ilk cümlə)</label>
              <input
                value={agent.greeting || ""}
                onChange={(e) => setAgent({ ...agent, greeting: e.target.value })}
                placeholder="Salam, ... Buyurun, necə kömək edə bilərəm?"
              />
            </div>
          </div>

          <div>
            <label>Prompt (agent təlimatı)</label>
            <textarea value={agent.prompt || ""} onChange={(e) => setAgent({ ...agent, prompt: e.target.value })} />
          </div>

          <div className="row">
            <button className="btn primary" onClick={save} disabled={saving}>
              {saving ? "Yadda saxlanılır…" : "Yadda saxla"}
            </button>
            {saved ? <span style={{ color: "var(--ok)" }}>Yadda saxlanıldı ✓</span> : null}
            {error ? <span className="error">{error}</span> : null}
          </div>
        </section>

        <section className="card grid">
          <h2 className="title" style={{ fontSize: "1.1rem", margin: 0 }}>Telefon nömrəsi</h2>
          {project.phoneNumber ? (
            <div className="row">
              <div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{formatPhone(project.phoneNumber.e164)}</div>
                <small className="muted">
                  {project.phoneNumber.operator || "Operator naməlum"} ·{" "}
                  {project.phoneNumber.status === "active" ? "Aktiv (routing)" : "Təyin olunub (routing gözləyir)"}
                </small>
              </div>
              <div className="spacer" />
              <button className="btn danger" onClick={removePhone} disabled={phoneBusy}>
                Nömrəni sil
              </button>
            </div>
          ) : (
            <div>
              <label>Azərbaycan nömrəsi təyin et</label>
              <div className="row">
                <input
                  style={{ flex: 1, minWidth: 200 }}
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="050 123 45 67  və ya  +994 50 123 45 67"
                />
                <button className="btn primary" onClick={assignPhone} disabled={phoneBusy}>
                  {phoneBusy ? "…" : "Təyin et"}
                </button>
              </div>
              <p className="hint">
                Azercell / Bakcell / Nar / şəhər nömrəsi. Nömrə platformada saxlanılır; canlı zəng
                yönləndirməsi Azərbaycan SIP provayderi qoşulduqdan sonra aktivləşəcək.
              </p>
            </div>
          )}
        </section>

        <section className="card">
          <div className="row">
            <div>
              <h2 className="title" style={{ fontSize: "1.1rem", margin: 0 }}>Bilik bazası / Data</h2>
              <p className="muted" style={{ margin: "0.3rem 0 0" }}>
                Layihənin datası (otaqlar, stok, rezervlər və s.). Agent zəngdə buradan cavab verəcək.
              </p>
            </div>
            <div className="spacer" />
            <Link className="btn primary" href={`/projects/${id}/data`}>Datanı idarə et →</Link>
          </div>
        </section>

        <section className="card">
          <div className="row">
            <div>
              <h2 className="title" style={{ fontSize: "1.1rem", margin: 0 }}>Test zəng (voice)</h2>
              <p className="muted" style={{ margin: "0.3rem 0 0" }}>
                Brauzerdən canlı söhbət — agent fayllardan oxuyub rezerv/sifariş yaza bilər.
                Əvvəl data yükləyin, sonra zəng edin.
              </p>
            </div>
            <div className="spacer" />
            <Link className="btn primary" href={`/projects/${id}/call`}>Test zəng →</Link>
          </div>
        </section>

        <section className="card">
          <h2 className="title" style={{ fontSize: "1.05rem", marginTop: 0 }}>Növbəti mərhələlər</h2>
          <p className="muted" style={{ margin: 0 }}>
            Canlı +994 SIP yönləndirmə, CRM və analitika sonrakı versiyalarda (docs/ROADMAP.md).
          </p>
        </section>
      </div>
    </>
  );
}
