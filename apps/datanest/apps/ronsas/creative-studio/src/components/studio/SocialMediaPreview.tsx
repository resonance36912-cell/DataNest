import { motion } from "framer-motion";
import { Instagram, Facebook, Twitter, Linkedin, Youtube, Copy, Hash, AtSign, Check, Music2, Pin, MessageCircle, Send, Ghost, MessageSquare, Users, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { SocialMediaConfig } from "./SocialMediaEditor";
import type { CreativeBrief } from "@/pages/Studio";

interface SocialMediaPreviewProps {
  config: SocialMediaConfig;
  brief: CreativeBrief | null;
  generatedImage?: string | null;
}

const platformMeta: Record<string, { icon: any; label: string; color: string; shareUrl: (text: string, handle?: string) => string }> = {
  instagram: {
    icon: Instagram,
    label: "Instagram",
    color: "hsl(330 70% 55%)",
    shareUrl: (_t, handle) => (handle ? `https://www.instagram.com/${handle}/` : "https://www.instagram.com/"),
  },
  facebook: {
    icon: Facebook,
    label: "Facebook",
    color: "hsl(220 70% 55%)",
    shareUrl: (text) => `https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(text)}`,
  },
  twitter: {
    icon: Twitter,
    label: "X / Twitter",
    color: "hsl(200 90% 50%)",
    shareUrl: (text) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
  },
  linkedin: {
    icon: Linkedin,
    label: "LinkedIn",
    color: "hsl(210 80% 45%)",
    shareUrl: (text) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent("https://resonance.studio")}&summary=${encodeURIComponent(text)}`,
  },
  youtube: {
    icon: Youtube,
    label: "YouTube",
    color: "hsl(0 70% 50%)",
    shareUrl: (_t, handle) => (handle ? `https://www.youtube.com/@${handle}` : "https://studio.youtube.com/"),
  },
  tiktok: {
    icon: Music2,
    label: "TikTok",
    color: "hsl(340 80% 55%)",
    shareUrl: (_t, handle) => (handle ? `https://www.tiktok.com/@${handle}` : "https://www.tiktok.com/upload"),
  },
  pinterest: {
    icon: Pin,
    label: "Pinterest",
    color: "hsl(0 75% 45%)",
    shareUrl: (text) => `https://pinterest.com/pin/create/button/?description=${encodeURIComponent(text)}`,
  },
  threads: {
    icon: MessageSquare,
    label: "Threads",
    color: "hsl(0 0% 95%)",
    shareUrl: (text, handle) => `https://www.threads.net/intent/post?text=${encodeURIComponent(text)}${handle ? `&handle=${handle}` : ""}`,
  },
  whatsapp: {
    icon: MessageCircle,
    label: "WhatsApp",
    color: "hsl(142 70% 45%)",
    shareUrl: (text) => `https://wa.me/?text=${encodeURIComponent(text)}`,
  },
  telegram: {
    icon: Send,
    label: "Telegram",
    color: "hsl(200 80% 55%)",
    shareUrl: (text) => `https://t.me/share/url?url=${encodeURIComponent("https://resonance.studio")}&text=${encodeURIComponent(text)}`,
  },
  reddit: {
    icon: Users,
    label: "Reddit",
    color: "hsl(16 100% 50%)",
    shareUrl: (text) => `https://www.reddit.com/submit?title=${encodeURIComponent(text)}`,
  },
  snapchat: {
    icon: Ghost,
    label: "Snapchat",
    color: "hsl(54 100% 55%)",
    shareUrl: (_t, handle) => (handle ? `https://www.snapchat.com/add/${handle}` : "https://www.snapchat.com/"),
  },
};

const SocialMediaPreview = ({ config, brief, generatedImage }: SocialMediaPreviewProps) => {
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const buildCaption = () => {
    const parts: string[] = [];

    // Caption text
    if (config.caption) {
      parts.push(config.caption);
    } else if (brief) {
      parts.push(brief.headline);
      if (brief.subheadline) parts.push(brief.subheadline);
      if (brief.callToAction) parts.push(`\n${brief.callToAction}`);
    }

    // Mentions
    if (config.mentions.length > 0) {
      parts.push("\n" + config.mentions.map((m) => `@${m}`).join(" "));
    }

    // Hashtags
    if (config.hashtags.length > 0) {
      parts.push("\n" + config.hashtags.map((h) => `#${h}`).join(" "));
    }

    // Handle
    if (config.handle) {
      parts.push(`\n📍 @${config.handle}`);
    }

    return parts.join("\n");
  };

  const fullCaption = buildCaption();
  const hashtagsText = config.hashtags.map((h) => `#${h}`).join(" ");
  const mentionsText = config.mentions.map((m) => `@${m}`).join(" ");

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(label);
    toast({ title: "Copied!", description: `${label} copied to clipboard` });
    setTimeout(() => setCopiedField(null), 2000);
  };

  const CopyButton = ({ text, label }: { text: string; label: string }) => (
    <button
      onClick={() => copyToClipboard(text, label)}
      className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
      title={`Copy ${label}`}
    >
      {copiedField === label ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Post Preview Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="studio-card overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-border/50">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
            <AtSign className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {config.handle ? `@${config.handle}` : brief?.brand || "Your Brand"}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {config.postType} • {config.platforms.map((p) => platformMeta[p]?.label).join(", ")}
            </p>
          </div>
          <span className="text-[10px] text-muted-foreground border border-border rounded-full px-2 py-0.5">
            Preview
          </span>
        </div>

        {/* Image */}
        {generatedImage && (
          <div className="aspect-square bg-muted relative overflow-hidden max-h-[280px]">
            <img src={generatedImage} alt="Post preview" className="w-full h-full object-cover" />
          </div>
        )}

        {/* Caption */}
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed flex-1">
              {fullCaption || "Your caption will appear here..."}
            </p>
            {fullCaption && <CopyButton text={fullCaption} label="Caption" />}
          </div>

          {/* Hashtags row */}
          {config.hashtags.length > 0 && (
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/30">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <Hash className="w-3.5 h-3.5 text-primary shrink-0" />
                <p className="text-xs text-primary truncate">{hashtagsText}</p>
              </div>
              <CopyButton text={hashtagsText} label="Hashtags" />
            </div>
          )}

          {/* Mentions row */}
          {config.mentions.length > 0 && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <AtSign className="w-3.5 h-3.5 text-accent shrink-0" />
                <p className="text-xs text-accent truncate">{mentionsText}</p>
              </div>
              <CopyButton text={mentionsText} label="Mentions" />
            </div>
          )}
        </div>
      </motion.div>

      {/* Share / Post Buttons */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 block">Share to Platforms</label>
        <div className="grid grid-cols-1 gap-2">
          {config.platforms.map((pid) => {
            const meta = platformMeta[pid];
            if (!meta) return null;
            const Icon = meta.icon;
            const platformLinkLabel = `${meta.label} Link`;
            const shareUrl = meta.shareUrl(fullCaption, config.handle || undefined);
            return (
              <div
                key={pid}
                className="flex items-stretch gap-1.5 rounded-lg border border-border bg-card overflow-hidden"
              >
                <motion.button
                  type="button"
                  onClick={() => copyToClipboard(shareUrl, platformLinkLabel)}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary transition-colors group text-left flex-1 min-w-0"
                  title={`Copy ${meta.label} link`}
                >
                  <Icon className="w-4 h-4 shrink-0" style={{ color: meta.color }} />
                  <span className="text-sm font-medium text-foreground flex-1 truncate">
                    {meta.label}{config.handle ? ` · @${config.handle}` : ""}
                  </span>
                  {copiedField === platformLinkLabel ? (
                    <Check className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  )}
                </motion.button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 border-l border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  title={`Open ${meta.label} in new tab`}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-medium">Open</span>
                </a>
              </div>
            );
          })}
        </div>
      </div>

      {/* Copy All Button */}
      <button
        onClick={() => copyToClipboard(fullCaption, "Full Post")}
        className="w-full studio-gradient-bg text-primary-foreground font-semibold text-sm py-2.5 rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
      >
        {copiedField === "Full Post" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        Copy Full Post Content
      </button>
    </div>
  );
};

export default SocialMediaPreview;
