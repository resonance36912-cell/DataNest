import { Loader2, Sparkles, Wand2, X, Eraser, PenTool, Undo2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AiPenPanelProps {
  sceneIndex: number;
  aiPenPrompt: string;
  aiPenLoading: boolean;
  onClose: () => void;
  onSetAiPenPrompt: (val: string) => void;
  onAiEditImage: (idx: number, prompt: string) => void;
  previousImageUrl?: string | null;
  onUndo?: (idx: number) => void;
  onSaveEdit?: (idx: number) => void;
}

const CHAR_PRESERVE = "CRITICAL: Keep the character's EXACT face, identity, skin tone, hair, body type, and clothing/attire completely unchanged. Do NOT alter what the character is wearing. Only modify";

const EXPRESSION_PRESETS = [
  { emoji: "😏", label: "Confident", prompt: `${CHAR_PRESERVE} the facial expression to a confident, powerful smile with intense eye contact.` },
  { emoji: "😢", label: "Emotional", prompt: `${CHAR_PRESERVE} the facial expression to show deep emotion — eyes glistening, slightly parted lips, vulnerable look.` },
  { emoji: "😠", label: "Fierce", prompt: `${CHAR_PRESERVE} the facial expression to fierce and intense — furrowed brows, determined gaze, strong jaw.` },
  { emoji: "😄", label: "Joyful", prompt: `${CHAR_PRESERVE} the facial expression to joyful and euphoric — wide genuine smile, bright eyes, radiating happiness.` },
  { emoji: "🤫", label: "Mysterious", prompt: `${CHAR_PRESERVE} the facial expression to mysterious and alluring — subtle smirk, half-lidded eyes, enigmatic look.` },
];

const POSE_PRESETS = [
  { emoji: "💃", label: "Dancing", prompt: `${CHAR_PRESERVE} the pose to be dancing dynamically — arms in motion, body mid-movement, energetic. Keep face, outfit, and background the same.` },
  { emoji: "🚶", label: "Walking", prompt: `${CHAR_PRESERVE} the pose to walking toward the camera with a confident stride — one foot forward, slight lean, cinematic. Keep face, outfit, and background the same.` },
  { emoji: "😎", label: "Leaning", prompt: `${CHAR_PRESERVE} the pose to leaning against a wall or surface with arms crossed, looking cool and relaxed. Keep face, outfit, and background the same.` },
  { emoji: "🎤", label: "Performing", prompt: `${CHAR_PRESERVE} the pose to performing / singing — hands near the face or reaching out dramatically, performance energy. Keep face, outfit, and background the same.` },
  { emoji: "🧘", label: "Seated", prompt: `${CHAR_PRESERVE} the pose to sitting or crouching — contemplative, low angle, grounded feel. Keep face, outfit, and background the same.` },
];

const MOOD_PRESETS = [
  { emoji: "🌧️", label: "Melancholic", prompt: `Transform the mood to melancholic and somber — cooler blue/grey tones, soft shadows, rain or mist in the air, subdued lighting. ${CHAR_PRESERVE} nothing about the character — same face, hair, clothing, and pose.` },
  { emoji: "✨", label: "Euphoric", prompt: `Transform the mood to euphoric and triumphant — warm golden light, lens flare, vibrant saturated colors, the character bathed in radiant glow. ${CHAR_PRESERVE} nothing about the character — same face, hair, clothing, and pose.` },
  { emoji: "🌑", label: "Dark", prompt: `Transform the mood to dark and moody — deep shadows, noir-style contrast, desaturated colors with selective highlights, mysterious atmosphere. ${CHAR_PRESERVE} nothing about the character — same face, hair, clothing, and pose.` },
  { emoji: "💫", label: "Dreamy", prompt: `Transform the mood to dreamy and ethereal — soft focus, pastel colors, gentle bokeh, floating particles of light, heavenly glow. ${CHAR_PRESERVE} nothing about the character — same face, hair, clothing, and pose.` },
  { emoji: "🔥", label: "Intense", prompt: `Transform the mood to intense and aggressive — high contrast, red/orange tones, dramatic harsh lighting, gritty texture, raw energy. ${CHAR_PRESERVE} nothing about the character — same face, hair, clothing, and pose.` },
  { emoji: "🌅", label: "Serene", prompt: `Transform the mood to serene and peaceful — warm golden hour lighting, soft natural light, gentle colors, calm tranquil atmosphere. ${CHAR_PRESERVE} nothing about the character — same face, hair, clothing, and pose.` },
];

export default function AiPenPanel({ sceneIndex: i, aiPenPrompt, aiPenLoading, onClose, onSetAiPenPrompt, onAiEditImage, previousImageUrl, onUndo, onSaveEdit }: AiPenPanelProps) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium flex items-center gap-1.5"><PenTool className="h-3 w-3 text-primary" /> AI Pen</span>
        <div className="flex items-center gap-1">
          {previousImageUrl && onUndo && (
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs gap-1 text-muted-foreground hover:text-foreground" onClick={() => onUndo(i)} disabled={aiPenLoading} title="Undo last AI edit">
              <Undo2 className="h-3 w-3" /> Undo
            </Button>
          )}
          {onSaveEdit && (
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs gap-1 text-primary hover:text-primary/80" onClick={() => onSaveEdit(i)} disabled={aiPenLoading} title="Save current edit to database">
              <Save className="h-3 w-3" /> Save
            </Button>
          )}
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        <Button variant="outline" size="sm" className="text-xs gap-1 h-7" onClick={() => onAiEditImage(i, `${CHAR_PRESERVE} the facial expression — make it more emotional and expressive. Make the character's face clearer and more detailed.`)} disabled={aiPenLoading}><Wand2 className="h-3 w-3" /> Enhance Face</Button>
        <Button variant="outline" size="sm" className="text-xs gap-1 h-7" onClick={() => onAiEditImage(i, `Remove any distracting objects or clutter from the background. ${CHAR_PRESERVE} nothing — keep the character's face, clothing, and pose completely unchanged.`)} disabled={aiPenLoading}><Eraser className="h-3 w-3" /> Clean Up</Button>
        <Button variant="outline" size="sm" className="text-xs gap-1 h-7" onClick={() => onAiEditImage(i, `Make the lighting more dramatic and cinematic with better contrast and atmosphere. ${CHAR_PRESERVE} nothing — keep the character's face, clothing, and pose completely unchanged.`)} disabled={aiPenLoading}><Sparkles className="h-3 w-3" /> Better Lighting</Button>
      </div>
      <PresetSection label="Facial Expression" presets={EXPRESSION_PRESETS} sceneIndex={i} onAiEditImage={onAiEditImage} disabled={aiPenLoading} />
      <PresetSection label="Movement & Pose" presets={POSE_PRESETS} sceneIndex={i} onAiEditImage={onAiEditImage} disabled={aiPenLoading} />
      <PresetSection label="Mood & Atmosphere" presets={MOOD_PRESETS} sceneIndex={i} onAiEditImage={onAiEditImage} disabled={aiPenLoading} />
      <div className="flex gap-2">
        <Input
          placeholder="Describe changes… e.g. 'add sunglasses', 'change background to sunset'"
          value={aiPenPrompt}
          onChange={(e) => onSetAiPenPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && aiPenPrompt.trim() && onAiEditImage(i, aiPenPrompt.trim())}
          className="text-xs h-8"
          disabled={aiPenLoading}
        />
        <Button
          size="sm" className="h-8 gap-1"
          onClick={() => aiPenPrompt.trim() && onAiEditImage(i, aiPenPrompt.trim())}
          disabled={!aiPenPrompt.trim() || aiPenLoading}
        >
          {aiPenLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
          Apply
        </Button>
      </div>
    </div>
  );
}

function PresetSection({ label, presets, sceneIndex, onAiEditImage, disabled }: {
  label: string;
  presets: { emoji: string; label: string; prompt: string }[];
  sceneIndex: number;
  onAiEditImage: (idx: number, prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="flex gap-1.5 flex-wrap">
        {presets.map(p => (
          <Button key={p.label} variant="outline" size="sm" className="text-xs gap-1 h-7" onClick={() => onAiEditImage(sceneIndex, p.prompt)} disabled={disabled}>
            {p.emoji} {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
