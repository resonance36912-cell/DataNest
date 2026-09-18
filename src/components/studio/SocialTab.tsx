import { motion } from "framer-motion";
import { Upload, X } from "lucide-react";
import SocialMediaPreview from "./SocialMediaPreview";
import SocialMediaEditor, { type SocialMediaConfig } from "./SocialMediaEditor";
import type { CreativeBrief } from "@/pages/Studio";

interface LibraryItem {
  type: string;
  url: string;
  label: string;
}

interface SocialTabProps {
  socialConfig: SocialMediaConfig;
  onSocialConfigChange: (cfg: SocialMediaConfig) => void;
  brief: CreativeBrief | null;
  generatedLibrary: LibraryItem[];
  selectedSocialContent: string | null;
  onSelectedSocialContentChange: (url: string | null) => void;
  socialUploadFiles: File[];
  onSocialUploadFilesChange: (files: File[]) => void;
  socialUploadPreview: string | null;
  socialImageSource: string | null;
}

const SocialTab = ({
  socialConfig,
  onSocialConfigChange,
  brief,
  generatedLibrary,
  selectedSocialContent,
  onSelectedSocialContentChange,
  socialUploadFiles,
  onSocialUploadFilesChange,
  socialUploadPreview,
  socialImageSource,
}: SocialTabProps) => {
  return (
    <motion.div
      key="social"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="flex-1 flex flex-col md:flex-row overflow-hidden overflow-y-auto md:overflow-hidden"
    >
      {/* Social config sidebar */}
      <div className="w-full md:w-[380px] md:shrink-0 border-b md:border-b-0 md:border-r border-border/50 md:overflow-y-auto scrollbar-thin bg-card">
        <div className="p-4 sm:p-5 space-y-5">
          {/* Upload for social */}
          <div>
            <h3 className="font-display text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Upload Content
            </h3>
            <label className="studio-card flex flex-col items-center gap-2 p-6 cursor-pointer hover:!bg-studio-surface-hover transition-colors">
              <input
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    onSocialUploadFilesChange(Array.from(e.target.files));
                    onSelectedSocialContentChange(null);
                  }
                }}
              />
              <Upload className="w-5 h-5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Upload image or video to post</p>
            </label>
            {socialUploadPreview && (
              <div className="mt-2 relative">
                <img
                  src={socialUploadPreview}
                  alt="Uploaded social media file preview"
                  className="w-full rounded-lg border border-border"
                  loading="lazy"
                  decoding="async"
                />
                <button
                  type="button"
                  aria-label="Remove uploaded file"
                  onClick={() => {
                    onSocialUploadFilesChange([]);
                  }}
                  className="absolute top-1 right-1 p-1 rounded-full bg-background/80 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Cross-post from library */}
          {generatedLibrary.length > 0 && (
            <div>
              <h3 className="font-display text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Cross-Post from Library
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {generatedLibrary.map((item, i) => (
                  <button
                    key={`${item.url}-${i}`}
                    onClick={() => {
                      onSelectedSocialContentChange(item.url);
                      onSocialUploadFilesChange([]);
                    }}
                    className={`studio-card overflow-hidden transition-all ${
                      selectedSocialContent === item.url
                        ? "!border-primary ring-1 ring-primary/30"
                        : "hover:!bg-studio-surface-hover"
                    }`}
                  >
                    <img
                      src={item.url}
                      alt={item.label}
                      className="w-full aspect-square object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    <p className="text-[10px] text-muted-foreground p-1.5 truncate capitalize">{item.label}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="font-display text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Social Media Details
            </h3>
            <SocialMediaEditor
              config={socialConfig}
              onChange={onSocialConfigChange}
              brand={brief?.brand}
              headline={brief?.headline}
              uploadedFiles={socialUploadFiles}
            />
          </div>
        </div>
      </div>

      {/* Social preview */}
      <div className="flex-1 md:overflow-y-auto scrollbar-thin p-4 sm:p-5">
        <div className="max-w-lg mx-auto">
          <h3 className="font-display text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Post Preview
          </h3>
          <SocialMediaPreview
            config={socialConfig}
            brief={brief}
            generatedImage={socialImageSource}
          />
        </div>
      </div>
    </motion.div>
  );
};

export default SocialTab;
