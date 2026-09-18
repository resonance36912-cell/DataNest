import * as React from "react";

/**
 * <ResonanceLogo />
 * Official lockup for The Resonance hub family. Drop the official PNG at
 * /public/resonance-lockup.png (the v3 brand pack provides it).
 */
export function ResonanceLogo({
  src = "/resonance-lockup.png",
  height = 28,
  className = "",
  invert = true,
  alt = "The Resonance",
}: {
  src?: string;
  height?: number;
  className?: string;
  invert?: boolean;
  alt?: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      style={{ height, width: "auto" }}
      className={`${invert ? "brightness-0 invert" : ""} ${className}`.trim()}
      loading="lazy"
      decoding="async"
    />
  );
}
