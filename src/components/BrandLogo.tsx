import { useNavigate } from "@/lib/router-compat";
import { TrendingUp } from "lucide-react";
import logoMark from "@/assets/logo-youtube-optimizer.png";

interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
  clickable?: boolean;
  animated?: boolean;
  /** Subtle continuous breathing glow — safe for headers/nav. */
  breathe?: boolean;
}

const BrandLogo = ({
  size = "md",
  clickable = true,
  animated = false,
  breathe = false,
}: BrandLogoProps) => {
  const navigate = useNavigate();

  const sizeConfig = {
    sm: {
      resonance: "text-xl",
      sub: "text-[9px]",
      arrow: 14,
      glow: "2px 6px",
      outerGlow: "4px 12px",
    },
    md: {
      resonance: "text-3xl",
      sub: "text-[11px]",
      arrow: 20,
      glow: "3px 8px",
      outerGlow: "6px 18px",
    },
    lg: {
      resonance: "text-5xl",
      sub: "text-sm",
      arrow: 28,
      glow: "4px 12px",
      outerGlow: "8px 25px",
    },
  };

  const cfg = sizeConfig[size];

  const gradientStyle = {
    background:
      "linear-gradient(90deg, hsl(var(--resonance-cyan)), hsl(var(--resonance-magenta)), hsl(var(--resonance-violet)), hsl(var(--resonance-magenta)), hsl(var(--resonance-cyan)))",
    WebkitBackgroundClip: "text" as const,
    WebkitTextFillColor: "transparent",
    backgroundClip: "text" as const,
  };

  const markSize = size === "sm" ? 24 : size === "md" ? 34 : 52;

  const content = (
    <span className="inline-flex items-center gap-2 leading-none relative">
      {/* Mark with contrast aura for legibility on any surface */}
      <span
        className="relative inline-flex shrink-0 items-center justify-center"
        style={{ width: markSize, height: markSize }}
      >
        <span
          aria-hidden="true"
          className={`absolute inset-0 rounded-full blur-md ${breathe ? "resonance-mark-aura" : ""}`}
          style={{
            background:
              "radial-gradient(circle at 50% 50%, hsl(var(--resonance-magenta) / 0.55), hsl(var(--resonance-violet) / 0.35) 55%, transparent 75%)",
          }}
        />
        <img
          src={logoMark}
          alt="Resonance YouTube Optimizer mark"
          width={markSize}
          height={markSize}
          loading="eager"
          decoding="async"
          className={`relative rounded-md object-contain ${breathe ? "resonance-breathe" : ""}`}
          style={{
            filter: breathe
              ? undefined
              : `drop-shadow(0 0 6px hsl(var(--accent) / 0.55))`,
          }}
        />
      </span>
      <span className="inline-flex items-center gap-0 leading-none relative">
      {/* RESONANCE text */}
      <span className="relative">
        <span
          className={`${cfg.resonance} font-black uppercase tracking-[0.08em] relative z-10 ${animated ? "resonance-glitch-pulse" : ""} ${breathe ? "resonance-breathe" : ""}`}
          style={{
            fontFamily: "'Inter Tight', system-ui, sans-serif",
            ...gradientStyle,
            filter: `drop-shadow(0 0 ${cfg.glow} hsl(var(--resonance-cyan) / 0.8)) drop-shadow(0 0 ${cfg.outerGlow} hsl(var(--resonance-magenta) / 0.5))`,
          }}
        >
          Resonance
        </span>
        {/* Glitch layers — only on animated hero */}
        {animated && (
          <>
            <span
              aria-hidden="true"
              className={`${cfg.resonance} font-black uppercase tracking-[0.08em] absolute inset-0 z-20 pointer-events-none resonance-glitch-layer-1`}
              style={{
                fontFamily: "'Inter Tight', system-ui, sans-serif",
                ...gradientStyle,
                clipPath: "inset(0 0 65% 0)",
              }}
            >
              Resonance
            </span>
            <span
              aria-hidden="true"
              className={`${cfg.resonance} font-black uppercase tracking-[0.08em] absolute inset-0 z-20 pointer-events-none resonance-glitch-layer-2`}
              style={{
                fontFamily: "'Inter Tight', system-ui, sans-serif",
                ...gradientStyle,
                clipPath: "inset(60% 0 0 0)",
              }}
            >
              Resonance
            </span>
          </>
        )}
        {/* Glow layer */}
        <span
          aria-hidden="true"
          className={`${cfg.resonance} font-black uppercase tracking-[0.08em] absolute inset-0 z-0 blur-[3px] opacity-50`}
          style={{ fontFamily: "'Inter Tight', system-ui, sans-serif", ...gradientStyle }}
        >
          Resonance
        </span>
      </span>

      {/* YOUTUBE OPTIMIZER with arrow above */}
      <span className="inline-flex flex-col items-center ml-2 relative">
        {/* Growth arrow from U to Z */}
        <div
          className="mb-[-2px]"
          style={{
            width: "100%",
            paddingLeft: "8%",
            paddingRight: "12%",
            filter: `drop-shadow(0 0 4px hsl(var(--resonance-cyan) / 0.8)) drop-shadow(0 0 8px hsl(var(--resonance-magenta) / 0.4))`,
          }}
        >
          <svg
            width="100%"
            height={cfg.arrow}
            viewBox="0 0 110 24"
            preserveAspectRatio="none"
            fill="none"
          >
            {/* Glow trail — animated only */}
            {animated && (
              <path
                d="M2,12 L8,12 L10,4 L12,20 L14,2 L16,22 L18,4 L20,20 L22,6 L24,18 L26,8 L28,16 L30,10 L32,14 L34,11 L36,13 L38,12 L44,12 L46,6 L48,18 L50,2 L52,22 L54,4 L56,20 L58,6 L60,18 L62,8 L64,16 L66,10 L68,14 L70,12 L76,12 L78,8 L80,16 L82,6 L84,18 L86,8 L88,14 L90,12 L98,12 M91,6 L98,12 L91,18"
                stroke="hsl(var(--resonance-magenta))"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                opacity="0.4"
                style={{
                  strokeDasharray: "400",
                  strokeDashoffset: "400",
                  animation: "wave-draw 4s cubic-bezier(0.25, 0.1, 0.25, 1) infinite",
                  filter: "blur(3px)",
                }}
              />
            )}
            {/* Main wave line */}
            <path
              d="M2,12 L8,12 L10,4 L12,20 L14,2 L16,22 L18,4 L20,20 L22,6 L24,18 L26,8 L28,16 L30,10 L32,14 L34,11 L36,13 L38,12 L44,12 L46,6 L48,18 L50,2 L52,22 L54,4 L56,20 L58,6 L60,18 L62,8 L64,16 L66,10 L68,14 L70,12 L76,12 L78,8 L80,16 L82,6 L84,18 L86,8 L88,14 L90,12 L98,12"
              stroke="hsl(var(--resonance-cyan))"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              {...(animated
                ? {
                    strokeDasharray: "400",
                    strokeDashoffset: "400",
                    style: { animation: "wave-draw 4s cubic-bezier(0.25, 0.1, 0.25, 1) infinite" },
                  }
                : {})}
            />
            {/* Arrowhead */}
            <path
              d="M91,6 L98,12 L91,18"
              stroke="hsl(var(--resonance-cyan))"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              {...(animated
                ? {
                    style: { animation: "arrow-appear 4s cubic-bezier(0.25, 0.1, 0.25, 1) infinite" },
                  }
                : {})}
            />
            {/* Arrowhead glow — animated only */}
            {animated && (
              <path
                d="M91,6 L98,12 L91,18"
                stroke="hsl(var(--resonance-magenta))"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                opacity="0"
                style={{
                  animation: "arrow-appear 4s cubic-bezier(0.25, 0.1, 0.25, 1) infinite",
                  filter: "blur(4px)",
                }}
              />
            )}
          </svg>
        </div>
        {/* YOUTUBE OPTIMIZER text */}
        <span className="relative">
          <span
            className={`${cfg.sub} font-semibold uppercase tracking-[0.2em] relative z-10`}
            style={{
              fontFamily: "'Inter Tight', system-ui, sans-serif",
              ...gradientStyle,
              filter: `drop-shadow(0 0 ${cfg.glow} hsl(var(--resonance-cyan) / 0.8)) drop-shadow(0 0 ${cfg.outerGlow} hsl(var(--resonance-magenta) / 0.5))`,
            }}
          >
            YouTube Optimizer
          </span>
          <span
            aria-hidden="true"
            className={`${cfg.sub} font-semibold uppercase tracking-[0.2em] absolute inset-0 z-0 blur-[3px] opacity-50`}
            style={{ fontFamily: "'Inter Tight', system-ui, sans-serif", ...gradientStyle }}
          >
            YouTube Optimizer
          </span>
        </span>
      </span>
      </span>
    </span>
  );

  if (!clickable) return content;

  return (
    <button
      onClick={() => navigate("/")}
      aria-label="Resonance YouTube Optimizer — go to home"
      className="hover:opacity-90 transition-opacity rounded-md outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {content}
    </button>
  );
};

export default BrandLogo;
