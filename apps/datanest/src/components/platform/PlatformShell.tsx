import type { ReactNode } from "react";

export default function PlatformShell({
  navigation,topbar,context,children,footer,navigationOpen=false
}:{
  navigation:ReactNode;
  topbar:ReactNode;
  context?:ReactNode;
  children:ReactNode;
  footer?:ReactNode;
  navigationOpen?:boolean;
}) {
  return <>
    {navigation}
    <main className="mainPane" inert={navigationOpen} aria-hidden={navigationOpen||undefined}>
      {topbar}
      <div className="contentPane">
        {context}
        {children}
      </div>
      {footer}
    </main>
  </>;
}
