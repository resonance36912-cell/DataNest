import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Layout from "@/components/Layout";
import { motion } from "framer-motion";

const NotFound = () => {
  return (
    <Layout>
      <Helmet>
        <title>Page not found — Sync Vision</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-7xl font-bold gradient-text mb-4">404</h1>
          <p className="text-xl text-muted-foreground mb-8">This page doesn't exist</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Return Home
          </Link>
        </motion.div>
      </div>
    </Layout>
  );
};

export default NotFound;