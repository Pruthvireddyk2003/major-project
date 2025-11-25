// lib/auth.ts
export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function requireAuth() {
  const token = getToken();
  if (!token) window.location.href = "/login";
}
