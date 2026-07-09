"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken } from "@/lib/api";
import {
  DEFAULT_SPEECH_SPEED,
  OPERATOR_CATALOG,
  SPEECH_SPEEDS,
  normalizeSpeechSpeed,
  resolveOperator,
  voiceForOperator,
} from "@aivoiceos/shared";

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
  const [phoneInput, setPhoneInput] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api
      .project(id)
      .then((p) => {
        setProject(p);
        setAgent({
          ...p.agent,
          speechSpeed: normalizeSpeechSpeed(p.agent?.speechSpeed),
        });
        setOperatorId(resolveOperator(p.agent?.persona).id);
        setPhoneInput(p.phoneNumber?.e164 ? formatPhone(p.phoneNumber.e164) : "");
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
      const speed = normalizeSpeechSpeed(agent.speechSpeed ?? DEFAULT_SPEECH_SPEED);

      // Persist phone if typed and different / missing
      const typedPhone = phoneInput.trim();
      if (typedPhone) {
        const current = project.phoneNumber?.e164 || "";
        const normalizedTyped = typedPhone.replace(/\s/g, "");
        const normalizedCurrent = String(current).replace(/\s/g, "");
        if (!current || normalizedTyped !== normalizedCurrent) {
          try {
            await api.assignPhone(id, typedPhone);
          } catch (e: any) {
            // Keep going for agent fields; surface phone error
            setError(e.message || "Telefon saxlanılmadı");
          }
        }
      }

      const updated = await api.updateAgent(id, {
        operatorId: op.id,
        persona: op.name,
        prompt: agent.prompt,
        userPrompt: agent.userPrompt || "",
        language: agent.language || "az",
        voiceProvider: op.voiceProvider,
        voiceId: op.voiceId,
        speechSpeed: speed,
        greeting: agent.greeting || "",
      });
      setProject(updated);
      setAgent({
        ...updated.agent,
        speechSpeed: normalizeSpeechSpeed(updated.agent?.speechSpeed),
      });
      setOperatorId(resolveOperator(updated.agent?.persona).id);
      if (updated.phoneNumber?.e164) {
        setPhoneInput(formatPhone(updated.phoneNumber.e164));
      }
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
      setAgent({
        ...updated.agent,
        speechSpeed: normalizeSpeechSpeed(updated.agent?.speechSpeed),
      });
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function removePhone() {
    setError("");
    try {
      const updated = await api.removePhone(id);
      setProject(updated);
      setPhoneInput("");
      setDirty(true);
      setSaved(false);
    } catch (e: any) {
      setError(e.message);
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
        <div className="brand">
          AI Voice <span>OS</span>
        </div>
        <Link href="/projects" className="back">
          ← Layihələr
        </Link>
      </div>

      <div className="container grid" style={{ gap: "1.2rem" }}>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div>
            <h1 className="title" style={{ margin: 0 }}>
              {project.name}
            </h1>
            <span className="muted">{project.businessTemplate}</span>
          </div>
          <div className="spacer" />
          <span className={`pill ${project.status}`}>
            {project.status === "active"
              ? "Aktiv"
              : project.status === "paused"
                ? "Dayandırılıb"
                : "Qaralama"}
          </span>
          <button className="btn" onClick={toggleStatus} type="button">
            {project.status === "active" ? "Deaktiv et" : "Aktiv et"}
          </button>
          <button className="btn primary" onClick={() => void save()} disabled={saving} type="button">
            {saving ? "Saxlanır…" : saved ? "Saxlanıldı ✓" : "Yadda saxla"}
          </button>
          <button className="btn danger" onClick={() => void removeProject()} disabled={deleting} type="button">
            {deleting ? "Silinir…" : "Sil"}
          </button>
        </div>

        {saved ? (
          <p style={{ color: "var(--ok)", margin: 0, fontWeight: 700 }}>
            Yadda saxlanıldı ✓ — operator «{currentOp.name}» · {project.name}
          </p>
        ) : null}
        {error ? (
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
        ) : null}

        <section className="card grid">
          <h2 className="title" style={{ fontSize: "1.1rem", margin: 0 }}>
            AI Operator
          </h2>

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
              Yalnız <b>Leyla</b> və <b>Samir</b>. Yuxarıdakı <b>Yadda saxla</b> hər şeyi saxlayır.
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
              <label>Danışıq sürəti (Speech Speed)</label>
              <select
                value={String(normalizeSpeechSpeed(agent.speechSpeed))}
                onChange={(e) => {
                  setSaved(false);
                  setDirty(true);
                  setAgent({ ...agent, speechSpeed: Number(e.target.value) });
                }}
              >
                {SPEECH_SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s.toFixed(1)}x{s === 1.2 ? " (Standart)" : s === 1.0 ? " (Normal)" : ""}
                  </option>
                ))}
              </select>
              <p className="hint">1.2x tövsiyə olunur — təbii call-center tempi.</p>
            </div>
          </div>

          {/* Order: Salamlama → User Prompt → System Prompt */}
          <div>
            <label>1. Salamlama (Greeting) — zəng açılınca SƏSLƏNİR</label>
            <textarea
              value={agent.greeting || ""}
              onChange={(e) => {
                setSaved(false);
                setDirty(true);
                setAgent({ ...agent, greeting: e.target.value });
              }}
              placeholder={`Boş buraxın → avtomatik: «Salam. ${project?.name || "Şirkət"}-dən mən ${currentOp.name}${currentOp.id === "leyla" ? "yam" : "əm"}. Buyurun…»`}
              rows={2}
            />
            <p className="hint">AI-nin ilk cümləsi. Operator adını daxil edin.</p>
          </div>

          <div>
            <label>2. User Prompt — danışıq tərzi və davranış</label>
            <textarea
              value={agent.userPrompt || ""}
              onChange={(e) => {
                setSaved(false);
                setDirty(true);
                setAgent({ ...agent, userPrompt: e.target.value });
              }}
              placeholder="Məs: Bu gün yeni kampaniyanı ilk olaraq müştəriyə təqdim et. Mehriban və səbirli ol."
              rows={4}
            />
            <p className="hint">
              Səssiz təlimatdır — səslənmir. «Salam mən …yam» yazmayın (o Salamlama sahəsinə aiddir).
            </p>
          </div>

          <div>
            <label>3. System Prompt — sistem səviyyəsində texniki qaydalar</label>
            <textarea
              value={agent.prompt || ""}
              onChange={(e) => {
                setSaved(false);
                setDirty(true);
                setAgent({ ...agent, prompt: e.target.value });
              }}
              placeholder="Biznes qaydaları, məhsul siyasəti, məlumat mənbəyi…"
              rows={6}
            />
          </div>

          <div>
            <label>Telefon nömrəsi</label>
            {project.phoneNumber ? (
              <div className="row" style={{ marginBottom: "0.5rem" }}>
                <div>
                  <div style={{ fontSize: "1.05rem", fontWeight: 700 }}>
                    {formatPhone(project.phoneNumber.e164)}
                  </div>
                  <small className="muted">
                    {project.phoneNumber.operator || "Operator naməlum"} ·{" "}
                    {project.phoneNumber.status === "active"
                      ? "Aktiv (routing)"
                      : "Təyin olunub (routing gözləyir)"}
                  </small>
                </div>
                <div className="spacer" />
                <button className="btn danger" onClick={() => void removePhone()} type="button">
                  Nömrəni sil
                </button>
              </div>
            ) : null}
            <input
              value={phoneInput}
              onChange={(e) => {
                setPhoneInput(e.target.value);
                setDirty(true);
                setSaved(false);
              }}
              placeholder="050 123 45 67  və ya  +994 50 123 45 67"
            />
            <p className="hint">Yuxarıdakı Yadda saxla ilə birlikdə saxlanır.</p>
          </div>

          <div>
            <label>Səs</label>
            <input
              readOnly
              value={`${currentOp.name} · ${currentOp.gender === "female" ? "qadın" : "kişi"} · ${normalizeSpeechSpeed(agent.speechSpeed).toFixed(1)}x · neural AZ`}
            />
          </div>
        </section>

        <section className="card">
          <div className="row">
            <div>
              <h2 className="title" style={{ fontSize: "1.1rem", margin: 0 }}>
                Bilik bazası / Data
              </h2>
              <p className="muted" style={{ margin: "0.3rem 0 0" }}>
                Layihənin datası. Agent zəngdə buradan cavab verəcək.
              </p>
            </div>
            <div className="spacer" />
            <Link className="btn primary" href={`/projects/${id}/data`}>
              Datanı idarə et →
            </Link>
          </div>
        </section>

        <section className="card">
          <div className="row">
            <div>
              <h2 className="title" style={{ fontSize: "1.1rem", margin: 0 }}>
                Test zəng (voice)
              </h2>
              <p className="muted" style={{ margin: "0.3rem 0 0" }}>
                {project.status === "active"
                  ? `CallAI interfeysi · barge-in · ${normalizeSpeechSpeed(agent.speechSpeed).toFixed(1)}x`
                  : "Layihə deaktivdir — əvvəl «Aktiv et», sonra Test zəng."}
              </p>
            </div>
            <div className="spacer" />
            <Link
              className="btn primary"
              href={`/projects/${id}/call`}
              onClick={(e) => {
                if (dirty) {
                  const ok = window.confirm(
                    "Son dəyişikliyi hələ «Yadda saxla» etməmisiniz. Yenə də keçilsin?",
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
