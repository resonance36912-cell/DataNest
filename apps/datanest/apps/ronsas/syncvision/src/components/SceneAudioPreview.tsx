import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Volume2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface SceneAudioPreviewProps {
  audioUrl: string;
  startTime: number; // seconds
  endTime: number;   // seconds
  displayStartTime?: number;
  displayEndTime?: number;
}

export default function SceneAudioPreview({ audioUrl, startTime, endTime, displayStartTime, displayEndTime }: SceneAudioPreviewProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number>(0);
  const duration = Math.max(0.5, endTime - startTime);
  const shownStartTime = displayStartTime ?? startTime;
  const shownEndTime = displayEndTime ?? endTime;

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = startTime;
    }
    setPlaying(false);
    setProgress(0);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, [startTime]);

  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    if (audio.currentTime >= endTime) {
      stop();
      return;
    }
    const elapsed = audio.currentTime - startTime;
    setProgress(Math.min(100, (elapsed / duration) * 100));
    rafRef.current = requestAnimationFrame(tick);
  }, [startTime, endTime, duration, stop]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      stop();
    } else {
      audio.currentTime = startTime;
      audio.play().then(() => {
        setPlaying(true);
        rafRef.current = requestAnimationFrame(tick);
      }).catch(() => {});
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioRef.current?.pause();
    };
  }, []);

  // Stop if another scene starts playing (re-render with new startTime)
  useEffect(() => {
    stop();
  }, [startTime, endTime, stop]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      <button
        onClick={toggle}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        title={playing ? "Pause segment" : "Play segment"}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
      </button>
      <div className="flex-1 space-y-0.5">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Volume2 className="h-3 w-3" />
            Audio Segment
          </span>
          <span>{formatTime(shownStartTime)} – {formatTime(shownEndTime)} ({duration.toFixed(1)}s)</span>
        </div>
        <Progress value={progress} className="h-1" />
      </div>
    </div>
  );
}
