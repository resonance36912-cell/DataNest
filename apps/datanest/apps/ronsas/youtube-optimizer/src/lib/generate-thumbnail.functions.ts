import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { runGenerateThumbnail, type GenerateThumbnailResult } from "./generate-thumbnail.server";

const InputSchema = z.object({
  videoTitle: z.string().min(1),
  thumbnailFeedback: z.string().optional(),
  thumbnailSuggestion: z.string().optional(),
  niche: z.string().optional(),
  originalThumbnail: z.string().optional(),
  nicheOptimized: z.boolean().optional(),
  topPerformingThumbnails: z.array(z.string()).optional(),
  userPrompt: z.string().optional(),
  referenceImage: z.string().optional(),
  suggestText: z.boolean().optional(),
});

export const generateThumbnail = createServerFn({ method: "POST" })
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<GenerateThumbnailResult> => runGenerateThumbnail(data));
