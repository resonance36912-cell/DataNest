import { afterEach, describe, expect, test } from "vitest";
import { ronsAiChat } from "@/lib/rons-ai.server";

const oldUrl = process.env["RONS_AI_GATEWAY_URL"];
const oldRemote = process.env["RONS_AI_ALLOW_REMOTE"];
const oldModel = process.env["RONS_AI_MODEL"];

afterEach(() => {
  if (oldUrl === undefined) delete process.env["RONS_AI_GATEWAY_URL"];
  else process.env["RONS_AI_GATEWAY_URL"] = oldUrl;
  if (oldRemote === undefined) delete process.env["RONS_AI_ALLOW_REMOTE"];
  else process.env["RONS_AI_ALLOW_REMOTE"] = oldRemote;
  if (oldModel === undefined) delete process.env["RONS_AI_MODEL"];
  else process.env["RONS_AI_MODEL"] = oldModel;
});

describe("RONS sovereign AI client", () => {
  test("defaults to the loopback RONS gateway without credentials", async () => {
    delete process.env["RONS_AI_GATEWAY_URL"];
    const mockFetch = (async (input, init) => {
      expect(String(input)).toBe("http://127.0.0.1:58600/v1/ai/chat");
      const headers = init?.headers as Record<string, string>;
      expect(headers["Authorization"]).toBeUndefined();
      const body = JSON.parse(String(init?.body));
      expect(body.messages[0].content).toBe("hello");
      return Response.json({ message: { content: "local answer" }, external_ai_used: false });
    }) as typeof fetch;
    expect(await ronsAiChat([{ role: "user", content: "hello" }], mockFetch)).toBe("local answer");
  });

  test("rejects external-AI responses", async () => {
    const mockFetch = (async () => Response.json({
      message: { content: "external" }, external_ai_used: true,
    })) as typeof fetch;
    await expect(ronsAiChat([{ role: "user", content: "hello" }], mockFetch))
      .rejects.toThrow("violated sovereign mode");
  });

  test("blocks remote gateways unless explicitly allowed", async () => {
    process.env["RONS_AI_GATEWAY_URL"] = "https://example.com/v1/ai/chat";
    const mockFetch = (async () => Response.json({ message: { content: "no" } })) as typeof fetch;
    await expect(ronsAiChat([{ role: "user", content: "hello" }], mockFetch))
      .rejects.toThrow("Remote RONS AI gateway is disabled");
  });
});
