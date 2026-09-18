import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Wand2, X, User } from "lucide-react";
import { LockedButton } from "@/components/brand/LockedButton";
import type { FeatureGateState } from "@/lib/featureGates";

const formFields = [
  { key: "gender", label: "Gender", options: ["Male", "Female", "Non-binary", "Androgynous", "Other"] },
  { key: "age_range", label: "Age Range", options: ["Child (5-12)", "Teen (13-17)", "Young Adult (18-25)", "Adult (25-35)", "Middle-aged (35-50)", "Mature (50+)"] },
  { key: "ethnicity", label: "Ethnicity / Skin Tone", options: ["Light", "Fair", "Medium", "Olive", "Tan", "Brown", "Dark Brown", "Deep", "Any / AI Decides"] },
  { key: "hairstyle", label: "Hairstyle", options: ["Short Cropped", "Buzz Cut", "Afro", "Braids", "Locs / Dreadlocks", "Curly", "Wavy", "Straight Long", "Ponytail", "Bun", "Mohawk", "Bald", "Pixie Cut", "Bob", "Cornrows"] },
  { key: "facial_features", label: "Facial Features", options: ["Sharp / Angular", "Soft / Round", "Strong Jawline", "High Cheekbones", "Full Lips", "Freckles", "Beard / Stubble", "Clean Shaven", "Glasses", "Scar", "Piercings", "Tattoos"] },
  { key: "outfit", label: "Outfit / Style", options: ["Streetwear", "Formal / Suit", "Casual", "Athleisure", "Vintage / Retro", "Gothic", "Bohemian", "Futuristic / Cyberpunk", "Military / Tactical", "Elegant / Haute Couture", "Minimalist", "Cultural / Traditional"] },
  { key: "accessories", label: "Accessories", options: ["None", "Sunglasses", "Chains / Necklaces", "Rings", "Watch", "Hat / Cap", "Headband", "Earrings", "Scarf", "Backpack", "Crown / Headpiece", "Gloves"] },
  { key: "vibe", label: "Overall Vibe", options: ["Confident", "Mysterious", "Energetic", "Dreamy", "Rebel", "Elegant", "Fierce", "Gentle", "Dark", "Playful", "Spiritual", "Regal"] },
];

interface CharacterFormProps {
  formData: Record<string, string>;
  generating: boolean;
  uploading: boolean;
  onFieldChange: (key: string, value: string) => void;
  onGenerate: () => void;
  onCancel: () => void;
  gate?: FeatureGateState;
}


export default function CharacterForm({ formData, generating, uploading, onFieldChange, onGenerate, onCancel, gate }: CharacterFormProps) {
  const locked = gate ? !gate.allowed && !gate.loading : false;
  return (
    <div className="glass-card p-6">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <User className="h-4 w-4 text-primary" /> Customize Character Details
      </h3>
      <p className="text-xs text-muted-foreground mb-4">Optionally set preferences before generating, or leave blank to let AI decide.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {formFields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{field.label}</Label>
            <Select value={formData[field.key] || ""} onValueChange={(v) => onFieldChange(field.key, v)}>
              <SelectTrigger className="bg-secondary border-border text-foreground">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {field.options.map((o) => <SelectItem key={o} value={o.toLowerCase()}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-1.5">
        <Label className="text-xs text-muted-foreground">Extra Details</Label>
        <Textarea
          placeholder="Any additional details (tattoo placements, clothing brands, poses, etc.)..."
          value={formData.extra_details || ""}
          onChange={(e) => onFieldChange("extra_details", e.target.value)}
          className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
        />
      </div>
      <div className="mt-4 flex gap-2">
        {generating ? (
          <Button onClick={onCancel} className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90">
            <X className="h-4 w-4" /> Cancel
          </Button>
        ) : locked && gate ? (
          <LockedButton gate={gate} feature="ai_character_gen" className="sm:w-auto">Unlock Character Generation</LockedButton>
        ) : (
          <Button onClick={onGenerate} disabled={uploading} className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
            title="Creates a character portrait based on the details (~15–30s, ~£0.02)">
            <Wand2 className="h-4 w-4" /> Generate from Details
          </Button>
        )}
      </div>
    </div>
  );
}
