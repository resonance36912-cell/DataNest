import test from "node:test";
import assert from "node:assert/strict";
import {formatDualAdvocacyResponse,parseCompleteDualAdvocacyResponse,parseDualAdvocacyResponse} from "../../supabase/functions/_shared/dualAdvocacy.ts";

test("complete dual advocacy can be stored and shown",()=>{
  const response=parseCompleteDualAdvocacyResponse('```json\n{"angelsAdvocate":"Pro","devilsAdvocate":"Con","synthesis":"Next step"}\n```');
  assert.deepEqual(response,{
    angelsAdvocate:"Pro",
    devilsAdvocate:"Con",
    synthesis:"Next step"
  });
  assert.match(formatDualAdvocacyResponse(response),/SYNTHESIS\nNext step/);
});

test("incomplete provider output cannot become cumulative working memory",()=>{
  assert.equal(parseCompleteDualAdvocacyResponse("A single unstructured answer"),null);
  assert.equal(parseCompleteDualAdvocacyResponse('{"angelsAdvocate":"Pro","synthesis":"Next step"}'),null);
  assert.equal(parseCompleteDualAdvocacyResponse('{"angelsAdvocate":"Pro","devilsAdvocate":"Con","synthesis":" "}'),null);
  assert.equal(parseDualAdvocacyResponse("A single unstructured answer").synthesis,"Re-run the command to obtain the complete dual-advocacy response.");
});
