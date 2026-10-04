import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveCalmerMetrics,
  classifyCalmerTier,
  buildGateSoftening,
  buildCalmerState
} from "../../scripts/calmer-governance.mjs";

const config={
  pressure:"maximum-softening-within-hard-pass-floor",
  domainFloorsHours:{
    ownerOperator:1,engineeringReview:4,securityReview:8,visualReview:4,
    governanceReview:8,legalReview:12,externalReview:12,operationsReview:4
  },
  evidenceReuseMinutes:{stone:60,gold:180,diamond:360},
  tiers:{
    stone:{label:"STONE",minimums:{accuracy:0.80,performance:0.70,security:0.90,contribution:0.50},benefits:["stone"]},
    gold:{label:"GOLD",minimums:{accuracy:0.90,performance:0.85,security:0.95,contribution:0.70},benefits:["gold"]},
    diamond:{label:"DIAMOND",minimums:{accuracy:0.97,performance:0.95,security:1.00,contribution:0.90},benefits:["diamond"]}
  },
  tierScopes:["functions","processes","builds"],
  nonNegotiable:["security"],
  controls:{mayRemoveHardGate:false}
};

const gateConfig={
  maxHumanHours:72,
  humanBuckets:[6,12,24,36,48,60,72],
  humanResponseAssumptions:{
    engineeringReview:{typicalHours:8},
    securityReview:{typicalHours:12},
    governanceReview:{typicalHours:12}
  },
  taskComplexityHours:{routine:2,standard:6,complex:12,cross_system:18},
  reportingComplexityHours:{summary:2,standard:4,detailed:8,audit_grade:12},
  gateProfiles:{
    "ci.yml":{
      gateId:"ci",gateType:"automated_validation",taskComplexity:"complex",
      reportingComplexity:"standard",reviewDomains:["engineeringReview"]
    },
    "security-scan.yml":{
      gateId:"security-scan",gateType:"automated_validation",taskComplexity:"complex",
      reportingComplexity:"audit_grade",reviewDomains:["securityReview","governanceReview"]
    }
  }
};

test("CALMER derives strong evidence metrics and DIAMOND package when thresholds are met",()=>{
  const metrics=deriveCalmerMetrics({
    guardian:{
      status:"healthy",health:{score:100},
      checks:[
        {weight:50,earned:50},{weight:25,earned:25},{weight:25,earned:25}
      ],
      observed:{knowledge:{itemCount:120},botsquad:{botCount:10}}
    },
    enforcer:{status:"pass"},
    conductor:{allProcessesFresh:true},
    knowledge:{itemCount:120},
    suggester:{summary:{total:20}}
  });
  assert.deepEqual(metrics,{accuracy:1,performance:1,security:1,contribution:1});
  assert.equal(classifyCalmerTier(metrics,config.tiers),"diamond");
});

test("CALMER softens planning windows without removing hard controls",()=>{
  const proposals=buildGateSoftening(config,gateConfig);
  const ci=proposals.find(x=>x.gateId==="ci");
  const security=proposals.find(x=>x.gateId==="security-scan");
  assert.ok(ci.minimumPassPlanningHours<ci.baselinePlanningHours);
  assert.ok(security.minimumPassPlanningHours<=security.baselinePlanningHours);
  assert.equal(ci.hardControlsPreserved,true);
  assert.equal(security.hardControlsPreserved,true);
});

test("CALMER suspends softening when ENFORCER blocks",()=>{
  const state=buildCalmerState({
    config,gateConfig,
    guardian:{status:"healthy",health:{score:100},checks:[{weight:100,earned:100}],observed:{knowledge:{itemCount:100},botsquad:{botCount:10}}},
    enforcer:{status:"block"},
    conductor:{allProcessesFresh:true},
    knowledge:{itemCount:100},
    suggester:{summary:{total:20}}
  });
  assert.equal(state.status,"softening-suspended");
  assert.equal(state.tier,"UNQUALIFIED");
  assert.equal(state.summary.hardControlsRemoved,0);
  assert.ok(state.gateSoftening.every(x=>x.maximumSofteningHours===0));
});

test("STONE GOLD DIAMOND packages cover functions processes and builds",()=>{
  const state=buildCalmerState({
    config,gateConfig,
    guardian:{status:"healthy",health:{score:100},checks:[{weight:100,earned:100}],observed:{knowledge:{itemCount:100},botsquad:{botCount:10}}},
    enforcer:{status:"pass"},
    conductor:{allProcessesFresh:true},
    knowledge:{itemCount:100},
    suggester:{summary:{total:20}}
  });
  assert.equal(state.tier,"DIAMOND");
  assert.deepEqual(state.packages.map(x=>x.scope),["functions","processes","builds"]);
  assert.ok(state.packages.every(x=>x.fastLaneEligible===true));
});
