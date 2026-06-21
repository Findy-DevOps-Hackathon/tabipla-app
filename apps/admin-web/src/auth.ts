const AUTH_TOKEN_KEY = "tabipla-admin-token";

export type AuthUser = {
  id: string;
  email: string;
  municipalityName?: string;
};

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return Boolean(getAuthToken());
}

export function setAuthSession(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function logout(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export const DEMO_USER_EMAIL = "taro.yamada@test.com";
