export type BridgeAuthContext = {
  getToken(): string | undefined;
  getClientId(): string | undefined;
  getUserId(): string | undefined;
  signal?: AbortSignal;
};

function getSupabaseConfig() {
  const url =
    import.meta.env.VITE_SUPABASE_URL ||
    (typeof process !== "undefined" ? process.env.SUPABASE_URL : undefined);
  const key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    (typeof process !== "undefined" ? process.env.SUPABASE_PUBLISHABLE_KEY : undefined);

  if (!url || !key) {
    throw new Error("Bridge Supabase configuration is unavailable");
  }
  return { url: url.replace(/\/+$/, ""), key };
}

export function bridgeClientId(ctx: BridgeAuthContext): string | null {
  return ctx.getClientId() ?? null;
}

export async function bridgeRpc<T>(
  ctx: BridgeAuthContext,
  fn: string,
  body: Record<string, unknown>,
): Promise<T> {
  const token = ctx.getToken();
  const userId = ctx.getUserId();
  if (!token || !userId) {
    throw new Error("Authenticated bridge caller required");
  }

  const { url, key } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: ctx.signal,
  });

  if (!response.ok) {
    const raw = await response.text();
    const safe = raw.replace(/[\r\n]+/g, " ").slice(0, 500);
    throw new Error(`Bridge RPC ${fn} failed (${response.status}): ${safe}`);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
