import { m as motion } from "@/lib/lazy-motion";
import { MessageCircle, Mail, Phone, Youtube, Facebook } from "lucide-react";
import { useNavigate } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import SEO from "@/components/SEO";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

const contactMethods = [
  {
    icon: MessageCircle,
    title: "WhatsApp",
    detail: "+27 83 261 5492",
    sub: "Fastest response",
    description: "Start a chat with our team on WhatsApp for quick questions and support.",
    action: "Chat on WhatsApp",
    href: "https://wa.me/27832615492",
    color: "text-resonance-teal",
    bg: "bg-resonance-teal/10",
  },
  {
    icon: Mail,
    title: "Email",
    detail: "support@resonance-podcast.com",
    sub: "24hr response",
    description: "Drop us a line anytime. We read every email and typically respond within 24 hours.",
    action: "Send Email",
    href: "mailto:support@resonance-podcast.com",
    color: "text-resonance-cyan",
    bg: "bg-resonance-cyan/10",
  },
  {
    icon: Phone,
    title: "Phone",
    detail: "+27 83 261 5492",
    sub: "Mon-Fri, 9AM-6PM",
    description: "Call us for urgent matters, interview requests, or technical support.",
    action: "Call Now",
    href: "tel:+27832615492",
    color: "text-resonance-violet",
    bg: "bg-resonance-violet/10",
  },
  {
    icon: Youtube,
    title: "YouTube",
    detail: "@resonance36912",
    sub: "2K+ subscribers",
    description: "Watch video episodes, behind-the-scenes content, and exclusive interviews.",
    action: "Subscribe",
    href: "https://www.youtube.com/@resonance36912",
    color: "text-resonance-magenta",
    bg: "bg-resonance-magenta/10",
  },
  {
    icon: Facebook,
    title: "Facebook",
    detail: "The Resonance Podcast",
    sub: "Join our community",
    description: "Connect with fellow listeners, get episode updates, and join live discussions.",
    action: "Follow Us",
    href: "https://www.facebook.com/people/The-Resonance-Podcast/61574983737484/",
    color: "text-resonance-gold",
    bg: "bg-resonance-gold/10",
  },
];

const faqs = [
  { q: "Where can I listen to episodes?", a: "You can listen to short clips on our website, or on YouTube for full episodes." },
  { q: "Can I suggest a guest or topic?", a: "Absolutely! Email us with your suggestions and tell us why you think they'd be a great fit for our show." },
  { q: "Do you accept sponsorships?", a: "Yes! For business inquiries including sponsorships and partnerships, please reach out to our business email." },
  { q: "How often do you release episodes?", a: "We release new episodes every Tuesday, with bonus content and clips throughout the week on our social channels." },
];

const Contact = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Contact – Resonance YouTube Optimizer"
        description="Reach the Resonance team via WhatsApp, email, YouTube or Facebook for questions, feedback, sponsorships and collaboration."
        path="/contact"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "ContactPage",
            "@id": "https://youtubeoptimizer.life/contact#contactpage",
            url: "https://youtubeoptimizer.life/contact",
            name: "Contact Resonance YouTube Optimizer",
            description:
              "Reach the Resonance team via WhatsApp, email, YouTube or Facebook.",
            publisher: { "@id": "https://reson8.life/#organization" },
          },
          {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "@id": "https://youtubeoptimizer.life/contact#faq",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          },
        ]}
      />
      <SiteHeader active="Contact" />

      <main className="container mx-auto px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <h1 className="font-display font-bold text-4xl md:text-5xl tracking-tight mb-4">
            Contact <span className="gradient-resonance-text">Resonance</span>
          </h1>
          <p className="text-muted-foreground text-lg">
            Ready to connect? Choose your preferred way to reach out. We're here to help with questions, feedback, or collaboration opportunities.
          </p>
        </motion.div>

        {/* Contact Methods */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto mb-16">
          {contactMethods.map((method, i) => (
            <motion.div
              key={method.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-card/60 border border-border/40 rounded-2xl p-6 backdrop-blur-xl hover:border-primary/30 transition-all"
            >
              <div className={`w-12 h-12 rounded-xl ${method.bg} flex items-center justify-center mb-4`}>
                <method.icon className={`h-6 w-6 ${method.color}`} />
              </div>
              <h3 className="font-display font-semibold text-lg">{method.title}</h3>
              <p className={`text-sm font-medium ${method.color}`}>{method.detail}</p>
              <p className="text-xs text-muted-foreground mb-3">{method.sub}</p>
              <p className="text-muted-foreground text-sm leading-relaxed mb-4">{method.description}</p>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full neon-border text-xs"
                onClick={() => window.open(method.href, "_blank")}
              >
                {method.action}
              </Button>
            </motion.div>
          ))}
        </div>

        {/* Info Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto mb-16"
        >
          {[
            { label: "Location", value: "Cape Town, South Africa" },
            { label: "Response Time", value: "Within 24 hours" },
            { label: "Languages", value: "English, Afrikaans" },
          ].map((info) => (
            <div key={info.label} className="text-center bg-card/60 border border-border/40 rounded-2xl p-5 backdrop-blur-xl">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{info.label}</p>
              <p className="font-display font-semibold text-sm">{info.value}</p>
            </div>
          ))}
        </motion.div>

        {/* FAQ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="max-w-3xl mx-auto"
        >
          <h2 className="font-display font-bold text-2xl text-center mb-8">Quick Answers</h2>
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-card/60 border border-border/40 rounded-xl p-5 backdrop-blur-xl">
                <h3 className="font-display font-semibold text-sm mb-2">{faq.q}</h3>
                <p className="text-muted-foreground text-sm">{faq.a}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Contact;
