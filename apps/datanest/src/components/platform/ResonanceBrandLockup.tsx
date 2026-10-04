import { DATANEST_LOGO_SRC } from "@/lib/brand";
import {
  DATANEST_DISPLAY_NAME,
  RESONANCE_BUSINESS_IDENTITY
} from "@/lib/brandIdentity";

export default function ResonanceBrandLockup({compact=false}:{compact?:boolean}) {
  return (
    <span
      className={"resonanceBrandLockup"+(compact?" compact":"")}
      aria-label={DATANEST_DISPLAY_NAME+" by "+RESONANCE_BUSINESS_IDENTITY.businessBrand}
    >
      <span className="resonanceBrandLogo" aria-hidden="true">
        <img src={DATANEST_LOGO_SRC} alt="" />
      </span>
      <span className="resonanceBrandCopy">
        <strong>{DATANEST_DISPLAY_NAME}</strong>
        {!compact&&<small>{RESONANCE_BUSINESS_IDENTITY.businessBrand}</small>}
      </span>
    </span>
  );
}
