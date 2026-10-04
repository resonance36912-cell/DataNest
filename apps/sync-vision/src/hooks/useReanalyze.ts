import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProject, VerificationResult } from "@/contexts/ProjectContext";
import { toast } from "sonner";

const isCreditsError = (status: number, message: string) =>
  status === 402 || /credits?\s*exhausted|add funds|insufficient credits/i.test(message);

/**
 * Re-runs verification from persisted transcription data,
 * without requiring the original audio file or going back to step 2.
 */
export function useReanalyze() {
  const {
    transcription, setTranscription,
    verification, setVerification,
    projectId, activeTranscriptVersionId, setActiveTranscriptVersionId,
  } = useProject();

  const [reanalyzing, setReanalyzing] = useState(false);
  const [clearing, setClearing] = useState(false);

  const reanalyze = useCallback(async (optsOrEvent?: { skipCache?: boolean } | unknown) => {
    const opts: { skipCache?: boolean } =
      optsOrEvent && typeof optsOrEvent === "object" && "skipCache" in (optsOrEvent as object)
        ? (optsOrEvent as { skipCache?: boolean })
        : {};
    setReanalyzing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Please sign in.");

      // 1) Ensure we have transcription data — rehydrate from DB if needed
      let txn = transcription;
      if (!txn && projectId) {
        // Try to load from active transcript version
        let versionId = activeTranscriptVersionId;
        if (!versionId) {
          const { data: ver } = await supabase
            .from("transcript_versions")
            .select("id, raw_payload")
            .eq("project_id", projectId)
            .in("status", ["active", "accepted"])
            .order("updated_at", { ascending: false })
            .limit(1)
            .single();
          if (ver) {
            versionId = ver.id;
            setActiveTranscriptVersionId(ver.id);
            const payload = ver.raw_payload as any;
            if (payload?.text && payload?.words) {
              txn = {
                text: payload.text,
                words: payload.words || [],
                audio_events: payload.audio_events || [],
                quality: payload.quality || { has_content: true, has_timestamps: true, word_count: 0, char_count: 0 },
              };
              setTranscription(txn);
            }
          }
        } else if (!txn) {
          const { data: ver } = await supabase
            .from("transcript_versions")
            .select("raw_payload")
            .eq("id", versionId)
            .single();
          if (ver) {
            const payload = ver.raw_payload as any;
            if (payload?.text && payload?.words) {
              txn = {
                text: payload.text,
                words: payload.words || [],
                audio_events: payload.audio_events || [],
                quality: payload.quality || { has_content: true, has_timestamps: true, word_count: 0, char_count: 0 },
              };
              setTranscription(txn);
            }
          }
        }
      }

      if (!txn) {
        toast.error("No transcription data found. Please go back to Upload and re-upload the track.");
        return;
      }

      // 2) Get project name + genre/mood for context (genre/mood improve the
      // suggestion-only lyric repair pass on the server).
      let fileName = "audio.mp3";
      let projectGenre = "";
      let projectMood = "";
      if (projectId) {
        const { data: proj } = await supabase
          .from("projects")
          .select("name, file_path, mood")
          .eq("id", projectId)
          .single();
        if (proj?.file_path) {
          fileName = proj.file_path.split("/").pop() || proj.name || "audio.mp3";
        } else if (proj?.name) {
          fileName = proj.name;
        }
        projectMood = proj?.mood || "";
      }

      // 3) Call verify-transcription edge function
      toast.info("Re-analyzing transcription…");
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-transcription`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          transcription: {
            text: txn.text,
            words: txn.words,
            audio_events: txn.audio_events,
            quality: txn.quality,
          },
          file_name: fileName,
          project_id: projectId || undefined,
          genre: projectGenre,
          mood: projectMood,
          skip_cache: opts.skipCache === true,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Verification failed" }));
        const message = err.error || `Verification failed (${response.status})`;
        const e: any = new Error(isCreditsError(response.status, message) ? "Add AI credits to continue" : message);
        e.code = isCreditsError(response.status, message) ? "AI_CREDITS_EXHAUSTED" : `HTTP_${response.status}`;
        throw e;
      }

      const result: VerificationResult = await response.json();
      if (result?.fallback && result?.ai_credits_exhausted) {
        setVerification(result);
        toast.error("Add AI credits to continue", {
          description: "Automated re-analysis paused. Your existing transcription is preserved for manual editing.",
          duration: 10000,
          action: {
            label: "Add credits",
            onClick: () => window.open("https://lovable.dev/settings/plans", "_blank", "noopener,noreferrer"),
          },
        });
        return;
      }
      if (!result.verified_lyrics?.trim()) throw new Error("Verification produced empty lyrics");

      setVerification(result);

      // 4) Also persist to project table
      if (projectId) {
        await supabase.from("projects").update({
          lyrics: result.verified_lyrics,
          bpm: result.bpm,
          music_key: result.music_key,
          mood: result.mood,
          energy: result.energy,
          instruments: result.instruments,
        }).eq("id", projectId);
      }

      toast.success(
        result.cached
          ? `Reused cached analysis (instant). Lyrics confidence: ${result.confidence_lyrics}%`
          : `Re-analysis complete! Lyrics confidence: ${result.confidence_lyrics}%`
      );
    } catch (err: any) {
      console.error("Re-analyze error:", err);
      if (err?.code === "AI_CREDITS_EXHAUSTED") {
        toast.error("Add AI credits to continue", {
          description: "Your workspace AI credits are exhausted. Top up to resume automated re-analysis.",
          duration: 10000,
          action: {
            label: "Add credits",
            onClick: () => window.open("https://lovable.dev/settings/plans", "_blank", "noopener,noreferrer"),
          },
        });
      } else {
        toast.error(err.message || "Re-analysis failed.");
      }
    } finally {
      setReanalyzing(false);
    }
  }, [transcription, projectId, activeTranscriptVersionId, setTranscription, setVerification, setActiveTranscriptVersionId]);

  const clearCache = useCallback(async () => {
    if (!projectId) {
      toast.error("No project loaded.");
      return;
    }
    setClearing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Please sign in.");

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clear-verification-cache`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ project_id: projectId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to clear cache" }));
        throw new Error(err.error || `Failed to clear cache (${res.status})`);
      }

      // Strip the cached flag from the current verification so the badge disappears
      if (verification) {
        setVerification({ ...verification, cached: false });
      }

      toast.success("Cached verification cleared. You can now run a fresh analysis.");
    } catch (err: any) {
      console.error("Clear cache error:", err);
      toast.error(err.message || "Failed to clear cache");
    } finally {
      setClearing(false);
    }
  }, [projectId, verification, setVerification]);

  return { reanalyze, reanalyzing, clearCache, clearing };
}
