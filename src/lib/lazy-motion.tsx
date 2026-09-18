import type { ReactNode } from "react";
import { LazyMotion, MotionConfig } from "framer-motion";

/**
 * Lazy animation runtime.
 *
 * `LazyMotion` + the lightweight `m` components keep framer-motion's animation
 * engine (~20kb) out of the initial route chunk — it is fetched only after
 * hydration, in a separate async chunk. Pages must use `m.*` (not `motion.*`);
 * `strict` makes that a build/runtime error instead of a silent bundle-size
 * regression.
 *
 * `MotionConfig reducedMotion="user"` makes every transform/opacity animation
 * inside the tree respect the OS-level `prefers-reduced-motion` setting.
 */
const loadDomAnimation = () =>
  import("framer-motion").then((mod) => mod.domAnimation);

export function LazyMotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadDomAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

export { AnimatePresence, m } from "framer-motion";
