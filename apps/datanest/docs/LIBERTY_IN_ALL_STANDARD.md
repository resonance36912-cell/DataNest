# DataNest LIBERTY-IN-ALL Standard

**Version:** 1.0
**Effective:** 1 October 2026
**Authority:** DataNest-Supository/DataNest
**Status:** Implemented as a source-controlled internal assurance standard; alignment mapping only, not external certification.

## 1. Intent

LIBERTY-IN-ALL establishes DataNest's default for transparent, attributable and continuously refreshed records visibility. Its objective is to make trustworthy evidence easy to discover and verify while restricting only what must be restricted for security, privacy, contractual, legal or governance reasons.

The standard does not grant production authority and does not weaken Boundaries, ENFORCER, human approval, privacy or secret-protection requirements.

## 2. Principle

**Maximum legitimate visibility; minimum necessary restriction.**

Visibility is evidence-first rather than disclosure-at-any-cost. A record may be indexed publicly only when its metadata is safe for public disclosure. Sensitive content remains protected even when the existence of a control or evidence class is disclosed.

## 3. Required traceability metadata

Every indexed record should expose, where applicable:

- repository path or stable public identifier;
- SHA-256 content digest;
- byte size and format;
- exact source commit/ref;
- generation/publication timestamp;
- schema/version identifier;
- authority and production-authorization state;
- evidence source and derivation relationship;
- known evidence gaps;
- disclosure classification.

The public index publishes metadata and digests, not arbitrary source contents.

## 4. Audience views

The same evidence lineage supports:

- interested individuals and the public: sanitized evidence discovery and assurance status;
- stakeholders: public evidence plus governance/product references;
- auditors: source commit, digests, evidence lineage and gaps;
- regulators: control mappings, provenance, retention posture, limitations and evidence references.

No audience label itself grants privileged repository or production access.

## 5. Continuous operation

The LIBERTY-IN-ALL workflow runs on relevant repository changes, selected specialized-tree completions, manual dispatch and a ten-minute pulse. Generated evidence is written to a dedicated automation branch and retained as workflow artifacts.

"Continuous" means event-driven plus periodic near-real-time repository indexing. It is not a promise of zero-latency observation of external systems.

## 6. Privacy and security

The indexer must:

- classify sensitive-looking paths as restricted metadata;
- exclude restricted record names and details from published traceability indexes;
- expose only a restricted-record count and aggregate digest for that class;
- exclude restricted records from the public record list;
- never publish record contents through the public index;
- never publish secrets, passwords, tokens, credentials, private keys, private authentication material or protected personal data;
- make missing evidence explicit instead of fabricating it.

Changes to disclosure or sensitivity policy require human review.

## 7. Integrity and provenance

Traceability records are content-digested with SHA-256 and linked to the exact Git commit observed by the indexing run. Git history and workflow artifacts provide historical lineage. Generated latest files are current snapshots and do not replace historical source history.

## 8. Authority model

LIBERTY-IN-ALL may index, hash, classify, summarize safe metadata and publish sanitized assurance output.

It may not approve pull requests, merge branches, deploy production, alter production authority, rewrite historical evidence, relax privacy/security controls, or assert certification/guaranteed compliance.

## 9. Standards alignment

The design maps to:

- **ISO 15489-1:2016** — records creation, capture and management concepts;
- **ISO 23081-1:2017** — metadata-for-records principles;
- **W3C PROV** — interoperable provenance concepts for entities, activities, agents and derivation;
- **ISO/IEC 27001:2022** — information-security management context;
- **ISO/IEC 27701:2025** — privacy information management context;
- **NIST CSF 2.0** — cybersecurity governance and assurance context.

These are design/alignment references. DataNest does not claim certification, accreditation or jurisdiction-specific legal compliance from this mapping.

## 10. Public entrypoints

Stable public descriptor: /DataNest/transparency/liberty-in-all/index.json

Continuously generated public traceability snapshot: https://raw.githubusercontent.com/DataNest-Supository/DataNest/automation/liberty-in-all/public/transparency/liberty-in-all/latest.json

The live DataNest Transparency workspace reads this sanitized snapshot on demand from the dedicated automation branch, so fresh evidence can be inspected without turning a transparency refresh into a production deployment. The static descriptor remains part of the governed Pages release.

## 11. Acceptance criteria

A conforming LIBERTY-IN-ALL run must show:

1. production authorization is false;
2. indexed records carry SHA-256 digests and a source ref;
3. sensitive record names/details are excluded from published indexes and represented only by an aggregate restricted-evidence count/digest;
4. public output contains no record contents;
5. missing configured evidence is explicit;
6. disclosure-policy changes remain human-reviewed;
7. generated output remains attributable to a source-controlled workflow run.
