import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import {
  HardDrive, Trash2, Image, Video, Music, FileText,
  ChevronDown, ChevronUp, ExternalLink, RefreshCw, AlertTriangle,
  ArrowUpDown, Filter, Sparkles, Calendar, Search, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface StorageAsset {
  id: string;
  name: string;
  source: "supabase" | "fal" | "external";
  type: "image" | "video" | "audio" | "other";
  url: string;
  thumbnailUrl?: string;
  size: number | null;
  createdAt: string;
  projectName?: string;
  sceneNumber?: number;
  /** For supabase storage deletions */
  storagePath?: string;
  /** For DB reference cleanup */
  dbTable?: string;
  dbId?: string;
  dbField?: string;
  /** Whether this asset is referenced by an active scene */
  referenced?: boolean;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function getFileType(name: string, mime?: string): StorageAsset["type"] {
  const n = name.toLowerCase();
  if (mime?.startsWith("image/") || /\.(png|jpg|jpeg|webp|gif|svg)$/.test(n)) return "image";
  if (mime?.startsWith("video/") || /\.(mp4|webm|mov)$/.test(n)) return "video";
  if (mime?.startsWith("audio/") || /\.(wav|mp3|ogg|flac|m4a)$/.test(n)) return "audio";
  return "other";
}

const typeIcons: Record<StorageAsset["type"], typeof Image> = {
  image: Image, video: Video, audio: Music, other: FileText,
};

const sourceLabels: Record<StorageAsset["source"], { label: string; color: string }> = {
  supabase: { label: "Cloud Storage", color: "bg-primary/20 text-primary" },
  fal: { label: "FAL", color: "bg-amber-500/20 text-amber-400" },
  external: { label: "External", color: "bg-blue-500/20 text-blue-400" },
};

const AGE_FILTERS = [
  { label: "All ages", days: 0 },
  { label: "> 7 days", days: 7 },
  { label: "> 30 days", days: 30 },
  { label: "> 90 days", days: 90 },
] as const;

export default function StorageOverview() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<StorageAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<StorageAsset | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [filterType, setFilterType] = useState<"all" | StorageAsset["type"]>("all");
  const [sortBy, setSortBy] = useState<"date" | "size" | "name">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [cleanupMode, setCleanupMode] = useState(false);
  const [ageFilter, setAgeFilter] = useState(0);
  const [referencedUrls, setReferencedUrls] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const loadAssets = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Load project names for mapping
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name")
        .eq("user_id", user.id);
      const projectMap = new Map<string, string>((projects || []).map((p: any) => [String(p.id), String(p.name || "Unknown")] as [string, string]));

      const allAssets: StorageAsset[] = [];

      // 1) Supabase storage — list files in user folder
      const { data: storageFiles } = await supabase.storage
        .from("media-uploads")
        .list(user.id, { limit: 500, sortBy: { column: "created_at", order: "desc" } });

      // Supabase storage list is flat per folder, need to recurse subfolders
      const subfolders = (storageFiles || []).filter(f => !f.metadata);
      const files = (storageFiles || []).filter(f => f.metadata);

      // Process direct files
      for (const f of files) {
        const path = `${user.id}/${f.name}`;
        const type = getFileType(f.name, f.metadata?.mimetype);
        allAssets.push({
          id: `sb-${path}`,
          name: f.name,
          source: "supabase",
          type,
          url: "",
          size: f.metadata?.size || null,
          createdAt: f.created_at || "",
          storagePath: path,
        });
      }

      // Load subfolder contents in parallel
      const subPromises = subfolders.map(async (sf) => {
        const { data: subFiles } = await supabase.storage
          .from("media-uploads")
          .list(`${user.id}/${sf.name}`, { limit: 200, sortBy: { column: "created_at", order: "desc" } });

        // Check for deeper subfolders
        const deepFolders = (subFiles || []).filter(f => !f.metadata);
        const directFiles = (subFiles || []).filter(f => f.metadata);

        const results: StorageAsset[] = directFiles.map(f => {
          const path = `${user.id}/${sf.name}/${f.name}`;
          const projectId = sf.name;
          return {
            id: `sb-${path}`,
            name: f.name,
            source: "supabase" as const,
            type: getFileType(f.name, f.metadata?.mimetype),
            url: "",
            size: f.metadata?.size || null,
            createdAt: f.created_at || "",
            storagePath: path,
            projectName: projectMap.get(projectId),
          };
        });

        // Handle deeper subfolders (e.g., scene-images/, segment-audio/, character-ref/)
        for (const df of deepFolders) {
          const { data: deepFiles } = await supabase.storage
            .from("media-uploads")
            .list(`${user.id}/${sf.name}/${df.name}`, { limit: 200 });

          for (const f of (deepFiles || []).filter(f => f.metadata)) {
            const path = `${user.id}/${sf.name}/${df.name}/${f.name}`;
            results.push({
              id: `sb-${path}`,
              name: `${df.name}/${f.name}`,
              source: "supabase",
              type: getFileType(f.name, f.metadata?.mimetype),
              url: "",
              size: f.metadata?.size || null,
              createdAt: f.created_at || "",
              storagePath: path,
              projectName: projectMap.get(sf.name),
            });
          }
        }

        return results;
      });

      const subResults = await Promise.all(subPromises);
      allAssets.push(...subResults.flat());

      // 2) FAL-hosted assets from render_jobs
      const { data: renderJobs } = await supabase
        .from("render_jobs")
        .select("id, provider, scene_number, output, final_output_url, created_at, project_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      for (const rj of renderJobs || []) {
        const output = rj.output as Record<string, any> || {};
        const videoUrl = output?.video || output?.video_url || rj.final_output_url;
        if (videoUrl && typeof videoUrl === "string" && videoUrl.startsWith("http")) {
          allAssets.push({
            id: `rj-${rj.id}`,
            name: `Render Scene ${rj.scene_number} (${rj.provider})`,
            source: videoUrl.includes("fal.media") ? "fal" : "external",
            type: "video",
            url: videoUrl,
            size: null,
            createdAt: rj.created_at,
            projectName: projectMap.get(rj.project_id || ""),
            sceneNumber: rj.scene_number,
            dbTable: "render_jobs",
            dbId: rj.id,
          });
        }
      }

      // 3) FAL-hosted assets from generation_jobs
      const { data: genJobs } = await supabase
        .from("generation_jobs")
        .select("id, provider_name, provider_operation, scene_number, output_asset_url, created_at, project_id")
        .eq("user_id", user.id)
        .not("output_asset_url", "is", null)
        .order("created_at", { ascending: false });

      for (const gj of genJobs || []) {
        if (gj.output_asset_url) {
          allAssets.push({
            id: `gj-${gj.id}`,
            name: `Generated Scene ${gj.scene_number} (${gj.provider_operation})`,
            source: gj.output_asset_url.includes("fal.media") ? "fal" : "external",
            type: gj.provider_operation === "image-to-video" ? "video" : "image",
            url: gj.output_asset_url,
            size: null,
            createdAt: gj.created_at,
            projectName: projectMap.get(gj.project_id || ""),
            sceneNumber: gj.scene_number,
            dbTable: "generation_jobs",
            dbId: gj.id,
            dbField: "output_asset_url",
          });
        }
      }

      // 4) Lipsync job outputs
      const { data: lipsyncJobs } = await supabase
        .from("lipsync_jobs")
        .select("id, provider, scene_number, output_url, created_at, project_id")
        .eq("user_id", user.id)
        .not("output_url", "is", null)
        .order("created_at", { ascending: false });

      for (const lj of lipsyncJobs || []) {
        if (lj.output_url) {
          allAssets.push({
            id: `lj-${lj.id}`,
            name: `Lip-sync Scene ${lj.scene_number} (${lj.provider})`,
            source: lj.output_url.includes("fal.media") ? "fal" : "external",
            type: "video",
            url: lj.output_url,
            size: null,
            createdAt: lj.created_at,
            projectName: projectMap.get(lj.project_id || ""),
            sceneNumber: lj.scene_number,
            dbTable: "lipsync_jobs",
            dbId: lj.id,
            dbField: "output_url",
          });
        }
      }

      // Sort by date desc
      allAssets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Generate signed URLs for supabase storage assets (for thumbnails + open link)
      const sbAssets = allAssets.filter(a => a.storagePath && (a.type === "image" || a.type === "video" || a.type === "audio"));
      if (sbAssets.length > 0) {
        const paths = sbAssets.map(a => a.storagePath!);
        const { data: signedData } = await supabase.storage
          .from("media-uploads")
          .createSignedUrls(paths, 3600);
        if (signedData) {
          const urlMap = new Map<string, string>();
          signedData.forEach(s => { if (s.signedUrl) urlMap.set(s.path || "", s.signedUrl); });
          for (const asset of sbAssets) {
            const signed = urlMap.get(asset.storagePath!);
            if (signed) {
              asset.url = signed;
              if (asset.type === "image") asset.thumbnailUrl = signed;
            }
          }
        }
      }

      // Set thumbnailUrl for FAL/external image & video assets
      for (const a of allAssets) {
        if (!a.thumbnailUrl && a.url && (a.type === "image" || a.type === "video")) {
          a.thumbnailUrl = a.url;
        }
      }

      setAssets(allAssets);
    } catch (err) {
      console.error("Failed to load storage assets:", err);
      toast.error("Failed to load storage overview");
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Load active scene references to identify orphaned assets
  const loadReferences = useCallback(async () => {
    if (!user) return;
    const urls = new Set<string>();
    const { data: scenes } = await supabase
      .from("scenes")
      .select("scene_image_url, video_url, lipsync_video_url, enhanced_video_url, segment_audio_url, segment_audio_path")
      .eq("user_id", user.id);
    for (const s of scenes || []) {
      if (s.scene_image_url) urls.add(s.scene_image_url);
      if (s.video_url) urls.add(s.video_url);
      if (s.lipsync_video_url) urls.add(s.lipsync_video_url);
      if (s.enhanced_video_url) urls.add(s.enhanced_video_url);
      if (s.segment_audio_url) urls.add(s.segment_audio_url);
      if (s.segment_audio_path) urls.add(s.segment_audio_path);
    }
    const { data: chars } = await supabase
      .from("characters")
      .select("reference_image_url")
      .eq("user_id", user.id);
    for (const c of chars || []) {
      if (c.reference_image_url) urls.add(c.reference_image_url);
    }
    const { data: projects } = await supabase
      .from("projects")
      .select("file_path")
      .eq("user_id", user.id);
    for (const p of projects || []) {
      if (p.file_path) urls.add(p.file_path);
    }
    setReferencedUrls(urls);
  }, [user]);

  useEffect(() => { loadAssets(); loadReferences(); }, [loadAssets, loadReferences]);

  const purgeAsset = async (asset: StorageAsset) => {
    // 1) Remove from Supabase Storage if applicable; verify removal
    if (asset.storagePath) {
      const { data, error } = await supabase.storage
        .from("media-uploads")
        .remove([asset.storagePath]);
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Storage delete returned no result (likely blocked by permissions)");
      }
    }

    // 2) Best-effort FAL CDN deletion
    if (asset.source === "fal" && asset.url) {
      try {
        await supabase.functions.invoke("delete-fal-asset", { body: { urls: [asset.url] } });
      } catch { /* best-effort */ }
    }

    // 3) Clean up the originating DB row so the asset doesn't reappear on refresh.
    //    For job-backed assets, delete the row entirely — the URL lives on the row
    //    itself (output / output_asset_url / output_url) and a null-update on a
    //    single field still leaves the asset visible elsewhere.
    if (asset.dbTable && asset.dbId) {
      const jobTables = new Set(["render_jobs", "generation_jobs", "lipsync_jobs"]);
      if (jobTables.has(asset.dbTable)) {
        const { error } = await supabase
          .from(asset.dbTable as any)
          .delete()
          .eq("id", asset.dbId);
        if (error) throw error;
      } else if (asset.dbField) {
        const { error } = await supabase
          .from(asset.dbTable as any)
          .update({ [asset.dbField]: null } as any)
          .eq("id", asset.dbId);
        if (error) throw error;
      }
    }

    // 4) Clear scene references that point at this URL so a reload of scenes
    //    can't resurrect the asset link.
    if (asset.url && user) {
      const fields = [
        "scene_image_url",
        "video_url",
        "lipsync_video_url",
        "enhanced_video_url",
        "segment_audio_url",
      ];
      await Promise.all(
        fields.map((f) => {
          const q: any = supabase.from("scenes");
          return q.update({ [f]: null }).eq("user_id", user.id).eq(f, asset.url);
        })
      );
    }
  };

  const handleDelete = async (asset: StorageAsset) => {
    setDeleting(true);
    try {
      await purgeAsset(asset);
      setAssets(prev => prev.filter(a => a.id !== asset.id));
      setSelected(prev => { const n = new Set(prev); n.delete(asset.id); return n; });
      toast.success(`Deleted: ${asset.name}`);
    } catch (err) {
      console.error("Delete failed:", err);
      toast.error(`Failed to delete: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    const toDelete = assets.filter(a => selected.has(a.id));
    let deleted = 0;
    const failedIds = new Set<string>();
    for (const asset of toDelete) {
      try {
        await purgeAsset(asset);
        deleted++;
      } catch (err) {
        failedIds.add(asset.id);
        console.error(`Failed to delete ${asset.name}:`, err);
      }
    }
    setAssets(prev => prev.filter(a => !(selected.has(a.id) && !failedIds.has(a.id))));
    setSelected(new Set(failedIds));
    setBulkDelete(false);
    setDeleting(false);
    if (deleted === toDelete.length) {
      toast.success(`Deleted ${deleted} assets`);
    } else {
      toast.warning(`Deleted ${deleted} of ${toDelete.length} — ${toDelete.length - deleted} failed`);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const selectAll = () => setSelected(new Set(filteredAssets.map(a => a.id)));
  const deselectAll = () => setSelected(new Set());

  // Mark assets as referenced or not
  const assetsWithRefs = useMemo(() => {
    return assets.map(a => {
      const isReferenced = !!(
        (a.url && referencedUrls.has(a.url)) ||
        (a.storagePath && referencedUrls.has(a.storagePath))
      );
      return { ...a, referenced: isReferenced };
    });
  }, [assets, referencedUrls]);

  // Filter & sort
  const filteredAssets = useMemo(() => {
    const now = Date.now();
    let list = filterType === "all" ? assetsWithRefs : assetsWithRefs.filter(a => a.type === filterType);

    // Cleanup mode: show only unreferenced assets
    if (cleanupMode) {
      list = list.filter(a => !a.referenced);
    }

    // Age filter
    if (ageFilter > 0) {
      const cutoff = now - ageFilter * 24 * 60 * 60 * 1000;
      list = list.filter(a => a.createdAt && new Date(a.createdAt).getTime() < cutoff);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        (a.projectName && a.projectName.toLowerCase().includes(q))
      );
    }

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date") {
        cmp = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      } else if (sortBy === "size") {
        cmp = (a.size || 0) - (b.size || 0);
      } else {
        cmp = a.name.localeCompare(b.name);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [assetsWithRefs, filterType, cleanupMode, ageFilter, searchQuery, sortBy, sortDir]);

  const toggleSort = (field: "date" | "size" | "name") => {
    if (sortBy === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDir(field === "name" ? "asc" : "desc");
    }
  };

  // Summary stats
  const totalSize = assets.reduce((sum, a) => sum + (a.size || 0), 0);
  const bySource = { supabase: 0, fal: 0, external: 0 };
  const byType = { image: 0, video: 0, audio: 0, other: 0 };
  const bySourceSize = { supabase: 0, fal: 0, external: 0 };
  assets.forEach(a => {
    bySource[a.source]++;
    byType[a.type]++;
    bySourceSize[a.source] += a.size || 0;
  });

  // Storage capacity (1 GB default for Supabase free tier)
  const STORAGE_LIMIT_BYTES = 1 * 1024 * 1024 * 1024; // 1 GB
  const usagePercent = Math.min((totalSize / STORAGE_LIMIT_BYTES) * 100, 100);
  const isWarning = usagePercent >= 70;
  const isCritical = usagePercent >= 90;
  const needsReminder = usagePercent >= 80;

  // Show a toast reminder once per session when storage exceeds 80%
  const reminderShownRef = useRef(false);
  useEffect(() => {
    if (!loading && needsReminder && !reminderShownRef.current && assets.length > 0) {
      reminderShownRef.current = true;
      const unreferencedCount = assetsWithRefs.filter(a => !a.referenced).length;
      toast.warning(
        `Storage is ${usagePercent.toFixed(0)}% full${unreferencedCount > 0 ? ` — ${unreferencedCount} orphaned files can be cleaned up` : ""}`,
        {
          duration: 8000,
          action: unreferencedCount > 0 ? {
            label: "Open Cleanup",
            onClick: () => { setExpanded(true); setCleanupMode(true); },
          } : undefined,
        }
      );
    }
  }, [loading, needsReminder, assets.length, usagePercent, assetsWithRefs]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-5"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold text-foreground">Storage Overview</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {assets.length} files · {formatBytes(totalSize)}
          </span>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Summary badges */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(bySource).filter(([, c]) => c > 0).map(([src, count]) => {
              const cfg = sourceLabels[src as StorageAsset["source"]];
              return (
                <span key={src} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${cfg.color}`}>
                  {cfg.label}: {count}
                </span>
              );
            })}
            {Object.entries(byType).filter(([, c]) => c > 0).map(([t, count]) => {
              const Icon = typeIcons[t as StorageAsset["type"]];
              return (
                <span key={t} className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
                  <Icon className="h-3 w-3" /> {t}: {count}
                </span>
              );
            })}
          </div>

          {/* Storage Capacity Monitor */}
          <div className={`rounded-lg border p-3 space-y-2 ${isCritical ? "border-destructive/50 bg-destructive/5" : isWarning ? "border-amber-500/50 bg-amber-500/5" : "border-border bg-muted/30"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {(isWarning || isCritical) && (
                  <AlertTriangle className={`h-4 w-4 ${isCritical ? "text-destructive" : "text-amber-500"}`} />
                )}
                <span className="text-xs font-medium text-foreground">
                  Storage Capacity
                </span>
              </div>
              <span className={`text-xs font-semibold ${isCritical ? "text-destructive" : isWarning ? "text-amber-500" : "text-muted-foreground"}`}>
                {formatBytes(totalSize)} / {formatBytes(STORAGE_LIMIT_BYTES)}
              </span>
            </div>
            <Progress
              value={usagePercent}
              className={`h-2 ${isCritical ? "[&>div]:bg-destructive" : isWarning ? "[&>div]:bg-amber-500" : ""}`}
            />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{usagePercent.toFixed(1)}% used</span>
              <span>{formatBytes(STORAGE_LIMIT_BYTES - totalSize)} remaining</span>
            </div>
            {isCritical && (
              <p className="text-[11px] text-destructive font-medium">
                ⚠️ Storage is almost full! Delete unused files to free up space.
              </p>
            )}
            {isWarning && !isCritical && (
              <p className="text-[11px] text-amber-500">
                Storage is filling up. Consider cleaning up old assets.
              </p>
            )}
            {/* Breakdown by source */}
            <div className="flex gap-3 pt-1">
              {Object.entries(bySourceSize).filter(([, s]) => s > 0).map(([src, size]) => {
                const cfg = sourceLabels[src as StorageAsset["source"]];
                return (
                  <span key={src} className="text-[10px] text-muted-foreground">
                    {cfg.label}: {formatBytes(size)}
                  </span>
                );
              })}
            </div>
          </div>


          {/* Action bar */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {selected.size > 0 ? (
                <>
                  <span className="text-xs text-muted-foreground">{selected.size} selected</span>
                  <Button variant="ghost" size="sm" onClick={deselectAll} className="text-xs h-7">Clear</Button>
                  <Button
                    variant="destructive" size="sm"
                    className="text-xs h-7 gap-1"
                    onClick={() => setBulkDelete(true)}
                  >
                    <Trash2 className="h-3 w-3" /> Delete Selected
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs h-7">Select All</Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={cleanupMode ? "default" : "outline"}
                size="sm"
                onClick={() => { setCleanupMode(!cleanupMode); setSelected(new Set()); setAgeFilter(0); }}
                className="text-xs h-7 gap-1"
              >
                <Sparkles className="h-3 w-3" /> {cleanupMode ? "Exit Cleanup" : "Cleanup"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { loadAssets(); loadReferences(); }} disabled={loading} className="gap-1 text-xs h-7">
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
          </div>

          {/* Cleanup panel */}
          {cleanupMode && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium text-foreground">
                    Cleanup Mode — {filteredAssets.length} unreferenced file{filteredAssets.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {assetsWithRefs.filter(a => a.referenced).length} files still in use
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                These files are not linked to any active scene, character, or project. They are safe to delete.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                {AGE_FILTERS.map(af => (
                  <button
                    key={af.days}
                    onClick={() => setAgeFilter(af.days)}
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${ageFilter === af.days ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                  >
                    {af.label}
                  </button>
                ))}
                {filteredAssets.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="text-xs h-6 gap-1 ml-auto"
                    onClick={() => { selectAll(); setBulkDelete(true); }}
                  >
                    <Trash2 className="h-3 w-3" /> Delete All {filteredAssets.length} Orphans
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search by filename or project…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-border bg-background pl-8 pr-8 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter & Sort Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Filter className="h-3 w-3 text-muted-foreground" />
              {(["all", "image", "video", "audio", "other"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${filterType === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                >
                  {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
                  {t !== "all" && ` (${byType[t]})`}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
              {(["date", "size", "name"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => toggleSort(s)}
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${sortBy === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)} {sortBy === s ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </button>
              ))}
            </div>
          </div>

          {/* Asset list */}
          {loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading storage files…</div>
          ) : filteredAssets.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {assets.length === 0 ? "No stored assets found" : `No ${filterType} assets found`}
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto space-y-1 pr-1">
              {filteredAssets.map((asset) => {
                const Icon = typeIcons[asset.type];
                const srcCfg = sourceLabels[asset.source];
                const dateObj = asset.createdAt ? new Date(asset.createdAt) : null;
                const dateStr = dateObj
                  ? dateObj.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                  : "—";
                const timeStr = dateObj
                  ? dateObj.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                  : "";
                return (
                  <div
                    key={asset.id}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-muted/50 ${selected.has(asset.id) ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}
                  >
                    <Checkbox
                      checked={selected.has(asset.id)}
                      onCheckedChange={() => toggleSelect(asset.id)}
                      className="shrink-0"
                    />
                    {/* Thumbnail */}
                    {asset.thumbnailUrl && asset.type === "image" ? (
                      <div className="h-10 w-10 shrink-0 rounded-md overflow-hidden bg-muted border border-border">
                        <img
                          src={asset.thumbnailUrl}
                          alt={asset.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      </div>
                    ) : asset.thumbnailUrl && asset.type === "video" ? (
                      <div className="h-10 w-10 shrink-0 rounded-md overflow-hidden bg-muted border border-border relative">
                        <video
                          src={asset.thumbnailUrl}
                          className="h-full w-full object-cover"
                          muted
                          preload="metadata"
                          onLoadedData={(e) => { (e.target as HTMLVideoElement).currentTime = 0.5; }}
                          onError={(e) => { (e.target as HTMLVideoElement).style.display = "none"; }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <Video className="h-3.5 w-3.5 text-white drop-shadow" />
                        </div>
                      </div>
                    ) : (
                      <div className="h-10 w-10 shrink-0 rounded-md bg-muted border border-border flex items-center justify-center">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">{asset.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={`inline-flex items-center rounded px-1.5 py-0 text-[9px] font-medium ${srcCfg.color}`}>
                          {srcCfg.label}
                        </span>
                        {!asset.referenced && referencedUrls.size > 0 && (
                          <span className="inline-flex items-center rounded px-1.5 py-0 text-[9px] font-medium bg-destructive/15 text-destructive">
                            orphan
                          </span>
                        )}
                        {asset.projectName && (
                          <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{asset.projectName}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground">{formatBytes(asset.size)}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {dateStr} {timeStr && `· ${timeStr}`}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {asset.url && (
                        <a
                          href={asset.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Open in new tab"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => setDeleteTarget(asset)}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Single delete dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Asset</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete <strong>"{deleteTarget?.name}"</strong> from {sourceLabels[deleteTarget?.source || "supabase"].label}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete dialog */}
      <AlertDialog open={bulkDelete} onOpenChange={(open) => !open && setBulkDelete(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} Assets</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selected.size} selected assets from their respective storage providers. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : `Delete ${selected.size} Assets`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
