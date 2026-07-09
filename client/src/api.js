const API_BASE = import.meta.env.VITE_API_BASE || "";

export async function createRealtimeSession() {
  const res = await fetch(`${API_BASE}/api/realtime/session`, { method: "POST" });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Sessiya yaradıla bilmədi");
  }
  return data;
}

/** Alias — same endpoint, provider decided server-side */
export async function createElevenLabsSession() {
  return createRealtimeSession();
}

export async function runTool(name, args = {}) {
  const res = await fetch(`${API_BASE}/api/tools/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args || {}),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Alət xətası: ${name}`);
  }
  return data;
}

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/api/health`);
  return res.json();
}

export async function fetchStore() {
  const res = await fetch(`${API_BASE}/api/store`);
  return res.json();
}
