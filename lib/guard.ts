// Request guards for the public API. Server-only.
//
// Two jobs. (1) Rate limits on the endpoints that spend our Jupiter, tokens.xyz and RPC quotas, so one
// caller cannot exhaust them and starve the daily measurement. The counts live in memory, so each
// server instance keeps its own — a speed bump, not a wall; a platform firewall rule is the real one.
// (2) Execute tokens: /api/swap/execute relays a signed transaction to Jupiter with our API key, and
// should only ever relay a trade this server built for that wallet, not serve as an open relay.

import { createHmac, timingSafeEqual } from "node:crypto";

const hits = new Map<string, number[]>();

/** True when this caller is over `max` requests in the last `windowMs` for `bucket`. */
export function overLimit(request: Request, bucket: string, max: number, windowMs = 60_000): boolean {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const key = `${bucket}|${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) for (const [k, v] of hits) if (now - (v.at(-1) ?? 0) > windowMs) hits.delete(k);
  return recent.length > max;
}

export const tooMany = () => Response.json({ error: "Too many requests. Wait a minute and try again." }, { status: 429, headers: { "Retry-After": "60" } });

const EXECUTE_TTL_MS = 2 * 60_000; // a Jupiter order is only executable for about a minute anyway

function secret(): string | null {
  const s = process.env.EXECUTE_SECRET || process.env.CRON_SECRET;
  return s ? `execute:${s}` : null;
}

function sign(payload: string): string | null {
  const s = secret();
  return s ? createHmac("sha256", s).update(payload).digest("base64url") : null;
}

/** A token binding a Jupiter order to the wallet it was built for, valid for two minutes. */
export function issueExecuteToken(requestId: string, user: string): string | null {
  const expires = Date.now() + EXECUTE_TTL_MS;
  const mac = sign(`${requestId}|${user}|${expires}`);
  return mac ? `${expires}.${mac}` : null;
}

/** Whether `token` was issued by this server for this order and wallet, and has not expired. */
export function verifyExecuteToken(token: string, requestId: string, user: string): boolean {
  const [expiresRaw, mac] = token.split(".");
  const expires = Number(expiresRaw);
  if (!mac || !Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = sign(`${requestId}|${user}|${expires}`);
  if (!expected) return false;
  const a = Buffer.from(mac), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
