import { Music, Theater, Smile, Clapperboard, ChevronDown, Activity, Clock } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Scene } from "@/contexts/ProjectContext";

const GENRES = [
  "Hip-Hop", "R&B", "Pop", "Rock", "Afrobeats", "Dancehall",
  "Country", "Latin", "Jazz", "Electronic", "Gospel", "Indie",
] as const;

type Genre = (typeof GENRES)[number];

/** B-roll suggestions keyed by genre */
const BROLL_SUGGESTIONS: Record<Genre, string[]> = {
  "Hip-Hop": ["Sports car drifting on empty road", "Jewelry and chains close-up with dramatic lighting", "City skyline at night with neon reflections", "Cash raining in slow motion"],
  "R&B": ["Candle-lit room with silk curtains", "Rainy window reflections at night", "Couple silhouette against sunset", "Rose petals floating in water"],
  "Pop": ["Confetti explosion in slow motion", "Colorful neon cityscape", "Dancing crowd at festival", "Balloon release against blue sky"],
  "Rock": ["Electric guitar sparking on stage", "Motorcycle on desert highway", "Crowd surfing at concert", "Flames erupting behind drum kit"],
  "Afrobeats": ["Vibrant street festival with dancers", "Traditional fabric patterns in motion", "Sunset over coastal African city", "Energetic marketplace with color"],
  "Dancehall": ["Beach party at golden hour", "Dancehall moves in slow motion", "Caribbean street with vibrant murals", "Sound system speakers pulsing"],
  "Country": ["Open road through golden wheat fields", "Vintage pickup truck at sunset", "Campfire under starry sky", "Horseback riding through canyon"],
  "Latin": ["Salsa dancers in dramatic lighting", "Havana street with classic cars", "Festival with papel picado banners", "Ocean waves hitting tropical shore"],
  "Jazz": ["Smoky jazz club with spotlights", "Saxophone close-up with warm lighting", "Rain on cobblestone streets at night", "Vinyl record spinning close-up"],
  "Electronic": ["Laser show through fog", "Futuristic cityscape with holograms", "Abstract particle waves", "DJ booth with pulsing LEDs"],
  "Gospel": ["Sunlight streaming through cathedral windows", "Choir robes in golden light", "Doves taking flight", "Morning mist over still water"],
  "Indie": ["Film camera with light leaks", "Wildflower field in golden hour", "Vintage café interior", "Polaroid photos scattered on table"],
};

interface ScenePromptEditorProps {
  scene: Scene;
  sceneIndex: number;
  onUpdateScene: (idx: number, updates: Partial<Scene>) => void;
}

function GenreToggle({ value, onChange }: { value: Genre | null; onChange: (g: Genre) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-6 gap-1 text-[10px] px-2 border-primary/30 text-primary hover:bg-primary/10">
          {value || "Genre"} <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-48 overflow-y-auto">
        {GENRES.map((g) => (
          <DropdownMenuItem key={g} onClick={() => onChange(g)} className="text-xs">
            {g} {value === g && "✓"}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function ScenePromptEditor({ scene, sceneIndex: i, onUpdateScene }: ScenePromptEditorProps) {
  const isInstrumental = !scene.lyric_segment || scene.lyric_segment.trim().split(/\s+/).filter(w => w.length > 0).length < 3;
  const isBrollSection = isInstrumental || ["intro", "outro", "interlude", "instrumental"].includes(scene.section_type || "");

  const genre = ((scene as any).genre as Genre) || null;
  const demeanour = (scene as any).demeanour as string || "";
  const brollPrompt = (scene as any).broll_prompt as string || "";
  const isBroll = scene.is_broll === true;

  const setGenre = (g: Genre) => onUpdateScene(i, { genre: g } as any);

  return (
    <div className="space-y-3 text-sm">
      {/* A/B-Roll Toggle */}
      <div className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30 border border-border/40">
        <Label htmlFor={`broll-toggle-${i}`} className="text-xs font-medium text-muted-foreground cursor-pointer select-none">
          {isBroll ? "🎬 B-Roll" : "🎤 A-Roll"}
        </Label>
        <Switch
          id={`broll-toggle-${i}`}
          checked={isBroll}
          onCheckedChange={(checked) => onUpdateScene(i, { is_broll: !!checked })}
        />
        <span className="text-[10px] text-muted-foreground/70">
          {isBroll ? "Cinematic cutaway — no singing/rapping" : "Lead vocal performance"}
        </span>
      </div>

      {/* 1. Lyrics with Genre toggle */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Music className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-muted-foreground">Lyrics</span>
          <GenreToggle value={genre} onChange={setGenre} />
          {(isInstrumental || isBroll) && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-accent/40 text-accent-foreground bg-accent/10">
              {isBroll ? "🎬 B-Roll" : "🎵 Instrumental"}
            </Badge>
          )}
        </div>
        <Textarea
          value={scene.lyric_segment || ""}
          onChange={(e) => onUpdateScene(i, { lyric_segment: e.target.value })}
          className="text-xs min-h-[50px] bg-secondary/30 border-border/50"
          placeholder="Lyrics for this segment…"
        />
      </div>

      {/* 2. Character Performance with Genre toggle */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Theater className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-muted-foreground">Character Performance</span>
          <GenreToggle value={genre} onChange={setGenre} />
        </div>
        <Textarea
          value={scene.action_description}
          onChange={(e) => onUpdateScene(i, { action_description: e.target.value })}
          className="text-xs min-h-[70px] bg-secondary/30 border-border/50"
          placeholder={`Character ${genre === "Hip-Hop" ? "raps" : "sings"}: "${scene.lyric_segment?.slice(0, 40) || '...'}". ${genre ? `${genre}-style` : "Passionate"} delivery with direct eye contact.`}
        />
      </div>

      {/* 3. Character Demeanour: Mood, Emotions, & Gestures */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Smile className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-muted-foreground">Character Demeanour</span>
          <span className="text-[10px] text-muted-foreground/60">Mood · Emotions · Gestures</span>
        </div>
        <Textarea
          value={demeanour}
          onChange={(e) => onUpdateScene(i, { demeanour: e.target.value } as any)}
          className="text-xs min-h-[50px] bg-secondary/30 border-border/50"
          placeholder={`e.g. Confident smirk, arms crossed then opens up. ${scene.mood ? `Current mood: ${scene.mood}` : "Intense, brooding energy."}`}
        />
        {scene.mood && !demeanour && (
          <button
            className="text-[10px] text-primary hover:text-primary/80 transition-colors"
            onClick={() => onUpdateScene(i, { demeanour: `Mood: ${scene.mood}. ` } as any)}
          >
            Pre-fill from scene mood →
          </button>
        )}
      </div>

      {/* 3b. AI Shot Direction — emotion, pacing, per-line beats tied to word timings */}
      {(scene.emotion || scene.pacing || (scene.shot_notes && scene.shot_notes.length > 0)) && (
        <div className="space-y-2 border border-primary/20 rounded-lg p-3 bg-primary/5">
          <div className="flex items-center gap-2 flex-wrap">
            <Activity className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-primary">AI Shot Direction</span>
            {scene.emotion && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary bg-primary/10">
                emotion: {scene.emotion}
              </Badge>
            )}
            {scene.pacing && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-accent/40 text-accent-foreground bg-accent/10">
                pacing: {scene.pacing.replace(/_/g, " ")}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={scene.emotion || ""}
              onChange={(e) => onUpdateScene(i, { emotion: e.target.value } as any)}
              placeholder="dominant emotion"
              className="text-[11px] px-2 py-1 rounded border border-border/50 bg-background/50"
            />
            <input
              type="text"
              value={scene.pacing || ""}
              onChange={(e) => onUpdateScene(i, { pacing: e.target.value } as any)}
              placeholder="pacing (e.g. building)"
              className="text-[11px] px-2 py-1 rounded border border-border/50 bg-background/50"
            />
          </div>
          {Array.isArray(scene.shot_notes) && scene.shot_notes.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/80">
                <Clock className="h-3 w-3" />
                <span>Per-line shot notes ({scene.shot_notes.length})</span>
              </div>
              <ul className="space-y-1">
                {scene.shot_notes.map((sn, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-[11px] leading-snug px-2 py-1 rounded bg-background/50 border border-border/40"
                  >
                    <span className="font-mono text-[10px] text-primary/80 shrink-0 tabular-nums">
                      {sn.at_sec.toFixed(2)}s{typeof sn.until_sec === "number" ? `–${sn.until_sec.toFixed(2)}s` : ""}
                    </span>
                    <div className="flex-1 min-w-0">
                      {sn.lyric && (
                        <span className="italic text-foreground/90">"{sn.lyric}" — </span>
                      )}
                      <span className="text-foreground/80">{sn.shot}</span>
                      {sn.emotion && (
                        <span className="ml-1 text-muted-foreground/70">· {sn.emotion}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 4. B-roll (shown for intros, outros, instrumental sections, or when B-roll toggled) */}
      {(isBrollSection || isBroll) && (
        <div className="space-y-1.5 border border-accent/20 rounded-lg p-3 bg-accent/5">
          <div className="flex items-center gap-2">
            <Clapperboard className="h-3.5 w-3.5 text-accent-foreground" />
            <span className="text-xs font-medium text-accent-foreground">B-Roll</span>
            <GenreToggle value={genre} onChange={setGenre} />
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-auto border-accent/30 text-accent-foreground/70">
              {scene.section_type || "instrumental"}
            </Badge>
          </div>
          <Textarea
            value={brollPrompt}
            onChange={(e) => onUpdateScene(i, { broll_prompt: e.target.value } as any)}
            className="text-xs min-h-[60px] bg-background/50 border-border/50"
            placeholder={genre ? `e.g. ${BROLL_SUGGESTIONS[genre]?.[0] || "Cinematic cutaway shot…"}` : "Describe a cinematic B-roll cutaway…"}
          />
          {genre && BROLL_SUGGESTIONS[genre] && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {BROLL_SUGGESTIONS[genre].map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => onUpdateScene(i, { broll_prompt: suggestion } as any)}
                  className="text-[10px] px-2 py-0.5 rounded-full border border-accent/30 text-accent-foreground/80 hover:bg-accent/20 hover:border-accent/50 transition-all"
                >
                  {suggestion.length > 35 ? suggestion.slice(0, 35) + "…" : suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
