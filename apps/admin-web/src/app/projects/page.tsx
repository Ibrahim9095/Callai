"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, clearToken, getToken } from "@/lib/api";
import { OPERATOR_CATALOG } from "@aivoiceos/shared";

type Template = { id: string; label: string; description: string };
type Project = {
  id: string;
  name: string;
  businessTemplate: string;
  businessLabel?: string | null;
  status: "draft" | "active" | "paused";
  agent?: { active: boolean; persona?: string; voiceProvider: string; voiceId: string } | null;
  phoneNumber?: { e164: string; operator?: string | null; status: string } | null;
};

const CUSTOM = "custom";

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState("");
  const [tmpl, setTmpl] = useState("hotel");
  const [customType, setCustomType] = useState("");
  const [operatorId, setOperatorId] = useState("leyla");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    Promise.all([api.projects(), api.templates()])
      .then(([p, t]) => {
        setProjects(p);
        setTemplates(t);
        if (t[0]) setTmpl(t[0].id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (tmpl === CUSTOM && !customType.trim()) {
      setError("Biznes növünü yazın (məs. Təkər təmiri)");
      return;
    }
    setCreating(true);
    try {
      const p = await api.createProject(
        name.trim(),
        tmpl,
        tmpl === CUSTOM ? customType.trim() : undefined,
        operatorId,
      );
      setProjects((prev) => [p, ...prev]);
      setName("");
      setCustomType("");
      setOperatorId("leyla");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  function logout() {
    clearToken();
    router.replace("/login");
  }

  function label(p: Project) {
    return p.businessLabel || templates.find((t) => t.id === p.businessTemplate)?.label || p.businessTemplate;
  }

  return (
    <>
      <div className="topbar">
        <div className="brand">
          AI Voice <span>OS</span>
        </div>
        <div className="row">
          <span className="muted">Layihələr</span>
          <button className="btn ghost" onClick={logout}>Çıxış</button>
        </div>
      </div>

      <div className="container grid" style={{ gap: "1.4rem" }}>
        <section className="card">
          <h2 className="title" style={{ fontSize: "1.15rem" }}>Yeni layihə (biznes)</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Layihə adı şirkət kimi salamda çıxır. Operator yalnız <b>Leyla</b> və ya <b>Samir</b>.
          </p>
          <form onSubmit={createProject} className="grid cols-2">
            <div>
              <label htmlFor="name">Layihə / şirkət adı</label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Məs. Premium Auto Service"
                required
                minLength={2}
              />
            </div>
            <div>
              <label htmlFor="tmpl">Biznes tipi</label>
              <select id="tmpl" value={tmpl} onChange={(e) => setTmpl(e.target.value)}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
                <option value={CUSTOM}>Digər (özüm yazıram)…</option>
              </select>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label>Operator</label>
              <div className="operator-picks" role="radiogroup" aria-label="Operator">
                {OPERATOR_CATALOG.map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    role="radio"
                    aria-checked={operatorId === op.id}
                    className={`operator-pick ${operatorId === op.id ? "selected" : ""}`}
                    onClick={() => setOperatorId(op.id)}
                  >
                    <span className="operator-pick-name">{op.name}</span>
                    <span className="operator-pick-meta">
                      {op.gender === "female" ? "Qadın səs" : "Kişi səs"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {tmpl === CUSTOM ? (
              <div style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="customType">Biznes növü (manual)</label>
                <input
                  id="customType"
                  value={customType}
                  onChange={(e) => setCustomType(e.target.value)}
                  placeholder="Məs. Təkər təmiri, Kondisioner servisi…"
                />
              </div>
            ) : null}

            <div style={{ alignSelf: "end" }}>
              <button className="btn primary" disabled={creating}>
                {creating ? "Yaradılır…" : "Layihə yarat"}
              </button>
            </div>
          </form>
          {error ? <p className="error">{error}</p> : null}
        </section>

        <section className="grid" style={{ gap: "0.6rem" }}>
          <h2 className="title" style={{ fontSize: "1.15rem", margin: 0 }}>Layihələr</h2>
          {loading ? (
            <p className="muted">Yüklənir…</p>
          ) : projects.length === 0 ? (
            <p className="muted">Hələ layihə yoxdur. Yuxarıdan yeni layihə yaradın.</p>
          ) : (
            <div className="list">
              {projects.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`} className="card item">
                  <div>
                    <h3>{p.name}</h3>
                    <small>
                      {label(p)}
                      {p.agent?.persona ? ` · ${p.agent.persona}` : ""}
                      {p.phoneNumber?.e164 ? ` · ☎ ${p.phoneNumber.e164}` : " · nömrə yoxdur"}
                    </small>
                  </div>
                  <span className={`pill ${p.status}`}>{statusLabel(p.status)}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function statusLabel(s: string) {
  return s === "active" ? "Aktiv" : s === "paused" ? "Dayandırılıb" : "Qaralama";
}
