import { Activity } from "lucide-react";
import { AdminSection } from "../AdminSection";
import OpsCockpit from "@/components/OpsCockpit";

export function OpsSection() {
  return (
    <AdminSection
      icon={Activity}
      title="Ops Cockpit"
      description="Provider health, system alerts, and live job telemetry"
    >
      <OpsCockpit />
    </AdminSection>
  );
}
