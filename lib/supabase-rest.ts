// Minimal Supabase PostgREST client — server-only (service key). No SDK dependency.

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  // New-format secret keys (sb_secret_…) go in `apikey` only; legacy JWT keys also need Authorization.
  const auth: Record<string, string> = key.startsWith("sb_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
  return { base: `${url.replace(/\/$/, "")}/rest/v1`, auth };
}

/** Insert-or-update rows in batches, resolving conflicts on the given unique columns. */
export async function upsertRows(table: string, rows: object[], onConflict: string, batchSize = 500): Promise<number> {
  const { base, auth } = config();
  let written = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const res = await fetch(`${base}/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(batch),
    });
    if (!res.ok) throw new Error(`supabase upsert ${table} ${res.status}: ${await res.text()}`);
    written += batch.length;
  }
  return written;
}

/** Read rows with a PostgREST query string (e.g. "select=*&snapshot_date=eq.2026-09-15"), paging through all results. */
export async function selectRows<T>(table: string, query: string, pageSize = 1000): Promise<T[]> {
  const { base, auth } = config();
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const res = await fetch(`${base}/${table}?${query}`, {
      headers: { ...auth, "Range-Unit": "items", Range: `${from}-${from + pageSize - 1}` },
    });
    if (!res.ok) throw new Error(`supabase select ${table} ${res.status}: ${await res.text()}`);
    const page = (await res.json()) as T[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function insertRow(table: string, row: object): Promise<void> {
  const { base, auth } = config();
  const res = await fetch(`${base}/${table}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`supabase insert ${table} ${res.status}: ${await res.text()}`);
}

/** Delete the rows a PostgREST filter matches (e.g. "key_hash=eq.ab…&asset_id=eq.tesla"). */
export async function deleteRows(table: string, filter: string): Promise<void> {
  const { base, auth } = config();
  const res = await fetch(`${base}/${table}?${filter}`, {
    method: "DELETE",
    headers: { ...auth, Prefer: "return=minimal" },
  });
  if (!res.ok) throw new Error(`supabase delete ${table} ${res.status}: ${await res.text()}`);
}
