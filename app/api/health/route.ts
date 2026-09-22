import { METHOD_VERSION } from "@/lib/trust-score";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, methodVersion: METHOD_VERSION });
}
