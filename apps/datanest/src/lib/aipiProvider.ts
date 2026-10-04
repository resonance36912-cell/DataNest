import {
  AipiError,
  type AipiChatMessage,
  type AipiUpstreamConfig,
} from "./aipiCore";

export type AipiProviderResult = {
  content: string;
  inputTokens: number;
  outputTokens: number;
};

export async function callAipiProvider(input: {
  config: AipiUpstreamConfig;
  model: string;
  messages: AipiChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<AipiProviderResult> {
  let response: Response;
  try {
    response = await fetch(input.config.url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${input.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        messages: [
          {
            role: "system",
            content: [
              "You are operating through Resonance AiPI inside DataNest.",
              "Respect DataNest governance boundaries and treat uncertified evidence as provisional.",
              "Do not claim tool actions, approvals, deployments, or evidence that are not present in the supplied context.",
            ].join("\n"),
          },
          ...input.messages,
        ],
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxOutputTokens ?? 2048,
      }),
    });
  } catch (error) {
    const wrapped = new AipiError("provider_network_error", 502, "The AiPI provider could not be reached.");
    (wrapped as AipiError & { cause?: unknown }).cause = error;
    throw wrapped;
  }

  if (!response.ok) {
    throw new AipiError("provider_http_error", 502, "The AiPI provider returned an error.");
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: unknown } }>;
    usage?: Record<string, unknown>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new AipiError("provider_empty_response", 502, "The AiPI provider returned no usable content.");
  }

  const usage = payload.usage || {};
  return {
    content: content.trim(),
    inputTokens: Number(usage.prompt_tokens ?? usage.input_tokens ?? 0),
    outputTokens: Number(usage.completion_tokens ?? usage.output_tokens ?? 0),
  };
}
