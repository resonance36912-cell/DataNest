import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Instagram, Facebook, Twitter, Linkedin, Youtube, Hash, AtSign, Plus, X, Sparkles, Loader2, Link2, Music2, Pin, MessageCircle, Send, Ghost, MessageSquare, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const platforms = [
  { id: "instagram", label: "Instagram", icon: Instagram, color: "hsl(330 70% 55%)" },
  { id: "facebook", label: "Facebook", icon: Facebook, color: "hsl(220 70% 55%)" },
  { id: "twitter", label: "X / Twitter", icon: Twitter, color: "hsl(200 90% 50%)" },
  { id: "linkedin", label: "LinkedIn", icon: Linkedin, color: "hsl(210 80% 45%)" },
  { id: "youtube", label: "YouTube", icon: Youtube, color: "hsl(0 70% 50%)" },
  { id: "tiktok", label: "TikTok", icon: Music2, color: "hsl(340 80% 55%)" },
  { id: "pinterest", label: "Pinterest", icon: Pin, color: "hsl(0 75% 45%)" },
  { id: "threads", label: "Threads", icon: MessageSquare, color: "hsl(0 0% 95%)" },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle, color: "hsl(142 70% 45%)" },
  { id: "telegram", label: "Telegram", icon: Send, color: "hsl(200 80% 55%)" },
  { id: "reddit", label: "Reddit", icon: Users, color: "hsl(16 100% 50%)" },
  { id: "snapchat", label: "Snapchat", icon: Ghost, color: "hsl(54 100% 55%)" },
];

const ACCOUNTS_STORAGE_KEY = "resonance:social-accounts:v1";

type AccountMap = Record<string, string[]>;

const loadAccounts = (): AccountMap => {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
};

const saveAccounts = (map: AccountMap) => {
  try {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
};

// Re-export from the lightweight config module so existing imports keep working
// while Studio.tsx can pull the default without bundling this whole editor.
export { DEFAULT_SOCIAL_CONFIG, type SocialMediaConfig } from "./socialConfig";
import type { SocialMediaConfig } from "./socialConfig";

interface SocialMediaEditorProps {
  config: SocialMediaConfig;
  onChange: (config: SocialMediaConfig) => void;
  brand?: string;
  headline?: string;
  uploadedFiles?: File[];
}

const postTypes = [
  { id: "post", label: "Post" },
  { id: "reel", label: "Reel" },
  { id: "story", label: "Story" },
  { id: "carousel", label: "Carousel" },
];

const SocialMediaEditor = ({ config, onChange, brand, headline, uploadedFiles }: SocialMediaEditorProps) => {
  const { toast } = useToast();
  const [hashtagInput, setHashtagInput] = useState("");
  const [mentionInput, setMentionInput] = useState("");
  const [isGeneratingTags, setIsGeneratingTags] = useState(false);
  const [socialUrl, setSocialUrl] = useState("");

  const togglePlatform = (id: string) => {
    const next = config.platforms.includes(id)
      ? config.platforms.filter((p) => p !== id)
      : [...config.platforms, id];
    onChange({ ...config, platforms: next.length ? next : config.platforms });
  };

  const addHashtag = () => {
    const tag = hashtagInput.trim().replace(/^#/, "");
    if (tag && !config.hashtags.includes(tag)) {
      onChange({ ...config, hashtags: [...config.hashtags, tag] });
    }
    setHashtagInput("");
  };

  const removeHashtag = (tag: string) => {
    onChange({ ...config, hashtags: config.hashtags.filter((h) => h !== tag) });
  };

  const addMention = () => {
    const mention = mentionInput.trim().replace(/^@/, "");
    if (mention && !config.mentions.includes(mention)) {
      onChange({ ...config, mentions: [...config.mentions, mention] });
    }
    setMentionInput("");
  };

  const [accountsMap, setAccountsMap] = useState<AccountMap>(() => loadAccounts());

  useEffect(() => {
    saveAccounts(accountsMap);
  }, [accountsMap]);

  const addAccountToPlatform = (platformId: string, handle: string) => {
    const clean = handle.trim().replace(/^@/, "");
    if (!clean) return;
    setAccountsMap((prev) => {
      const existing = prev[platformId] || [];
      if (existing.includes(clean)) return prev;
      return { ...prev, [platformId]: [...existing, clean] };
    });
  };

  const removeAccountFromPlatform = (platformId: string, handle: string) => {
    setAccountsMap((prev) => ({
      ...prev,
      [platformId]: (prev[platformId] || []).filter((h) => h !== handle),
    }));
  };

  const removeMention = (mention: string) => {
    onChange({ ...config, mentions: config.mentions.filter((m) => m !== mention) });
  };


  const handleAIGenerate = async () => {
    console.log("[social-tags] click");
    setIsGeneratingTags(true);
    const safetyTimer = setTimeout(() => {
      setIsGeneratingTags(false);
      toast({
        title: "Generation timed out",
        description: "The server took too long. Please try again.",
        variant: "destructive",
      });
    }, 60000);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        throw new Error("You are signed out. Please sign in again.");
      }

      const fileNames = uploadedFiles?.map(f => f.name).join(", ") || "";
      const payload = {
        caption: config.caption,
        brand: brand || config.handle,
        headline,
        platforms: config.platforms,
        url: socialUrl.trim() || undefined,
        sourceFiles: fileNames || undefined,
      };

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-social-tags`;
      console.log("[social-tags] POST", url);
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(payload),
      });

      const data = await resp.json().catch(() => ({}));
      console.log("[social-tags] status", resp.status, data);
      if (!resp.ok || !data?.success) {
        throw new Error(data?.error || `Request failed (${resp.status})`);
      }

      const newHashtags = (data.hashtags as string[]).filter((t: string) => !config.hashtags.includes(t));
      const newMentions = (data.mentions as string[]).filter((m: string) => !config.mentions.includes(m));

      onChange({
        ...config,
        hashtags: [...config.hashtags, ...newHashtags],
        mentions: [...config.mentions, ...newMentions],
      });

      toast({ title: "Tags generated!", description: `Added ${newHashtags.length} hashtags & ${newMentions.length} mentions` });
    } catch (err: any) {
      console.error("[social-tags] error:", err);
      toast({ title: "Generation failed", description: err?.message || "Please try again", variant: "destructive" });
    } finally {
      clearTimeout(safetyTimer);
      setIsGeneratingTags(false);
    }
  };


  return (
    <div className="space-y-4">
      {/* Platform selection */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 block">Platforms</label>
        <div className="flex flex-wrap gap-1.5">
          {platforms.map((p) => {
            const isActive = config.platforms.includes(p.id);
            const Icon = p.icon;
            return (
              <motion.button
                key={p.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => togglePlatform(p.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all border ${
                  isActive
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="w-3.5 h-3.5" style={isActive ? { color: p.color } : undefined} />
                {p.label}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Post type */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 block">Post Type</label>
        <div className="grid grid-cols-4 gap-1.5">
          {postTypes.map((t) => (
            <button
              key={t.id}
              onClick={() => onChange({ ...config, postType: t.id as SocialMediaConfig["postType"] })}
              className={`text-xs py-1.5 rounded-md font-medium transition-all border ${
                config.postType === t.id
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Handle */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Your Handle</label>
        <div className="relative">
          <AtSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={config.handle}
            onChange={(e) => onChange({ ...config, handle: e.target.value.replace(/^@/, "") })}
            placeholder="yourhandle"
            className="w-full rounded-md border border-border bg-card pl-7 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>

      {/* Saved Accounts per active platform */}
      {config.platforms.length > 0 && (
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Saved Accounts</label>
          <div className="space-y-2">
            {config.platforms.map((pid) => {
              const platform = platforms.find((p) => p.id === pid);
              if (!platform) return null;
              const Icon = platform.icon;
              const list = accountsMap[pid] || [];
              return (
                <div key={pid} className="rounded-md border border-border bg-card p-2 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5" style={{ color: platform.color }} />
                    <span className="text-[11px] font-medium text-foreground">{platform.label}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {list.length === 0 && (
                      <span className="text-[10px] text-muted-foreground">No accounts saved</span>
                    )}
                    {list.map((h) => {
                      const isActive = config.handle === h;
                      return (
                        <span
                          key={h}
                          className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                            isActive
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border bg-background text-muted-foreground"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onChange({ ...config, handle: h })}
                            className="hover:text-foreground"
                            title="Use this account"
                          >
                            @{h}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeAccountFromPlatform(pid, h)}
                            className="hover:text-foreground"
                            title="Remove"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        const handle = window.prompt(`Add ${platform.label} account (without @)`);
                        if (handle) addAccountToPlatform(pid, handle);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Caption */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Caption / Description</label>
        <textarea
          value={config.caption}
          onChange={(e) => onChange({ ...config, caption: e.target.value })}
          placeholder="Write your caption or let AI generate one..."
          rows={3}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors resize-none"
        />
      </div>

      {/* URL for AI context */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Reference URL (for AI context)</label>
        <div className="relative">
          <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="url"
            value={socialUrl}
            onChange={(e) => setSocialUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full rounded-md border border-border bg-card pl-7 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">AI will scrape this URL to generate more accurate tags</p>
      </div>

      {/* AI Auto-Generate Button */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleAIGenerate}
        disabled={isGeneratingTags}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm studio-gradient-bg text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {isGeneratingTags ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
        {isGeneratingTags ? "Generating..." : "AI Auto-Generate Hashtags & Mentions"}
      </motion.button>

      {/* Hashtags */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Hashtags</label>
        <div className="flex gap-1.5 mb-2">
          <div className="relative flex-1">
            <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={hashtagInput}
              onChange={(e) => setHashtagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addHashtag())}
              placeholder="addhashtag"
              className="w-full rounded-md border border-border bg-card pl-7 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            />
          </div>
          <button onClick={addHashtag} className="p-2 rounded-md border border-border bg-card hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {config.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {config.hashtags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                #{tag}
                <button onClick={() => removeHashtag(tag)} className="hover:text-foreground"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Mentions */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Mentions</label>
        <div className="flex gap-1.5 mb-2">
          <div className="relative flex-1">
            <AtSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={mentionInput}
              onChange={(e) => setMentionInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMention())}
              placeholder="mention"
              className="w-full rounded-md border border-border bg-card pl-7 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            />
          </div>
          <button onClick={addMention} className="p-2 rounded-md border border-border bg-card hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {config.mentions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {config.mentions.map((mention) => (
              <span key={mention} className="inline-flex items-center gap-1 text-[11px] bg-accent/10 text-accent px-2 py-0.5 rounded-full">
                @{mention}
                <button onClick={() => removeMention(mention)} className="hover:text-foreground"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SocialMediaEditor;
