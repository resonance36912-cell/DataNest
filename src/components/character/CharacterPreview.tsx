import { Loader2, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ProcessProgressBar from "@/components/ProcessProgressBar";
import CharacterEditToolbar from "./CharacterEditToolbar";
import type { CharacterConcept } from "@/contexts/ProjectContext";

interface CharacterPreviewProps {
  character: CharacterConcept | null;
  generating: boolean;
  editing: boolean;
  isGeneratingImage: boolean;
  uploading: boolean;
  hasReferenceBase64: boolean;
  editPrompt: string;
  imageRating: number;
  swapInputRef: React.RefObject<HTMLInputElement>;
  onEditPromptChange: (v: string) => void;
  onImageRatingChange: (v: number) => void;
  onEnhanceFace: () => void;
  onAiEdit: (instruction: string) => void;
  onCancel: () => void;
  onRegenerate: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onSwapRef: () => void;
  onSwapFile: (file: File) => void;
}

export default function CharacterPreview({
  character, generating, editing, isGeneratingImage, uploading,
  hasReferenceBase64, editPrompt, imageRating, swapInputRef,
  onEditPromptChange, onImageRatingChange,
  onEnhanceFace, onAiEdit, onCancel, onRegenerate, onDownload, onDelete, onSwapRef, onSwapFile,
}: CharacterPreviewProps) {
  if (!character && !generating) return null;

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">{character?.recalledFromGallery ? "Recalled Character" : "Your Character"}</h3>
          {character?.recalledFromGallery && (
            <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/20">
              <Download className="h-3 w-3 mr-1" /> From Gallery
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={onDelete} disabled={generating || editing || isGeneratingImage || uploading}>
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </Button>
      </div>

      {generating && !character ? (
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <ProcessProgressBar progress={0} active={generating} label="Generating character from your song..." className="max-w-sm" />
        </div>
      ) : character ? (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <div className="aspect-[3/4] rounded-xl bg-secondary/80 overflow-hidden relative">
              {character.imageUrl ? (
                <img src={character.imageUrl} alt={character.name} className="w-full h-full object-cover" />
              ) : (
                <Skeleton className="w-full h-full flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </Skeleton>
              )}
              {(editing || isGeneratingImage) && (
                <div className="absolute inset-0 bg-background/60 flex flex-col items-center justify-center p-4">
                  <ProcessProgressBar progress={0} active={editing || isGeneratingImage}
                    label={editing ? "AI editing character image…" : "Regenerating character image…"}
                    className="max-w-[80%]" barHeight="h-1.5" />
                </div>
              )}
            </div>

            {character.imageUrl && (
              <CharacterEditToolbar
                editing={editing} isGeneratingImage={isGeneratingImage} uploading={uploading} generating={generating}
                hasReferenceBase64={hasReferenceBase64} editPrompt={editPrompt} imageRating={imageRating}
                swapInputRef={swapInputRef}
                onEditPromptChange={onEditPromptChange} onImageRatingChange={onImageRatingChange}
                onEnhanceFace={onEnhanceFace} onCleanUp={() => onAiEdit("Remove any distracting background objects. Keep the character exactly the same, clean up the background.")}
                onSwapRef={onSwapRef} onRegenerate={onRegenerate} onCancel={onCancel}
                onAiEdit={onAiEdit} onDownload={onDownload} onSwapFile={onSwapFile}
              />
            )}
          </div>

          <div className="space-y-3">
            <h4 className="text-lg font-bold">{character.name}</h4>
            <p className="text-xs text-primary/80 font-medium">{character.vibe}</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{character.description}</p>
            <div className="space-y-1.5">
              <p className="text-xs"><span className="font-medium text-foreground">Outfit:</span> <span className="text-muted-foreground">{character.outfit}</span></p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
