const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export function getApiKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("ai_support_api_key") ?? "";
}

export function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("ai_support_token") ?? "";
}

export function setToken(token: string, companyName?: string) {
  localStorage.setItem("ai_support_token", token);
  if (companyName) localStorage.setItem("ai_support_company", companyName);
  // Middleware cookie okur (localStorage server-side'da görünmez)
  document.cookie = `ai_support_token=${token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
}

export function clearAuth() {
  localStorage.removeItem("ai_support_token");
  localStorage.removeItem("ai_support_company");
  document.cookie = "ai_support_token=; path=/; max-age=0";
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  const token = getToken();
  const key = getApiKey();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  // JWT varsa Bearer, yoksa API key kullan
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else if (key) {
    headers["X-API-Key"] = key;
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  return res.json();
}
