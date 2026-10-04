#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const GH = "https://api.github.com";
const SB = "https://api.supabase.com";

export function normalizeBranchFamily(name) {
  let value = String(name || "").toLowerCase();
  const endings = [/-20\d{6}$/, /-current-main$/, /-current$/, /-final$/, /-v\d+$/];
  for (let changed = true; changed;) {
    changed = false;
    for (const ending of endings) {
      const next = value.replace(ending, "");
      if (next !== value) { value = next; changed = true; }
    }
  }
  return value;
}

export function extractAuditIds(text) {
  return [...new Set(String(text || "").match(/AUD-\d{3}/g) || [])].sort();
}

const ageDays = (date, now = new Date()) =>
  date ? Math.max(0, (now - new Date(date)) / 86400000) : Number.NaN;
const matches = (value, patterns = []) =>
  patterns.some((p) => new RegExp(p).test(value));

export function classifyBranch(branch, config, now = new Date()) {
  const age = ageDays(branch.updatedAt, now);
  const rawAhead = branch.compare?.ahead_by ?? branch.compare?.aheadBy;
  const rawBehind = branch.compare?.behind_by ?? branch.compare?.behindBy;
  const ahead = rawAhead == null ? null : Number(rawAhead);
  const behind = rawBehind == null ? null : Number(rawBehind);
  const status = branch.compare?.status || "unknown";

  if (branch.protected || branch.name === config.baseBranch || matches(branch.name, config.protectedPatterns))
    return { decision:"keep", reason:"protected", ageDays:age, ahead, behind, status };
  if (branch.openPr)
    return { decision:"keep", reason:"open_pr", ageDays:age, ahead, behind, status };
  if (ahead === 0 && status !== "unknown" && Number.isFinite(age))
    return { decision:"delete_candidate", reason:branch.mergedPr ? "merged_no_unique_commits" : "no_unique_commits", ageDays:age, ahead, behind, status };
  if (branch.familyContainedBy && ahead != null && ahead > 0)
    return {
      decision:"review",
      reason:"superseded_reachable_from_sibling",
      preservedBy:branch.familyContainedBy,
      ageDays:age,
      ahead,
      behind,
      status
    };
  if (branch.mergedPr && ahead != null && ahead > 0 && branch.postMergeActivity)
    return { decision:"review", reason:"post_merge_unique_commits", ageDays:age, ahead, behind, status };
  if (branch.mergedPr && ahead != null && ahead > 0 && branch.archiveMatchesTip)
    return {
      decision:"archived",
      reason:"merged_history_archived",
      archiveTag:branch.archiveTag || null,
      ageDays:age,
      ahead,
      behind,
      status
    };
  if (branch.mergedPr && ahead != null && ahead > 0)
    return { decision:"review", reason:"merged_pr_unique_history", ageDays:age, ahead, behind, status };
  if (Number.isFinite(age) && age >= config.staleDays && ahead != null && ahead > 0)
    return { decision:"review", reason:"stale_unique_work", ageDays:age, ahead, behind, status };
  if (branch.familyDivergedFrom)
    return {
      decision:"review",
      reason:"divergent_family_variant",
      divergedFrom:branch.familyDivergedFrom.name,
      familyStatus:branch.familyDivergedFrom.status || "diverged",
      familyAhead:branch.familyDivergedFrom.ahead ?? null,
      familyBehind:branch.familyDivergedFrom.behind ?? null,
      ageDays:age,
      ahead,
      behind,
      status
    };
  if (branch.familyHasNewerSibling)
    return { decision:"review", reason:"possible_superseded_variant", ageDays:age, ahead, behind, status };
  return { decision:"keep", reason:"active_or_unresolved", ageDays:age, ahead, behind, status };
}

export function isArchivedPruneTarget(branch, config = {}, requested = false) {
  return !!(
    requested &&
    config.allowArchivedPrune === true &&
    branch?.classification?.decision === "archived" &&
    branch?.classification?.reason === "merged_history_archived" &&
    branch?.classification?.archiveTag
  );
}

export function evaluateSupabaseProject(project, config = {}) {
  const checks = [];
  const status = project.project?.status || project.status || "UNKNOWN";
  if (!String(status).includes("HEALTHY"))
    checks.push({ level:"blocker", code:"project_unhealthy", detail:"Project status: " + status });

  for (const advisor of project.securityAdvisors || []) {
    const severity = String(advisor.level || advisor.severity || "warning").toLowerCase();
    checks.push({
      level:/critical|error/.test(severity) ? "blocker" : "warning",
      code:"security_advisor",
      detail:advisor.title || advisor.name || advisor.detail || "Supabase security advisor requires review"
    });
  }

  for (const b of project.branches || []) {
    const branchStatus = String(b.status || "UNKNOWN");
    if (/FAILED|ERROR/i.test(branchStatus))
      checks.push({
        level:b.is_default ? "blocker" : "warning",
        code:"supabase_branch_failure",
        detail:(b.name || b.git_branch || b.id) + ": " + branchStatus
      });
    if (config.expectedGitBranch && b.is_default && b.git_branch !== config.expectedGitBranch)
      checks.push({
        level:"warning",
        code:"git_branch_mapping_drift",
        detail:"Expected " + config.expectedGitBranch + ", got " + (b.git_branch || "unset")
      });
  }
  return checks;
}

export function getStrictBlockers(supabase) {
  return [
    ...(supabase?.globalChecks || []),
    ...(supabase?.projects || []).flatMap((p) => p.checks || []),
  ].filter((c) => c.level === "blocker");
}

export function migrationNameFromFile(file) {
  return String(file || "")
    .replace(/\.sql$/i, "")
    .replace(/^\d{14}_/, "");
}

export function compareMigrationParity(repoFiles = [], liveMigrations = []) {
  const repoEntries = repoFiles
    .filter((file) => String(file).endsWith(".sql"))
    .map((file) => ({
      file,
      version:(String(file).match(/^(\d{14})_/) || [])[1] || null,
      name:migrationNameFromFile(file),
    }));
  const liveEntries = liveMigrations
    .filter((m) => m?.name)
    .map((m) => ({ version:String(m.version || ""), name:String(m.name) }));

  const repoNames = new Set(repoEntries.map((m) => m.name));
  const liveNames = new Set(liveEntries.map((m) => m.name));
  const repoVersionsByName = new Map(repoEntries.map((m) => [m.name, m.version]));
  const liveVersionsByName = new Map(liveEntries.map((m) => [m.name, m.version]));

  return {
    repoCount:repoEntries.length,
    liveCount:liveEntries.length,
    repoOnly:[...repoNames].filter((name) => !liveNames.has(name)).sort(),
    liveOnly:[...liveNames].filter((name) => !repoNames.has(name)).sort(),
    versionMismatches:[...repoNames]
      .filter((name) => liveNames.has(name))
      .filter((name) => {
        const repoVersion = repoVersionsByName.get(name);
        const liveVersion = liveVersionsByName.get(name);
        return liveVersion && repoVersion !== liveVersion;
      })
      .map((name) => ({
        name,
        repoVersion:repoVersionsByName.get(name),
        liveVersion:liveVersionsByName.get(name),
      })),
  };
}

export function parseArgs(argv) {
  const out = { apply:false, strict:false, pruneArchived:false, gitOnlySafeApply:false, config:"branch-cleaner.config.json", reportDir:"artifacts/branch-cleaner", staleDays:null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") out.apply = true;
    else if (argv[i] === "--git-only-safe-apply") { out.apply = true; out.gitOnlySafeApply = true; }
    else if (argv[i] === "--strict") out.strict = true;
    else if (argv[i] === "--prune-archived") out.pruneArchived = true;
    else if (argv[i] === "--config") out.config = argv[++i];
    else if (argv[i] === "--report-dir") out.reportDir = argv[++i];
    else if (argv[i] === "--stale-days") out.staleDays = Number(argv[++i]);
  }
  return out;
}

async function json(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers:{
      Accept:"application/json",
      ...(token ? { Authorization:"Bearer " + token } : {}),
      "User-Agent":"resonance-branch-cleaner",
      ...(options.headers || {})
    }
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (!response.ok) {
    const error = new Error(String(data?.message || data?.error || (response.status + " " + response.statusText)));
    error.status = response.status;
    throw error;
  }
  return data;
}

const gh = (repo, endpoint, token, options) =>
  json(GH + "/repos/" + repo + endpoint, token, {
    ...options,
    headers:{ "X-GitHub-Api-Version":"2022-11-28", ...(options?.headers || {}) }
  });
const sb = (endpoint, token) => json(SB + endpoint, token);

async function paginate(repo, endpoint, token) {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const join = endpoint.includes("?") ? "&" : "?";
    const data = await gh(repo, endpoint + join + "per_page=100&page=" + page, token);
    if (!Array.isArray(data)) break;
    out.push(...data);
    if (data.length < 100) break;
  }
  return out;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length:Math.min(limit, Math.max(items.length, 1)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

export function buildArchiveTips(archiveRefsRaw, archiveTagPrefix) {
  const archiveRefs = Array.isArray(archiveRefsRaw) ? archiveRefsRaw : [];
  const archiveRefPrefix = "refs/tags/" + archiveTagPrefix;
  const archiveTips = new Map();
  for (const ref of archiveRefs) {
    if (!String(ref?.ref || "").startsWith(archiveRefPrefix)) continue;
    const branchName = String(ref.ref).slice(archiveRefPrefix.length);
    if (!branchName) continue;
    archiveTips.set(branchName, ref?.object?.sha || null);
  }
  return archiveTips;
}

export function indexPullRequestsByBranch(prs, repo) {
  const prsByBranch = new Map();
  for (const pr of prs || []) {
    if (pr.head?.repo?.full_name && pr.head.repo.full_name !== repo) continue;
    if (!pr.head?.ref) continue;
    prsByBranch.set(pr.head.ref, [...(prsByBranch.get(pr.head.ref) || []), pr]);
  }
  return prsByBranch;
}

async function collectBranchFacts(repo, token, branches, prsByBranch, archiveTips, config, archiveTagPrefix) {
  return mapLimit(branches, 6, async (branch) => {
    const [commit, compare] = await Promise.allSettled([
      gh(repo, "/commits/" + branch.commit.sha, token),
      branch.name === config.baseBranch
        ? Promise.resolve({ status:"identical", ahead_by:0, behind_by:0 })
        : gh(repo, "/compare/" + encodeURIComponent(config.baseBranch) + "..." + encodeURIComponent(branch.name), token)
    ]);
    const commitData = commit.status === "fulfilled" ? commit.value : {};
    const compareData = compare.status === "fulfilled" ? compare.value : { status:"unknown" };
    const linked = prsByBranch.get(branch.name) || [];
    const updatedAt = commitData.commit?.committer?.date || commitData.commit?.author?.date || null;
    const mergedAt = linked.map((pr) => pr.merged_at).filter(Boolean).sort().at(-1) || null;
    const postMergeActivity = !!(
      mergedAt &&
      updatedAt &&
      Number.isFinite(Date.parse(mergedAt)) &&
      Number.isFinite(Date.parse(updatedAt)) &&
      Date.parse(updatedAt) > Date.parse(mergedAt)
    );
    return {
      name:branch.name,
      sha:branch.commit.sha,
      protected:!!branch.protected,
      updatedAt,
      mergedAt,
      postMergeActivity,
      compare:{
        status:compareData.status || "unknown",
        ahead_by:compareData.ahead_by ?? null,
        behind_by:compareData.behind_by ?? null
      },
      openPr:linked.some((pr) => pr.state === "open"),
      mergedPr:linked.some((pr) => !!pr.merged_at),
      archiveTag:archiveTips.has(branch.name) ? archiveTagPrefix + branch.name : null,
      archiveMatchesTip:archiveTips.get(branch.name) === branch.commit.sha,
      auditIds:extractAuditIds(linked.map((pr) => (pr.title || "") + "\n" + (pr.body || "")).join("\n"))
    };
  });
}

function groupBranchFamilies(facts) {
  const families = new Map();
  for (const branch of facts) {
    const family = normalizeBranchFamily(branch.name);
    families.set(family, [...(families.get(family) || []), branch]);
  }
  return families;
}

async function analyzeBranchFamilies(repo, token, facts) {
  const superseded = new Set();
  const containedBy = new Map();
  const divergedFrom = new Map();
  for (const group of groupBranchFamilies(facts).values()) {
    const ordered = [...group]
      .sort((a,b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    const newest = ordered[0];
    for (const older of ordered.slice(1)) {
      superseded.add(older.name);
      try {
        const relation = await gh(
          repo,
          "/compare/" + encodeURIComponent(older.sha) + "..." + encodeURIComponent(newest.sha),
          token
        );
        if (relation?.merge_base_commit?.sha === older.sha && Number(relation.behind_by || 0) === 0) {
          containedBy.set(older.name, newest.name);
        } else if (relation?.status && relation.status !== "unknown") {
          divergedFrom.set(older.name, {
            name:newest.name,
            status:relation.status,
            ahead:relation.ahead_by ?? null,
            behind:relation.behind_by ?? null,
          });
        }
      } catch {
        // Naming/date similarity alone is not enough to claim ancestry.
      }
    }
  }
  return { superseded, containedBy, divergedFrom };
}

function classifyBranchFacts(facts, familyState, config) {
  return facts.map((branch) => ({
    ...branch,
    family:normalizeBranchFamily(branch.name),
    classification:classifyBranch({
      ...branch,
      familyHasNewerSibling:familyState.superseded.has(branch.name),
      familyContainedBy:familyState.containedBy.get(branch.name) || null,
      familyDivergedFrom:familyState.divergedFrom.get(branch.name) || null
    }, config)
  }));
}

async function githubAudit(repo, token, config) {
  const archiveTagPrefix = String(config.archiveTagPrefix || "branch-archive/");
  const archiveEndpoint = "/git/matching-refs/tags/" +
    archiveTagPrefix.split("/").map(encodeURIComponent).join("/");
  const [branches, prs, archiveRefsRaw] = await Promise.all([
    paginate(repo, "/branches", token),
    paginate(repo, "/pulls?state=all&sort=updated&direction=desc", token),
    gh(repo, archiveEndpoint, token).catch(() => [])
  ]);
  const archiveTips = buildArchiveTips(archiveRefsRaw, archiveTagPrefix);
  const prsByBranch = indexPullRequestsByBranch(prs, repo);
  const facts = await collectBranchFacts(
    repo,
    token,
    branches,
    prsByBranch,
    archiveTips,
    config,
    archiveTagPrefix
  );
  const familyState = await analyzeBranchFamilies(repo, token, facts);
  return {
    pullRequestCount:prs.length,
    branches:classifyBranchFacts(facts, familyState, config)
  };
}

const digest = (text) => createHash("sha256").update(text).digest("hex");

async function learn(config) {
  const sources = [];
  let findings, backlog, index;
  for (const file of config.auditSources || []) {
    try {
      const text = await readFile(file, "utf8");
      sources.push({ path:file, sha256:digest(text), bytes:Buffer.byteLength(text) });
      if (file.endsWith("/findings.json")) findings = JSON.parse(text);
      if (file.endsWith("/remediation-backlog.json")) backlog = JSON.parse(text);
      if (file.endsWith("/audits/index.json")) index = JSON.parse(text);
    } catch (error) {
      sources.push({ path:file, error:error.message });
    }
  }
  const unresolved = (findings?.findings || [])
    .filter((f) => !["validated","remediated","closed"].includes(f.validation_state));
  return {
    sources,
    audit:{
      auditId:findings?.audit_id || null,
      certificationStatus:findings?.certification_status || null,
      validationState:findings?.validation_state ||
        index?.documents?.find((d) => d.document_type === "audit_return")?.findings?.validation_state || null,
      findingCount:findings?.findings?.length || 0,
      unresolvedCount:unresolved.length,
      highOrVerificationPriority:unresolved.filter((f) => String(f.priority || "").toUpperCase().startsWith("P1")).length,
      backlogCount:backlog?.items?.length || 0,
      unresolvedIds:unresolved.map((f) => f.id)
    }
  };
}

export function advisorList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.lints)) return data.lints;
  if (Array.isArray(data?.advisors)) return data.advisors;
  return [];
}

export function normalizeSupabaseProjectPayload(project) {
  project.branches = Array.isArray(project.branches) ? project.branches : project.branches?.branches || [];
  project.securityAdvisors = advisorList(project.securityAdvisors);
  project.performanceAdvisors = advisorList(project.performanceAdvisors);
  project.migrations = Array.isArray(project.migrations) ? project.migrations : project.migrations?.migrations || [];
  return project;
}

function migrationParityHasDrift(parity) {
  return !!(
    parity.repoOnly.length ||
    parity.liveOnly.length ||
    parity.versionMismatches.length
  );
}

function appendMigrationHistoryDriftCheck(project, historyLabel) {
  if (!project.migrationParity || !migrationParityHasDrift(project.migrationParity)) return;
  project.checks.push({
    level:"blocker",
    code:"migration_history_drift",
    detail:"Git migration history does not reproduce " + historyLabel + " migration history: " +
      project.migrationParity.repoCount + " repo files vs " +
      project.migrationParity.liveCount + " applied migrations; " +
      project.migrationParity.liveOnly.length + " live-only, " +
      project.migrationParity.repoOnly.length + " repo-only, " +
      project.migrationParity.versionMismatches.length + " version mismatches",
  });
}

async function attachMigrationParity(project, entry, historyLabel, captureErrors) {
  if (!entry.migrationSourceDir) return;
  const verify = async () => {
    if (project.errors.some((error) => error.key === "migrations")) {
      throw new Error("Supabase migration history could not be retrieved");
    }
    const repoFiles = await readdir(entry.migrationSourceDir);
    project.migrationParity = compareMigrationParity(repoFiles, project.migrations);
    if (entry.enforceMigrationParity) appendMigrationHistoryDriftCheck(project, historyLabel);
  };
  if (!captureErrors) {
    await verify();
    return;
  }
  try {
    await verify();
  } catch (error) {
    project.errors.push({ key:"migrationParity", status:null, message:error.message });
    if (entry.enforceMigrationParity) {
      project.checks.push({
        level:"blocker",
        code:"migration_parity_unresolved",
        detail:"Could not verify migration parity from " + entry.migrationSourceDir,
      });
    }
  }
}

function requiredSupabaseAuditFailures(project) {
  return project.errors.filter((error) =>
    ["project", "branches", "securityAdvisors", "migrations"].includes(error.key)
  );
}

function appendSupabaseAuditCompletenessCheck(project) {
  const requiredFailures = requiredSupabaseAuditFailures(project);
  if (!requiredFailures.length) return;
  project.checks.push({
    level:"blocker",
    code:"supabase_audit_incomplete",
    detail:"Required Supabase checks failed: " +
      requiredFailures.map((error) => error.key).join(", "),
  });
}

function supabaseProjectCalls(entry) {
  return [
    ["project", "/v1/projects/" + entry.ref],
    ["branches", "/v1/projects/" + entry.ref + "/branches"],
    ["securityAdvisors", "/v1/projects/" + entry.ref + "/advisors/security"],
    ["performanceAdvisors", "/v1/projects/" + entry.ref + "/advisors/performance"],
    ...(entry.migrationSourceDir
      ? [["migrations", "/v1/projects/" + entry.ref + "/database/migrations"]]
      : [])
  ];
}

async function fetchSupabaseProject(entry, token) {
  const project = { ref:entry.ref, role:entry.role, errors:[] };
  await Promise.all(supabaseProjectCalls(entry).map(async ([key, endpoint]) => {
    try {
      project[key] = await sb(endpoint, token);
    } catch (error) {
      project.errors.push({ key, status:error.status || null, message:error.message });
    }
  }));
  normalizeSupabaseProjectPayload(project);
  project.checks = evaluateSupabaseProject(project, entry);
  await attachMigrationParity(project, entry, "live", true);
  appendSupabaseAuditCompletenessCheck(project);
  return project;
}

async function supabaseAuditFromEvidence(config) {
  const file = config.supabaseEvidenceFile;
  if (!file) return null;
  try {
    const evidence = JSON.parse(await readFile(file, "utf8"));
    if (evidence.schemaVersion !== 1) throw new Error("Unsupported Supabase evidence schema");
    const generatedAt = Date.parse(evidence.generatedAt);
    const expiresAt = Date.parse(evidence.expiresAt);
    const now = Date.now();
    const maxAgeMs = Number(config.supabaseEvidenceMaxAgeMinutes || 30) * 60000;
    if (!Number.isFinite(generatedAt) || !Number.isFinite(expiresAt))
      throw new Error("Supabase evidence timestamps are invalid");
    if (generatedAt - now > 300000)
      throw new Error("Supabase evidence is dated too far in the future");
    if (now - generatedAt > maxAgeMs)
      throw new Error("Supabase evidence is older than the configured maximum age");
    if (now > expiresAt)
      throw new Error("Supabase evidence has expired");

    const expectedRefs = (config.supabaseProjects || []).map((entry) => entry.ref).sort();
    const evidenceRefs = (evidence.projects || []).map((entry) => entry.ref).sort();
    if (JSON.stringify(expectedRefs) !== JSON.stringify(evidenceRefs))
      throw new Error("Supabase evidence project refs do not match configured authorities");

    const projects = [];
    for (const entry of config.supabaseProjects || []) {
      const snapshot = evidence.projects.find((project) => project.ref === entry.ref);
      if (!snapshot?.project?.status)
        throw new Error("Supabase evidence is incomplete for " + entry.ref);

      const project = {
        ref:entry.ref,
        role:entry.role,
        errors:[],
        project:snapshot.project,
        branches:Array.isArray(snapshot.branches) ? snapshot.branches : [],
        securityAdvisors:Array.isArray(snapshot.securityAdvisors) ? snapshot.securityAdvisors : [],
        performanceAdvisors:[],
        migrations:Array.isArray(snapshot.migrations) ? snapshot.migrations : [],
      };
      project.checks = evaluateSupabaseProject(project, entry);
      await attachMigrationParity(project, entry, "verified", false);
      projects.push(project);
    }

    return {
      skipped:false,
      projects,
      globalChecks:[],
      evidence:{
        path:file,
        source:evidence.source || "verified snapshot",
        generatedAt:evidence.generatedAt,
        expiresAt:evidence.expiresAt,
      },
    };
  } catch (error) {
    return {
      skipped:true,
      reason:"Verified Supabase evidence unavailable: " + error.message,
      projects:[],
      globalChecks:[{
        level:"blocker",
        code:"supabase_evidence_invalid",
        detail:"Fresh verified Supabase evidence is required before strict destructive cleanup.",
      }],
    };
  }
}

async function supabaseAudit(config, token) {
  if (!token) {
    const evidence = await supabaseAuditFromEvidence(config);
    if (evidence) return evidence;
    return {
      skipped:true,
      reason:"SUPABASE_ACCESS_TOKEN not set",
      projects:[],
      globalChecks:[{
        level:"blocker",
        code:"supabase_audit_unavailable",
        detail:"Supabase verification is required before strict destructive cleanup.",
      }],
    };
  }

  const projects = [];
  for (const entry of config.supabaseProjects || []) {
    projects.push(await fetchSupabaseProject(entry, token));
  }

  const refs = new Set(projects.map((project) => project.ref));
  return {
    skipped:false,
    projects,
    globalChecks:refs.size === projects.length ? [] : [{
      level:"blocker",
      code:"duplicate_supabase_authority",
      detail:"Configured Supabase roles must use distinct project refs."
    }]
  };
}

async function revalidateDeletion(repo, token, branch, config, pruneArchived) {
  if (
    branch.name === config.baseBranch ||
    matches(branch.name, config.protectedPatterns)
  ) return { ok:false, reason:"protected_by_config" };

  const owner = repo.split("/")[0];
  const branchPath = encodeURIComponent(branch.name);
  const [liveBranch, openPrs] = await Promise.all([
    gh(repo, "/branches/" + branchPath, token),
    gh(repo, "/pulls?state=open&head=" + encodeURIComponent(owner + ":" + branch.name), token),
  ]);

  if (liveBranch?.protected) return { ok:false, reason:"protected_live" };
  if (Array.isArray(openPrs) && openPrs.length) return { ok:false, reason:"open_pr_live" };

  if (branch.classification.decision === "delete_candidate") {
    const compare = await gh(
      repo,
      "/compare/" + encodeURIComponent(config.baseBranch) + "..." + encodeURIComponent(branch.name),
      token
    );
    if (Number(compare?.ahead_by) !== 0 || compare?.status === "unknown")
      return { ok:false, reason:"unique_or_unknown_commits_live" };
    return { ok:true, liveSha:liveBranch?.commit?.sha || null, mode:"standard" };
  }

  if (!isArchivedPruneTarget(branch, config, pruneArchived))
    return { ok:false, reason:"archived_prune_not_authorized" };

  const archiveTag = String(branch.classification.archiveTag || "");
  const tagRef = ["tags", ...archiveTag.split("/")].map(encodeURIComponent).join("/");
  const [tag, commit, prs] = await Promise.all([
    gh(repo, "/git/ref/" + tagRef, token),
    gh(repo, "/commits/" + liveBranch.commit.sha, token),
    gh(repo, "/pulls?state=all&head=" + encodeURIComponent(owner + ":" + branch.name), token),
  ]);

  const liveSha = liveBranch?.commit?.sha || null;
  const tagSha = tag?.object?.sha || null;
  if (!liveSha || tagSha !== liveSha)
    return { ok:false, reason:"archive_tag_tip_mismatch_live" };

  const mergedAt = (Array.isArray(prs) ? prs : [])
    .map((p) => p.merged_at)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  if (!mergedAt) return { ok:false, reason:"merged_pr_missing_live" };

  const updatedAt = commit?.commit?.committer?.date || commit?.commit?.author?.date || null;
  if (
    !updatedAt ||
    !Number.isFinite(Date.parse(updatedAt)) ||
    !Number.isFinite(Date.parse(mergedAt)) ||
    Date.parse(updatedAt) > Date.parse(mergedAt)
  ) return { ok:false, reason:"post_merge_activity_live" };

  return { ok:true, liveSha, mode:"archived" };
}

async function applyDeletes(repo, token, branches, config, options = {}) {
  const deleted = [], failed = [];
  const pruneArchived = options.pruneArchived === true;
  const targets = branches.filter((branch) =>
    branch.classification.decision === "delete_candidate" ||
    isArchivedPruneTarget(branch, config, pruneArchived)
  );

  for (const b of targets) {
    try {
      const verification = await revalidateDeletion(repo, token, b, config, pruneArchived);
      if (!verification.ok) {
        failed.push({
          branch:b.name,
          status:null,
          message:"live deletion revalidation failed: " + verification.reason
        });
        continue;
      }
      const ref = ["heads", ...b.name.split("/")].map(encodeURIComponent).join("/");
      await gh(repo, "/git/refs/" + ref, token, { method:"DELETE" });
      deleted.push(b.name);
    } catch (error) {
      failed.push({ branch:b.name, status:error.status || null, message:error.message });
    }
  }
  return { deleted, failed };
}

const decisionCounts = (branches) =>
  branches.reduce((a,b) => {
    a[b.classification.decision] = (a[b.classification.decision] || 0) + 1;
    return a;
  }, {});

function markdown(r) {
  const lines = [
    "# Resonance Branch-Cleaner report",
    "",
    "Generated: " + r.generatedAt,
    "Repository: " + r.repository,
    "Mode: " + r.mode,
    "",
    "## Learning sources",
    "",
    "- External audit findings: " + r.learning.audit.findingCount +
      " (" + r.learning.audit.unresolvedCount + " unresolved; " +
      r.learning.audit.highOrVerificationPriority + " P1/P1-verify)",
    "- Remediation backlog items: " + r.learning.audit.backlogCount,
    "- Audit validation state: " + (r.learning.audit.validationState || "unknown"),
    "- Certification status: " + (r.learning.audit.certificationStatus || "not asserted"),
    "- Guardrails loaded: " + r.guardrails.length,
    "",
    "## GitHub branch hygiene",
    "",
    "- Branches inspected: " + r.github.branches.length,
    "- Pull requests indexed: " + r.github.pullRequestCount,
    "- Decisions: " + JSON.stringify(r.github.counts),
    ""
  ];
  for (const b of r.github.branches.filter((x) => x.classification.decision !== "keep")) {
    lines.push("- " + b.name + ": " + b.classification.decision + " / " +
      b.classification.reason + " / ahead=" + (b.classification.ahead ?? "?") +
      " / age=" + (Number.isFinite(b.classification.ageDays) ? b.classification.ageDays.toFixed(1) : "?") +
      (b.classification.preservedBy ? " / preserved-by=" + b.classification.preservedBy : "") +
      (b.classification.divergedFrom
        ? " / diverged-from=" + b.classification.divergedFrom +
          "(" + (b.classification.familyStatus || "diverged") +
          ",ahead=" + (b.classification.familyAhead ?? "?") +
          ",behind=" + (b.classification.familyBehind ?? "?") + ")"
        : "") +
      (b.classification.archiveTag ? " / archive-tag=" + b.classification.archiveTag : ""));
  }
  lines.push("", "## Supabase control-plane audit", "");
  if (r.supabase.skipped) {
    lines.push("Supabase checks skipped: " + r.supabase.reason);
  } else {
    for (const p of r.supabase.projects) {
      lines.push(
        "### " + p.role + " — " + p.ref,
        "- Project status: " + (p.project?.status || "unknown"),
        "- Branches returned: " + p.branches.length,
        "- Security advisors: " + p.securityAdvisors.length,
        "- Performance advisors: " + p.performanceAdvisors.length
      );
      if (p.migrationParity) {
        lines.push(
          "- Migration parity: repo=" + p.migrationParity.repoCount +
            ", live=" + p.migrationParity.liveCount +
            ", live-only=" + p.migrationParity.liveOnly.length +
            ", repo-only=" + p.migrationParity.repoOnly.length +
            ", version-mismatches=" + p.migrationParity.versionMismatches.length
        );
      }
      for (const c of p.checks) lines.push("- " + c.level + " " + c.code + ": " + c.detail);
      for (const e of p.errors) lines.push("- warning " + e.key + ": " + (e.status || "error") + " " + e.message);
      lines.push("");
    }
  }
  lines.push(
    "## Apply results",
    "",
    "- Deleted: " + (r.apply.deleted.join(", ") || "none"),
    "- Delete failures: " + r.apply.failed.length,
    "- Archived prune requested: " + (r.pruneArchived ? "yes" : "no"),
    "- Apply skipped: " + (r.apply.skipped ? (r.apply.reason || "yes") : "no"),
    "",
    "Branch-Cleaner reports evidence; it does not convert deletion, an advisor result, or a published audit into certification."
  );
  return lines.join("\n") + "\n";
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const config = JSON.parse(await readFile(a.config, "utf8"));
  if (Number.isFinite(a.staleDays) && a.staleDays > 0) config.staleDays = a.staleDays;
  if (a.pruneArchived && !a.apply)
    throw new Error("--prune-archived requires --apply.");
  if (a.pruneArchived && a.gitOnlySafeApply)
    throw new Error("--git-only-safe-apply cannot be combined with --prune-archived.");
  if (a.pruneArchived && config.allowArchivedPrune !== true)
    throw new Error("Archived pruning is disabled by branch-cleaner.config.json.");

  const repo = process.env.BRANCH_CLEANER_REPOSITORY || process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!repo || !token) throw new Error("Set GITHUB_REPOSITORY and GITHUB_TOKEN (or GH_TOKEN).");

  const [learning, github, supabase] = await Promise.all([
    learn(config),
    githubAudit(repo, token, config),
    supabaseAudit(config, process.env.SUPABASE_ACCESS_TOKEN)
  ]);

  if (!supabase.skipped) {
    const gitNames = new Set(github.branches.map((b) => b.name));
    for (const p of supabase.projects) {
      for (const b of p.branches) {
        if (b.git_branch && !gitNames.has(b.git_branch)) {
          p.checks.push({
            level:"warning",
            code:"supabase_git_branch_orphan",
            detail:(b.name || b.id) + " maps to missing Git branch " + b.git_branch
          });
        }
      }
    }
  }

  const strictBlockers = getStrictBlockers(supabase);
  const gitOnlySafeApply = a.gitOnlySafeApply === true && a.pruneArchived !== true;
  const apply = a.apply
    ? (strictBlockers.length && !gitOnlySafeApply
      ? {
          deleted:[],
          failed:[],
          skipped:true,
          reason:"control_plane_blockers",
          blockerCount:strictBlockers.length,
        }
      : await applyDeletes(repo, token, github.branches, config, { pruneArchived:gitOnlySafeApply ? false : a.pruneArchived }))
    : { deleted:[], failed:[], skipped:false };

  const report = {
    schemaVersion:1,
    generatedAt:new Date().toISOString(),
    repository:repo,
    mode:a.apply ? (a.gitOnlySafeApply ? "git-only-safe-apply" : (a.pruneArchived ? "apply+prune-archived" : "apply")) : "dry-run",
    pruneArchived:a.pruneArchived,
    gitOnlySafeApply:a.gitOnlySafeApply,
    guardrails:config.guardrails || [],
    learning,
    github:{ ...github, counts:decisionCounts(github.branches) },
    supabase,
    apply
  };

  await mkdir(a.reportDir, { recursive:true });
  await writeFile(path.join(a.reportDir, "branch-cleaner-report.json"), JSON.stringify(report, null, 2) + "\n");
  await writeFile(path.join(a.reportDir, "branch-cleaner-report.md"), markdown(report));
  process.stdout.write(markdown(report));

  if (a.strict && (strictBlockers.length || apply.failed.length)) process.exitCode = 2;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error("Branch-Cleaner failed: " + (error.stack || error.message));
    process.exitCode = 1;
  });
}
