import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import SEO from "@/components/SEO";

const Terms = () => (
  <div className="min-h-screen bg-background">
    <SEO
      title="Terms of Service — Resonance Creative Studio"
      description="The terms governing your use of Resonance Creative Studio, including accounts, intellectual property, acceptable use and content ownership."
      path="/terms"
    />
    <div className="max-w-3xl mx-auto px-6 py-16">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to home
      </Link>

      <h1 className="font-display text-3xl font-bold text-foreground mb-2">Terms of Service</h1>
      <p className="text-sm text-muted-foreground mb-4">Review-gated legacy draft · 0.1-draft · effective date not approved.</p>\n      <p className="text-sm text-muted-foreground mb-10">This legacy Creative Studio policy remains review-gated under the Resonance DataNest legal process and is not a replacement for the central governed legal record.</p>

      <div className="space-y-8 text-sm text-secondary-foreground leading-relaxed">
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">1. Acceptance of Terms</h2>
          <p>By accessing and using Resonance Creative Studio ("Service"), you accept and agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">2. Description of Service</h2>
          <p>Resonance Creative Studio is an AI-powered platform that generates visual marketing content including posters, brochures, advertisements, and videos from user-provided inputs such as URLs, images, and text.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">3. User Accounts</h2>
          <p>You must create an account to use the Service. You are responsible for maintaining the confidentiality of your credentials and for all activities under your account.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">4. Intellectual Property</h2>
          <p>Content generated through the Service is owned by you, the user. However, we retain rights to the underlying technology, algorithms, and platform infrastructure.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">5. Acceptable Use</h2>
          <p>You agree not to use the Service to generate content that is illegal, harmful, defamatory, or infringes on the rights of others. We reserve the right to terminate accounts that violate this policy.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">6. Limitation of Liability</h2>
          <p>The Service is provided "as is" without warranty of any kind. We shall not be liable for any indirect, incidental, or consequential damages arising from use of the Service.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">7. Changes to Terms</h2>
          <p>We reserve the right to update these terms at any time. Continued use of the Service after changes constitutes acceptance of the updated terms.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">8. Contact</h2>
          <p>For questions about these terms, please <Link to="/contact" className="text-primary hover:underline">contact us</Link>.</p>
        </section>
      </div>
    </div>
  </div>
);

export default Terms;
