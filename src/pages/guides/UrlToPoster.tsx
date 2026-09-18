// Legacy `/guides/url-to-poster` route — kept for backlink/SEO equity.
// Renders the new Brief-First guide so visitors landing on the old URL see
// the same content as `/guides/brief-to-creative`, with a canonical link
// pointing to the new path.
import { Link } from "react-router-dom";
import SEO from "@/components/SEO";
import BriefToCreative from "./BriefToCreative";

const UrlToPoster = () => {
  return (
    <>
      <SEO
        title="Brief to Creative (formerly URL to Poster) — AI Marketing Asset Generator"
        description="Upload a product image, complete a guided brief, or add a reference link to generate posters, ads, social posts and campaign assets. A URL is optional."
        path="/guides/brief-to-creative"
      />
      <div className="max-w-3xl mx-auto px-6 pt-4">
        <p className="text-xs text-muted-foreground rounded-lg border border-border bg-card/50 px-3 py-2">
          This guide has moved — see{" "}
          <Link to="/guides/brief-to-creative" className="text-primary hover:underline">
            Brief to Creative
          </Link>
          . URL input is now optional; uploads and product details drive generation.
        </p>
      </div>
      <BriefToCreative />
    </>
  );
};

export default UrlToPoster;
