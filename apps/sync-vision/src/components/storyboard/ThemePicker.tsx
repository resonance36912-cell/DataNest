/**
 * ThemePicker — Theme selector chips with custom input for storyboard scenes.
 *
 * Surfaces the effective theme that will be sent to the AI so users can
 * confirm their selection is actually applied. Mirrors the fallback logic
 * in `useStoryboardHandlers.themeForRequest`:
 *   userPickedTheme (custom or preset != "auto") || visualStyle || "auto"
 */

import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";

const THEME_OPTIONS = [
  { value: "auto", label: "🎵 Auto", desc: "Match the song" },
  { value: "professional", label: "💼 Professional" },
  { value: "spiritual", label: "🙏 Spiritual" },
  { value: "scientific", label: "🔬 Scientific" },
  { value: "playful", label: "🎪 Playful" },
  { value: "retro", label: "📼 Retro" },
  { value: "philosophical", label: "🤔 Philosophical" },
  { value: "historical", label: "🏛️ Historical" },
  { value: "futuristic", label: "🚀 Futuristic" },
  { value: "dramatic", label: "🎭 Dramatic" },
  { value: "romantic", label: "💕 Romantic" },
  { value: "dark", label: "🌑 Dark" },
  { value: "nature", label: "🌿 Nature" },
];

interface ThemePickerProps {
  sceneTheme: string;
  setSceneTheme: (s: string) => void;
  customTheme: string;
  setCustomTheme: (s: string) => void;
  /** Persisted track visual_style used as fallback when picker is "auto". */
  visualStyle?: string | null;
}

function labelFor(value: string): string {
  const found = THEME_OPTIONS.find((t) => t.value === value);
  return found ? found.label : value;
}

export default function ThemePicker({
  sceneTheme,
  setSceneTheme,
  customTheme,
  setCustomTheme,
  visualStyle,
}: ThemePickerProps) {
  // Effective theme mirrors server-bound `themeForRequest` in useStoryboardHandlers.
  const userPicked = sceneTheme && sceneTheme !== "auto" ? sceneTheme : "";
  const fallback = (visualStyle ?? "").trim();
  const effective = userPicked || fallback || "auto";
  const source: "custom" | "preset" | "track" | "auto" =
    customTheme.trim()
      ? "custom"
      : userPicked
        ? "preset"
        : fallback
          ? "track"
          : "auto";

  // Toast on real user changes (skip first render).
  // Debounce custom typing so each keystroke does not fire a toast.
  // Suppress auto/track toasts to avoid noise when visualStyle loads async.
  const firstRender = useRef(true);
  const lastToasted = useRef<string>(effective);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      lastToasted.current = effective;
      return;
    }
    if (effective === lastToasted.current) return;
    if (source === "auto" || source === "track") {
      lastToasted.current = effective;
      return;
    }

    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      lastToasted.current = effective;
      const detail =
        source === "custom"
          ? `Custom theme "${effective}" will be sent on the next generation.`
          : `Theme "${effective}" will be sent on the next generation.`;
      toast.success("Theme updated", { description: detail });
      toastTimer.current = null;
    }, 600);

    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [effective, source]);

  const activeLabel =
    source === "custom" ? `"${effective}"` : labelFor(effective);
  const badgeText =
    source === "custom"
      ? `Sending: ${activeLabel}`
      : source === "preset"
        ? `Sending: ${activeLabel}`
        : source === "track"
          ? `Auto → ${activeLabel} (from track)`
          : "Auto → AI picks from song";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground shrink-0">Theme:</span>
        {THEME_OPTIONS.map((t) => {
          const isActive = sceneTheme === t.value && !customTheme;
          return (
            <button
              key={t.value}
              onClick={() => {
                setSceneTheme(t.value);
                setCustomTheme("");
              }}
              aria-pressed={isActive}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all inline-flex items-center gap-1 ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/40"
                  : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
              }`}
              title={t.desc || t.label}
            >
              {isActive && <Check className="h-3 w-3" />}
              {t.label}
            </button>
          );
        })}
        <Input
          placeholder="Custom theme…"
          value={customTheme}
          onChange={(e) => {
            setCustomTheme(e.target.value);
            if (e.target.value.trim()) setSceneTheme(e.target.value.trim());
            else setSceneTheme("auto");
          }}
          className={`h-7 w-40 text-xs rounded-full px-3 bg-secondary border-border placeholder:text-muted-foreground ${
            customTheme ? "ring-2 ring-primary/40 text-foreground" : ""
          }`}
        />
      </div>

      <div className="flex items-center gap-2 pl-1">
        <Badge
          variant="outline"
          className="gap-1 border-primary/40 bg-primary/5 text-[10px] font-medium text-primary"
          aria-live="polite"
          data-testid="theme-picker-active"
          title="This is the theme that will be sent to the AI on the next generation."
        >
          <Sparkles className="h-3 w-3" />
          {badgeText}
        </Badge>
      </div>
    </div>
  );
}
