const DEFAULT_SRC = "/resonance-lockup.png";

const AVIF_SRCSET = [
  "/resonance-lockup-192.avif 192w",
  "/resonance-lockup-384.avif 384w",
  "/resonance-lockup-768.avif 768w",
].join(", ");

const WEBP_SRCSET = [
  "/resonance-lockup-192.webp 192w",
  "/resonance-lockup-384.webp 384w",
  "/resonance-lockup-768.webp 768w",
].join(", ");

/**
 * <ResonanceLogo />
 * The shared logo lockup. Serves AVIF/WebP variants via <picture> + srcset,
 * falling back to /public/resonance-lockup.png. Pass a custom `src` to bypass
 * the responsive sources.
 */
export function ResonanceLogo({
  src = DEFAULT_SRC,
  height = 28,
  className = "",
  invert = true,
  alt = "The Resonance",
  priority = false,
}: {
  src?: string;
  height?: number;
  className?: string;
  invert?: boolean;
  alt?: string;
  priority?: boolean;
}) {
  const imgClass = `${invert ? "brightness-0 invert" : ""} ${className}`.trim();
  const width = Math.round(height * 1.5);
  const img = (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      style={{ height, width: "auto" }}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...({ fetchpriority: priority ? "high" : "auto" } as any)}
      className={imgClass}
    />
  );

  if (src !== DEFAULT_SRC) return img;

  // Rendered at `height` px tall (1.5:1 lockup); ask for ~3x for crisp HiDPI.
  const sizes = `${width}px`;

  return (
    <picture>
      <source type="image/avif" srcSet={AVIF_SRCSET} sizes={sizes} />
      <source type="image/webp" srcSet={WEBP_SRCSET} sizes={sizes} />
      {img}
    </picture>
  );
}
