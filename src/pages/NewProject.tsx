import { lazy, Suspense, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { RefreshCw, Save, Trash2 } from "lucide-react";
import { useAutoSave } from "@/hooks/useAutoSave";
import { stepSkeletons } from "@/components/ui/step-skeletons";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Layout from "@/components/Layout";
import StepIndicator from "@/components/StepIndicator";
import { ProjectProvider, useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { UpgradeRecommendations } from "@/components/brand/UpgradeRecommendations";
import { PlanStatusBanner } from "@/components/brand/PlanStatusBanner";
import ProjectMetricsPanel from "@/components/ProjectMetricsPanel";
import PipelineStatusPanel from "@/components/PipelineStatusPanel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const WORKFLOW_STEPS = [
  { label: "Upload", Component: lazy(() => import("@/components/steps/UploadStep")) },
  { label: "Analyze", Component: lazy(() => import("@/components/steps/AnalysisStep")) },
  { label: "Character", Component: lazy(() => import("@/components/steps/CharacterStep")) },
  { label: "Storyboard", Component: lazy(() => import("@/components/steps/StoryboardStep")) },
  { label: "Assembly", Component: lazy(() => import("@/components/steps/AssemblyStep")) },
  { label: "Export", Component: lazy(() => import("@/components/steps/ExportStep")) },
] as const;

const stepDefinitions = WORKFLOW_STEPS.map(({ label }) => ({ label }));
const lastStepIndex = WORKFLOW_STEPS.length - 1;

function NewProjectInner() {
  const { currentStep, setCurrentStep, loadingProject, refreshProject, projectId, file, audioUrl, scenes, transcription, verification, characterConcepts, selectedCharacterIndex, characterConfirmed } = useProject();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Jump to a specific step if ?step= is provided (e.g. from Gallery)
  useEffect(() => {
    const stepParam = searchParams.get("step");
    if (stepParam) {
      const stepNum = parseInt(stepParam, 10);
      if (!isNaN(stepNum) && stepNum >= 0 && stepNum < WORKFLOW_STEPS.length) {
        setCurrentStep(stepNum);
      }
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setCurrentStep, setSearchParams]);

  // Auto-save every 2 minutes
  useAutoSave();

  const next = () => setCurrentStep((s: number) => Math.min(s + 1, lastStepIndex));
  const prev = () => setCurrentStep((s: number) => Math.max(s - 1, 0));

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (projectId) {
        await refreshProject();
        toast.success("Project data refreshed");
      } else {
        window.location.reload();
      }
    } catch {
      toast.error("Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  };

  const handleSave = async () => {
    if (!projectId || !user) {
      toast.error("No project to save. Upload a file first.");
      return;
    }
    setSaving(true);
    try {
      // Save current step + verification data to project
      const projectUpdate: TablesUpdate<"projects"> = {
        current_step: currentStep,
        updated_at: new Date().toISOString(),
      };
      if (verification) {
        projectUpdate.lyrics = verification.verified_lyrics || null;
        projectUpdate.bpm = verification.bpm || null;
        projectUpdate.music_key = verification.music_key || null;
        projectUpdate.mood = verification.mood || null;
        projectUpdate.energy = verification.energy || null;
        projectUpdate.instruments = verification.instruments || null;
      }
      const { error: projectError } = await supabase
        .from("projects")
        .update(projectUpdate)
        .eq("id", projectId)
        .eq("user_id", user.id);
      if (projectError) throw projectError;

      // Persist scenes
      if (scenes.length > 0) {
        const rows: TablesInsert<"scenes">[] = scenes.map(scene => ({
          project_id: projectId,
          user_id: user.id,
          scene_number: scene.scene_number,
          lyric_segment: scene.lyric_segment || "",
          time_start: scene.time_start,
          time_end: scene.time_end,
          mood: scene.mood,
          location: scene.location,
          camera_style: scene.camera_style,
          action_description: scene.action_description,
          visual_prompt: scene.visual_prompt,
          scene_image_url: scene.imageUrl || null,
          video_url: scene.videoUrl || null,
          video_quality: scene.videoQuality || null,
          lipsync_video_url: scene.lipSyncVideoUrl || null,
          enhanced_video_url: scene.enhancedVideoUrl || null,
          section_type: scene.section_type || null,
          section_index: scene.section_index || 1,
        }));
        const { error: scenesError } = await supabase
          .from("scenes")
          .upsert(rows, { onConflict: "project_id,user_id,scene_number" });
        if (scenesError) throw scenesError;
      }

      toast.success("Project saved!");
    } catch (err) {
      console.error("Save failed:", err);
      toast.error("Failed to save project");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!projectId || !user) return;
    setDeleting(true);
    try {
      // Delete related data then project
      const relatedDeletes = await Promise.all([
        supabase.from("render_jobs").delete().eq("project_id", projectId),
        supabase.from("generation_jobs").delete().eq("project_id", projectId),
        supabase.from("lipsync_jobs").delete().eq("project_id", projectId),
        supabase.from("scenes").delete().eq("project_id", projectId),
        supabase.from("characters").delete().eq("project_id", projectId),
        supabase.from("assembly_configs").delete().eq("project_id", projectId),
      ]);
      const relatedDeleteError = relatedDeletes.find(({ error }) => error)?.error;
      if (relatedDeleteError) throw relatedDeleteError;

      const { error: projectDeleteError } = await supabase
        .from("projects")
        .delete()
        .eq("id", projectId)
        .eq("user_id", user.id);
      if (projectDeleteError) throw projectDeleteError;
      toast.success("Project deleted");
      navigate("/dashboard");
    } catch (err) {
      console.error("Delete failed:", err);
      toast.error("Failed to delete project");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (loadingProject) {
    const LoadingSkeleton = stepSkeletons[currentStep] || stepSkeletons[0];
    return (
      <Layout hideFooter>
        <div className="container max-w-5xl px-3 sm:px-6 py-4 sm:py-8">
          <div className="mb-4 sm:mb-8">
            <StepIndicator steps={stepDefinitions} currentStep={currentStep} onStepClick={() => {}} />
          </div>
          <LoadingSkeleton />
        </div>
      </Layout>
    );
  }

  const { Component: StepComponent, label: activeStepLabel } = WORKFLOW_STEPS[currentStep];
  const ActiveStepSkeleton = stepSkeletons[currentStep] || stepSkeletons[0];
  const completedSteps = [
    Boolean(file || audioUrl),
    Boolean(transcription || verification?.verified_lyrics),
    Boolean(characterConfirmed && selectedCharacterIndex !== null && characterConcepts[selectedCharacterIndex]),
    scenes.length > 0 && scenes.every((scene) => Boolean(scene.visual_prompt)),
    scenes.length > 0 && scenes.every((scene) => Boolean(scene.videoUrl || scene.lipSyncVideoUrl || scene.enhancedVideoUrl)),
    false,
  ];

  return (
    <Layout hideFooter>
      <div className="container max-w-5xl px-3 sm:px-6 py-4 sm:py-8">
        <div className="mb-4 sm:mb-8 flex items-center gap-2 sm:gap-3">
          <div className="flex-1 min-w-0">
            <StepIndicator steps={stepDefinitions} currentStep={currentStep} completedSteps={completedSteps} onStepClick={(step) => setCurrentStep(step)} />
          </div>

          {/* Save Project */}
          {projectId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
              title="Save project progress"
            >
              <Save className={`h-4 w-4 ${saving ? "animate-pulse" : ""}`} />
              <span className="hidden sm:inline text-xs">{saving ? "Saving…" : "Save"}</span>
            </Button>
          )}


          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            title="Refresh project data"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>

          {/* Delete Project */}
          {projectId && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDeleteOpen(true)}
              className="shrink-0 text-muted-foreground hover:text-destructive"
              title="Delete this project"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        <PlanStatusBanner />
        <UpgradeRecommendations />
        {projectId && (
          <div className="mb-3 space-y-3">
            <PipelineStatusPanel projectId={projectId} />
            <div className="rounded-md border border-border/50 bg-card/40 p-3">
              <ProjectMetricsPanel projectId={projectId} />
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <SectionErrorBoundary name={activeStepLabel} key={`eb-${currentStep}`}>
              <Suspense fallback={<ActiveStepSkeleton />}>
                <StepComponent onNext={next} onPrev={prev} isFirst={currentStep === 0} isLast={currentStep === lastStepIndex} />
              </Suspense>
            </SectionErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this project and all its scenes, characters, videos, and render jobs. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete Project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

export default function NewProject() {
  const { id } = useParams<{ id?: string }>();

  return (
    <ProjectProvider initialProjectId={id}>
      <NewProjectInner />
    </ProjectProvider>
  );
}
