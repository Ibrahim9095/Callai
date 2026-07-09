"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken } from "@/lib/api";

type Field = { key: string; label: string; type: string };
type Collection = {
  id: string;
  name: string;
  label: string;
  fields: Field[];
  fileId?: string | null;
  _count?: { records: number };
};
type DataFile = {
  id: string;
  filename: string;
  kind: string;
  sheetCount: number;
  rowCount: number;
  collections: { id: string; name: string; label: string }[];
};

export default function DataPage() {
  const router = useRouter();
  const { id: pid } = useParams<{ id: string }>();

  const [files, setFiles] = useState<DataFile[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [records, setRecords] = useState<any[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    const [f, c] = await Promise.all([api.files(pid), api.collections(pid)]);
    setFiles(f);
    setCollections(c);
    if (c.length && !c.find((x: Collection) => x.id === activeId)) setActiveId(c[0].id);
    return c;
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, router]);

  useEffect(() => {
    if (!activeId) {
      setRecords([]);
      setFields([]);
      return;
    }
    api
      .records(pid, activeId)
      .then(({ collection, records }) => {
        setFields(collection.fields || []);
        setRecords(records);
      })
      .catch((e) => setError(e.message));
  }, [activeId, pid]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    setError("");
    setMsg("");
    setUploading(true);
    try {
      let imported = 0;
      for (const file of Array.from(list)) {
        await api.uploadFile(pid, file);
        imported++;
      }
      const c = await refresh();
      if (c[0]) setActiveId((prev) => prev || c[0].id);
      setMsg(`${imported} fayl yükləndi və oxundu`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removeFile(fid: string) {
    if (!window.confirm("Bu fayl və onun datası silinsin?")) return;
    await api.deleteFile(pid, fid);
    setActiveId("");
    await refresh();
  }

  const active = collections.find((c) => c.id === activeId);

  return (
    <>
      <div className="topbar">
        <div className="brand">AI Voice <span>OS</span></div>
        <Link href={`/projects/${pid}`} className="back">← Layihə</Link>
      </div>

      <div className="container grid" style={{ gap: "1.1rem" }}>
        <div className="row">
          <div>
            <h1 className="title" style={{ margin: 0 }}>Bilik bazası / Data</h1>
            <p className="muted" style={{ margin: "0.3rem 0 0" }}>
              Excel/CSV faylları yükləyin — istənilən sayda, çox vərəqli (sheet) də olar. AI agent
              zəngdə birbaşa buradan oxuyacaq (stok, boş otaq, qiymət).
            </p>
          </div>
          <div className="spacer" />
          <button className="btn primary" onClick={() => fileInput.current?.click()} disabled={uploading}>
            {uploading ? "Yüklənir…" : "+ Fayl əlavə et"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls,.csv"
            multiple
            style={{ display: "none" }}
            onChange={onUpload}
          />
        </div>

        {msg ? <p style={{ color: "var(--ok)" }}>{msg}</p> : null}
        {error ? <p className="error">{error}</p> : null}

        <section className="card">
          <h2 className="title" style={{ fontSize: "1.05rem", marginTop: 0 }}>Yüklənmiş fayllar</h2>
          {loading ? (
            <p className="muted">Yüklənir…</p>
          ) : files.length === 0 ? (
            <p className="muted">
              Hələ fayl yoxdur. «+ Fayl əlavə et» ilə Excel/CSV yükləyin (məs. otaqlar.xlsx —
              içində «Otaqlar», «Rezervlər» vərəqləri ola bilər).
            </p>
          ) : (
            <div className="list">
              {files.map((f) => (
                <div key={f.id} className="item" style={{ padding: "0.7rem 0" }}>
                  <div>
                    <h3 style={{ fontSize: "0.98rem" }}>📄 {f.filename}</h3>
                    <small className="muted">
                      {f.kind.toUpperCase()} · {f.sheetCount} vərəq · {f.rowCount} sətir ·{" "}
                      {f.collections.map((c) => c.label).join(", ")}
                    </small>
                  </div>
                  <button className="btn danger" onClick={() => removeFile(f.id)}>Sil</button>
                </div>
              ))}
            </div>
          )}
        </section>

        {collections.length > 0 ? (
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
              <section className="card" style={{ overflowX: "auto" }}>
                <h2 className="title" style={{ fontSize: "1.05rem", marginTop: 0 }}>
                  {active.label} — {records.length} sətir
                </h2>
                <p className="hint" style={{ marginTop: 0 }}>
                  Agent bu vərəqdən oxuyacaq. Sütunlar: {fields.map((f) => f.label).join(", ")}
                </p>
                {records.length === 0 ? (
                  <p className="muted">Sətir yoxdur.</p>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr>
                        {fields.map((f) => (
                          <th key={f.key} style={{ textAlign: "left", padding: "0.4rem", color: "var(--muted)" }}>
                            {f.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {records.slice(0, 100).map((r) => (
                        <tr key={r.id} style={{ borderTop: "1px solid var(--line)" }}>
                          {fields.map((f) => (
                            <td key={f.key} style={{ padding: "0.4rem" }}>
                              {formatCell(r.data?.[f.key], f.type)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {records.length > 100 ? (
                  <p className="hint">İlk 100 sətir göstərilir (cəmi {records.length}).</p>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  );
}

function formatCell(value: any, type: string) {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "boolean") return value ? "Bəli" : "Xeyr";
  return String(value);
}
