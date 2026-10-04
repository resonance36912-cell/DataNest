import { motion } from "framer-motion";
import {
  Upload, Film, Users, Target,
  Layers, ShieldCheck, DollarSign, Paintbrush, Video,
  Lock
} from "lucide-react";
import Layout from "@/components/Layout";
import { SeoHead } from "@/components/SeoHead";

const sections = [
  {
    icon: Target,
    title: "What Is Resonance SyncVision?",
    content:
      "Resonance SyncVision is an AI-powered music video pre-production platform. Upload a track, let AI analyze every beat and lyric, design your character, and generate production-ready scene storyboards — all in one workflow. It takes your audio or video file — MP3, WAV, or MP4 — and transforms it into a complete cinematic storyboard with character designs, scene prompts, and exportable assets.",
  },
  {
    icon: Layers,
    title: "The Workflow",
    content:
      "Our guided six-step workflow takes you from raw audio to production-ready assets:\n\n1. **Upload** your MP3, WAV, or MP4 file with progress tracking and validation.\n2. **Analyze** — AI transcribes lyrics, detects BPM, tempo feel, key instruments, mood, and energy.\n3. **Character Builder** — Upload a reference image or generate a front-facing character with AI. Customize every detail.\n4. **Storyboard** — AI generates scene-by-scene prompts aligned to lyrics, emotion, pacing, and BPM. Videos are generated with **WAN 2.5** with native audio support.\n5. **Assembly** — Arrange scenes, add transitions (crossfade, wipe, fade), text overlays, filters, and audio enhancements. Upload a full audio track for synchronized playback.\n6. **Export** — Download storyboard JSON, character specs, SRT/VTT subtitles, run reports, and other project assets. **Final video merge** (compiling all scenes into one rendered MP4) is included during the free-access promotion.",
  },
  {
    icon: Lock,
    title: "Free Access Promotion",
    content:
      "Sync Vision is temporarily providing full product access at no charge while Resonance measures real provider usage, infrastructure demand, storage, rendering, and support cost. No card, pack, subscription, or checkout is required during the promotion.\n\n**What is included:**\n• **Full workflow access** — Upload, analyze, build characters, storyboard, assemble, render, and export under promotional access.\n• **No payment required** — Commercial feature gates and new purchases are paused for the promotion.\n• **Measured usage** — Provider estimates and operating telemetry remain active so future pricing can be based on evidence rather than assumptions.\n• **Sign-in for continuity** — Sign in where requested so projects persist and usage can be attributed accurately.\n• **Future pricing** — Any commercial relaunch will be communicated before new charges are introduced.",
  },
  {
    icon: Upload,
    title: "Supported File Types",
    content:
      "Upload MP3, WAV, or MP4 files. We extract audio automatically from video files. Files are stored securely and processed through our analysis pipeline.",
  },
  {
    icon: Paintbrush,
    title: "Character Creation",
    content:
      "Design your main character with full control over gender, age range, ethnicity, hairstyle, facial features, outfit, accessories, and personality vibe. Upload a reference image or let AI generate concepts. Characters are generated front-facing for optimal video generation. Choose between animated (Pixar/Disney style) or photorealistic styles. Review and confirm before proceeding — generating a new character automatically clears downstream scenes and videos for consistency.",
  },
  {
    icon: Film,
    title: "Scene Generation & Storyboard",
    content:
      "Each scene card includes lyric segment, time range, mood, location, camera style, action description, and a visual prompt. Edit, reorder, duplicate, regenerate, or delete any scene. Videos are generated using **WAN 2.5** — a 10-second audio-synced video model that produces high-quality clips with embedded audio from your track.\n\n**Key features:**\n• **Audio-synced generation** — each scene receives its own 10-second audio segment for natural performance timing.\n• **Character consistency** — front-facing reference images maintain identity across scenes.\n• **Batch generation** — generate multiple scenes in parallel for faster workflows.\n• **Star ratings & auto-learning** — rate outputs to trigger AI regeneration with feedback-driven optimization.",
  },
  {
    icon: Video,
    title: "Assembly & Preview",
    content:
      "The Assembly step lets you arrange scenes into a final timeline with:\n\n• **Drag-and-drop reordering** — organize your visual narrative.\n• **Transitions** — Cut, Crossfade, Wipe, Fade In/Out between scenes.\n• **Full audio track** — upload your master audio and auto-align scenes to detected peaks.\n• **Real-time preview** — Play All with dual-layer video engine for smooth transitions.\n• **Karaoke lyrics overlay** — see transcribed lyrics synchronized during playback.\n• **Text overlays & filters** — add subtitles, title cards, and visual effects.\n• **Audio enhancement** — EQ, compression, and reverb controls.",
  },
  {
    icon: ShieldCheck,
    title: "Accuracy Verification",
    content:
      "Our multi-pass verification pipeline runs three passes on every analysis:\n\n• **Pass 1** — Primary transcription and music analysis.\n• **Pass 2** — Secondary verification and cross-check.\n• **Pass 3** — Confidence scoring and flagging uncertain results.\n\nEvery result shows confidence indicators. When confidence is low, accuracy is prioritized over speed. You can edit any value before proceeding.",
  },
  {
    icon: DollarSign,
    title: "Quality & Cost Efficiency",
    content:
      "Smart routing uses lower-cost internal processing where quality is sufficient, escalating to premium external APIs only when needed. The **WAN 2.5** model provides high-quality 10-second video generation with integrated audio at competitive cost. The modular architecture means providers can be swapped without changing the workflow.",
  },
  {
    icon: Users,
    title: "Who Is It For?",
    content:
      "Resonance SyncVision is built for musicians, AI creators, storytellers, music video planners, content studios, and creative agencies. Whether you're an independent artist planning your next visual or a studio producing at scale, the platform adapts to your workflow.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function About() {
  return (
    <Layout>
      <SeoHead
        title="About Sync Vision — Cinematic AI Music Videos"
        description="How Sync Vision turns songs into cinematic AI music video storyboards, scene videos, vocal-sync clips, karaoke captions and exports."
        path="/about"
      />
      <div className="container max-w-4xl py-16 lg:py-24">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-16 text-center">
          <h1 className="text-4xl font-bold lg:text-5xl">
            About <span className="gradient-text">Resonance SyncVision</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Everything you need to know about the platform
          </p>
        </motion.div>

        <div className="space-y-12">
          {sections.map((s) => (
            <motion.div
              key={s.title}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="glass-card p-8"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <s.icon className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-bold">{s.title}</h2>
              </div>
              <div className="prose prose-sm prose-invert max-w-none text-muted-foreground leading-relaxed whitespace-pre-line">
                {s.content.split("\n").map((line, li) => (
                  <p key={li} className={line.startsWith("•") || line.match(/^\d\./) ? "ml-4" : ""}>
                    {line.split(/(\*\*.*?\*\*)/).map((part, pi) =>
                      part.startsWith("**") && part.endsWith("**") ? (
                        <strong key={pi} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>
                      ) : (
                        part
                      )
                    )}
                  </p>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
