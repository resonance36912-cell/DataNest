// Shows the top 1–3 ranked source images the pipeline will pass to the
// generator as referenceImages[], with the heuristic reasons behind each
// score so the user can sanity-check before generating.
import { motion } from "framer-motion";
import { Crown, Image as ImageIcon, Camera, Info } from "lucide-react";
import type { RankedSourceImage } from "@/lib/sourceBrief";

interface Props {
  ranked: RankedSourceImage[];
  uploadOverride?: boolean; // user uploaded a file → it takes the hero slot
}

const sourceIcon = {
  logo: Crown,
  screenshot: Camera,
  scraped: ImageIcon,
} as const;

const sourceLabel = {
  logo: "Brand logo",
  screenshot: "Hero screenshot",
  scraped: "Scraped image",
} as const;

export default function ReferenceImagesPanel({ ranked, uploadOverride }: Props) {
  if (!ranked?.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-white/10 bg-background/40 backdrop-blur p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Top reference images
          </p>
          <p className="text-sm font-medium text-foreground/90">
            These are passed to the model as wording &amp; layout cues
          </p>
        </div>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Info className="w-3 h-3" />
          Heuristic scoring
        </span>
      </div>

      {uploadOverride && (
        <p className="text-[11px] text-amber-300/90 border border-amber-400/20 bg-amber-500/10 rounded px-2 py-1.5">
          Your uploaded file will be used as the literal hero. References below
          inform brand identity, colour and mood only.
        </p>
      )}

      <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ranked.map((item, i) => {
          const Icon = sourceIcon[item.source];
          return (
            <li
              key={item.url}
              className="rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col"
            >
              <div className="relative aspect-video bg-black/40">
                <img
                  src={item.url}
                  alt={`Reference ${i + 1}`}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
                  }}
                />
                <span className="absolute top-1.5 left-1.5 text-[10px] font-mono bg-black/70 text-white px-1.5 py-0.5 rounded">
                  #{i + 1}
                </span>
                <span className="absolute top-1.5 right-1.5 text-[10px] font-mono bg-primary/80 text-primary-foreground px-1.5 py-0.5 rounded">
                  {item.score}
                </span>
              </div>
              <div className="p-2.5 space-y-1.5 flex-1">
                <div className="flex items-center gap-1.5 text-[11px] text-foreground/80">
                  <Icon className="w-3 h-3" />
                  {sourceLabel[item.source]}
                </div>
                <ul className="space-y-0.5">
                  {item.reasons.map((r, idx) => (
                    <li
                      key={idx}
                      className="text-[10.5px] text-muted-foreground leading-snug"
                    >
                      • {r}
                    </li>
                  ))}
                </ul>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-[10px] text-primary/80 hover:text-primary truncate"
                  title={item.url}
                >
                  {item.url.replace(/^https?:\/\//, "")}
                </a>
              </div>
            </li>
          );
        })}
      </ol>
    </motion.div>
  );
}
