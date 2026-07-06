const AUTH_TOKEN_KEY = "tabipla-admin-token";
const AUTH_USER_KEY = "tabipla-admin-user";

export type AuthUser = {
  id: string;
  email: string;
  municipalityName?: string;
};

function decodeUserFromToken(token: string): AuthUser | null {
  const [encoded] = token.split(".");
  if (!encoded) return null;
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as AuthUser & { exp?: number };
    if (!payload?.id || !payload?.email) return null;
    return {
      id: payload.id,
      email: payload.email,
      municipalityName: payload.municipalityName,
    };
  } catch {
    return null;
  }
}

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getAuthUser(): AuthUser | null {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      // fall through
    }
  }

  const token = getAuthToken();
  if (!token) return null;

  const user = decodeUserFromToken(token);
  if (user) {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  }
  return user;
}

export function isAuthenticated(): boolean {
  return Boolean(getAuthToken());
}

export function setAuthSession(token: string, user: AuthUser): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function logout(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}
