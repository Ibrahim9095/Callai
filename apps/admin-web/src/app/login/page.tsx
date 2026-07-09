"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@aivoiceos.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.login(email, password);
      setToken(res.accessToken);
      router.replace("/projects");
    } catch (err: any) {
      setError(err.message || "Giriş alınmadı");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="center-screen">
      <form className="card auth-card" onSubmit={submit}>
        <p className="brand" style={{ fontSize: "1.1rem" }}>
          AI Voice <span>OS</span>
        </p>
        <h1 className="title">Admin girişi</h1>
        <p className="muted" style={{ margin: 0 }}>Platforma idarəetmə paneli</p>

        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <label htmlFor="password">Parol</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
        />

        {error ? <p className="error">{error}</p> : null}

        <button className="btn primary" style={{ width: "100%", marginTop: "1rem" }} disabled={loading}>
          {loading ? "Yoxlanılır…" : "Daxil ol"}
        </button>
      </form>
    </div>
  );
}
