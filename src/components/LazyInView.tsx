import { useEffect, useRef, useState, type ReactNode } from "react";

interface LazyInViewProps {
  /** Reserve vertical space so layout doesn't shift when the real content mounts. */
  minHeight?: number | string;
  /** Distance (in px) before the viewport edge at which to mount. */
  rootMargin?: string;
  /** Fallback shown while waiting to enter viewport. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Mounts its children only when its placeholder scrolls into (or near) the viewport.
 * Pair with React.lazy() to defer both the JS chunk and the framer-motion mount cost
 * for sections below the fold — keeps the main thread free on first paint.
 */
const LazyInView = ({ minHeight = 400, rootMargin = "200px", fallback = null, children }: LazyInViewProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  return (
    <div ref={ref} style={visible ? undefined : { minHeight }}>
      {visible ? children : fallback}
    </div>
  );
};

export default LazyInView;
