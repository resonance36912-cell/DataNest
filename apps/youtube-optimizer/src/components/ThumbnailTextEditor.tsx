import { useState, useRef, useCallback, useEffect } from "react";
import { Download, Type, Palette, Move, Plus, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

interface TextLayer {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontWeight: "normal" | "bold" | "900";
  fontFamily: string;
  strokeColor: string;
  strokeWidth: number;
}

export interface ThumbnailTextEditorHandle {
  getLayers: () => TextLayer[];
}

interface ThumbnailTextEditorProps {
  imageUrl: string;
  videoId: string;
  defaultText?: string;
  /** When true, render only the interactive preview (no controls panel) */
  previewOnly?: boolean;
}

const FONT_FAMILIES = [
  { value: '"Impact", "Arial Black", sans-serif', label: "Impact" },
  { value: '"Arial Black", "Helvetica Neue", sans-serif', label: "Arial Black" },
  { value: '"Inter", "Helvetica", sans-serif', label: "Inter" },
  { value: '"Georgia", serif', label: "Georgia" },
  { value: '"Courier New", monospace', label: "Courier" },
];

const FONT_WEIGHTS = [
  { value: "normal" as const, label: "Regular" },
  { value: "bold" as const, label: "Bold" },
  { value: "900" as const, label: "Black" },
];

const PRESET_COLORS = [
  "#FFFFFF", "#000000", "#FF0000", "#FFFF00",
  "#00FF00", "#00BFFF", "#FF6600", "#FF00FF",
];

let idCounter = 0;
const genId = () => `tl-${++idCounter}`;

const ThumbnailTextEditor = ({ imageUrl, videoId, defaultText, previewOnly = false }: ThumbnailTextEditorProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [layers, setLayers] = useState<TextLayer[]>(() => [
      {
        id: genId(),
        text: defaultText || "Your Text Here",
        x: 50,
        y: 80,
        fontSize: 32,
        color: "#FFFFFF",
        fontWeight: "900",
        fontFamily: FONT_FAMILIES[0]!.value,
        strokeColor: "#000000",
        strokeWidth: 3,
      },
    ]);
    const [activeLayerId, setActiveLayerId] = useState<string | null>(layers[0]?.id || null);
    const [dragging, setDragging] = useState<string | null>(null);
    const dragOffset = useRef({ x: 0, y: 0 });
    const userHasEdited = useRef(false);
    const originalText = useRef(defaultText || "");

    const activeLayer = layers.find((l) => l.id === activeLayerId) || null;



    const updateLayer = useCallback((id: string, updates: Partial<TextLayer>) => {
      setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
    }, []);

    const prevDefaultText = useRef(defaultText);
    useEffect(() => {
      if (
        defaultText !== undefined &&
        defaultText !== prevDefaultText.current &&
        activeLayerId &&
        !userHasEdited.current
      ) {
        updateLayer(activeLayerId, { text: defaultText });
        prevDefaultText.current = defaultText;
        originalText.current = defaultText;
      }
    }, [defaultText, activeLayerId, updateLayer]);

    const addLayer = () => {
      const newLayer: TextLayer = {
        id: genId(),
        text: "New Text",
        x: 50,
        y: 50,
        fontSize: 28,
        color: "#FFFFFF",
        fontWeight: "bold",
        fontFamily: FONT_FAMILIES[0]!.value,
        strokeColor: "#000000",
        strokeWidth: 2,
      };
      setLayers((prev) => [...prev, newLayer]);
      setActiveLayerId(newLayer.id);
    };

    const removeLayer = (id: string) => {
      const remaining = layers.filter((l) => l.id !== id);
      setLayers(remaining);
      setActiveLayerId(remaining[0]?.id ?? null);
    };

    const resetText = () => {
      if (activeLayerId && originalText.current) {
        updateLayer(activeLayerId, { text: originalText.current });
        userHasEdited.current = false;
      }
    };

    const handlePointerDown = (e: React.PointerEvent, layerId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setActiveLayerId(layerId);
      setDragging(layerId);
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const layer = layers.find((l) => l.id === layerId);
      if (!layer) return;
      dragOffset.current = {
        x: e.clientX - (layer.x / 100) * rect.width,
        y: e.clientY - (layer.y / 100) * rect.height,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
      if (!dragging) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newX = Math.max(0, Math.min(100, ((e.clientX - dragOffset.current.x) / rect.width) * 100));
      const newY = Math.max(0, Math.min(100, ((e.clientY - dragOffset.current.y) / rect.height) * 100));
      updateLayer(dragging, { x: newX, y: newY });
    };

    const handlePointerUp = () => setDragging(null);

    const downloadWithText = useCallback(async () => {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      try {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = imageUrl;
        });
      } catch {
        const res = await fetch(imageUrl);
        const blob = await res.blob();
        img.src = URL.createObjectURL(blob);
        await new Promise<void>((resolve) => { img.onload = () => resolve(); });
      }
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 1280;
      canvas.height = img.naturalHeight || 720;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const layer of layers) {
        if (!layer.text.trim()) continue;
        const scaledFontSize = (layer.fontSize / 400) * canvas.width;
        ctx.font = `${layer.fontWeight} ${scaledFontSize}px ${layer.fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const x = (layer.x / 100) * canvas.width;
        const y = (layer.y / 100) * canvas.height;
        if (layer.strokeWidth > 0) {
          ctx.strokeStyle = layer.strokeColor;
          ctx.lineWidth = (layer.strokeWidth / 400) * canvas.width;
          ctx.lineJoin = "round";
          ctx.strokeText(layer.text, x, y);
        }
        ctx.fillStyle = layer.color;
        ctx.fillText(layer.text, x, y);
      }
      const link = document.createElement("a");
      link.download = `thumbnail-${videoId}-edited.png`;
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }, [imageUrl, layers, videoId]);

    // --- Interactive Preview ---
    const preview = (
      <div
        ref={containerRef}
        className="relative w-full aspect-video rounded-lg overflow-hidden border-2 border-primary/30 cursor-crosshair select-none"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <img src={imageUrl} alt="Editable thumbnail" className="w-full h-full object-cover" draggable={false} />
        {layers.map((layer) => (
          <div
            key={layer.id}
            onPointerDown={(e) => handlePointerDown(e, layer.id)}
            onClick={(e) => { e.stopPropagation(); setActiveLayerId(layer.id); }}
            className={`absolute cursor-move touch-none transition-shadow ${
              activeLayerId === layer.id ? "ring-2 ring-primary rounded-sm" : ""
            }`}
            style={{
              left: `${layer.x}%`,
              top: `${layer.y}%`,
              transform: "translate(-50%, -50%)",
              fontSize: `${layer.fontSize}px`,
              fontWeight: layer.fontWeight,
              color: layer.color,
              WebkitTextStroke: `${layer.strokeWidth}px ${layer.strokeColor}`,
              paintOrder: "stroke fill",
              fontFamily: layer.fontFamily,
              lineHeight: 1.1,
              textAlign: "center",
              whiteSpace: "nowrap",
              userSelect: "none",
              textShadow: `0 2px 8px rgba(0,0,0,0.5)`,
              zIndex: activeLayerId === layer.id ? 10 : 1,
            }}
          >
            {layer.text || " "}
          </div>
        ))}
        <div className="absolute bottom-1 left-1 bg-background/80 rounded px-1.5 py-0.5 text-[8px] text-muted-foreground pointer-events-none">
          <Move className="h-2.5 w-2.5 inline mr-0.5" /> Drag to reposition
        </div>
      </div>
    );

    if (previewOnly) return preview;

    // --- Full editor (preview + controls) ---
    return (
      <div className="space-y-3">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Type className="h-3 w-3" /> Text Editor — Edit, Move & Resize
          </p>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={addLayer} className="h-6 px-2 text-[9px] gap-1">
              <Plus className="h-3 w-3" /> Add Text
            </Button>
            <Button size="sm" variant="ghost" onClick={resetText} className="h-6 px-2 text-[9px] gap-1">
              <RotateCcw className="h-3 w-3" /> Reset
            </Button>
            <Button size="sm" variant="ghost" onClick={downloadWithText} className="h-6 px-2 text-[9px] gap-1">
              <Download className="h-3 w-3" /> Save
            </Button>
          </div>
        </div>

        {preview}

        {/* Controls */}
        {activeLayer && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-secondary/20 rounded-lg p-3">
            {/* Left column: text + sizing */}
            <div className="space-y-2.5">
              {/* Layer selector */}
              {layers.length > 1 && (
                <div className="flex gap-1 flex-wrap">
                  {layers.map((l, i) => (
                    <button
                      key={l.id}
                      onClick={() => setActiveLayerId(l.id)}
                      className={`px-2 py-0.5 rounded text-[9px] border transition-colors ${
                        activeLayerId === l.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary/40 text-muted-foreground border-border/50"
                      }`}
                    >
                      {l.text.slice(0, 12) || `Layer ${i + 1}`}
                    </button>
                  ))}
                </div>
              )}


              <div className="flex items-center gap-3">
                <label className="text-[9px] font-semibold text-muted-foreground uppercase w-14 shrink-0">Size</label>
                <Slider
                  value={[activeLayer.fontSize]}
                  onValueChange={([v]) => updateLayer(activeLayer.id, { fontSize: v })}
                  min={12}
                  max={72}
                  step={1}
                  className="flex-1"
                />
                <span className="text-[10px] text-muted-foreground w-8 text-right">{activeLayer.fontSize}px</span>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-[9px] font-semibold text-muted-foreground uppercase w-14 shrink-0">Stroke</label>
                <Slider
                  value={[activeLayer.strokeWidth]}
                  onValueChange={([v]) => updateLayer(activeLayer.id, { strokeWidth: v })}
                  min={0}
                  max={8}
                  step={0.5}
                  className="flex-1"
                />
                <span className="text-[10px] text-muted-foreground w-8 text-right">{activeLayer.strokeWidth}px</span>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-[9px] font-semibold text-muted-foreground uppercase w-14 shrink-0">Weight</label>
                <div className="flex gap-1">
                  {FONT_WEIGHTS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => updateLayer(activeLayer.id, { fontWeight: value })}
                      className={`px-2 py-0.5 rounded border text-[9px] transition-colors ${
                        activeLayer.fontWeight === value
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary/40 text-muted-foreground border-border/50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right column: font + colors */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                <label className="text-[9px] font-semibold text-muted-foreground uppercase w-14 shrink-0">Font</label>
                <div className="flex gap-1 flex-wrap">
                  {FONT_FAMILIES.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => updateLayer(activeLayer.id, { fontFamily: value })}
                      className={`px-2 py-0.5 rounded border text-[9px] transition-colors ${
                        activeLayer.fontFamily === value
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary/40 text-muted-foreground border-border/50"
                      }`}
                      style={{ fontFamily: value }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-[9px] font-semibold text-muted-foreground uppercase w-14 shrink-0 flex items-center gap-1">
                  <Palette className="h-3 w-3" /> Fill
                </label>
                <div className="flex gap-1 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => updateLayer(activeLayer.id, { color: c })}
                      className={`w-5 h-5 rounded-full border-2 transition-transform ${
                        activeLayer.color === c ? "border-primary scale-125" : "border-border/50"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={activeLayer.color}
                    onChange={(e) => updateLayer(activeLayer.id, { color: e.target.value })}
                    className="w-5 h-5 rounded-full cursor-pointer border-0 p-0"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-[9px] font-semibold text-muted-foreground uppercase w-14 shrink-0">Outline</label>
                <div className="flex gap-1 flex-wrap">
                  {["#000000", "#FFFFFF", "#FF0000", "#FFFF00"].map((c) => (
                    <button
                      key={c}
                      onClick={() => updateLayer(activeLayer.id, { strokeColor: c })}
                      className={`w-5 h-5 rounded-full border-2 transition-transform ${
                        activeLayer.strokeColor === c ? "border-primary scale-125" : "border-border/50"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={activeLayer.strokeColor}
                    onChange={(e) => updateLayer(activeLayer.id, { strokeColor: e.target.value })}
                    className="w-5 h-5 rounded-full cursor-pointer border-0 p-0"
                  />
                </div>
              </div>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => removeLayer(activeLayer.id)}
                className="h-7 text-[10px] text-destructive hover:text-destructive gap-1 w-full"
              >
                <Trash2 className="h-3 w-3" /> Remove this text layer
              </Button>
            </div>
          </div>
        )}
      </div>
    );
};

export default ThumbnailTextEditor;
