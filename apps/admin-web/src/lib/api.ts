const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
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
  const res = await fetch(`${API_URL}/api${path}`, {
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
  createProject: (name: string, businessTemplate: string) =>
    request<any>("/projects", {
      method: "POST",
      body: JSON.stringify({ name, businessTemplate }),
    }),
  updateAgent: (id: string, data: Record<string, unknown>) =>
    request<any>(`/projects/${id}/agent`, { method: "PATCH", body: JSON.stringify(data) }),
  setStatus: (id: string, status: string) =>
    request<any>(`/projects/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};
