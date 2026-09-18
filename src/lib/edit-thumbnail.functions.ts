import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  imageUrl: z.string().min(1),
  editInstruction: z.string().min(1),
});

export const editThumbnail = createServerFn({ method: "POST" })
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<{ imageUrl: string }> => {
    void data;
    throw new Error(
      "Sovereign image editing is not configured on Ealiophin. Channel and episode analysis remain available.",
    );
  });
