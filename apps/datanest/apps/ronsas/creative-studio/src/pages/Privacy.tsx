import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import SEO from "@/components/SEO";

const Privacy = () => (
  <div className="min-h-screen bg-background">
    <SEO
      title="Privacy Policy — Resonance Creative Studio"
      description="How Resonance Creative Studio collects, uses, stores and protects your data. Account info, uploaded content, third-party AI processing and your rights."
      path="/privacy"
    />
    <div className="max-w-3xl mx-auto px-6 py-16">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to home
      </Link>

      <h1 className="font-display text-3xl font-bold text-foreground mb-2">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-4">Review-gated legacy draft · 0.1-draft · effective date not approved.</p>\n      <p className="text-sm text-muted-foreground mb-10">This legacy Creative Studio privacy copy remains review-gated until verified platform data flows and authorized legal review support an approved replacement.</p>

      <div className="space-y-8 text-sm text-secondary-foreground leading-relaxed">
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">1. Information We Collect</h2>
          <p>We collect information you provide directly: email address, account credentials, and content you upload (images, URLs, documents). We also collect usage data such as feature interactions and generation history.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">2. How We Use Your Information</h2>
          <p>Your information is used to provide and improve the Service, generate content, communicate updates, and ensure platform security.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">3. Data Storage & Security</h2>
          <p>Storage and security representations remain under review against verified implementation evidence. This draft does not make a platform-wide encryption or security guarantee.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">4. Third-Party Services</h2>
          <p>Some features may use configured third-party AI services. Provider-specific processing, storage, and retention behavior must be documented from verified configuration and contractual evidence rather than assumed in this draft.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">5. Your Rights</h2>
          <p>You may request deletion of your account and associated data at any time by contacting us. You have the right to access and export your data.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">6. Contact</h2>
          <p>For privacy-related inquiries, please <Link to="/contact" className="text-primary hover:underline">contact us</Link>.</p>
        </section>
      </div>
    </div>
  </div>
);

export default Privacy;
