# LIBERTY-IN-ALL

LIBERTY-IN-ALL is DataNest's continuous indexing and traceability assurance standard.

Its operating rule is **maximum legitimate visibility with minimum necessary restriction**:

- safe metadata and assurance evidence are indexed for on-demand visibility;
- each indexed record is content-digested and tied to an exact source commit;
- missing evidence stays visible instead of being inferred;
- public output is sanitized and never publishes record contents, secrets, private authentication material or protected personal data;
- public, stakeholder, auditor and regulator views share one attributable evidence lineage;
- the standard is non-authorizing: it cannot approve, merge, deploy production, alter governance authority or rewrite historical evidence.

Runtime outputs:

- liberty-in-all/state/latest.json — current assurance state;
- liberty-in-all/index/traceability.json — internal repository traceability index;
- public/transparency/liberty-in-all/latest.json — sanitized public index generated on the automation branch;
- public/transparency/liberty-in-all/index.json — stable public entrypoint metadata.

The workflow is event-driven and also pulses every ten minutes. This is near-real-time repository assurance, not a claim of instantaneous external-system monitoring.

Standards are alignment references only: ISO 15489-1:2016, ISO 23081-1:2017, W3C PROV, ISO/IEC 27001:2022, ISO/IEC 27701:2025 and NIST CSF 2.0. No certification or legal-compliance status is implied.

Live on-demand snapshot:

https://raw.githubusercontent.com/DataNest-Supository/DataNest/automation/liberty-in-all/public/transparency/liberty-in-all/latest.json

The deployed Transparency workspace reads this safe snapshot at runtime, so evidence freshness is decoupled from governed production deployment cadence.

Restricted-looking paths are not listed in published traceability output; only their aggregate count and non-reversible evidence digest are retained for assurance continuity.
