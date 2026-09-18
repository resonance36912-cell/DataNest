import { RefObject } from "react";
import { Download, Film, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SavedScene } from "@/components/assembly/SceneTimeline";
import type { SubtitleConfig } from "@/components/assembly/TextOverlayPanel";

interface AssemblyVideoPreviewProps {
  videoARef: RefObject<HTMLVideoElement>;
  videoBRef: RefObject<HTMLVideoElement>;
  currentActiveScene: SavedScene | null;
  orderedScenes: SavedScene[];
  subtitles: SubtitleConfig;
  filterStyle: React.CSSProperties;
  playback: {
    isPlayingAll: boolean;
    audioSyncPlaying: boolean;
    transitioning: boolean;
    transitionStyle: string;
    currentTrans: { durationSec: number };
    activeLayer: "A" | "B";
    makeLayerStyle: (layer: "A" | "B") => React.CSSProperties;
    playbackSceneIdx: number;
  };
  audioUrl: string | null;
  onDownload?: (scene: SavedScene) => void;
  downloading?: boolean;
}

export default function AssemblyVideoPreview({
  videoARef, videoBRef, currentActiveScene, orderedScenes, subtitles,
  filterStyle, playback, audioUrl, onDownload, downloading,
}: AssemblyVideoPreviewProps) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="aspect-video bg-black relative overflow-hidden" style={filterStyle}>
        {playback.isPlayingAll && playback.transitioning && playback.transitionStyle === "fade-black" && (
          <div
            className="absolute inset-0 z-20 pointer-events-none"
            style={{ backgroundColor: "black", animation: `fadeBlackPulse ${playback.currentTrans.durationSec}s ease-in-out` }}
          />
        )}

        <video
          ref={videoARef}
          className="w-full h-full object-contain"
          style={{ ...playback.makeLayerStyle("A"), zIndex: playback.activeLayer === "A" ? 10 : 5 }}
          controls={!playback.isPlayingAll && !playback.audioSyncPlaying}
          playsInline
          preload="auto"
          muted={(playback.isPlayingAll || playback.audioSyncPlaying) && !!audioUrl}
        />
        <video
          ref={videoBRef}
          className="w-full h-full object-contain"
          style={{ ...playback.makeLayerStyle("B"), zIndex: playback.activeLayer === "B" ? 10 : 5 }}
          playsInline
          preload="auto"
          muted={(playback.isPlayingAll || playback.audioSyncPlaying) && !!audioUrl}
        />

        {!playback.isPlayingAll && !currentActiveScene && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground z-30">
            <Film className="h-12 w-12 opacity-30" />
          </div>
        )}

        {(playback.isPlayingAll || playback.audioSyncPlaying) && currentActiveScene?.lyricSegment && (
          <div className="absolute left-0 right-0 bottom-12 flex justify-center pointer-events-none z-30">
            <div className="px-4 py-2 rounded-lg backdrop-blur-sm bg-black/60 max-w-[80%]">
              <p
                className="text-center leading-relaxed font-medium"
                style={{
                  fontFamily: subtitles.fontFamily,
                  fontSize: `${Math.max(subtitles.fontSize, 20)}px`,
                  color: subtitles.color || "#ffffff",
                  textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                }}
              >
                {currentActiveScene.lyricSegment}
              </p>
              <p className="text-[10px] text-center text-white/40 mt-1 tabular-nums">
                Scene {currentActiveScene.sceneNumber} · {currentActiveScene.timeStart} – {currentActiveScene.timeEnd}
              </p>
            </div>
          </div>
        )}

        {!playback.isPlayingAll && !playback.audioSyncPlaying && subtitles.enabled && currentActiveScene && (
          <div
            className={`absolute left-0 right-0 flex justify-center pointer-events-none z-30 ${
              subtitles.position === "top" ? "top-4" : subtitles.position === "center" ? "top-1/2 -translate-y-1/2" : "bottom-8"
            }`}
          >
            <span
              className="px-3 py-1 rounded"
              style={{
                fontFamily: subtitles.fontFamily, fontSize: `${subtitles.fontSize}px`,
                color: subtitles.color, backgroundColor: `rgba(0,0,0,${subtitles.bgOpacity / 100})`,
              }}
            >
              {currentActiveScene.lyricSegment || "Subtitle preview"}
            </span>
          </div>
        )}

        {playback.isPlayingAll && (
          <div className="absolute top-3 left-3 z-30">
            <Badge className="bg-destructive/90 text-destructive-foreground border-0 animate-pulse text-xs">
              ● Playing {playback.playbackSceneIdx + 1}/{orderedScenes.length}
            </Badge>
          </div>
        )}

        {/* Download button for current scene */}
        {!playback.isPlayingAll && currentActiveScene?.videoUrl && onDownload && (
          <div className="absolute top-3 right-3 z-30 opacity-0 hover:opacity-100 transition-opacity"
            style={{ opacity: downloading ? 1 : undefined }}>
            <button
              onClick={() => onDownload(currentActiveScene)}
              disabled={downloading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-background/80 backdrop-blur-sm text-foreground hover:bg-background text-xs font-medium transition-colors disabled:opacity-50"
              title={`Download Scene ${currentActiveScene.sceneNumber}`}
            >
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Download
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
