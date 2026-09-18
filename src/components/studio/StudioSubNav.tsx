import { NavLink } from "react-router-dom";
import { Sparkles, Package, Palette, Wand2 } from "lucide-react";

const tabs = [
  { to: "/studio", label: "Generate", icon: Wand2 },
  { to: "/studio/dna", label: "Brand DNA", icon: Sparkles },
  { to: "/studio/products", label: "Products", icon: Package },
  { to: "/studio/moodboards", label: "Moodboards", icon: Palette },
];

const StudioSubNav = () => (
  <div className="sticky top-16 z-20 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 h-11 flex items-center gap-1 overflow-x-auto">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.to === "/studio"}
          className={({ isActive }) =>
            `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors ${
              isActive
                ? "bg-white/[0.06] text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
            }`
          }
        >
          <t.icon className="w-3.5 h-3.5" />
          {t.label}
        </NavLink>
      ))}
    </div>
  </div>
);

export default StudioSubNav;
