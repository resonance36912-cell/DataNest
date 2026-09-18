import { Link } from "react-router-dom";
import { ArrowRight, Upload, Sparkles, Image as ImageIcon, Palette, Link2 } from "lucide-react";
import SEO from "@/components/SEO";

const BriefToCreative = () => {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Brief to Creative — AI Marketing Asset Generator"
        description="Upload a product image, complete a guided brief, or add a reference link to generate posters, ads, social posts, thumbnails, podcast covers and campaign assets. A URL is optional."
        path="/guides/brief-to-creative"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: "Generate AI marketing assets from a brief",
          description:
            "Upload an image or complete a guided brief in Resonance Creative Studio to generate posters, ads, social posts, podcast covers and cinematic video concepts. URL is optional.",
          step: [
            { "@type": "HowToStep", name: "Pick a content type", text: "Choose poster, product ad, brochure, social post, thumbnail, podcast cover or video concept." },
            { "@type": "HowToStep", name: "Add source material", text: "Upload a product image or logo, paste product details, or complete the guided brief. Optionally drop a reference URL." },
            { "@type": "HowToStep", name: "Review the brief", text: "Edit the auto-built source brief before generating. Missing details are flagged but never block you." },
            { "@type": "HowToStep", name: "Generate & export", text: "Generate variants, refine copy, download in the right aspect ratio." },
          ],
        }}
      />

      <main className="max-w-3xl mx-auto px-6 py-16">
        <nav className="text-xs text-muted-foreground mb-6">
          <Link to="/" className="hover:text-foreground">Home</Link> ·{" "}
          <span>Guides</span> · <span className="text-foreground">Brief to Creative</span>
        </nav>

        <h1 className="font-display text-4xl md:text-5xl font-bold leading-tight mb-4">
          Brief to <span className="studio-gradient-text">Creative</span>
        </h1>
        <p className="text-lg text-muted-foreground mb-10">
          Turn product details, images, screenshots and prompts into polished marketing assets —
          posters, ads, social posts, podcast covers, YouTube thumbnails and cinematic video
          concepts. A reference link is optional.
        </p>

        <section className="space-y-8">
          <article>
            <h2 className="font-display text-2xl font-bold mb-3 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" /> 1. Pick a content type
            </h2>
            <p className="text-muted-foreground">
              Open the <Link to="/studio" className="text-primary hover:underline">Studio</Link>{" "}
              and choose what you're making — poster, product ad, brochure, social post, YouTube
              thumbnail, podcast cover, video concept, or full campaign pack. The aspect ratio
              auto-adjusts to fit the format.
            </p>
          </article>

          <article>
            <h2 className="font-display text-2xl font-bold mb-3 flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" /> 2. Add what you have
            </h2>
            <p className="text-muted-foreground mb-3">
              Source material drives everything. Use whatever you already have:
            </p>
            <ul className="text-muted-foreground space-y-1.5 list-disc pl-5">
              <li>Upload a product image (becomes the hero subject)</li>
              <li>Upload a logo</li>
              <li>Paste product details — name, price, benefits, audience, CTA</li>
              <li>Upload a screenshot of an existing campaign</li>
              <li><em>Optional:</em> drop a reference URL for extra context</li>
            </ul>
          </article>

          <article>
            <h2 className="font-display text-2xl font-bold mb-3 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-primary" /> 3. Review the brief
            </h2>
            <p className="text-muted-foreground">
              Studio assembles a structured source brief from your inputs and (if provided) the
              reference URL. Edit any field inline before generation. Missing or weak fields are
              shown as soft prompts — they never block you.
            </p>
          </article>

          <article>
            <h2 className="font-display text-2xl font-bold mb-3 flex items-center gap-2">
              <Palette className="w-5 h-5 text-primary" /> 4. Generate, refine, download
            </h2>
            <p className="text-muted-foreground">
              Generate variants, swap copy with AI-assisted editing, then download in the exact
              size and format you need. ZAR-priced and English- / Afrikaans-friendly.
            </p>
          </article>

          <article>
            <h2 className="font-display text-2xl font-bold mb-3 flex items-center gap-2">
              <Link2 className="w-5 h-5 text-primary" /> About the optional URL
            </h2>
            <p className="text-muted-foreground">
              You can paste a product page URL as extra context, but Studio never blocks
              generation on a slow or unreachable link. If a URL can't be read, you'll get a soft
              notice and your upload + brief carry the run.
            </p>
          </article>
        </section>

        <div className="mt-12 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-6">
          <h2 className="font-display text-xl font-bold mb-2">Ready to try it?</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Sign up free and turn your first brief into a campaign-ready asset in under two minutes.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 studio-gradient-bg text-primary-foreground font-semibold text-sm px-4 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
          >
            Sign up &amp; sign in <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </main>
    </div>
  );
};

export default BriefToCreative;
