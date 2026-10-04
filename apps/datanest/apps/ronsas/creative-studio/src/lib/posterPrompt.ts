// Client-side mirror of the prompt construction in
// supabase/functions/generate-poster/index.ts. Used by the Studio
// "Prompt preview" panel so the user can review exactly what the model
// will see before triggering a generation. Keep this file in sync with
// generate-poster whenever its prompt template changes.

export interface PosterPromptInputs {
  brand?: string;
  headline?: string;
  subheadline?: string;
  callToAction?: string;
  keyPoints?: string[];
  colorSuggestions?: string[];
  style?: string;
  tone?: string;
  contentType?: string; // "poster" | "brochure" | "ad" | "social" | "video"
  heroIsUpload: boolean;
  hasHeroImage: boolean;
}

export interface PosterReferenceLabel {
  index: number;
  url: string;
  role: "primary" | "secondary" | "tertiary";
  label: string;
}

export function refLabelFor(index: number, heroIsUpload: boolean): string {
  if (index === 0) {
    return heroIsUpload
      ? "PRIMARY (user upload â€” use as the literal hero subject):"
      : "PRIMARY brand reference (use as hero identity / product look):";
  }
  if (index === 1) {
    return "Secondary brand reference (logo / palette / typography cue â€” do NOT copy literally):";
  }
  return "Tertiary brand reference (mood / context â€” inspiration only):";
}

export function labelReferences(
  urls: string[],
  heroIsUpload: boolean,
): PosterReferenceLabel[] {
  return urls.slice(0, 3).map((url, i) => ({
    index: i,
    url,
    role: i === 0 ? "primary" : i === 1 ? "secondary" : "tertiary",
    label: refLabelFor(i, heroIsUpload),
  }));
}

export function buildPosterPrompt(inputs: PosterPromptInputs, variantNumber: 1 | 2): string {
  const {
    brand, headline, subheadline, callToAction, keyPoints, colorSuggestions,
    style, tone, contentType, heroIsUpload, hasHeroImage,
  } = inputs;

  const colors = (colorSuggestions ?? []).join(", ") || "bold brand colors";
  const points = (keyPoints ?? []).join("; ") || "";
  const isBrochure = (contentType ?? "").toLowerCase() === "brochure";

  if (isBrochure) {
    const brochureVariant = variantNumber === 1
      ? "Elegant and clean with soft colors, rounded photo frames, generous whitespace, and refined serif or sans-serif typography."
      : "Bold and modern with vibrant accent colors, geometric shapes, strong contrast, and dynamic layout composition.";

    return `Design a professional tri-fold brochure (landscape orientation, 16:9 aspect ratio) shown fully unfolded with all 3 panels visible side by side.

Brand: ${brand || "Modern Brand"}
Headline: "${headline || "Your Headline Here"}"
Subheadline: "${subheadline || ""}"
Call to Action: "${callToAction || "Learn More"}"
Key Points: ${points}
Style: ${style || "professional"}, ${tone || "confident"}
Color palette: ${colors}
Variant direction: ${brochureVariant}

Requirements:
- Show all 3 panels of the tri-fold brochure laid out horizontally
- LEFT PANEL: Supporting info, key points, or services list with icons or small graphics
- CENTER PANEL: Hero section with large headline, a compelling photo or graphic, and the main value proposition
- RIGHT PANEL: Contact information, call to action, brand logo, and any closing details
- Use consistent typography and color scheme across all panels
- Include subtle fold lines or panel separators
- Make it look like a real printed brochure ready for production
- Use elegant photo frames or shapes for any imagery
${hasHeroImage
  ? `- ${heroIsUpload
      ? "Use the user-provided reference image as the featured hero photo across the centre panel â€” it must be the dominant visual."
      : "Use the provided brand reference image (logo or site screenshot) as a subtle inspiration for palette and product identity, NOT as a literal element. Show the actual product/brand identity prominently."}`
  : "- Use elegant abstract shapes, lifestyle imagery placeholders, and professional graphics"}`;
  }

  const variantStyle = variantNumber === 1
    ? "Clean, modern layout with strong typography hierarchy. Plenty of whitespace."
    : "Bold, dynamic layout with overlapping elements, gradients, and energetic composition.";

  return `Design a professional marketing ${contentType || "poster"} (portrait orientation, 3:4 aspect ratio) for the South African market.

Brand: ${brand || "Modern Brand"}
Suggested headline (you may shorten â€” never lengthen): "${headline || "Your Headline Here"}"
Suggested subheadline (benefit-led, â‰¤ 12 words): "${subheadline || ""}"
Call to Action: "${callToAction || "Shop now"}"
Key Points: ${points}
Style: ${style || "professional"}, ${tone || "confident"}
Color palette: ${colors}
Variant direction: ${variantStyle}

PRODUCT-AS-HERO (non-negotiable):
- The provided product/source image MUST be the dominant central visual â€” â‰¥55% of the canvas, sharp, faithful colours, no crops that hide the label.
- Compose copy and graphics AROUND the product; never overlay text across the product itself.

COPY RULES:
- ONE headline only, max 7 words, no emojis, no clichÃ©s ("Unlock", "Discover", "Elevate", "Transform").
- ONE benefit subhead (â‰¤12 words) naming the user payoff, not a feature list.
- ONE clear CTA badge â€” "Shop now", "Pre-order", "Add to cart", or the provided CTA â€” styled as a pill/button.
- ZAR pricing ("R 549") if pricing is given; never "$" unless source uses it.
- South African voice: conscious, calm, confident. Avoid hype and medical claims.

Layout:
- Hierarchy: Headline >> Subhead >> CTA. No Lorem ipsum, no placeholder text.
- Reserve one accent colour for the CTA only.
${hasHeroImage
  ? `- ${heroIsUpload
      ? "Make the provided reference image the dominant hero visual â€” center stage, large, sharply composed."
      : "Treat the provided brand reference (logo or site screenshot) as identity inspiration for colour and feel, NOT as a literal foreground element."}`
  : "- Use abstract shapes, gradients, and typography as the main visual elements"}`;
}
