"use client";

// Browser-side helpers. Everything here talks to OUR routes, never to a data provider directly —
// keys stay server-side (CLAUDE.md principle 4).

export class ApiError extends Error {
  constructor(message: string, public status: number, public body?: unknown) {
    super(message);
  }
}

const KEY_STORAGE = "trova.device-key";

/**
 * The private device secret the watchlist and profile are keyed by: 32 random bytes, base64url.
 * Generated once and kept in this browser. The server only ever stores its hash.
 */
export function deviceKey(): string | null {
  try {
    const existing = window.localStorage.getItem(KEY_STORAGE);
    if (existing && /^[A-Za-z0-9_-]{43}$/.test(existing)) return existing;
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const key = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    window.localStorage.setItem(KEY_STORAGE, key);
    return key;
  } catch {
    return null; // private mode or blocked storage: the watchlist simply isn't available
  }
}

export async function api<T>(path: string, init: RequestInit & { device?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.device) {
    const key = deviceKey();
    if (key) headers.set("x-trova-key", key);
  }
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await fetch(path, { ...init, headers });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status, body);
  }
  return body as T;
}

export const shortAddress = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export const isAddress = (v: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v.trim());
