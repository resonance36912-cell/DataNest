import { useState } from "react";
import { ArrowLeft, ArrowRight, Sparkles, ImageIcon, Upload, X, Check, Loader2, RefreshCw, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProject } from "@/contexts/ProjectContext";
import SaveProgressButton from "@/components/SaveProgressButton";
import RecallGalleryDialog from "@/components/assembly/RecallGalleryDialog";
import { LockedButton } from "@/components/brand/LockedButton";
import { useFeatureGate } from "@/lib/featureGates";

import { useCharacterGeneration } from "@/hooks/useCharacterGeneration";
import CharacterForm from "@/components/character/CharacterForm";
import CharacterPreview from "@/components/character/CharacterPreview";
import CharacterReferenceCarousel from "@/components/character/CharacterReferenceCarousel";


interface StepProps {
  onNext: () => void;
  onPrev: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export default function CharacterStep({ onNext, onPrev }: StepProps) {
  const { characterStyle, setCharacterStyle, verification } = useProject();
  const [formData, setFormData] = useState<Record<string, string>>({});
  const gen = useCharacterGeneration();
  const charGate = useFeatureGate("ai_character_gen");
  const charLocked = !charGate.allowed && !charGate.loading;

  const updateField = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold mb-1">Character Builder</h2>
            <p className="text-muted-foreground text-sm">Design your main character or let AI create one from your song.</p>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-secondary p-1">
            <button onClick={() => setCharacterStyle("animated")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${characterStyle === "animated" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              Animated
            </button>
            <button onClick={() => setCharacterStyle("realistic")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${characterStyle === "realistic" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              Realistic
            </button>
          </div>
        </div>
      </div>

      {/* Quick generate + Reference Image */}
      <div className="grid gap-4 sm:grid-cols-2">
        {verification && (
          <div className="glass-card p-6 border-primary/20">
            <div className="flex flex-col gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">Auto-Generate from Song</h3>
              <p className="text-xs text-muted-foreground">AI creates one character from your song's mood, lyrics, and energy.</p>
              {gen.generating ? (
                <Button onClick={gen.handleCancelGeneration} className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 mt-auto">
                  <X className="h-4 w-4" /> Cancel
                </Button>
              ) : charLocked ? (
                <div className="mt-auto">
                  <LockedButton gate={charGate} feature="ai_character_gen">Unlock Character Generation</LockedButton>
                </div>
              ) : (
                <Button onClick={() => gen.generateSingleCharacter(true)} disabled={gen.uploading} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 mt-auto"
                  title="Uses AI to analyse your song (~15–30s, ~£0.02)">
                  <Sparkles className="h-4 w-4" /> Generate Character
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="glass-card p-6">
          <div className="flex flex-col gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ImageIcon className="h-5 w-5" />
            </div>
            <h3 className="font-semibold">Reference Image</h3>
            <p className="text-xs text-muted-foreground">Upload a photo to guide the character's face and look.</p>

            {gen.referencePreview ? (
              <div className="flex items-start gap-3 mt-1">
                <div className="relative">
                  <img src={gen.referencePreview} alt="Reference" className="w-20 h-20 object-cover rounded-lg border border-border" />
                  <button onClick={gen.removeReference} className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/80">
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium truncate">{gen.referenceMeta?.name}</p>
                  {gen.referenceMeta?.size ? (
                    <p className="text-xs text-muted-foreground">{(gen.referenceMeta.size / (1024 * 1024)).toFixed(1)} MB</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Recalled from gallery</p>
                  )}
                  {gen.uploading ? (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading automatically...
                    </div>
                  ) : gen.referenceBase64 ? (
                    <p className="text-xs text-primary mt-1">✓ Saved automatically</p>
                  ) : gen.referencePreview?.startsWith("http") ? (
                    <p className="text-xs text-primary mt-1">✓ Loaded from storage</p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">Uploads automatically after selection</p>
                  )}
                </div>
              </div>
            ) : (
              <div onClick={() => gen.fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) gen.handleImageSelect(e.dataTransfer.files[0]); }}
                className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-4 hover:border-primary/30 cursor-pointer transition-colors mt-auto">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Drop or click to browse</p>
              </div>
            )}
            <input ref={gen.fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && gen.handleImageSelect(e.target.files[0])} />
          </div>
        </div>
      </div>

      {/* Use-as-is choice */}
      {gen.showUseAsIsChoice && gen.referencePreview && (
        <div className="glass-card p-6 border-primary/30">
          <div className="flex items-start gap-4">
            <img src={gen.referencePreview} alt="Reference" className="w-16 h-16 object-cover rounded-lg border border-border shrink-0" />
            <div className="flex-1 space-y-3">
              <h3 className="font-semibold text-sm">How would you like to use this image?</h3>
              <p className="text-xs text-muted-foreground">You can use it directly as your character portrait, or let AI generate a new character inspired by the reference.</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={gen.handleUseAsIs} disabled={gen.uploading} className="gap-1.5">
                  <Check className="h-3.5 w-3.5" /> Use As Is
                </Button>
                <Button size="sm" variant="outline" onClick={gen.handleGenerateFromReference} disabled={gen.uploading || gen.generating} className="gap-1.5">
                  <Wand2 className="h-3.5 w-3.5" /> Generate AI Character
                </Button>
                <Button size="sm" variant="ghost" onClick={() => {}} className="text-xs text-muted-foreground">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      <CharacterForm
        formData={formData}
        generating={gen.generating}
        uploading={gen.uploading}
        onFieldChange={updateField}
        onGenerate={() => gen.generateFromDetails(formData)}
        onCancel={gen.handleCancelGeneration}
        gate={charGate}
      />

      {/* Concept carousel */}
      <CharacterReferenceCarousel />

      {/* Preview */}
      <CharacterPreview

        character={gen.character}
        generating={gen.generating}
        editing={gen.editing}
        isGeneratingImage={gen.isGeneratingImage}
        uploading={gen.uploading}
        hasReferenceBase64={!!gen.referenceBase64}
        editPrompt={gen.editPrompt}
        imageRating={gen.imageRating}
        swapInputRef={gen.swapInputRef}
        onEditPromptChange={gen.setEditPrompt}
        onImageRatingChange={gen.setImageRating}
        onEnhanceFace={gen.enhanceFaceResemblance}
        onAiEdit={gen.aiEditImage}
        onCancel={gen.handleCancelGeneration}
        onRegenerate={gen.regenerateSelectedCharacter}
        onDownload={gen.downloadCharacterImage}
        onDelete={gen.deleteCharacter}
        onSwapRef={() => gen.swapInputRef.current?.click()}
        onSwapFile={gen.handleSwapReference}
      />

      {/* Footer */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onPrev} className="gap-2 border-border text-foreground hover:bg-secondary">
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back</span>
          </Button>
          <SaveProgressButton stepIndex={2} />
          <RecallGalleryDialog filterType="character" onSelect={gen.handleImportCharacter} />
        </div>
        <div className="flex gap-2 sm:gap-3 flex-wrap justify-end">
          {!gen.confirmed && gen.character && !gen.generating && (
            <>
              {!gen.character.imageUrl && (
                <Button variant="outline" size="sm" onClick={gen.regenerateSelectedCharacter} disabled={gen.isGeneratingImage || gen.uploading || gen.generating} className="gap-2 border-border">
                  {gen.isGeneratingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} <span className="hidden sm:inline">{gen.isGeneratingImage ? "Retrying..." : "Retry Image"}</span>
                </Button>
              )}
              <Button size="sm" onClick={gen.handleConfirm} className="gap-2 bg-success text-success-foreground hover:bg-success/90">
                <Check className="h-4 w-4" /> <span className="hidden sm:inline">Confirm</span>
              </Button>
            </>
          )}
          <Button onClick={onNext} disabled={!gen.confirmed} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
            <span className="sm:hidden">Next</span><span className="hidden sm:inline">Generate Scenes</span> <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
