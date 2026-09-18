import { useState, useId } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft, Mail, Send, Loader2, Phone, MessageCircle, Youtube, Facebook, MapPin, Clock, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import SEO from "@/components/SEO";
import { ResonanceFooter } from "@/components/brand/ResonanceFooter";

const contactCards = [
  {
    icon: MessageCircle,
    title: "WhatsApp",
    detail: "+27 83 261 5492",
    subtitle: "Fastest response",
    description: "Start a chat with our team on WhatsApp for quick questions and support.",
    action: { label: "Chat on WhatsApp", href: "https://wa.me/27832615492" },
  },
  {
    icon: Mail,
    title: "Email",
    detail: "support@resonance-podcast.com",
    subtitle: "24hr response",
    description: "Drop us a line anytime. We read every email and typically respond within 24 hours.",
    action: { label: "Send Email", href: "mailto:support@resonance-podcast.com" },
  },
  {
    icon: Phone,
    title: "Phone",
    detail: "+27 83 261 5492",
    subtitle: "Mon-Fri, 9AM-6PM",
    description: "Call us for urgent matters, interview requests, or technical support.",
    action: { label: "Call Now", href: "tel:+27832615492" },
  },
  {
    icon: Youtube,
    title: "YouTube",
    detail: "@resonance36912",
    subtitle: "2K+ subscribers",
    description: "Watch video episodes, behind-the-scenes content, and exclusive interviews.",
    action: { label: "Subscribe", href: "https://youtube.com/@resonance36912" },
  },
  {
    icon: Facebook,
    title: "Facebook",
    detail: "The Resonance Podcast",
    subtitle: "Join our community",
    description: "Connect with fellow listeners, get episode updates, and join live discussions.",
    action: { label: "Follow Us", href: "https://facebook.com/TheResonancePodcast" },
  },
];

const infoItems = [
  { icon: MapPin, label: "Location", value: "Cape Town, South Africa" },
  { icon: Clock, label: "Response Time", value: "Within 24 hours" },
  { icon: Globe, label: "Languages", value: "English, Afrikaans" },
];

const faqs = [
  { q: "Where can I listen to episodes?", a: "You can listen to short clips on our website, or on YouTube for full episodes." },
  { q: "Can I suggest a guest or topic?", a: "Absolutely! Email us with your suggestions and tell us why you think they'd be a great fit for our show." },
  { q: "Do you accept sponsorships?", a: "Yes! For business inquiries including sponsorships and partnerships, please reach out to our business email." },
  { q: "How often do you release episodes?", a: "We release new episodes every Tuesday, with bonus content and clips throughout the week on our social channels." },
];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: "easeOut" as const },
  }),
};

const Contact = () => {
  const { toast } = useToast();
  const nameId = useId();
  const emailId = useId();
  const messageId = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1000));
    toast({ title: "Message sent!", description: "We'll get back to you shortly." });
    setName("");
    setEmail("");
    setMessage("");
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Contact — Resonance Creative Studio"
        description="Reach the Resonance Creative Studio team via WhatsApp, email, or phone. Based in Cape Town, South Africa. Response within 24 hours."
        path="/contact"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            name: "Resonance Creative Studio",
            url: "https://resonancestudio.lovable.app/contact",
            email: "support@resonance-podcast.com",
            telephone: "+27832615492",
            address: { "@type": "PostalAddress", addressLocality: "Cape Town", addressCountry: "ZA" },
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          },
        ]}
      />
      <main className="max-w-5xl mx-auto px-6 py-16">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="font-display text-3xl font-bold text-foreground mb-2">Contact Resonance</h1>
          <p className="text-muted-foreground mb-10 max-w-2xl">
            Ready to connect? Choose your preferred way to reach out. We're here to help with questions, feedback, or collaboration opportunities.
          </p>
        </motion.div>

        {/* Contact cards */}
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {contactCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <motion.div key={card.title} custom={i} variants={fadeUp} className="studio-card p-5 group hover:border-primary/30 transition-colors flex flex-col">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-semibold text-foreground">{card.title}</h3>
                    <p className="text-xs text-muted-foreground">{card.subtitle}</p>
                  </div>
                </div>
                <p className="text-sm font-medium text-foreground mb-1">{card.detail}</p>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4 flex-1">{card.description}</p>
                <a href={card.action.href} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                  {card.action.label} →
                </a>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Info bar */}
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="flex flex-wrap gap-6 mb-12">
          {infoItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="w-4 h-4 text-primary" />
                <span className="font-medium text-foreground">{item.label}:</span>
                {item.value}
              </div>
            );
          })}
        </motion.div>

        {/* Form + FAQ side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Contact form */}
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="studio-card p-6">
            <h2 className="font-display text-lg font-semibold text-foreground mb-4">Send a Message</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor={nameId} className="text-xs text-muted-foreground block mb-1.5">Name</label>
                <input id={nameId} type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
              </div>
              <div>
                <label htmlFor={emailId} className="text-xs text-muted-foreground block mb-1.5">Email</label>
                <input id={emailId} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors" />
              </div>
              <div>
                <label htmlFor={messageId} className="text-xs text-muted-foreground block mb-1.5">Message</label>
                <textarea id={messageId} required value={message} onChange={(e) => setMessage(e.target.value)} placeholder="How can we help?" rows={4} className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors resize-none" />
              </div>
              <button type="submit" disabled={loading} className="studio-gradient-bg text-primary-foreground font-semibold text-sm py-2.5 px-6 rounded-lg flex items-center gap-2 disabled:opacity-50 hover:opacity-90 transition-opacity">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send Message
              </button>
            </form>
          </motion.div>

          {/* FAQ */}
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="studio-card p-6">
            <h2 className="font-display text-lg font-semibold text-foreground mb-4">Quick Answers</h2>
            <div className="space-y-4">
              {faqs.map((faq) => (
                <div key={faq.q}>
                  <h3 className="text-sm font-medium text-foreground mb-1">{faq.q}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </main>
      <ResonanceFooter currentApp="Creative Studio" />
    </div>
  );
};

export default Contact;
