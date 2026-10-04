import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import { SeoHead } from "@/components/SeoHead";
import { FREE_PROMOTION } from "@/lib/promotion";

export default function Credits() {
  return (
    <>
      <SeoHead
        title="Free Access Promotion - Sync Vision"
        description={FREE_PROMOTION.description}
        path="/credits"
      />
      <Navbar />
      <main className="container max-w-3xl pt-24 pb-16">
        <section className="rounded-3xl border border-primary/25 bg-card/60 p-8 text-center backdrop-blur-xl sm:p-12">
          <Sparkles className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary">{FREE_PROMOTION.shortLabel}</p>
          <h1 className="mt-2 text-3xl font-display font-bold">Credits are not sold during the promotion</h1>
          <p className="mt-4 text-muted-foreground">{FREE_PROMOTION.description}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            Scene generation, vocal sync, rendering, and exports are included. Usage is measured for costing only;
            no card, mobile purchase, pack, top-up, or subscription is required.
          </p>
          <Button asChild className="mt-8 rounded-full">
            <Link to="/dashboard">Return to Sync Vision</Link>
          </Button>
        </section>
      </main>
    </>
  );
}
