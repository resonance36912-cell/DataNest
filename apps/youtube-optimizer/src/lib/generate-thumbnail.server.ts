export interface GenerateThumbnailInput {
  videoTitle: string;
  thumbnailFeedback?: string | undefined;
  thumbnailSuggestion?: string | undefined;
  niche?: string | undefined;
  originalThumbnail?: string | undefined;
  nicheOptimized?: boolean | undefined;
  topPerformingThumbnails?: string[] | undefined;
  userPrompt?: string | undefined;
  referenceImage?: string | undefined;
  suggestText?: boolean | undefined;
}

export interface GenerateThumbnailResult {
  imageUrl: string;
  suggestedText?: string | undefined;
  qualityValidation: { passed: boolean; issues: string[] };
}

export async function runGenerateThumbnail(
  _input: GenerateThumbnailInput,
): Promise<GenerateThumbnailResult> {
  throw new Error(
    "Sovereign image generation is not configured on Ealiophin. Channel and episode analysis remain available.",
  );
}
