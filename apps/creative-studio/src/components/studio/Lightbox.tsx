import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";

interface LightboxProps {
  isVideo: boolean;
  items: string[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  onDownload?: () => void;
  renderVideo?: (i: number) => ReactNode;
}

const Lightbox = ({ isVideo, items, index, onIndexChange, onClose, onDownload, renderVideo }: LightboxProps) => {
  const total = items.length;
  const prev = () => onIndexChange((index - 1 + total) % total);
  const next = () => onIndexChange((index + 1) % total);
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const [swipeDx, setSwipeDx] = useState(0);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && total > 1) prev();
      else if (e.key === "ArrowRight" && total > 1) next();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, total]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Enlarged preview"
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 text-white/90"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xs font-medium tracking-wide">
          {total > 1 ? `${index + 1} / ${total}` : "Preview"}
        </div>
        <div className="flex items-center gap-2">
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-medium transition-colors"
              title="Download"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            aria-label="Close"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Stage */}
      <div className="flex-1 flex items-center justify-center px-4 pb-6 relative">
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); prev(); }}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              aria-label="Previous"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); next(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              aria-label="Next"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}

        <div
          className="max-w-[92vw] max-h-[82vh] w-full flex items-center justify-center touch-pan-y select-none"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => {
            const t = e.touches[0];
            touchStart.current = { x: t.clientX, y: t.clientY, time: Date.now() };
            setSwipeDx(0);
          }}
          onTouchMove={(e) => {
            if (!touchStart.current) return;
            const t = e.touches[0];
            const dx = t.clientX - touchStart.current.x;
            const dy = t.clientY - touchStart.current.y;
            if (Math.abs(dx) > Math.abs(dy)) setSwipeDx(dx);
          }}
          onTouchEnd={() => {
            const start = touchStart.current;
            touchStart.current = null;
            if (!start || total < 2) { setSwipeDx(0); return; }
            const dx = swipeDx;
            const elapsed = Date.now() - start.time;
            const threshold = 50;
            const fast = elapsed < 300 && Math.abs(dx) > 25;
            if (dx <= -threshold || (fast && dx < 0)) next();
            else if (dx >= threshold || (fast && dx > 0)) prev();
            setSwipeDx(0);
          }}
          style={{
            transform: swipeDx ? `translateX(${swipeDx}px)` : undefined,
            transition: swipeDx ? "none" : "transform 0.2s ease-out",
          }}
        >
          {isVideo && renderVideo ? (
            <div className="w-full max-w-4xl">{renderVideo(index)}</div>
          ) : (
            <img
              src={items[index]}
              alt={`Preview ${index + 1}`}
              className="max-w-full max-h-[82vh] object-contain rounded-lg shadow-2xl pointer-events-none"
              draggable={false}
            />
          )}
        </div>
      </div>

      {/* Hint */}
      <div className="pb-4 text-center text-[11px] text-white/50" onClick={(e) => e.stopPropagation()}>
        {total > 1 ? "← → to navigate · Esc to close · click outside to dismiss" : "Esc to close · click outside to dismiss"}
      </div>
    </motion.div>
  );
};

export default Lightbox;
