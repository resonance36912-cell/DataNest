import Link from "next/link";
import { RSGP_GOVERNANCE_LABEL } from "@/lib/brandIdentity";

export default function GovernanceTrustMark({href="/governance"}:{href?:string}) {
  return (
    <Link
      className="governanceTrustMark"
      href={href}
      aria-label={RSGP_GOVERNANCE_LABEL}
      data-trust-kind="governance"
      title="Review the applicable RSGP governance context and controls."
    >
      <span aria-hidden="true">◆</span>
      <strong>{RSGP_GOVERNANCE_LABEL}</strong>
    </Link>
  );
}
