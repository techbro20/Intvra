import { invoke } from "@tauri-apps/api/core";

export type CloudPlan = "free" | "payg" | "pro" | "lifetime";

export type CloudUser = {
  id: string;
  email: string;
  name: string | null;
  plan: CloudPlan;
  credits: number;
  creditsPerAnswer?: number;
  planRenewsAt: number | null;
  isAdmin: boolean;
  byok: boolean;
  trialBlocked?: "device" | "network" | null;
  upgradeUrl: string;
};

export type AuthState = {
  status: "signed_in" | "signed_out";
  user: CloudUser | null;
  apiBase: string;
  loginPending: boolean;
  offline?: boolean;
  error?: string;
};

export const AUTH_CHANGED_EVENT = "auth-changed";

export const PLAN_LABELS: Record<CloudPlan, string> = {
  free: "Free",
  payg: "Pay as you go",
  pro: "Pro",
  lifetime: "Lifetime",
};

let cachedState: AuthState | null = null;
const listeners = new Set<(state: AuthState) => void>();

function setState(state: AuthState) {
  cachedState = state;
  listeners.forEach((listener) => listener(state));
}

if (typeof window !== "undefined" && window.phantom?.onEvent) {
  window.phantom.onEvent((event) => {
    if (event.event === AUTH_CHANGED_EVENT) setState(event.payload as AuthState);
  });
}

export function getCachedAuthState() {
  return cachedState;
}

export async function getAuthState(refresh = false): Promise<AuthState> {
  if (cachedState && !refresh) return cachedState;
  const state = await invoke<AuthState>("auth_get_state", { refresh });
  setState(state);
  return state;
}

export function onAuthChanged(listener: (state: AuthState) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const startLogin = () => invoke<AuthState>("auth_start_login").then((s) => (setState(s), s));
export const cancelLogin = () => invoke<AuthState>("auth_cancel_login").then((s) => (setState(s), s));
export const logout = () => invoke<AuthState>("auth_logout").then((s) => (setState(s), s));
export const refreshAuth = () => invoke<AuthState>("auth_refresh").then((s) => (setState(s), s));

export function trialBlockedMessage(user: CloudUser) {
  if (user.trialBlocked === "network") return "Too many free trials have been claimed from this network.";
  if (user.trialBlocked === "device") return "This computer has already used a free trial.";
  return "";
}

export function answersLeft(user: CloudUser) {
  return Math.floor(user.credits / Math.max(1, user.creditsPerAnswer ?? 1));
}

/** Credit-plan accounts answer through Ai.Intvra Cloud; Lifetime and admin accounts use their own keys. */
export function usesCloud(state: AuthState | null) {
  return state?.status === "signed_in" && !state.user?.byok;
}

/** Errors meant to be shown to the user as-is. */
export class CloudError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "CloudError";
    this.status = status;
  }
}

export function cloudErrorMessage(status: number, body: string) {
  try {
    const parsed = JSON.parse(body);
    if (parsed?.error?.message) return String(parsed.error.message);
  } catch {}
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 402) return "You're out of credits. Upgrade your plan to keep getting answers.";
  return `Ai.Intvra Cloud error (${status}).`;
}
