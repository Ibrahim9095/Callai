"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken } from "@/lib/api";
import { OPERATOR_CATALOG, resolveOperator, voiceForOperator } from "@aivoiceos/shared";

function formatPhone(e164: string): string {
  const d = String(e164 || "").replace(/[^\d]/g, "").replace(/^994/, "");
  if (d.length !== 9) return e164;
  return `+994 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
}

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [project, setProject] = useState<any>(null);
  const [agent, setAgent] = useState<any>(null);
  const [operatorId, setOperatorId] = useState("leyla");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
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
        setOperatorId(resolveOperator(p.agent?.persona).id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, router]);

  function selectOperator(nextId: string) {
    const op = resolveOperator(nextId);
    const voice = voiceForOperator(op.id);
    setOperatorId(op.id);
    setSaved(false);
    setDirty(true);
    setAgent({
      ...agent,
      persona: op.name,
      voiceProvider: voice.voiceProvider,
      voiceId: voice.voiceId,
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const op = resolveOperator(operatorId);
      const updated = await api.updateAgent(id, {
        operatorId: op.id,
        persona: op.name,
        prompt: agent.prompt,
        language: agent.language || "az",
        voiceProvider: op.voiceProvider,
        voiceId: op.voiceId,
        greeting: "",
      });
      setProject(updated);
      setAgent(updated.agent);
      setOperatorId(resolveOperator(updated.agent?.persona).id);
      setSaved(true);
      setDirty(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      setError(e.message || "Saxlanılmadı");
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

  const currentOp = resolveOperator(operatorId);

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
          <div className="row" style={{ alignItems: "flex-start" }}>
            <h2 className="title" style={{ fontSize: "1.1rem", margin: 0 }}>AI Operator</h2>
            <div className="spacer" />
            <button className="btn primary" onClick={save} disabled={saving} style={{ minWidth: 140 }}>
              {saving ? "Saxlanır…" : "Yadda saxla"}
            </button>
          </div>
          {saved ? (
            <p style={{ color: "var(--ok)", margin: 0, fontWeight: 700 }}>
              Yadda saxlanıldı ✓ — zəngdə: «{currentOp.name}» · {project.name}
            </p>
          ) : null}
          {error ? <p className="error" style={{ margin: 0 }}>{error}</p> : null}

          <div>
            <label>Operator</label>
            <div className="operator-picks" role="radiogroup" aria-label="Operator">
              {OPERATOR_CATALOG.map((op) => (
                <button
                  key={op.id}
                  type="button"
                  role="radio"
                  aria-checked={operatorId === op.id}
                  className={`operator-pick ${operatorId === op.id ? "selected" : ""}`}
                  onClick={() => selectOperator(op.id)}
                >
                  <span className="operator-pick-name">{op.name}</span>
                  <span className="operator-pick-meta">
                    {op.gender === "female" ? "Qadın səs" : "Kişi səs"}
                  </span>
                </button>
              ))}
            </div>
            <p className="hint" style={{ marginBottom: 0 }}>
              Hazırda yalnız <b>Leyla</b> və <b>Samir</b>. Seçin → <b>Yadda saxla</b> → Test zəng.
              Salamda şirkət adı («{project.name}») + operator adı çıxacaq.
            </p>
          </div>

          <div className="grid cols-2">
            <div>
              <label>Dil</label>
              <select
                value={agent.language || "az"}
                onChange={(e) => {
                  setSaved(false);
                  setDirty(true);
                  setAgent({ ...agent, language: e.target.value });
                }}
              >
                <option value="az">Azərbaycan (az)</option>
                <option value="tr">Türk (tr)</option>
                <option value="en">İngilis (en)</option>
                <option value="ru">Rus (ru)</option>
              </select>
            </div>
            <div>
              <label>Səs (avtomatik)</label>
              <input
                readOnly
                value={
                  currentOp.gender === "female"
                    ? "Qadın səs — Leyla"
                    : "Kişi səs — Samir"
                }
              />
              <p className="hint">Səs operatora bağlıdır; əl ilə dəyişilmir.</p>
            </div>
          </div>

          <div>
            <label>Prompt (agent təlimatı)</label>
            <textarea
              value={agent.prompt || ""}
              onChange={(e) => {
                setSaved(false);
                setDirty(true);
                setAgent({ ...agent, prompt: e.target.value });
              }}
            />
          </div>

          <button
            className="btn primary"
            onClick={save}
            disabled={saving}
            style={{ width: "100%", fontSize: "1.05rem", padding: "0.9rem" }}
          >
            {saving ? "Yadda saxlanılır…" : "Yadda saxla"}
          </button>
        </section>

        <div className="save-bar">
          <div className="save-bar-inner">
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              Operator: <b style={{ color: "var(--ink)" }}>{currentOp.name}</b>
            </span>
            <button className="btn primary" onClick={save} disabled={saving}>
              {saving ? "…" : saved ? "Saxlanıldı ✓" : "Yadda saxla"}
            </button>
          </div>
        </div>

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
                Azercell / Bakcell / Nar / şəhər nömrəsi. Canlı yönləndirmə SIP qoşulduqdan sonra.
              </p>
            </div>
          )}
        </section>

        <section className="card">
          <div className="row">
            <div>
              <h2 className="title" style={{ fontSize: "1.1rem", margin: 0 }}>Bilik bazası / Data</h2>
              <p className="muted" style={{ margin: "0.3rem 0 0" }}>
                Layihənin datası. Agent zəngdə buradan cavab verəcək.
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
                Salam: «{project.name}» + «{currentOp.name}». Əvvəl <b>Yadda saxla</b>, sonra zəng.
              </p>
            </div>
            <div className="spacer" />
            <Link
              className="btn primary"
              href={`/projects/${id}/call`}
              onClick={(e) => {
                if (dirty) {
                  const ok = window.confirm(
                    "Son dəyişikliyi hələ «Yadda saxla» etməmisiniz — zəngdə köhnə operator qala bilər. Yenə də keçilsin?",
                  );
                  if (!ok) e.preventDefault();
                }
              }}
            >
              Test zəng →
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
