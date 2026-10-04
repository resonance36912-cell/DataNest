import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  /** Reserved vertical space before the section mounts — prevents layout shift. */
  minHeight?: number;
  /** How far ahead of the viewport to start loading. */
  rootMargin?: string;
  /** Accessible label for the placeholder while the section loads. */
  label?: string;
  children: ReactNode;
};

/**
 * Defers mounting (and therefore the dynamic import) of a below-the-fold
 * landing section until it is about to scroll into view. Reserves its height
 * up-front so deferring never causes CLS.
 */
export function LazySection({
  minHeight = 480,
  rootMargin = "300px 0px",
  label = "Loading section",
  children,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, rootMargin]);

  return (
    <div
      ref={ref}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: `auto ${minHeight}px`,
        ...(visible ? {} : { minHeight }),
      }}
    >
      {visible ? (
        <Suspense fallback={<div style={{ minHeight }} aria-hidden="true" />}>{children}</Suspense>
      ) : (
        <div style={{ minHeight }} role="presentation" aria-label={label} />
      )}
    </div>
  );
}

export default LazySection;
