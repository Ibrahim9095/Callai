// Always call the API same-origin ("/api/*"); Next.js rewrites proxy it to the
// API server inside the VM. This works through any host (tunnel, preview,
// localhost) and avoids the phone's own localhost being used.
const TOKEN_KEY = "aivoiceos_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401 && typeof window !== "undefined") {
    clearToken();
    if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = data?.message || `Xəta (${res.status})`;
    throw new ApiError(res.status, Array.isArray(message) ? message.join(", ") : message);
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; user: any }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<any>("/auth/me"),
  templates: () => request<any[]>("/templates"),
  projects: () => request<any[]>("/projects"),
  project: (id: string) => request<any>(`/projects/${id}`),
  createProject: (
    name: string,
    businessTemplate: string,
    customType?: string,
    operatorId?: string,
  ) =>
    request<any>("/projects", {
      method: "POST",
      body: JSON.stringify({
        name,
        businessTemplate,
        ...(customType ? { customType } : {}),
        ...(operatorId ? { operatorId } : {}),
      }),
    }),
  deleteProject: (id: string) => request<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),
  assignPhone: (id: string, number: string) =>
    request<any>(`/projects/${id}/phone`, { method: "PATCH", body: JSON.stringify({ number }) }),
  removePhone: (id: string) => request<any>(`/projects/${id}/phone`, { method: "DELETE" }),

  // Knowledge / data (file-driven)
  files: (pid: string) => request<any[]>(`/projects/${pid}/files`),
  deleteFile: (pid: string, fid: string) =>
    request<any[]>(`/projects/${pid}/files/${fid}`, { method: "DELETE" }),
  uploadFile: async (pid: string, file: File) => {
    const token = getToken();
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/projects/${pid}/files`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (res.status === 401 && typeof window !== "undefined") {
      clearToken();
      window.location.href = "/login";
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const m = data?.message || `Xəta (${res.status})`;
      throw new ApiError(res.status, Array.isArray(m) ? m.join(", ") : m);
    }
    return data;
  },
  collections: (pid: string) => request<any[]>(`/projects/${pid}/collections`),
  records: (pid: string, cid: string) =>
    request<{ collection: any; records: any[] }>(`/projects/${pid}/collections/${cid}/records`),

  updateAgent: (id: string, data: Record<string, unknown>) =>
    request<any>(`/projects/${id}/agent`, { method: "PATCH", body: JSON.stringify(data) }),
  setStatus: (id: string, status: string) =>
    request<any>(`/projects/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  // Voice — browser test call
  voiceSession: (pid: string) =>
    request<{
      provider: string;
      token: string;
      agent_id: string;
      projectId: string;
      projectName: string;
      businessLabel: string;
      operatorName: string;
      operatorId?: string;
      operatorGender: "female" | "male" | "unknown";
      companyName?: string;
      firstMessage: string;
      tools: string[];
    }>(`/projects/${pid}/voice/session`, { method: "POST", body: "{}" }),
  voiceTool: (pid: string, name: string, args: Record<string, unknown>) =>
    request<any>(`/projects/${pid}/voice/tools/${name}`, {
      method: "POST",
      body: JSON.stringify(args || {}),
    }),
};
