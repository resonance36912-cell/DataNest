import { useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Columns2, ImageOff, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useProject } from "@/contexts/ProjectContext";

/**
 * Horizontal carousel of every generated character concept so the user can
 * compare candidates and pick the reference used for scene generation.
 */
export default function CharacterReferenceCarousel() {
  const {
    characterConcepts: concepts,
    selectedCharacterIndex,
    setSelectedCharacterIndex,
  } = useProject();

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<number[]>([]);

  const activeIndex = useMemo(() => {
    if (selectedCharacterIndex !== null && concepts[selectedCharacterIndex]) return selectedCharacterIndex;
    return concepts.length ? 0 : null;
  }, [selectedCharacterIndex, concepts]);

  if (!concepts.length) return null;

  const scrollBy = (dir: number) => {
    scrollerRef.current?.scrollBy({ left: dir * 260, behavior: "smooth" });
  };

  const toggleCompare = (index: number) => {
    setCompareIds((prev) => {
      if (prev.includes(index)) return prev.filter((i) => i !== index);
      if (prev.length >= 3) {
        toast.info("Compare up to 3 concepts at a time");
        return prev;
      }
      return [...prev, index];
    });
  };

  const selectConcept = (index: number) => {
    setSelectedCharacterIndex(index);
    toast.success(`${concepts[index]?.name || `Concept ${index + 1}`} set as scene reference`);
  };

  const compareList = compareIds.map((i) => ({ index: i, concept: concepts[i] })).filter((c) => c.concept);

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Character References</h3>
          <Badge variant="secondary" className="text-[10px]">{concepts.length}</Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" disabled={compareList.length < 2}>
                <Columns2 className="h-3.5 w-3.5" /> Compare{compareList.length ? ` (${compareList.length})` : ""}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle className="text-base">Compare concepts</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(1, compareList.length)}, minmax(0, 1fr))` }}>
                {compareList.map(({ index, concept }) => (
                  <div key={index} className="space-y-2">
                    <div className="aspect-[3/4] overflow-hidden rounded-lg bg-secondary/60">
                      {concept.imageUrl ? (
                        <img src={concept.imageUrl} alt={concept.name} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          <ImageOff className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <p className="text-sm font-semibold leading-tight">{concept.name}</p>
                    <p className="text-[11px] text-primary/80">{concept.vibe}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug line-clamp-6">{concept.description}</p>
                    <p className="text-[11px]"><span className="font-medium">Outfit:</span> <span className="text-muted-foreground">{concept.outfit}</span></p>
                    <Button
                      size="sm"
                      className="w-full h-7 gap-1.5 text-xs"
                      variant={activeIndex === index ? "secondary" : "default"}
                      onClick={() => { selectConcept(index); setCompareOpen(false); }}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {activeIndex === index ? "Current reference" : "Use for scenes"}
                    </Button>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => scrollBy(-1)} aria-label="Scroll left">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => scrollBy(1)} aria-label="Scroll right">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div ref={scrollerRef} className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
        {concepts.map((concept, index) => {
          const isActive = activeIndex === index;
          const inCompare = compareIds.includes(index);
          return (
            <div
              key={`${concept.name}-${index}`}
              className={`snap-start shrink-0 w-[180px] sm:w-[200px] rounded-xl border p-2 transition-colors ${
                isActive ? "border-primary bg-primary/5" : "border-border/60 bg-card/40 hover:border-primary/40"
              }`}
            >
              <button
                type="button"
                onClick={() => selectConcept(index)}
                className="block w-full text-left"
                aria-label={`Select ${concept.name}`}
              >
                <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-secondary/60">
                  {concept.imageUrl ? (
                    <img src={concept.imageUrl} alt={concept.name} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <ImageOff className="h-5 w-5" />
                    </div>
                  )}
                  {isActive && (
                    <Badge className="absolute top-1.5 left-1.5 gap-1 text-[9px] px-1.5 py-0.5">
                      <Star className="h-2.5 w-2.5" /> Scene ref
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-xs font-semibold truncate">{concept.name || `Concept ${index + 1}`}</p>
                <p className="text-[10px] text-primary/80 truncate">{concept.vibe}</p>
              </button>
              <div className="mt-2 flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant={isActive ? "secondary" : "outline"}
                  className="h-6 flex-1 text-[10px]"
                  onClick={() => selectConcept(index)}
                >
                  {isActive ? "Selected" : "Select"}
                </Button>
                <Button
                  size="sm"
                  variant={inCompare ? "default" : "ghost"}
                  className="h-6 px-2 text-[10px]"
                  onClick={() => toggleCompare(index)}
                  aria-pressed={inCompare}
                >
                  <Columns2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground">
        The selected reference anchors character consistency across every generated scene.
      </p>
    </div>
  );
}
