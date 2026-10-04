import { RESONANCE_AUTHORSHIP_PUBLICATION_IDENTITY } from "@/lib/brandIdentity";

export default function AuthorshipPublicationsDisclosure(){
  const identity=RESONANCE_AUTHORSHIP_PUBLICATION_IDENTITY;
  return <section className="legalCentreSection legalCentreSectionWide" aria-labelledby="authorship-publications-heading">
    <p className="eyebrow">PUBLICATION RECORD</p>
    <h2 id="authorship-publications-heading">Authorship &amp; Publications</h2>
    <p>Authorship, publication, and business attribution for Resonance DataNest and associated public materials.</p>
    <dl className="legalIdentityChain">
      <div><dt>Business name</dt><dd>{identity.businessName}</dd></div>
      <div><dt>Ownership</dt><dd>{identity.ownership}</dd></div>
      <div><dt>HQ</dt><dd>{identity.headquarters}</dd></div>
      <div><dt>Email</dt><dd><a href={`mailto:${identity.email}`}>{identity.email}</a></dd></div>
      <div><dt>Website</dt><dd><a href={identity.website} target="_blank" rel="noreferrer">{identity.website}</a></dd></div>
      <div><dt>Social</dt><dd>{identity.socialHandle}</dd></div>
    </dl>
  </section>;
}
