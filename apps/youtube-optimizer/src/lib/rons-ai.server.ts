export type RonsAiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type RonsAiResponse = {
  message?: { content?: unknown };
  model?: string;
  external_ai_used?: boolean;
};

const DEFAULT_GATEWAY = "http://127.0.0.1:58600/v1/ai/chat";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function configuredGateway(): string {
  const raw = process.env["RONS_AI_GATEWAY_URL"]?.trim() || DEFAULT_GATEWAY;
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("RONS AI gateway must use HTTP(S)");
  if (url.username || url.password) throw new Error("RONS AI gateway URL must not contain credentials");
  if (!LOOPBACK_HOSTS.has(url.hostname) && process.env["RONS_AI_ALLOW_REMOTE"] !== "1") {
    throw new Error("Remote RONS AI gateway is disabled");
  }
  return url.toString();
}
export async function ronsAiChat(
  messages: readonly RonsAiMessage[],
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!messages.length) throw new Error("RONS AI requires at least one message");
  const model = process.env["RONS_AI_MODEL"]?.trim();
  const response = await fetchImpl(configuredGateway(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ...(model ? { model } : {}), messages }),
  });
  if (!response.ok) {
    if (response.status === 503) throw new Error("Sovereign AI is not available on Ealiophin");
    throw new Error(`Sovereign AI request failed (${response.status})`);
  }
  const payload = (await response.json()) as RonsAiResponse;
  if (payload.external_ai_used === true) throw new Error("RONS AI response violated sovereign mode");
  const content = payload.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Sovereign AI returned no text content");
  }
  return content.trim();
}
