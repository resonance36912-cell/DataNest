# Resonance DataNest memory, learning and language control baseline

Status: adopted engineering requirements; partial implementation, not assessed ISO conformity.
Version: memory-language-v1. Sources checked: 2026-09-29.

## Purpose and authority

Collective understanding means preserving and reconciling attributable interpretations across people, languages and domains. Agreement, fluency, repetition and lexical similarity are not proof of truth or comprehension. Collective evidence feeds discovery; verified candidates still require current certification before operational reuse. Adaptation must improve accessibility without changing the underlying claim or weakening scope boundaries.

The following mappings are DataNest design decisions based on publicly available scopes. They are not a clause-by-clause assessment. Obtain authorized full standards and applicable amendments for formal assessment; record edition, clause, control owner, implementation, evidence, exceptions and reviewer decision. Do not ingest copyrighted standards into learning corpora without appropriate rights. Internal Certified Memory must never be marketed as ISO certification.

## Standards register and control mapping

| Reference | Purpose in DataNest | Required evidence / current gap |
| --- | --- | --- |
| [ISO 30401:2018](https://www.iso.org/standard/68683.html), including applicable 2022 and 2024 amendments | Knowledge ownership, acquisition, sharing, retention, review and improvement | Existing memory lifecycle and provenance are partial technical support. Governance owner must establish organizational objectives, reviews and audit evidence. Monitor replacement draft; do not claim draft compliance. |
| [ISO/IEC 42001:2023](https://www.iso.org/standard/42001) | AI management accountability, change control and continual improvement | Owner-approved AI scope, responsibilities, impact assessment, incident handling and management review remain required. A passing software pipeline is insufficient. |
| [ISO/IEC 23894:2023](https://www.iso.org/standard/77304.html) | AI risk management | Maintain language-specific risk register covering mistranslation, false consensus, source dependency, cultural bias, poisoning and unsupported reuse; assign treatment and residual-risk owner. |
| [ISO/IEC 5259 series](https://www.iso.org/publication/PUB200525.html) | Data quality for analytics and ML | Measure provenance completeness, representativeness, ambiguity, duplication, label accuracy and drift by language/domain. Confirm applicable parts and editions before formal assessment. |
| [ISO 704:2022](https://www.iso.org/standard/79077.html) | Terminology and concept discipline | Separate concept identity, definition, preferred/alternate language labels, domain and scope. Qualified reviewers approve mappings; lexical matches cannot silently merge concepts. |
| [ISO/IEC 5338:2023](https://www.iso.org/standard/81118.html) | AI system lifecycle processes | Version datasets, models/providers, policies, evaluations and release evidence; record rollback and retirement decisions. |
| [NIST AI RMF 1.0 and GenAI Profile](https://www.nist.gov/itl/ai-risk-management-framework) | Govern, Map, Measure, Manage; generative-AI risk | Document context and harms, benchmark before release, monitor outcomes and remediate. This is a voluntary framework, not a product certification. |
| [BCP 47 / RFC 5646](https://www.rfc-editor.org/rfc/rfc5646) | Language identification | Store source/output language tags, uncertainty and code-switched segments; unknown language remains unknown. Language must not set jurisdiction or access rights. |
| [Unicode UAX #15](https://www.unicode.org/reports/tr15/) | Canonical text normalization | Preserve original evidence; derive NFC search text separately. Never strip accents or non-Latin scripts from the authoritative record; normalization is not translation. |
| [W3C SKOS](https://www.w3.org/TR/skos-reference/) | Multilingual concept labels and relationships | Distinguish exact, close, broader, narrower and related mappings. Retain scope notes; SKOS interchange is not yet implemented. |
| [W3C PROV-O](https://www.w3.org/TR/prov-o/) | Derivation and attribution | Link translated/paraphrased evidence to original entities, activities and agents. Existing trace IDs support provenance; full PROV export and derivation-family independence remain gaps. |
| [W3C DQV](https://www.w3.org/TR/vocab-dqv/) | Quality measurement descriptions | Store metric, method, dataset, time and assessor. DQV is a supporting W3C Note, not a certification standard. |

These references complement existing security, privacy, retention and authorization controls; they do not replace them. Formal information-security/privacy standards mapping requires a separate scoped assessment.

## Application requirements

1. Preserve original evidence, source trace, content hash, project, Job, session, author/provider and time. Derived normalization, translation and summaries must reference their original evidence and transformation version. Never overwrite originals to improve search.
2. Capture explicit language preference separately from detected language, confidence, dialect and jurisdiction. Use BCP 47 tags where applicable; support unknown/mixed language. User preference does not authorize cross-session learning.
3. Maintain concept IDs independently of words. Record definitions, domain, language labels, scope, mapping kind, reviewer, evidence and validity. Personal vocabulary remains personal until independently approved for shared use.
4. A translation is dependent evidence. Multiple models translating one source count as one source family, not independent corroboration. Human corrections add review evidence without erasing dissent or original provenance.
5. Filter by authorization, product, purpose, jurisdiction and validity before ranking. Language preference affects presentation/relevance, never authorization or certification confidence. A translation inherits source restrictions; a materially changed interpretation requires a new review.
6. Preserve negation, modal force (must/may), numbers, units, dates, names and uncertainty. Where terms are non-equivalent, keep the original, give scoped explanations and seek clarification if the decision depends on meaning.
7. Do not infer comprehension from fluency, user assent or popularity. For consequential ambiguity, provide a short paraphrase of the interpretation and allow correction. Avoid unnecessary comprehension quizzes in routine interactions.
8. High-impact claims and uncertain semantic equivalence require language-competent domain review before shared operational reuse. Legal Eagle matters remain excluded from automatic project learning.
9. Outcome evidence can trigger review, narrowing or supersession; frequency alone cannot increase truth status. Keep revocation, version history and reproducible memory usage receipts.
10. Re-run evaluations after model, prompt, tokenizer, translation, ontology or retrieval changes. Record provider/model, policy version, dataset version, language coverage and limitations with each release.

## Implementation and gap ledger

| Control | Evidence / implementation | Status |
| --- | --- | --- |
| Scope, validity, ranked selection | `20260929070000_optimize_collective_verified_memory.sql`; `20260929081500_fix_verified_memory_relevance_ranking.sql` | Existing database controls; relevance is lexical, not multilingual semantic understanding |
| Usage attribution | `20260929083000_add_certified_memory_usage_receipts.sql` | Existing receipts; does not establish comprehension |
| Language adaptation and truth boundaries | `_shared/memoryLanguagePolicy.ts`, included by all three prompt builders | Implemented model instructions in this change; probabilistic, not a deterministic enforcement gate |
| Preservation of required response schema | Shared policy localizes values, preserves keys | Integration tests in this change; live multilingual response quality still needs evaluation |
| Unicode discovery and language metadata capture | Trend tokens use NFC and preserve Unicode letters, marks and numbers; original evidence is retained. Optional declared `sourceLanguage` values are BCP 47-canonicalized at human chat and external-AI intake, declaration provenance/status and review reasons are retained on evidence, and file-derived propositions carry explicit not-supplied/script-review metadata | Partial: SQL ranked retrieval remains ASCII-oriented; source tags are declarations, not language detection; untagged ASCII non-English text can still evade the signal; qualified language-aware analyzers/reviewers remain open. Do not advertise multilingual retrieval parity |
| Validated language review before certification | `_shared/datanestLanguageReview.ts`, staging `LANGUAGE_REVIEW` validation gate, reviewer qualification registry, and the certification console require explicit reviewed BCP 47 coverage, review basis, meaning preservation, no unresolved ambiguity, and active qualification coverage before signaled candidates can proceed from VERIFY to VALIDATE/certification | Partial: registry entries are owner-recorded project governance evidence with language/scope/evidence/revocation; they are not external accreditation, a comprehension benchmark, or ISO conformity evidence |
| Translation/source-family lineage | Immutable staging derivation relations, append-only semantic-equivalence reviews, source-family-aware independence counting, qualification-scoped review and certification binding | Implemented governed control for explicitly declared derivations; no automatic translation detection or semantic-equivalence inference; pre-existing evidence without declared lineage is not retroactively reclassified |
| Concept registry and shared definitions | Standards and schema requirements in this baseline | Open: scoped registry, reviewed mapping lifecycle, SKOS export |
| Per-language comprehension evaluation | Release requirements below | Open: reviewed datasets, metrics and human assessment; prompt tests are not quality evidence |
| Canonical equivalence consolidation | `20260929232000_add_canonical_memory_consolidation.sql`, certification gateway and console | Governed mechanism: heuristic equivalence only proposes review; an already-certified record must be selected as canonical; Owner execution preserves every historical source and blocks known contradictions |
| Formal standards conformity | Public scopes mapped above | Not assessed: full-text review, control owners, operational evidence and independent assessment as appropriate |

## Canonical memory consolidation

Canonical memory consolidation is governed deduplication of historically equivalent Certified Memory. It does not synthesize or certify new knowledge. The canonical record must already exist as active Certified Memory; if a better or newly synthesized statement is needed, it must first complete the ordinary evidence, validation and certification path before it can be selected as canonical.

The relation classifier may surface same-category equivalence suggestions, but lexical or normalized similarity is only a review hint. A human Owner or Admin may propose a consolidation after inspecting the preserved records, and only the project Owner may execute or reject the proposal. Known contradiction relations block consolidation, and execution revalidates the member set so stale or already-changed proposals cannot silently alter current memory.

When a proposal is executed, equivalent members are retired from active retrieval and linked to the selected canonical memory through `consolidated_into_memory_id` plus the Certified Memory relation graph. Their original rows, content hashes, certification identities, effective versions and immutable proposal snapshots are not deleted; historical source memories remain traceable. Consolidation therefore reduces duplicate retrieval without erasing provenance, dissent history, prior certification, review evidence or usage receipts.

This control does not establish semantic equivalence across languages, domains or jurisdictions. Language-sensitive duplicate hints remain conservative, and a missing contradiction hint is not evidence that two claims are equivalent. Consequential consolidation still requires human review of scope, applicability, validity, jurisdiction, modal force, quantities and source lineage.

## Release evaluation protocol

The following are DataNest acceptance requirements, not thresholds specified by ISO.

Use consented or purpose-built evaluation material with qualified bilingual/domain reviewers. Keep all fixtures marked synthetic and excluded from production learning. Split train/tuning and held-out evaluation by source family to prevent translations of the same source leaking between splits.

Start coverage planning with English, isiZulu, isiXhosa, Afrikaans and Sesotho plus the actual languages requested by users. Include mixed-language input, accents, regional terminology, ambiguous dates, low-resource conditions and non-Latin scripts. This is a proposed evaluation scope, not a supported-language claim. Record sample counts and uncertainty; do not average away a failing language or domain.

Measure retrieval Recall@k/nDCG against reviewed relevance labels, claim/negation/quantity preservation, terminology accuracy, citation entailment, appropriate clarification/abstention, contradiction detection and reviewer agreement with adjudication. Also measure unauthorized-scope leakage and mistaken evidence independence. Retrieval metrics and lexical overlap cannot substitute for meaning preservation.

Release gates: zero observed scope leaks, zero automatic promotion of uncertified translations and zero missed seeded critical negation/quantity contradictions in the release fixtures. These are fixture gates, not claims of zero real-world risk. Owners must pre-register numeric per-language quality thresholds and sample requirements before collecting release results; unassessed or failing language/domain combinations remain experimental and cannot gain automatic shared-learning eligibility.

Record dataset/version, source rights, languages, reviewer qualifications, results by slice, confidence intervals where meaningful, unresolved disagreements, policy/model versions and release decision. Keep evaluation outputs separate from learned memory.

## Ownership and sequence

The project Owner assigns accountable roles before claiming assessed alignment: knowledge steward (concepts and review), language/domain reviewers (meaning), security/privacy owner (scope and rights), evaluation owner (datasets and metrics), release owner (gates and rollback). These are required roles, not appointments of specific people.

Next implementation order: add Unicode-aware/scoped multilingual retrieval; add concept registry and shared definitions; establish per-language comprehension evaluations; assess the management-system controls against authorized standards. Each step requires its own tests and governed release. Review this register after incidents and relevant standards/model changes, and at least quarterly as a DataNest policy.

## Unicode discovery implementation

`normalizeTrendTokens` now normalizes a derived search representation to NFC, preserves accents and non-Latin scripts, retains short non-ASCII tokens, and rejects combining-mark-only noise. Original evidence and its content hash are not rewritten. English aliases/stopwords remain heuristic; whitespace tokenization does not provide word segmentation for every script. NFC equivalence is character equivalence, not semantic equivalence.

`requiresLanguageReview` treats supplied `source_language` or `language` metadata outside the English tag family (including unknown, mixed, malformed and empty values), an explicit `language_review_required` flag, and non-ASCII letters/marks/numbers as review signals. An English tag cannot override the script check. The candidate is assigned the existing high-risk review route so `automatedLearningGateResults` does not auto-validate it. This reflects limitations of the current evaluator, not lower trust in a language or its speakers. The computed candidate includes `languageReviewRequired`; persistence currently carries the high-risk class and linked source metadata rather than a separate review-reason column.

Missing language metadata on ASCII-only content retains legacy behavior for compatibility. This is NOT reliable English detection: untagged ASCII Afrikaans, isiZulu, transliteration and code-switching can still evade this review signal. Human chat and external-AI intake now accept an optional `sourceLanguage` declaration and reject malformed supplied tags; absence remains explicit rather than inferred. Complete capture, language-aware analysis and qualified per-language review remain required before claiming complete multilingual control. No existing certified records are reclassified by this change.

## Language metadata capture implementation

`buildEvidenceLanguageMetadata` records whether a source-language declaration was supplied, its canonical BCP 47 form when supplied, the declaration basis, deterministic review reasons and the resulting `language_review_required` flag. It does not run a language detector. A missing declaration is stored as `language_metadata_status: "not_supplied"` without inventing a `source_language` value, which preserves the compatibility behavior documented above.

Human chat evidence uses the basis `user_declared`; imported external-AI evidence uses `user_declared_for_external_evidence`. Replays of already-staged external evidence reject a conflicting supplied language declaration rather than rewriting append-only provenance. File-derived propositions do not claim a detected source language; they retain `not_supplied` status and still receive the Unicode-script review signal when applicable.

A valid tag is metadata, not proof of fluency, translation quality or comprehension. Non-English, unknown/multiple-language declarations and non-ASCII language signals continue through the existing high-risk candidate path, which withholds low-risk automated validation. Signaled candidates now also require a separate human `LANGUAGE_REVIEW` validation record before certification. A reviewer qualification registry and per-language benchmark suite are still required before DataNest can treat that review as evidence of qualified multilingual comprehension.

## Derivation-family independence and semantic-equivalence review

Explicitly declared translations, paraphrases, summaries, transcriptions and other derived evidence are stored in the service-only staging lineage tables `ai_evidence_derivations` and `ai_evidence_derivation_reviews`. The lineage relation is immutable: each derived event is bound to one parent event, one root source-family event, a derivation kind and a transformation version. Semantic review is append-only; a later review never erases the prior decision.

External-AI intake accepts a derivation declaration only when `derivedFromEventId`, `derivationKind` and `transformationVersion` are supplied together. The parent must already exist in the same project. The child inherits the parent's root source family, so a chain of translations or paraphrases remains one evidence family. Replays must match the immutable lineage or are rejected.

Learning independence now uses the root derivation family before any legacy `independence_key`. Multiple translations, paraphrases or summaries of one source therefore count as one independent source even when produced by different providers or sessions. Any declared derivation forces the candidate onto a human-governed path; review can establish semantic equivalence but never converts dependent evidence into independent corroboration.

Semantic-equivalence decisions require explicit source and target BCP 47 metadata plus active reviewer-registry coverage with the `semantic_equivalence` scope for every reviewed language. The reviewer records either `equivalent` or `changed`, with a substantive basis and exact qualification IDs. A materially changed result cannot support certification as equivalent evidence. Revoked reviewer qualifications make an earlier equivalence review stale.

Candidate validation seals and certification decisions bind a hash of the current derivation/review state. Adding lineage, changing the latest review, or revoking a bound qualification invalidates the previously bound review state for derived candidates. Certification and promotion fail closed until current qualified equivalence evidence and matching validation/certification state are present.

These controls operate only on declared lineage. DataNest does not infer that two texts are translations, does not auto-translate them, and does not claim semantic-equivalence quality from lexical similarity. Existing evidence is not retroactively assigned derivation families. Full PROV export, automatic lineage discovery and cross-language concept mapping remain future work.

## Validated language review gate

`summarizeLanguageReviewEvidence` derives a candidate-level review requirement from the linked, preserved intake evidence rather than trusting the candidate label alone. Candidates without a review signal retain the existing AUDIT → VERIFY → VALIDATE → STRESS_TEST path. Candidates with a signal use AUDIT → VERIFY → LANGUAGE_REVIEW → VALIDATE → STRESS_TEST; automatic certification is explicitly disabled for that path.

The `LANGUAGE_REVIEW` record is human-only. The certification console requires one or more reviewed BCP 47 language tags, a written review basis/limitations statement, an affirmative meaning-preservation attestation, and an affirmative statement that no unresolved semantic ambiguity remains. The backend derives pass/fail from those fields instead of accepting a generic pass flag. The validation evidence also records the source-language tags/signals and exact linked evidence IDs under the candidate validation seal.

The reviewer qualification registry is service-only and project-scoped. Owner-recorded entries identify reviewer, BCP 47 language tag, qualification scope, evidence basis, verification actor/time, active state and explicit revocation provenance. Qualification records are append-only across replacement cycles: an active qualification must be revoked before a new qualification for the same language and scope is registered. A passing `LANGUAGE_REVIEW` requires active registry coverage for every reviewed language and records the exact qualification IDs under the current candidate seal. Final certification rechecks those exact qualification records; if one has been revoked or the review predates the current qualification policy, the language review must be repeated. Registry verification is a DataNest governance control, not proof of external professional accreditation or multilingual comprehension quality. Existing Certified Memory is not retroactively reclassified by this change.

For non-ASCII text, near-identical token sets alone no longer generate duplicate hints unless the original strings are equal after NFC normalization. English negation/scalar checks are still incomplete for other languages; absence of a hint never proves consistency. There is no automatic translation or cross-language concept merging.

Regression tests cover canonical equivalence, accents, Arabic, Devanagari, CJK, Hangul, full-width numerals, language metadata, source preservation and withholding automated validation. These are deterministic software checks, not bilingual comprehension benchmarks or evidence of ISO conformity.
