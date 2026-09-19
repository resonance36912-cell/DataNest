import { motion } from "framer-motion";
import { Check, X } from "lucide-react";

/**
 * Holo-inspired sections, adapted to the Resonance voice:
 *   1. "You've probably seen our work" â€” gallery of stylised creative tiles
 *   2. Comparison table â€” Creative Studio vs Canva vs ChatGPT vs hiring a designer (ZAR)
 *   3. Stat strip â€” conservative, honest claims
 *   4. Team â€” South African builders behind the spoke (anonymised, role-only)
 *
 * No fake star ratings, no invented customer counts. Update the STATS array
 * once you have real numbers.
 */

const GALLERY_TILES = [
  { kicker: "Poster", title: "Spring Drop\n40% off", grad: "linear-gradient(135deg, hsl(265 85% 55%), hsl(295 90% 55%))" },
  { kicker: "Instagram", title: "Loadshedding-\nproof coffee.", grad: "linear-gradient(160deg, hsl(325 90% 60%), hsl(20 90% 60%))" },
  { kicker: "Ad", title: "From R59.\nFor every braai.", grad: "linear-gradient(135deg, hsl(150 80% 45%), hsl(190 90% 50%))" },
  { kicker: "Cinematic", title: "Tabletop wines.\nCape Winelands.", grad: "linear-gradient(200deg, hsl(0 84% 55%), hsl(325 90% 55%))" },
  { kicker: "Brochure", title: "Joburg studios.\nOpen Saturdays.", grad: "linear-gradient(135deg, hsl(222 70% 30%), hsl(265 85% 55%))" },
  { kicker: "Story", title: "Sho't left.\nBook the bakkie.", grad: "linear-gradient(135deg, hsl(295 90% 55%), hsl(265 85% 50%))" },
  { kicker: "Poster", title: "Heritage Day\nLineup", grad: "linear-gradient(160deg, hsl(20 90% 55%), hsl(45 95% 55%))" },
  { kicker: "Ad", title: "Pay with EFT.\nShip same day.", grad: "linear-gradient(135deg, hsl(190 90% 45%), hsl(265 85% 55%))" },
];

const STATS = [
  { value: "11", label: "SA official languages, plus Afrikaans-friendly copy" },
  { value: "<60s", label: "from URL to first creative draft" },
  { value: "2Ã—", label: "design variants every single generation" },
  { value: "FREE", label: "promotional access while real provider costs are measured" },
];

const COMPARE = [
  { row: "Learns your brand from a URL", us: true, canva: false, gpt: false, dsg: true },
  { row: "Generates posters, social, ads & cinematic video", us: true, canva: true, gpt: false, dsg: true },
  { row: "Built for South African workflows", us: true, canva: false, gpt: false, dsg: true },
  { row: "Afrikaans + SA-English copy out of the box", us: true, canva: false, gpt: true, dsg: true },
  { row: "Two unique variants per request", us: true, canva: false, gpt: false, dsg: false },
  { row: "Free promotional access during current costing study", us: true, canva: false, gpt: false, dsg: false },
];

const TEAM = [
  { role: "Studio Lead", initials: "RC", grad: "linear-gradient(135deg, hsl(265 85% 55%), hsl(295 90% 55%))" },
  { role: "AI Engineering", initials: "AI", grad: "linear-gradient(135deg, hsl(295 90% 55%), hsl(325 90% 60%))" },
  { role: "Design", initials: "DS", grad: "linear-gradient(135deg, hsl(325 90% 60%), hsl(20 90% 55%))" },
  { role: "Creator Success", initials: "CS", grad: "linear-gradient(135deg, hsl(190 90% 50%), hsl(265 85% 55%))" },
];

const Cell = ({ v }: { v: boolean | string }) => {
  if (v === true) return <Check className="w-5 h-5 text-primary mx-auto" aria-label="Yes" />;
  if (v === false) return <X className="w-5 h-5 text-muted-foreground/40 mx-auto" aria-label="No" />;
  return <span className="font-display font-semibold text-foreground">{v}</span>;
};

const HoloInspiredSections = () => (
  <>
    {/* 1. You've probably seen our work */}
    <section className="px-6 py-24 border-t border-border/50">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-3xl md:text-4xl font-bold leading-tight">
            You've probably scrolled past our work.<br />
            <span className="studio-gradient-text">You just didn't know it was AI.</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {GALLERY_TILES.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="relative aspect-[4/5] rounded-2xl overflow-hidden border border-white/10"
              style={{ background: t.grad }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
              <span className="absolute top-3 left-3 text-[10px] uppercase tracking-[0.2em] text-white/80 bg-black/30 backdrop-blur px-2 py-1 rounded-full">
                {t.kicker}
              </span>
              <h3 className="absolute bottom-4 left-4 right-4 font-display text-white text-lg md:text-xl font-bold leading-tight whitespace-pre-line">
                {t.title}
              </h3>
            </motion.div>
          ))}
        </div>

        <p className="text-center text-xs uppercase tracking-[0.2em] text-muted-foreground/60 mt-6">
          Illustrative â€” your brand, your products, your voice.
        </p>
      </div>
    </section>

    {/* 2. Stat strip */}
    <section className="px-6 py-16 border-t border-border/50 bg-card/20">
      <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
        {STATS.map((s) => (
          <div key={s.label} className="text-center">
            <div className="font-display text-3xl md:text-4xl font-bold studio-gradient-text mb-2">{s.value}</div>
            <p className="text-xs md:text-sm text-muted-foreground leading-snug">{s.label}</p>
          </div>
        ))}
      </div>
    </section>

    {/* 3. Comparison table */}
    <section className="px-6 py-24 border-t border-border/50">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-3">
            One tool, instead of <span className="studio-gradient-text">four separate apps</span>.
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Built for South African creators and brands â€” not retrofitted with a ZAR price tag.
          </p>
        </motion.div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-background/40">
                <th className="text-left font-display font-semibold p-4 md:p-5 w-2/5">Capability</th>
                <th className="p-4 md:p-5 text-center">
                  <span className="block font-display font-bold studio-gradient-text">Creative Studio</span>
                </th>
                <th className="p-4 md:p-5 text-center text-muted-foreground font-display">Canva</th>
                <th className="p-4 md:p-5 text-center text-muted-foreground font-display">ChatGPT</th>
                <th className="p-4 md:p-5 text-center text-muted-foreground font-display whitespace-nowrap">Hire a designer</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((r, i) => (
                <tr key={r.row} className={i % 2 ? "bg-background/20" : ""}>
                  <td className="p-4 md:p-5 text-foreground/90">{r.row}</td>
                  <td className="p-4 md:p-5 text-center"><Cell v={r.us} /></td>
                  <td className="p-4 md:p-5 text-center"><Cell v={r.canva} /></td>
                  <td className="p-4 md:p-5 text-center"><Cell v={r.gpt} /></td>
                  <td className="p-4 md:p-5 text-center"><Cell v={r.dsg} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-center text-xs text-muted-foreground/60 mt-3">
          R- = lowest, R$$$ = highest typical campaign cost. Comparisons general; check each tool's current pricing.
        </p>
      </div>
    </section>

    {/* 4. Team */}
    <section className="px-6 py-20 border-t border-border/50">
      <div className="max-w-5xl mx-auto text-center">
        <h2 className="font-display text-3xl md:text-4xl font-bold mb-3">
          The South African team behind the spoke.
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto mb-10">
          Resonance Creative Studio is built and supported by a small team inside The Resonance â€” the ecosystem also behind ePublisher, Sync Vision and the Resonance Podcast.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
          {TEAM.map((m) => (
            <div key={m.role} className="flex flex-col items-center">
              <div
                className="h-20 w-20 rounded-full flex items-center justify-center font-display text-white text-lg font-bold border border-white/10 shadow-lg"
                style={{ background: m.grad }}
                aria-hidden="true"
              >
                {m.initials}
              </div>
              <p className="mt-3 text-sm text-foreground/90 font-display font-semibold">{m.role}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  </>
);

export default HoloInspiredSections;
