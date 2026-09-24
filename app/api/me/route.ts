// GET /api/me → { nickname, alertUntradable }
// PUT /api/me { nickname?, alertUntradable? } → the updated profile
// Identified by the device key in `x-trova-key`; never by a wallet, never by a signature.

import { cleanNickname, getProfile, keyHashFrom, NotConfigured, updateProfile } from "@/lib/user-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function fail(e: unknown) {
  if (e instanceof NotConfigured) {
    return Response.json({ error: e.message, configured: false }, { status: 503, headers: NO_STORE });
  }
  console.error("profile failed", e);
  return Response.json({ error: "Profile is temporarily unavailable." }, { status: 502, headers: NO_STORE });
}

const unauthorized = () =>
  Response.json({ error: "Missing or malformed device key." }, { status: 401, headers: NO_STORE });

export async function GET(request: Request) {
  const keyHash = keyHashFrom(request);
  if (!keyHash) return unauthorized();
  try {
    return Response.json(await getProfile(keyHash), { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(request: Request) {
  const keyHash = keyHashFrom(request);
  if (!keyHash) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400, headers: NO_STORE });
  }

  const patch: { nickname?: string | null; alertUntradable?: boolean } = {};
  if ("nickname" in body) {
    if (body.nickname !== null && typeof body.nickname !== "string") {
      return Response.json({ error: "nickname must be a string or null." }, { status: 400, headers: NO_STORE });
    }
    patch.nickname = body.nickname === null ? null : cleanNickname(body.nickname);
  }
  if ("alertUntradable" in body) {
    if (typeof body.alertUntradable !== "boolean") {
      return Response.json({ error: "alertUntradable must be true or false." }, { status: 400, headers: NO_STORE });
    }
    patch.alertUntradable = body.alertUntradable;
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nothing to update." }, { status: 400, headers: NO_STORE });
  }

  try {
    return Response.json(await updateProfile(keyHash, patch), { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}
