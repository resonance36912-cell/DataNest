import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { HUB_PRICING_URL } from "@/lib/entitlement";

const CtaSection = () => (
  <section className="px-6 py-20 border-t border-border/50">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="max-w-3xl mx-auto text-center"
    >
      <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
        Ready to Create Something{" "}
        <span className="studio-gradient-text">Extraordinary</span>?
      </h2>
      <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
        Full Creative Studio access is free during the promotion while real provider usage and operating costs are measured.
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 studio-gradient-bg text-primary-foreground font-display font-semibold px-8 py-3.5 rounded-xl hover:opacity-90 transition-opacity"
        >
          Start free
          <ArrowRight className="w-4 h-4" />
        </Link>
        <a
          href={HUB_PRICING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 border border-border bg-card/60 text-foreground font-display font-semibold px-8 py-3.5 rounded-xl hover:bg-card transition-colors"
        >
          Promotion details ↗
        </a>
      </div>
    </motion.div>
  </section>
);

export default CtaSection;
