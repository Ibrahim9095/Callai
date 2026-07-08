"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, clearToken, getToken } from "@/lib/api";

type Template = { id: string; label: string; description: string };
type Project = {
  id: string;
  name: string;
  businessTemplate: string;
  status: "draft" | "active" | "paused";
  agent?: { active: boolean; voiceProvider: string; voiceId: string } | null;
};

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState("");
  const [tmpl, setTmpl] = useState("hotel");
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
    setCreating(true);
    try {
      const p = await api.createProject(name.trim(), tmpl);
      setProjects((prev) => [p, ...prev]);
      setName("");
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
            Biznes tipini seçin — agent avtomatik həmin sahə üçün qurulacaq.
          </p>
          <form onSubmit={createProject} className="grid cols-2">
            <div>
              <label htmlFor="name">Layihə adı</label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Məs. Grand Baku Hotel"
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
              </select>
            </div>
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
                      {templateLabel(templates, p.businessTemplate)} · səs: {p.agent?.voiceId || "—"}
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

function templateLabel(templates: Template[], id: string) {
  return templates.find((t) => t.id === id)?.label || id;
}
function statusLabel(s: string) {
  return s === "active" ? "Aktiv" : s === "paused" ? "Dayandırılıb" : "Qaralama";
}
