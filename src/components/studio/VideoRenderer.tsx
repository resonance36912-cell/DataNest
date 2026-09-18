import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Play } from "lucide-react";

import type { TextOverlayConfig } from "./TextOverlayEditor";

interface VideoRendererProps {
  posterUrl: string;
  headline?: string;
  subheadline?: string;
  callToAction?: string;
  colors?: string[];
  duration?: number;
  cameraMode?: number;
  showTextOverlay?: boolean;
  overlayConfig?: TextOverlayConfig;
  disableInteraction?: boolean;
  cinematicIntensity?: number;
}

/* ── easing helpers ── */
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutQuad = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOutBack = (t: number) => {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const phase = (p: number, start: number, end: number, ease = easeOutCubic) => {
  if (p <= start) return 0;
  if (p >= end) return 1;
  return ease((p - start) / (end - start));
};

/* ── camera movement calculators (intensity-aware) ── */
function cameraKenBurns(progress: number, ci: number) {
  const amp = 1 + ci * 3; // camera amplitude scales 1x–4x
  const revealZoom = 1.25 - 0.15 * amp * phase(progress, 0, 0.25);
  const panP = phase(progress, 0.15, 0.7, easeInOutQuad);
  const driftScale = 1.1 + 0.06 * amp * panP;
  const pullBack = phase(progress, 0.65, 0.88);
  const finalScale = driftScale - 0.08 * amp * pullBack;
  // dramatic slow push-in at high intensity
  const pushIn = phase(progress, 0.4, 0.65, easeInOutCubic);
  const pushBoost = ci * 0.15 * pushIn;
  return {
    scale: (progress < 0.25 ? revealZoom : finalScale) + pushBoost,
    tx: progress < 0.15 ? 0 : -1.5 * amp * panP + ci * 2 * Math.sin(progress * Math.PI * 3),
    ty: progress < 0.15 ? 0 : -1 * amp * panP + ci * 1.5 * Math.cos(progress * Math.PI * 2),
    rotate: ci * 2.5 * Math.sin(progress * Math.PI * 4),
    perspective: ci > 0.3,
  };
}

function cameraDollyOrbit(progress: number, ci: number) {
  const amp = 1 + ci * 3;
  const dollyOut = phase(progress, 0, 0.2, easeOutCubic);
  const dollyScale = 1.35 - 0.2 * amp * dollyOut;
  const orbitP = phase(progress, 0.12, 0.82, easeInOutCubic);
  const orbitAngle = orbitP * Math.PI * (0.6 + ci * 0.8); // wider orbit arc
  const orbitRadius = 2.5 * amp;
  const orbitX = Math.sin(orbitAngle) * orbitRadius;
  const orbitY = -Math.abs(Math.cos(orbitAngle) * orbitRadius * 0.5);
  const orbitRotate = Math.sin(orbitAngle) * (1.2 + ci * 3);
  const pushIn = phase(progress, 0.72, 0.92, easeInOutQuad);
  const pushScale = 1.15 + (0.1 + ci * 0.2) * pushIn;
  // dramatic crane movement
  const craneP = phase(progress, 0.3, 0.7, easeInOutCubic);
  const craneY = ci * 4 * Math.sin(craneP * Math.PI);
  return {
    scale: progress < 0.2 ? dollyScale : pushScale,
    tx: progress < 0.12 ? 0 : orbitX,
    ty: (progress < 0.12 ? 0 : orbitY) - craneY,
    rotate: progress < 0.12 ? 0 : orbitRotate,
    perspective: true as const,
  };
}

function cameraParallaxDrift(progress: number, ci: number) {
  const amp = 1 + ci * 3;
  const driftP = phase(progress, 0.05, 0.85, easeInOutCubic);
  const tx = 3 * amp * (1 - driftP) - 1.5 * amp;
  const ty = 2 * amp * (1 - driftP) - 1 * amp;
  const breathe = Math.sin(progress * Math.PI * 3) * (0.02 + ci * 0.06);
  const baseScale = 1.12 + (0.05 + ci * 0.12) * driftP + breathe;
  const tilt = Math.sin(progress * Math.PI * 2) * (0.5 + ci * 3);
  // whip-pan effect at high intensity
  const whipP = phase(progress, 0.45, 0.55, easeInOutCubic);
  const whipX = ci * 6 * Math.sin(whipP * Math.PI);
  return { scale: baseScale, tx: tx + whipX, ty, rotate: tilt, perspective: ci > 0.5 };
}

type CameraFn = (progress: number, ci: number) => { scale: number; tx: number; ty: number; rotate: number; perspective: boolean };
const CAMERA_MODES: CameraFn[] = [cameraKenBurns, cameraDollyOrbit, cameraParallaxDrift];

/* ── Pre-generate grain textures to avoid inline SVG re-creation every frame ── */
const GRAIN_TEXTURES = Array.from({ length: 8 }, (_, i) =>
  `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' seed='${i * 7}' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`
);

const VideoRenderer = ({
  posterUrl,
  headline,
  subheadline,
  callToAction,
  colors = [],
  duration = 10,
  cameraMode = 0,
  showTextOverlay = false,
  overlayConfig,
  disableInteraction = false,
  cinematicIntensity = 0,
}: VideoRendererProps) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const progressRef = useRef(0);
  const smoothCiRef = useRef(cinematicIntensity);
  const targetCiRef = useRef(cinematicIntensity);
  const frameRef = useRef<number>();
  const startRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Force re-render at a throttled rate for React-dependent overlays
  const [, forceRender] = useState(0);
  const lastRenderRef = useRef(0);

  const modeIndex = Math.abs(cameraMode) % CAMERA_MODES.length;
  const cameraFn = CAMERA_MODES[modeIndex];

  // Update target intensity ref when prop changes
  useEffect(() => {
    targetCiRef.current = cinematicIntensity;
  }, [cinematicIntensity]);

  const animate = useCallback(
    (now: number) => {
      const elapsed = now - startRef.current;
      const p = (elapsed % (duration * 1000)) / (duration * 1000);
      progressRef.current = p;

      // Smooth lerp cinematic intensity
      const diff = targetCiRef.current - smoothCiRef.current;
      if (Math.abs(diff) > 0.5) {
        smoothCiRef.current += diff * 0.08;
      } else {
        smoothCiRef.current = targetCiRef.current;
      }

      // Direct DOM mutations for the main image (avoids React re-render)
      const container = containerRef.current;
      if (container) {
        const img = container.querySelector<HTMLImageElement>("[data-vr-frame]");
        const ci = Math.max(0, Math.min(1, smoothCiRef.current / 100));
        const cam = cameraFn(p, ci);
        const revealBlur = 6 * (1 - phase(p, 0, 0.12));
        const revealBrightness = 0.3 + 0.7 * phase(p, 0, 0.18);
        // Dramatic lighting pulses at high intensity
        const lightPulse = ci * 0.15 * Math.sin(p * Math.PI * 4);
        const exposureShift = ci * 0.1 * Math.sin(p * Math.PI * 2.5);
        const cGradeSaturate = 1.08 + 0.25 * ci + ci * 0.08 * Math.sin(p * Math.PI * 3);
        const cGradeContrast = 1 + 0.25 * ci;
        const cGradeHue = 18 * ci * Math.sin(p * Math.PI * 2);

        if (img) {
          const perspDist = cam.perspective ? Math.max(400, 800 - ci * 400) : 0;
          img.style.transform = `${cam.perspective ? `perspective(${perspDist}px) ` : ""}scale(${cam.scale}) translate(${cam.tx}%, ${cam.ty}%) rotate(${cam.rotate}deg)`;
          img.style.filter = `blur(${revealBlur}px) brightness(${revealBrightness + lightPulse + exposureShift}) saturate(${cGradeSaturate}) contrast(${cGradeContrast}) hue-rotate(${cGradeHue}deg)`;
        }

        // Light sweep — more dramatic with intensity
        const sweep = container.querySelector<HTMLDivElement>("[data-vr-sweep]");
        if (sweep) {
          const sweepAngle = modeIndex === 1 ? 75 : 105;
          const sweepX = -30 + 160 * phase(p, 0.05, 0.35, easeInOutQuad);
          const sweepIntensity = 0.08 + ci * 0.18;
          // secondary sweep at high intensity
          const sweep2X = 120 - 160 * phase(p, 0.4, 0.7, easeInOutQuad);
          const sweep2 = ci > 0.3 ? `, linear-gradient(${sweepAngle + 90}deg, transparent ${sweep2X - 10}%, rgba(255,220,180,${ci * 0.1}) ${sweep2X}%, transparent ${sweep2X + 10}%)` : "";
          sweep.style.background = `linear-gradient(${sweepAngle}deg, transparent ${sweepX - 15}%, rgba(255,255,255,${sweepIntensity}) ${sweepX}%, transparent ${sweepX + 15}%)${sweep2}`;
        }

        // Vignette — dramatic pulsing at high intensity
        const vignette = container.querySelector<HTMLDivElement>("[data-vr-vignette]");
        if (vignette) {
          const vignetteBase = 0.5 + 0.35 * ci;
          const vignettePulse = ci * 0.25 * Math.sin(p * Math.PI * 3);
          vignette.style.opacity = String(vignetteBase + vignettePulse);
        }

        // Film grain — more visible at high intensity
        const grain = container.querySelector<HTMLDivElement>("[data-vr-grain]");
        if (grain) {
          grain.style.backgroundImage = GRAIN_TEXTURES[Math.floor(p * 60) % GRAIN_TEXTURES.length];
          grain.style.opacity = String(0.06 + ci * 0.08);
        }

        // Letterbox — cinematic widescreen
        const lbTop = container.querySelector<HTMLDivElement>("[data-vr-lb-top]");
        const lbBot = container.querySelector<HTMLDivElement>("[data-vr-lb-bot]");
        const letterboxH = 8 + 8 * ci;
        if (lbTop) lbTop.style.height = `${letterboxH}%`;
        if (lbBot) lbBot.style.height = `${letterboxH}%`;

        // Fade out
        const fadeEl = container.querySelector<HTMLDivElement>("[data-vr-fade]");
        if (fadeEl) {
          const fadeOut = p > 0.88 ? 1 - phase(p, 0.88, 0.98) : 1;
          fadeEl.style.opacity = fadeOut < 1 ? String(1 - fadeOut) : "0";
          fadeEl.style.display = fadeOut < 1 ? "" : "none";
        }
      }

      // Throttle React re-renders to ~20fps for text overlays & bokeh
      if (now - lastRenderRef.current > 50) {
        lastRenderRef.current = now;
        forceRender((c) => c + 1);
      }

      frameRef.current = requestAnimationFrame(animate);
    },
    [duration, cameraFn, modeIndex]
  );

  useEffect(() => {
    if (!isPlaying) {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      pausedAtRef.current = progressRef.current;
      return;
    }
    startRef.current = performance.now() - pausedAtRef.current * duration * 1000;
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [isPlaying, duration, animate]);

  useEffect(() => {
    progressRef.current = 0;
    pausedAtRef.current = 0;
    startRef.current = performance.now();
  }, [posterUrl]);

  const progress = progressRef.current;
  const accentColor = colors[0] || "hsl(var(--primary))";
  const accentColor2 = colors[1] || accentColor;
  const ci = Math.max(0, Math.min(1, smoothCiRef.current / 100));
  const cinematic = ci > 0;

  /* ── text animation phases ── */
  const headlineP = phase(progress, 0.12, 0.28, easeOutBack);
  const subP = phase(progress, 0.25, 0.40, easeOutCubic);
  const ctaP = phase(progress, 0.50, 0.65, easeOutBack);
  const headlineBreath = 1 + 0.008 * Math.sin(progress * Math.PI * 6);
  const letterboxH = 8 + 8 * ci;

  /* ── cinematic: anamorphic flare (more dramatic) ── */
  const flareP = phase(progress, 0.15, 0.55, easeInOutQuad);
  const flareX = 10 + 80 * flareP;
  const flareOpacity = ci * 0.25 * Math.sin(flareP * Math.PI);
  // secondary flare at high intensity
  const flare2P = phase(progress, 0.5, 0.85, easeInOutQuad);
  const flare2X = 90 - 80 * flare2P;
  const flare2Opacity = ci > 0.4 ? ci * 0.15 * Math.sin(flare2P * Math.PI) : 0;

  /* ── cinematic: bokeh particles (stable seed per poster) ── */
  const bokehCount = Math.round(18 * ci);
  const bokehParticles = useMemo(() => {
    if (bokehCount === 0) return [];
    return Array.from({ length: bokehCount }, (_, i) => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 3 + Math.random() * 8,
      speed: 0.3 + Math.random() * 0.7,
      delay: Math.random() * Math.PI * 2,
      opacity: 0.08 + Math.random() * 0.12,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bokehCount, posterUrl]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full aspect-video rounded-lg overflow-hidden bg-black select-none ${disableInteraction ? "pointer-events-none" : "cursor-pointer"}`}
      onClick={disableInteraction ? undefined : () => setIsPlaying((p) => !p)}
    >
      {/* ─── MAIN FRAME ─── */}
      <img
        data-vr-frame
        src={posterUrl}
        alt="Video frame"
        draggable={false}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ willChange: "transform, filter" }}
      />

      {/* ─── LIGHT SWEEP ─── */}
      <div data-vr-sweep className="absolute inset-0 pointer-events-none" />

      {/* ─── VIGNETTE ─── */}
      <div
        data-vr-vignette
        className="absolute inset-0 pointer-events-none"
        style={{
          background: modeIndex === 1
            ? "radial-gradient(ellipse 65% 55% at 50% 45%, transparent 35%, rgba(0,0,0,0.75) 100%)"
            : "radial-gradient(ellipse 70% 60% at 50% 50%, transparent 40%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      {/* ─── FILM GRAIN ─── */}
      <div
        data-vr-grain
        className="absolute inset-0 pointer-events-none mix-blend-overlay"
        style={{ opacity: 0.06, backgroundSize: "180px 180px" }}
      />

      {/* ─── CINEMATIC: ANAMORPHIC FLARES ─── */}
      {cinematic && flareOpacity > 0.01 && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 120% ${3 + ci * 3}% at ${flareX}% 50%, rgba(200,220,255,${flareOpacity}), transparent 70%)`,
          }}
        />
      )}
      {cinematic && flare2Opacity > 0.01 && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 100% ${2 + ci * 2}% at ${flare2X}% 48%, rgba(255,200,150,${flare2Opacity}), transparent 65%)`,
          }}
        />
      )}

      {/* ─── CINEMATIC: BOKEH PARTICLES ─── */}
      {cinematic && bokehParticles.map((p, i) => {
        const y = p.y + Math.sin(progress * Math.PI * 2 * p.speed + p.delay) * 8;
        const x = p.x + Math.cos(progress * Math.PI * 1.5 * p.speed + p.delay) * 4;
        const scale = 0.8 + 0.4 * Math.sin(progress * Math.PI * 3 * p.speed + p.delay);
        return (
          <div
            key={i}
            className="absolute rounded-full pointer-events-none"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: p.size,
              height: p.size,
              background: `radial-gradient(circle, rgba(255,255,255,${p.opacity * ci * scale}) 0%, transparent 70%)`,
              filter: `blur(${p.size * 0.3}px)`,
            }}
          />
        );
      })}

      {/* ─── GRADIENT OVERLAYS ─── */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: cinematic
          ? "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.35) 30%, transparent 55%, rgba(0,0,0,0.25) 100%)"
          : "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.25) 35%, transparent 55%, rgba(0,0,0,0.15) 100%)",
      }} />
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `linear-gradient(135deg, ${accentColor}10 0%, transparent 50%, ${accentColor2}08 100%)`,
      }} />

      {/* ─── CINEMATIC: TEAL/ORANGE COLOR WASH ─── */}
      {cinematic && (
        <div className="absolute inset-0 pointer-events-none mix-blend-color" style={{
          background: "linear-gradient(180deg, rgba(0,80,120,0.08) 0%, transparent 40%, rgba(180,100,30,0.06) 100%)",
        }} />
      )}

      {/* ─── LETTERBOX ─── */}
      <div data-vr-lb-top className="absolute top-0 left-0 right-0 bg-black pointer-events-none" style={{ height: `${letterboxH}%` }} />
      <div data-vr-lb-bot className="absolute bottom-0 left-0 right-0 bg-black pointer-events-none" style={{ height: `${letterboxH}%` }} />

      {/* ─── TEXT OVERLAYS (optional) ─── */}
      {showTextOverlay && (
        <TextOverlayDisplay
          overlayConfig={overlayConfig}
          headline={headline}
          subheadline={subheadline}
          callToAction={callToAction}
          headlineP={headlineP}
          subP={subP}
          ctaP={ctaP}
          headlineBreath={headlineBreath}
          letterboxH={letterboxH}
          accentColor={accentColor}
          accentColor2={accentColor2}
        />
      )}

      {/* ─── FADE OUT ─── */}
      <div data-vr-fade className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: 0, display: "none" }} />

      {/* ─── PLAY / PAUSE ─── */}
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20">
            <Play className="w-7 h-7 text-white ml-1" />
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Extracted text overlay sub-component ── */
interface TextOverlayDisplayProps {
  overlayConfig?: TextOverlayConfig;
  headline?: string;
  subheadline?: string;
  callToAction?: string;
  headlineP: number;
  subP: number;
  ctaP: number;
  headlineBreath: number;
  letterboxH: number;
  accentColor: string;
  accentColor2: string;
}

const TextOverlayDisplay = ({
  overlayConfig: oc,
  headline,
  subheadline,
  callToAction,
  headlineP,
  subP,
  ctaP,
  headlineBreath,
  letterboxH,
  accentColor,
  accentColor2,
}: TextOverlayDisplayProps) => {
  const displayHeadline = oc ? oc.headline : headline;
  const displaySub = oc ? oc.subheadline : subheadline;
  const displayCta = oc ? oc.callToAction : callToAction;
  const vAlign = oc?.verticalAlign || "bottom";
  const hAlign = oc?.horizontalAlign || "left";
  const justifyMap = { top: "justify-start", center: "justify-center", bottom: "justify-end" } as const;
  const alignMap = { left: "items-start text-left", center: "items-center text-center", right: "items-end text-right" } as const;
  const hSizeClass = oc?.headlineSizeClass || "text-lg md:text-2xl lg:text-3xl";
  const sSizeClass = oc?.subheadlineSizeClass || "text-xs md:text-sm lg:text-base";
  const cSizeClass = oc?.ctaSizeClass || "text-xs md:text-sm";
  const hColor = oc?.headlineColor || "#ffffff";
  const sColor = oc?.subheadlineColor || "#ffffffcc";
  const cColor = oc?.ctaColor || "#ffffff";
  const hBold = oc?.headlineBold !== false;
  const hItalic = oc?.headlineItalic || false;

  return (
    <div
      className={`absolute inset-0 flex flex-col ${justifyMap[vAlign]} ${alignMap[hAlign]} pointer-events-none`}
      style={{ padding: `${letterboxH + 2}% 6% ${letterboxH + 3}%` }}
    >
      <div
        className="h-[2px] rounded-full mb-3"
        style={{
          width: `${headlineP * 60}px`,
          backgroundColor: accentColor,
          opacity: headlineP,
          boxShadow: `0 0 12px ${accentColor}80`,
        }}
      />
      {displayHeadline && (
        <div
          className={`font-display ${hSizeClass} tracking-tight leading-tight`}
          style={{
            color: hColor,
            fontWeight: hBold ? 700 : 400,
            fontStyle: hItalic ? "italic" : "normal",
            opacity: headlineP,
            transform: `translateY(${(1 - headlineP) * 30}px) scale(${headlineBreath})`,
            textShadow: "0 2px 20px rgba(0,0,0,0.8), 0 0 40px rgba(0,0,0,0.4)",
            letterSpacing: `${-0.02 + headlineP * 0.01}em`,
          }}
        >
          {displayHeadline}
        </div>
      )}
      {displaySub && (
        <div
          className={`${sSizeClass} mt-1.5 max-w-[75%] leading-relaxed`}
          style={{
            color: sColor,
            opacity: subP,
            transform: `translateX(${(1 - subP) * -20}px)`,
            textShadow: "0 1px 12px rgba(0,0,0,0.6)",
          }}
        >
          {displaySub}
        </div>
      )}
      {displayCta && (
        <div
          className="mt-3"
          style={{
            opacity: ctaP,
            transform: `translateY(${(1 - ctaP) * 15}px) scale(${0.85 + ctaP * 0.15})`,
          }}
        >
          <span
            className={`inline-flex items-center gap-2 px-5 py-2 rounded-full ${cSizeClass} font-semibold backdrop-blur-sm`}
            style={{
              color: cColor,
              background: `linear-gradient(135deg, ${accentColor}, ${accentColor2})`,
              boxShadow: `0 4px 24px ${accentColor}50, 0 0 0 1px rgba(255,255,255,0.1) inset`,
            }}
          >
            {displayCta}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      )}
    </div>
  );
};

export default VideoRenderer;
