import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTrendTokens,requiresLanguageReview,candidateFromRepeatedEvidence,classifyCertifiedMemoryRelation} from '../../supabase/functions/_shared/datanestAiTrends.ts';
import {automatedLearningGateResults} from '../../supabase/functions/_shared/datanestAiValidation.ts';

test('NFC search forms agree without stripping accents or rewriting evidence',()=>{
  const decomposed='Cafe\u0301 re\u0301sume\u0301';
  assert.deepEqual(normalizeTrendTokens(decomposed),normalizeTrendTokens('Café résumé'));
  assert.deepEqual(normalizeTrendTokens(decomposed),['café','résumé']);
  assert.equal(decomposed,'Cafe\u0301 re\u0301sume\u0301');
  assert.notDeepEqual(normalizeTrendTokens('résumé'),normalizeTrendTokens('resume'));
});
test('derived tokens retain short non-Latin words, combining marks and numbers',()=>{
  for(const value of ['中文','العربية','हिन्दी','日本語','한국어','１２３']){
    assert.ok(normalizeTrendTokens(value).includes(value.normalize('NFC')));
  }
  assert.deepEqual(normalizeTrendTokens('café\n中文\tالعربية').length,3);
  assert.deepEqual(normalizeTrendTokens('\u0301'),[]);
});
test('language tags and unsupported scripts can require review but never reduce risk',()=>{
  for(const language of ['zu-ZA','xh','af','st','und','mul','bad_tag','',null,42]){
    assert.equal(requiresLanguageReview({id:'e',content:'Use compact project headers',metadata:{source_language:language}}),true);
  }
  assert.equal(requiresLanguageReview({id:'e',content:'Use compact project headers',metadata:{source_language:'en-ZA'}}),false);
  assert.equal(requiresLanguageReview({id:'e',content:'Use compact project headers',metadata:{source_language:'en',language:'zu'}}),true);
  assert.equal(requiresLanguageReview({id:'e',content:'中文 headers',metadata:{source_language:'en',language_review_required:false}}),true);
});
test('Unicode discovery preserves source text and does not enter low-risk automated validation',()=>{
  const content='Cafe\u0301 re\u0301sume\u0301 project workflow headers';
  const events=[1,2,3].map(n=>({id:`e${n}`,content,sessionId:`s${n}`}));
  const candidate=candidateFromRepeatedEvidence(events);
  assert.ok(candidate);
  assert.equal(candidate.normalizedKnowledge,content);
  assert.equal(candidate.languageReviewRequired,true);
  assert.equal(candidate.riskClass,'high');
  assert.equal(candidate.lifecycleState,'INTAKE');
  assert.deepEqual(automatedLearningGateResults({normalizedKnowledge:content,riskClass:candidate.riskClass,evidenceCount:3,independentEvidenceCount:3,confidence:1,hasConflict:false,contentHash:'a'.repeat(64),evidenceHash:'b'.repeat(64),policyVersion:'test'}),[]);
  assert.equal(events[0].content,content);
});
test('ASCII non-English metadata also prevents the low-risk automatic path',()=>{
  const events=[1,2,3].map(n=>({id:`e${n}`,content:'Gebruik kort opskrifte vir projek werk',metadata:{source_language:'af'},sessionId:`s${n}`}));
  assert.equal(candidateFromRepeatedEvidence(events)?.riskClass,'high');
});
test('non-English lexical overlap is not sufficient to declare semantic duplicates',()=>{
  const sentence='العربية مشروع معرفة ذاكرة تعلم دليل مصدر سياق نتيجة مراجعة تحقق';
  assert.equal(classifyCertifiedMemoryRelation(sentence,sentence+' لا').relation,'related');
  assert.equal(classifyCertifiedMemoryRelation(sentence,sentence).relation,'duplicates');
});
