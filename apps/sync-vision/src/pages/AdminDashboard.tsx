import { AdminLayout } from "@/components/admin/AdminLayout";
import { OverviewSection } from "@/components/admin/sections/OverviewSection";
import { StorageSection } from "@/components/admin/sections/StorageSection";
import { OpsSection } from "@/components/admin/sections/OpsSection";
import { JobsSection } from "@/components/admin/sections/JobsSection";
import { TablesSection } from "@/components/admin/sections/TablesSection";
import { EntitlementsSection } from "@/components/admin/sections/EntitlementsSection";
import { CouponsSection } from "@/components/admin/sections/CouponsSection";
import { SecurityFindingsSection } from "@/components/admin/sections/SecurityFindingsSection";
import { PerformanceSection } from "@/components/admin/sections/PerformanceSection";
import { OptimizationSection } from "@/components/admin/sections/OptimizationSection";
import { CreditsSection } from "@/components/admin/sections/CreditsSection";
import { TranscriptionQASection } from "@/components/admin/sections/TranscriptionQASection";
import { QualityReviewSection } from "@/components/admin/sections/QualityReviewSection";
import { QaAuditLogSection } from "@/components/admin/sections/QaAuditLogSection";
import { EmailDeliverySection } from "@/components/admin/sections/EmailDeliverySection";
import { PayloadFlagsSection } from "@/components/admin/sections/PayloadFlagsSection";

export default function AdminDashboard() {
  return (
    <AdminLayout
      sections={{
        overview: <OverviewSection />,
        credits: <CreditsSection />,
        storage: <StorageSection />,
        ops: <OpsSection />,
        jobs: <JobsSection />,
        perf: <PerformanceSection />,
        transcription: <TranscriptionQASection />,
        quality: <QualityReviewSection />,
        qa_audit: <QaAuditLogSection />,
        payload_flags: <PayloadFlagsSection />,
        emails: <EmailDeliverySection />,
        optimization: <OptimizationSection />,
        security: <SecurityFindingsSection />,
        entitlements: <EntitlementsSection />,
        coupons: <CouponsSection />,
        tables: <TablesSection />,
      }}
    />
  );
}
