import test from 'node:test';
import assert from 'node:assert/strict';
import { MEMORY_LANGUAGE_POLICY } from '../../supabase/functions/_shared/memoryLanguagePolicy.ts';
import { buildGovernedPrompt } from '../../supabase/functions/_shared/datanestAiRuntime.ts';
import { buildDevelopmentCommandPrompt, buildLegalEaglePrompt, parseCompleteDualAdvocacyResponse } from '../../supabase/functions/_shared/dualAdvocacy.ts';

const original='Chaza: café / cafe\u0301; 中文; isiZulu. Do not change 10 mg to 100 mg.';
const builders={
  datanest:()=>buildGovernedPrompt({governance:'GOVERNANCE',certifiedMemory:['trusted'],job:{},uncertifiedEvidence:[original],userMessage:original}),
  development:()=>buildDevelopmentCommandPrompt({job:{},workingMemory:[original],userMessage:original}),
  legal:()=>buildLegalEaglePrompt({jurisdiction:'South Africa',legalTask:'explanation',job:{},certifiedMemory:['trusted'],matterEvidence:[original],userMessage:original})
};
for(const [mode,build] of Object.entries(builders)){
  test(`${mode} includes language policy before unmodified multilingual evidence`,()=>{
    const prompt=build();
    assert.equal(prompt.split(MEMORY_LANGUAGE_POLICY).length-1,1);
    assert.ok(prompt.indexOf(MEMORY_LANGUAGE_POLICY)<prompt.indexOf(original));
    assert.ok(prompt.endsWith(original));
    assert.ok(prompt.includes(JSON.stringify([original])));
  });
}
test('localized prose retains the required dual-advocacy schema',()=>{
  const reply={angelsAdvocate:'Ukuqonda',devilsAdvocate:'Onsekerheid',synthesis:'中文'};
  assert.deepEqual(parseCompleteDualAdvocacyResponse(JSON.stringify(reply)),reply);
  assert.equal(parseCompleteDualAdvocacyResponse(JSON.stringify({engel:'yes',duiwel:'no',samevatting:'maybe'})),null);
});
