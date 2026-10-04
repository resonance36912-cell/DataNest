import { Check, CheckSquare, Film } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Scene } from "@/contexts/ProjectContext";

interface ApprovedScenesSummaryProps {
  scenes: Scene[];
  sceneApproved: Record<number, boolean>;
  savedSceneIndices: number[];
  onSelectScene: (idx: number) => void;
}

export default function ApprovedScenesSummary({ scenes, sceneApproved, savedSceneIndices, onSelectScene }: ApprovedScenesSummaryProps) {
  const approvedScenes = scenes.filter((_, idx) => sceneApproved[idx]);
  if (approvedScenes.length === 0) return null;

  return (
    <div className="glass-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Check className="h-4 w-4 text-green-500" />
          Approved Scenes ({approvedScenes.length}/{scenes.length})
        </h3>
        {approvedScenes.length === scenes.length && (
          <Badge className="bg-green-500/20 text-green-600 border-green-500/30 text-[10px]">All Approved</Badge>
        )}
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-10 gap-1.5">
        {scenes.map((scene, idx) => {
          const approved = sceneApproved[idx];
          const saved = savedSceneIndices.includes(idx);
          const thumb = scene.videoUrl || scene.imageUrl;
          return (
            <button
              key={idx}
              onClick={() => onSelectScene(idx)}
              className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-video group ${
                approved ? "border-green-500/60 hover:border-green-400" : "border-border/30 opacity-40 hover:opacity-60"
              }`}
            >
              {thumb ? (
                scene.videoUrl ? (
                  <video src={thumb} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                ) : (
                  <img src={thumb} alt={`Scene ${idx + 1}`} className="w-full h-full object-cover" />
                )
              ) : (
                <div className="w-full h-full bg-secondary flex items-center justify-center">
                  <Film className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[10px] text-white font-medium">Scene {idx + 1}</span>
              </div>
              <div className="absolute top-1 left-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-[9px] font-bold text-white">
                {idx + 1}
              </div>
              {approved && (
                <div className="absolute top-1 right-1 h-4 w-4 rounded-full bg-green-500 flex items-center justify-center">
                  <Check className="h-2.5 w-2.5 text-white" />
                </div>
              )}
              {saved && (
                <div className="absolute bottom-1 right-1 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                  <CheckSquare className="h-2.5 w-2.5 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
