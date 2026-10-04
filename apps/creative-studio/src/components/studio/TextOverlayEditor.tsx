import { useState } from "react";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowUp,
  ArrowDown,
  Minus,
  Bold,
  Italic,
  Type,
  X,
  ChevronDown,
} from "lucide-react";

// Re-export from the lightweight config module so PreviewPanel can pull defaults
// without bundling this whole editor (which is now lazy-loaded).
export { DEFAULT_OVERLAY_CONFIG, type TextOverlayConfig } from "./textOverlayConfig";
import type { TextOverlayConfig } from "./textOverlayConfig";

const SIZE_OPTIONS = [
  { label: "XS", value: "text-xs" },
  { label: "SM", value: "text-sm" },
  { label: "Base", value: "text-base" },
  { label: "LG", value: "text-lg" },
  { label: "XL", value: "text-xl" },
  { label: "2XL", value: "text-2xl" },
  { label: "3XL", value: "text-3xl" },
];

interface TextOverlayEditorProps {
  config: TextOverlayConfig;
  onChange: (config: TextOverlayConfig) => void;
  onClose: () => void;
}

const TextOverlayEditor = ({ config, onChange, onClose }: TextOverlayEditorProps) => {
  const [activeTab, setActiveTab] = useState<"content" | "style" | "position">("content");

  const update = (partial: Partial<TextOverlayConfig>) => {
    onChange({ ...config, ...partial });
  };

  return (
    <div className="rounded-lg border border-border bg-card shadow-lg w-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Type className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">Text Overlay</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-secondary text-muted-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(["content", "style", "position"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              activeTab === tab
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="p-3 space-y-3 max-h-[320px] overflow-y-auto">
        {/* ─── Content Tab ─── */}
        {activeTab === "content" && (
          <>
            <Field label="Headline">
              <input
                value={config.headline}
                onChange={(e) => update({ headline: e.target.value })}
                placeholder="Enter headline..."
                className="w-full rounded-md border border-border bg-secondary/50 px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
              />
            </Field>
            <Field label="Subheadline">
              <input
                value={config.subheadline}
                onChange={(e) => update({ subheadline: e.target.value })}
                placeholder="Enter subheadline..."
                className="w-full rounded-md border border-border bg-secondary/50 px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
              />
            </Field>
            <Field label="Call to Action">
              <input
                value={config.callToAction}
                onChange={(e) => update({ callToAction: e.target.value })}
                placeholder="Enter CTA..."
                className="w-full rounded-md border border-border bg-secondary/50 px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
              />
            </Field>
          </>
        )}

        {/* ─── Style Tab ─── */}
        {activeTab === "style" && (
          <>
            <Field label="Headline Size">
              <SizePicker value={config.headlineSizeClass} onChange={(v) => update({ headlineSizeClass: v })} />
            </Field>
            <div className="flex items-center gap-2">
              <Field label="Headline Color" className="flex-1">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.headlineColor}
                    onChange={(e) => update({ headlineColor: e.target.value })}
                    className="w-7 h-7 rounded cursor-pointer border border-border"
                  />
                  <span className="text-xs text-muted-foreground font-mono">{config.headlineColor}</span>
                </div>
              </Field>
              <div className="flex items-center gap-1 pt-4">
                <button
                  onClick={() => update({ headlineBold: !config.headlineBold })}
                  className={`p-1.5 rounded ${config.headlineBold ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => update({ headlineItalic: !config.headlineItalic })}
                  className={`p-1.5 rounded ${config.headlineItalic ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <Field label="Subheadline Size">
              <SizePicker value={config.subheadlineSizeClass} onChange={(v) => update({ subheadlineSizeClass: v })} />
            </Field>
            <Field label="Subheadline Color">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config.subheadlineColor}
                  onChange={(e) => update({ subheadlineColor: e.target.value })}
                  className="w-7 h-7 rounded cursor-pointer border border-border"
                />
                <span className="text-xs text-muted-foreground font-mono">{config.subheadlineColor}</span>
              </div>
            </Field>

            <Field label="CTA Size">
              <SizePicker value={config.ctaSizeClass} onChange={(v) => update({ ctaSizeClass: v })} />
            </Field>
            <Field label="CTA Color">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config.ctaColor}
                  onChange={(e) => update({ ctaColor: e.target.value })}
                  className="w-7 h-7 rounded cursor-pointer border border-border"
                />
                <span className="text-xs text-muted-foreground font-mono">{config.ctaColor}</span>
              </div>
            </Field>
          </>
        )}

        {/* ─── Position Tab ─── */}
        {activeTab === "position" && (
          <>
            <Field label="Vertical Position">
              <div className="grid grid-cols-3 gap-1">
                {(["top", "center", "bottom"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => update({ verticalAlign: v })}
                    className={`px-2 py-1.5 rounded text-xs font-medium capitalize transition-colors ${
                      config.verticalAlign === v
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Horizontal Alignment">
              <div className="grid grid-cols-3 gap-1">
                {([
                  { val: "left" as const, icon: AlignLeft },
                  { val: "center" as const, icon: AlignCenter },
                  { val: "right" as const, icon: AlignRight },
                ]).map(({ val, icon: Icon }) => (
                  <button
                    key={val}
                    onClick={() => update({ horizontalAlign: val })}
                    className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs font-medium capitalize transition-colors ${
                      config.horizontalAlign === val
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {val}
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}
      </div>
    </div>
  );
};

/* ── Small helpers ── */

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-medium text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}

function SizePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {SIZE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
            value === opt.value
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default TextOverlayEditor;
