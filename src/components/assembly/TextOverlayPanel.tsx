import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Type } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface SubtitleConfig {
  enabled: boolean;
  fontFamily: string;
  fontSize: number;
  position: "bottom" | "top" | "center";
  color: string;
  bgOpacity: number;
}

export interface TitleCard {
  id: string;
  text: string;
  sceneIndex: number;
  position: "before" | "after";
  durationSec: number;
}

interface TextOverlayPanelProps {
  subtitles: SubtitleConfig;
  onSubtitlesChange: (config: SubtitleConfig) => void;
  titleCards: TitleCard[];
  onTitleCardsChange: (cards: TitleCard[]) => void;
  sceneCount: number;
}

const FONT_OPTIONS = [
  "Inter", "Roboto", "Montserrat", "Playfair Display", "Bebas Neue", "Oswald", "Permanent Marker",
];

export default function TextOverlayPanel({ subtitles, onSubtitlesChange, titleCards, onTitleCardsChange, sceneCount }: TextOverlayPanelProps) {
  const addTitleCard = () => {
    const card: TitleCard = {
      id: crypto.randomUUID(),
      text: "",
      sceneIndex: 0,
      position: "before",
      durationSec: 3,
    };
    onTitleCardsChange([...titleCards, card]);
  };

  const updateCard = (id: string, partial: Partial<TitleCard>) => {
    onTitleCardsChange(titleCards.map((c) => (c.id === id ? { ...c, ...partial } : c)));
  };

  const removeCard = (id: string) => {
    onTitleCardsChange(titleCards.filter((c) => c.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* Subtitles */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Type className="h-4 w-4" /> Subtitles
          </h3>
          <Switch
            checked={subtitles.enabled}
            onCheckedChange={(v) => onSubtitlesChange({ ...subtitles, enabled: v })}
          />
        </div>

        {subtitles.enabled && (
          <div className="space-y-3 pl-1">
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground w-16">Font</label>
              <Select value={subtitles.fontFamily} onValueChange={(v) => onSubtitlesChange({ ...subtitles, fontFamily: v })}>
                <SelectTrigger className="h-7 text-xs flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((f) => (
                    <SelectItem key={f} value={f} className="text-xs" style={{ fontFamily: f }}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground w-16">Size</label>
              <Slider
                value={[subtitles.fontSize]}
                min={12}
                max={48}
                step={2}
                onValueChange={([v]) => onSubtitlesChange({ ...subtitles, fontSize: v })}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-8">{subtitles.fontSize}px</span>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground w-16">Position</label>
              <div className="flex gap-1.5">
                {(["top", "center", "bottom"] as const).map((pos) => (
                  <button
                    key={pos}
                    onClick={() => onSubtitlesChange({ ...subtitles, position: pos })}
                    className={`px-2.5 py-1 rounded-md text-xs capitalize transition-all ${
                      subtitles.position === pos
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground w-16">BG</label>
              <Slider
                value={[subtitles.bgOpacity]}
                min={0}
                max={100}
                step={5}
                onValueChange={([v]) => onSubtitlesChange({ ...subtitles, bgOpacity: v })}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-8">{subtitles.bgOpacity}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Title Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Title Cards</h3>
          <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={addTitleCard}>
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>

        {titleCards.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No title cards added. Add intro titles, lower thirds, or credits.</p>
        ) : (
          <div className="space-y-2">
            {titleCards.map((card) => (
              <div key={card.id} className="flex gap-2 items-start p-2 rounded-lg border border-border/30 bg-card">
                <div className="flex-1 space-y-1.5">
                  <Input
                    value={card.text}
                    onChange={(e) => updateCard(card.id, { text: e.target.value })}
                    placeholder="Title text…"
                    className="h-7 text-xs"
                  />
                  <div className="flex gap-2 items-center">
                    <Select value={String(card.sceneIndex)} onValueChange={(v) => updateCard(card.id, { sceneIndex: Number(v) })}>
                      <SelectTrigger className="h-6 w-24 text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: sceneCount }).map((_, idx) => (
                          <SelectItem key={idx} value={String(idx)} className="text-[10px]">Scene {idx + 1}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={card.position} onValueChange={(v) => updateCard(card.id, { position: v as "before" | "after" })}>
                      <SelectTrigger className="h-6 w-16 text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="before" className="text-[10px]">Before</SelectItem>
                        <SelectItem value="after" className="text-[10px]">After</SelectItem>
                      </SelectContent>
                    </Select>
                    <Badge className="text-[9px] bg-secondary text-muted-foreground border-border/30">{card.durationSec}s</Badge>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/60 hover:text-destructive" onClick={() => removeCard(card.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
