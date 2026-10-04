import { HardDrive } from "lucide-react";
import { AdminSection } from "../AdminSection";
import StorageOverview from "@/components/StorageOverview";

export function StorageSection() {
  return (
    <AdminSection
      icon={HardDrive}
      title="Storage Overview"
      description="media-uploads bucket usage, quotas, and cleanup tools"
    >
      <StorageOverview />
    </AdminSection>
  );
}
