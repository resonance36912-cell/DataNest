import { Button } from "@/components/ui/button";
import { Pencil, Eraser, RotateCw, RefreshCw, User, X, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import StarRating from "@/components/StarRating";

interface CharacterEditToolbarProps {
  editing: boolean;
  isGeneratingImage: boolean;
  uploading: boolean;
  generating: boolean;
  hasReferenceBase64: boolean;
  editPrompt: string;
  imageRating: number;
  swapInputRef: React.RefObject<HTMLInputElement>;
  onEditPromptChange: (v: string) => void;
  onImageRatingChange: (v: number) => void;
  onEnhanceFace: () => void;
  onCleanUp: () => void;
  onSwapRef: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
  onAiEdit: (instruction: string) => void;
  onDownload: () => void;
  onSwapFile: (file: File) => void;
}

export default function CharacterEditToolbar({
  editing, isGeneratingImage, uploading, generating, hasReferenceBase64,
  editPrompt, imageRating, swapInputRef,
  onEditPromptChange, onImageRatingChange,
  onEnhanceFace, onCleanUp, onSwapRef, onRegenerate, onCancel, onAiEdit, onDownload, onSwapFile,
}: CharacterEditToolbarProps) {
  return (
    <>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={onDownload}>
          <Download className="h-3.5 w-3.5" /> Download Image
        </Button>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onEnhanceFace} disabled={editing || !hasReferenceBase64} title="Improve facial similarity to reference (~10–20s)">
            <User className="h-3.5 w-3.5" /> Enhance Face
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onCleanUp} disabled={editing} title="Remove distracting background (~10–20s)">
            <Eraser className="h-3.5 w-3.5" /> Clean Up
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onSwapRef} disabled={editing}>
            <RotateCw className="h-3.5 w-3.5" /> Swap Ref
          </Button>
          {(isGeneratingImage || editing) ? (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs border-destructive/30 text-destructive hover:bg-destructive/10" onClick={onCancel}>
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onRegenerate} disabled={uploading || generating} title="Generate new portrait (~15–30s, ~£0.02)">
              <RefreshCw className="h-3.5 w-3.5" /> Regenerate
            </Button>
          )}
        </div>

        {/* Filter groups */}
        <FilterGroup label="Age & Appearance" disabled={editing} onAiEdit={onAiEdit} filters={[
          { emoji: "👶", label: "Look Younger", prompt: "Make the character look younger, around 18-22 years old. Smoother skin, more youthful features. Keep outfit, pose, and background identical." },
          { emoji: "🧓", label: "Look Older", prompt: "Make the character look older and more mature, around 45-55 years old. Add subtle aging, distinguished features. Keep outfit, pose, and background identical." },
          { emoji: "🧔", label: "Add Beard", prompt: "Add a well-groomed beard and mustache to the character. Keep everything else identical." },
          { emoji: "💪", label: "More Muscular", prompt: "Make the character more muscular and athletic looking. Keep face, outfit, and background identical." },
          { emoji: "🏃", label: "Slimmer", prompt: "Make the character slimmer and leaner. Keep face, outfit, and background identical." },
          { emoji: "🎨", label: "Add Tattoos", prompt: "Add stylish tattoo sleeves on both arms of the character. Keep face, pose, outfit, and background identical." },
        ]} />
        <FilterGroup label="Expressions" disabled={editing} onAiEdit={onAiEdit} filters={[
          { emoji: "😎", label: "Confident", prompt: "Change the character's expression to a confident, powerful look with a slight smirk. Keep everything else identical." },
          { emoji: "😄", label: "Joyful", prompt: "Change the character's expression to joyful and happy with a warm genuine smile. Keep everything else identical." },
          { emoji: "😤", label: "Intense", prompt: "Change the character's expression to intense and serious with a piercing gaze. Keep everything else identical." },
          { emoji: "🔮", label: "Mysterious", prompt: "Change the character's expression to mysterious and enigmatic with slightly narrowed eyes. Keep everything else identical." },
          { emoji: "😢", label: "Melancholic", prompt: "Change the character's expression to melancholic and sad with teary eyes. Keep everything else identical." },
        ]} />
        <FilterGroup label="Quick Clothing Edits" disabled={editing} onAiEdit={onAiEdit} filters={[
          { emoji: "🧥", label: "Leather Jacket", prompt: "Change the character's outfit to a sleek black leather jacket with a white t-shirt underneath. Keep face, pose, and background identical." },
          { emoji: "👔", label: "Formal Suit", prompt: "Change the character's outfit to an elegant formal suit with a tie. Keep face, pose, and background identical." },
          { emoji: "🧢", label: "Streetwear", prompt: "Change the character's outfit to trendy streetwear — oversized hoodie, chains, and sneakers. Keep face, pose, and background identical." },
          { emoji: "🌸", label: "Bohemian", prompt: "Change the character's outfit to a flowing bohemian style with layered fabrics and earthy tones. Keep face, pose, and background identical." },
          { emoji: "🤖", label: "Cyberpunk", prompt: "Change the character's outfit to futuristic cyberpunk attire with neon accents and tech-wear elements. Keep face, pose, and background identical." },
        ]} />
        <FilterGroup label="Lighting & Mood" disabled={editing} onAiEdit={onAiEdit} filters={[
          { emoji: "🎬", label: "Cinematic", prompt: "Apply dramatic cinematic lighting with strong side lighting and deep shadows. Keep the character and pose identical." },
          { emoji: "🌅", label: "Golden Hour", prompt: "Apply golden hour warm sunlight glow to the entire image. Keep the character identical." },
          { emoji: "🌃", label: "Neon Night", prompt: "Apply neon-lit night club atmosphere with colorful neon reflections on the character's face. Keep pose identical." },
          { emoji: "✨", label: "Dreamy", prompt: "Apply a dreamy, ethereal soft-focus glow with pastel tones. Keep the character identical." },
          { emoji: "🖤", label: "Dark Noir", prompt: "Apply a dark, moody noir atmosphere with high contrast black and white tones. Keep the character identical." },
        ]} />
        <FilterGroup label="Accessories" disabled={editing} onAiEdit={onAiEdit} filters={[
          { emoji: "🕶️", label: "Sunglasses", prompt: "Add stylish dark sunglasses to the character. Keep everything else identical." },
          { emoji: "📿", label: "Gold Chain", prompt: "Add a gold chain necklace to the character. Keep everything else identical." },
          { emoji: "🎩", label: "Hat", prompt: "Add a stylish hat or cap to the character. Keep everything else identical." },
          { emoji: "💎", label: "Earrings", prompt: "Add diamond earrings and ear piercings to the character. Keep everything else identical." },
          { emoji: "⌚", label: "Watch & Rings", prompt: "Add a stylish wristwatch and rings to the character's hands. Keep everything else identical." },
        ]} />

        <input ref={swapInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { if (e.target.files?.[0]) onSwapFile(e.target.files[0]); }} />

        <div className="flex gap-2">
          <Input placeholder="Describe edit (e.g. 'add sunglasses', 'change shirt to red')..." value={editPrompt} onChange={(e) => onEditPromptChange(e.target.value)}
            className="text-xs bg-secondary border-border" onKeyDown={(e) => { if (e.key === "Enter" && editPrompt.trim()) onAiEdit(editPrompt); }} />
          <Button size="sm" onClick={() => editPrompt.trim() && onAiEdit(editPrompt)} disabled={editing || !editPrompt.trim()} className="gap-1 shrink-0">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        </div>

        <StarRating label="Image quality:" value={imageRating} onChange={onImageRatingChange} />
      </div>
    </>
  );
}

// ─── Filter group sub-component ───
interface FilterDef { emoji: string; label: string; prompt: string; }
function FilterGroup({ label, disabled, filters, onAiEdit }: { label: string; disabled: boolean; filters: FilterDef[]; onAiEdit: (p: string) => void }) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {filters.map(f => (
          <Button key={f.label} variant="outline" size="sm" className="text-xs gap-1 h-7" onClick={() => onAiEdit(f.prompt)} disabled={disabled}>
            {f.emoji} {f.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
