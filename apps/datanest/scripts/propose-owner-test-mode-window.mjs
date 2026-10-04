import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const OWNER_TEST_MODE_TIMEFRAME_MODEL_VERSION="datanest-owner-test-window-v1";
export const OWNER_TEST_MODE_TIME_BUCKETS=[6,12,24,36,48,60,72];

export const TASK_COMPLEXITY_HOURS={
  routine:2,
  standard:6,
  complex:12,
  cross_system:18
};

export const REPORTING_COMPLEXITY_HOURS={
  summary:2,
  standard:4,
  detailed:8,
  audit_grade:12
};

export const HUMAN_REVIEW_RESPONSE_ASSUMPTIONS={
  governanceReview:{
    typicalHours:12,
    rangeHours:[8,24],
    label:"Governance-impact review"
  },
  legalReview:{
    typicalHours:24,
    rangeHours:[12,48],
    label:"Legal review"
  },
  externalReview:{
    typicalHours:24,
    rangeHours:[12,48],
    label:"External / independent review"
  }
};

function clean(value){
  return typeof value==="string" ? value.trim() : "";
}

function isPlaceholder(value){
  const normalized=clean(value).toLowerCase();
  return !normalized || ["pending","todo","tbd","none","n/a"].includes(normalized);
}

function assertChoice(value,allowed,label){
  if (!allowed.includes(value)) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}`);
  }
}

function roundUpToBucket(hours){
  return OWNER_TEST_MODE_TIME_BUCKETS.find((bucket)=>hours<=bucket) || 72;
}

export function proposeOwnerTestModeWindow(env=process.env,now=new Date()){
  const taskComplexity=clean(env.DATANEST_UI_OWNER_TEST_MODE_TASK_COMPLEXITY) || "standard";
  const reportingComplexity=clean(env.DATANEST_UI_OWNER_TEST_MODE_REPORTING_COMPLEXITY) || "standard";

  assertChoice(
    taskComplexity,
    Object.keys(TASK_COMPLEXITY_HOURS),
    "DATANEST_UI_OWNER_TEST_MODE_TASK_COMPLEXITY"
  );
  assertChoice(
    reportingComplexity,
    Object.keys(REPORTING_COMPLEXITY_HOURS),
    "DATANEST_UI_OWNER_TEST_MODE_REPORTING_COMPLEXITY"
  );

  const pendingReviewDomains=[];
  for (const [key,envName] of [
    ["governanceReview","DATANEST_UI_GOVERNANCE_REVIEW_REF"],
    ["legalReview","DATANEST_UI_LEGAL_REVIEW_REF"],
    ["externalReview","DATANEST_UI_EXTERNAL_REVIEW_REF"]
  ]) {
    if (isPlaceholder(env[envName])) pendingReviewDomains.push(key);
  }

  const humanAssumptions=pendingReviewDomains.map((key)=>({
    key,
    ...HUMAN_REVIEW_RESPONSE_ASSUMPTIONS[key]
  }));

  const humanResponseHours=humanAssumptions.length
    ? Math.max(...humanAssumptions.map((item)=>item.typicalHours))
    : 4;
  const coordinationHours=Math.max(0,(pendingReviewDomains.length-1)*6);
  const taskHours=TASK_COMPLEXITY_HOURS[taskComplexity];
  const reportingHours=REPORTING_COMPLEXITY_HOURS[reportingComplexity];
  const rawHours=humanResponseHours+coordinationHours+taskHours+reportingHours;
  const recommendedHours=roundUpToBucket(rawHours);
  const capped=rawHours>72;

  const nowMillis=now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowMillis)) throw new Error("Proposal time must be a valid date");

  const recommendedExpiresAt=new Date(nowMillis+recommendedHours*3_600_000).toISOString();
  const confidence=pendingReviewDomains.length>=2 ? "medium" : "medium_high";

  const rationale=[
    `task complexity ${taskComplexity} (+${taskHours}h)`,
    `reporting complexity ${reportingComplexity} (+${reportingHours}h)`,
    `human response baseline ${humanResponseHours}h`,
    `coordination overhead ${coordinationHours}h for ${pendingReviewDomains.length} pending review domain(s)`
  ];

  return {
    modelVersion:OWNER_TEST_MODE_TIMEFRAME_MODEL_VERSION,
    modelType:"deterministic_ai_assisted_governance_heuristic",
    taskComplexity,
    reportingComplexity,
    pendingReviewDomains,
    pendingReviewCount:pendingReviewDomains.length,
    humanResponseAssumptions:humanAssumptions,
    humanResponseHours,
    coordinationHours,
    taskHours,
    reportingHours,
    rawHours,
    recommendedHours,
    recommendedExpiresAt,
    cappedAtMaximum:capped,
    confidence,
    rationale,
    interpretation:"Typical response assumptions are planning heuristics, not guarantees. Reviewers may respond sooner or later; the Owner retains bounded override authority."
  };
}

const directInvocation=
  process.argv[1] &&
  import.meta.url===pathToFileURL(resolve(process.argv[1])).href;

if (directInvocation) {
  const proposal=proposeOwnerTestModeWindow();
  console.log(JSON.stringify(proposal,null,2));
}
