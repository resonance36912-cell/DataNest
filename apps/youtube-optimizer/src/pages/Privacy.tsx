import { m as motion } from "@/lib/lazy-motion";
import SEO from "@/components/SEO";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

const Privacy = () => {


  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Privacy Policy – Resonance YouTube Optimizer"
        description="How Resonance collects, uses and protects your data. POPIA-conscious privacy practices for our YouTube growth platform."
        path="/privacy"
      />
      <SiteHeader />

      <main className="container mx-auto px-6 py-16 max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display font-bold text-4xl mb-2">Privacy Policy</h1>
          <p className="text-muted-foreground text-sm mb-10">Last updated: March 29, 2026</p>

          <div className="space-y-8 text-sm text-muted-foreground leading-relaxed">
            <section>
              <h2 className="font-display font-semibold text-lg text-foreground mb-3">1. Information We Collect</h2>
              <p>When you use Resonance YouTube Optimizer, we may collect the following information:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li><strong className="text-foreground">Channel Data:</strong> YouTube channel URLs and publicly available channel metadata you submit for analysis.</li>
                <li><strong className="text-foreground">Usage Data:</strong> Pages visited, features used, session duration, and interaction patterns to improve our service.</li>
                <li><strong className="text-foreground">Device Information:</strong> Browser type, operating system, and screen resolution for optimization purposes.</li>
                <li><strong className="text-foreground">Account Data:</strong> Email address if you create an account or contact us.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display font-semibold text-lg text-foreground mb-3">2. How We Use Your Information</h2>
              <ul className="list-disc ml-6 space-y-1">
                <li>To provide AI-powered channel audits and growth recommendations.</li>
                <li>To generate thumbnails, content ideas, and strategy simulations.</li>
                <li>To improve and optimize our platform's performance and features.</li>
                <li>To communicate with you about updates, support, or promotional content (with your consent).</li>
                <li>To monitor and prevent fraud or abuse of our services.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display font-semibold text-lg text-foreground mb-3">3. Data Storage & Security</h2>
              <p>Your data is stored securely using industry-standard encryption and access controls. We use cloud infrastructure with enterprise-grade security measures. Channel analysis data is processed in real-time and audit results are stored to improve recommendations over time.</p>
            </section>

            <section>
              <h2 className="font-display font-semibold text-lg text-foreground mb-3">4. Third-Party Services</h2>
              <p>We integrate with third-party services to deliver our features:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li><strong className="text-foreground">YouTube Data API:</strong> To retrieve publicly available channel and video information.</li>
                <li><strong className="text-foreground">AI Services:</strong> To power our audit engine, content recommendations, and thumbnail generation.</li>
                <li><strong className="text-foreground">Analytics:</strong> To understand usage patterns and improve the platform.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display font-semibold text-lg text-foreground mb-3">5. Your Rights</h2>
              <p>You have the right to:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>Access the personal data we hold about you.</li>
                <li>Request correction or deletion of your data.</li>
                <li>Opt out of non-essential data collection.</li>
                <li>Withdraw consent for communications at any time.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display font-semibold text-lg text-foreground mb-3">6. Cookies</h2>
              <p>We use essential cookies to maintain your session and preferences. Analytics cookies help us understand how you use the platform. You can manage cookie preferences through your browser settings.</p>
            </section>

            <section>
              <h2 className="font-display font-semibold text-lg text-foreground mb-3">7. Children's Privacy</h2>
              <p>Our service is not directed to individuals under 13. We do not knowingly collect personal information from children.</p>
            </section>

            <section>
              <h2 className="font-display font-semibold text-lg text-foreground mb-3">8. Changes to This Policy</h2>
              <p>We may update this Privacy Policy from time to time. We will notify you of any significant changes by posting the new policy on this page with an updated date.</p>
            </section>

            <section>
              <h2 className="font-display font-semibold text-lg text-foreground mb-3">9. Contact Us</h2>
              <p>If you have questions about this Privacy Policy, contact us at:</p>
              <ul className="list-none mt-2 space-y-1">
                <li>Email: <a href="mailto:support@resonance-podcast.com" className="text-primary hover:underline">support@resonance-podcast.com</a></li>
                <li>WhatsApp: <a href="https://wa.me/27832615492" className="text-primary hover:underline">+27 83 261 5492</a></li>
              </ul>
            </section>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default Privacy;
