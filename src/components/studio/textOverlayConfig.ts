// Extracted so PreviewPanel can hold default config without bundling the
// full TextOverlayEditor component (which is lazy-loaded).

export interface TextOverlayConfig {
  headline: string;
  subheadline: string;
  callToAction: string;
  verticalAlign: "top" | "center" | "bottom";
  horizontalAlign: "left" | "center" | "right";
  headlineSizeClass: string;
  subheadlineSizeClass: string;
  ctaSizeClass: string;
  headlineColor: string;
  subheadlineColor: string;
  ctaColor: string;
  headlineBold: boolean;
  headlineItalic: boolean;
}

export const DEFAULT_OVERLAY_CONFIG: TextOverlayConfig = {
  headline: "",
  subheadline: "",
  callToAction: "",
  verticalAlign: "bottom",
  horizontalAlign: "left",
  headlineSizeClass: "text-2xl",
  subheadlineSizeClass: "text-sm",
  ctaSizeClass: "text-sm",
  headlineColor: "#ffffff",
  subheadlineColor: "#ffffffcc",
  ctaColor: "#ffffff",
  headlineBold: true,
  headlineItalic: false,
};
