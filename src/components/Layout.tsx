import { ReactNode } from "react";
import Navbar from "./Navbar";
import Footer from "./Footer";
import AppNav, { useIsProductRoute } from "./AppNav";

export default function Layout({ children, hideFooter }: { children: ReactNode; hideFooter?: boolean }) {
  const isProduct = useIsProductRoute();
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      {isProduct && <AppNav />}
      <main className="flex-1 pt-16">{children}</main>
      {!hideFooter && <Footer />}
    </div>
  );
}
