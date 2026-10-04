import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { runChannelAudit } from "./channel-audit.server";
import { runChannelAuditWithStagingStub } from "./channel-audit.staging";

const InputSchema = z.object({
  channelInput: z.string().trim().min(1).max(500),
});

export const auditChannel = createServerFn({ method: "POST" })
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) =>
    runChannelAuditWithStagingStub(async () => {
      const youtubeApiKey = process.env["YOUTUBE_API_KEY"];
      if (!youtubeApiKey) throw new Error("YouTube API key not configured");
      return runChannelAudit({
        channelInput: data.channelInput,
        youtubeApiKey,
      });
    }),
  );
