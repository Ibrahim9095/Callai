"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken } from "@/lib/api";

type Field = { key: string; label: string; type: string; required?: boolean };
type Collection = { id: string; name: string; label: string; fields: Field[]; _count?: { records: number } };

export default function DataPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const pid = params.id;

  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [records, setRecords] = useState<any[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [form, setForm] = useState<Record<string, any>>({});
  const [csv, setCsv] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api
      .collections(pid)
      .then((cols) => {
        setCollections(cols);
        if (cols[0]) setActiveId(cols[0].id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [pid, router]);

  useEffect(() => {
    if (!activeId) return;
    setError("");
    setMsg("");
    api
      .records(pid, activeId)
      .then(({ collection, records }) => {
        setFields(collection.fields || []);
        setRecords(records);
        setForm({});
      })
      .catch((e) => setError(e.message));
  }, [activeId, pid]);

  const active = collections.find((c) => c.id === activeId);

  async function addRecord(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.createRecord(pid, activeId, form);
      const { records } = await api.records(pid, activeId);
      setRecords(records);
      setForm({});
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function removeRecord(rid: string) {
    if (!window.confirm("Bu sətir silinsin?")) return;
    await api.deleteRecord(pid, activeId, rid);
    setRecords((prev) => prev.filter((r) => r.id !== rid));
  }

  async function doImport() {
    setError("");
    setMsg("");
    try {
      const res = await api.importCsv(pid, activeId, csv);
      setMsg(`${res.imported} sətir idxal edildi`);
      setCsv("");
      const { records } = await api.records(pid, activeId);
      setRecords(records);
    } catch (e: any) {
      setError(e.message);
    }
  }

  function renderInput(f: Field) {
    const v = form[f.key] ?? "";
    if (f.type === "boolean") {
      return (
        <select value={String(v)} onChange={(e) => setForm({ ...form, [f.key]: e.target.value === "true" })}>
          <option value="false">Xeyr</option>
          <option value="true">Bəli</option>
        </select>
      );
    }
    return (
      <input
        type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
        value={v}
        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
        placeholder={f.label}
      />
    );
  }

  return (
    <>
      <div className="topbar">
        <div className="brand">AI Voice <span>OS</span></div>
        <Link href={`/projects/${pid}`} className="back">← Layihə</Link>
      </div>

      <div className="container grid" style={{ gap: "1.1rem" }}>
        <h1 className="title" style={{ margin: 0 }}>Bilik bazası / Data</h1>
        <p className="muted" style={{ marginTop: "-0.6rem" }}>
          Bu layihənin datası burada saxlanılır. AI agent zəngdə buradan oxuyacaq (boş otaq,
          qiymət, stok) və yeni sətir əlavə edəcək (məs. rezerv).
        </p>

        {loading ? (
          <p className="muted">Yüklənir…</p>
        ) : collections.length === 0 ? (
          <p className="muted">Kolleksiya yoxdur.</p>
        ) : (
          <>
            <div className="row">
              {collections.map((c) => (
                <button
                  key={c.id}
                  className={`btn ${c.id === activeId ? "primary" : "ghost"}`}
                  onClick={() => setActiveId(c.id)}
                >
                  {c.label} {typeof c._count?.records === "number" ? `(${c._count.records})` : ""}
                </button>
              ))}
            </div>

            {active ? (
              <>
                <section className="card">
                  <h2 className="title" style={{ fontSize: "1.05rem", marginTop: 0 }}>
                    Yeni sətir — {active.label}
                  </h2>
                  <form onSubmit={addRecord} className="grid cols-2">
                    {fields.map((f) => (
                      <div key={f.key}>
                        <label>{f.label}{f.required ? " *" : ""}</label>
                        {renderInput(f)}
                      </div>
                    ))}
                    <div style={{ alignSelf: "end" }}>
                      <button className="btn primary">Əlavə et</button>
                    </div>
                  </form>
                </section>

                <section className="card" style={{ overflowX: "auto" }}>
                  <h2 className="title" style={{ fontSize: "1.05rem", marginTop: 0 }}>
                    Sətirlər ({records.length})
                  </h2>
                  {records.length === 0 ? (
                    <p className="muted">Hələ sətir yoxdur. Yuxarıdan əlavə edin və ya CSV idxal edin.</p>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                      <thead>
                        <tr>
                          {fields.map((f) => (
                            <th key={f.key} style={{ textAlign: "left", padding: "0.4rem", color: "var(--muted)" }}>
                              {f.label}
                            </th>
                          ))}
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((r) => (
                          <tr key={r.id} style={{ borderTop: "1px solid var(--line)" }}>
                            {fields.map((f) => (
                              <td key={f.key} style={{ padding: "0.4rem" }}>
                                {formatCell(r.data?.[f.key], f.type)}
                              </td>
                            ))}
                            <td style={{ padding: "0.4rem", textAlign: "right" }}>
                              <button className="btn danger" onClick={() => removeRecord(r.id)}>Sil</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>

                <section className="card">
                  <h2 className="title" style={{ fontSize: "1.05rem", marginTop: 0 }}>CSV / Excel idxalı</h2>
                  <p className="hint" style={{ marginTop: 0 }}>
                    Excel-də «Save as CSV» edin, sonra məzmunu bura yapışdırın. Başlıqlar sahə adları
                    ilə uyğun olmalıdır: <b>{fields.map((f) => f.label).join(", ")}</b>
                  </p>
                  <textarea
                    value={csv}
                    onChange={(e) => setCsv(e.target.value)}
                    placeholder={`${fields.map((f) => f.label).join(",")}\n...`}
                  />
                  <div className="row" style={{ marginTop: "0.6rem" }}>
                    <button className="btn primary" onClick={doImport} disabled={!csv.trim()}>
                      İdxal et
                    </button>
                    {msg ? <span style={{ color: "var(--ok)" }}>{msg}</span> : null}
                  </div>
                </section>
              </>
            ) : null}
          </>
        )}

        {error ? <p className="error">{error}</p> : null}
      </div>
    </>
  );
}

function formatCell(value: any, type: string) {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "boolean") return value ? "Bəli" : "Xeyr";
  return String(value);
}
