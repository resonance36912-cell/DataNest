import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEvidenceLanguageMetadata,
  canonicalizeDeclaredLanguage,
  hasNonAsciiLanguageSignal
} from "../../supabase/functions/_shared/datanestLanguageMetadata.ts";

test("declared BCP 47 language tags are canonicalized without language inference",()=>{
  assert.equal(canonicalizeDeclaredLanguage("en-za"),"en-ZA");
  assert.equal(canonicalizeDeclaredLanguage("af"),"af");
  assert.throws(()=>canonicalizeDeclaredLanguage("bad_tag"),/valid BCP 47/);
  assert.throws(()=>canonicalizeDeclaredLanguage(""),/non-empty BCP 47/);
  assert.throws(()=>canonicalizeDeclaredLanguage(null),/non-empty BCP 47/);
});

test("missing ASCII language metadata remains explicitly not supplied for compatibility",()=>{
  const metadata=buildEvidenceLanguageMetadata({
    content:"Use compact project headers"
  });
  assert.equal(metadata.language_metadata_status,"not_supplied");
  assert.equal(metadata.source_language_basis,"not_supplied");
  assert.equal(Object.hasOwn(metadata,"source_language"),false);
  assert.equal(metadata.language_review_required,false);
  assert.deepEqual(metadata.language_review_reasons,[]);
});

test("declared non-English and unknown language tags require governed review",()=>{
  for(const sourceLanguage of ["af","zu-ZA","xh","st","und","mul"]){
    const metadata=buildEvidenceLanguageMetadata({
      content:"Gebruik kort opskrifte vir projek werk",
      declaredLanguageProvided:true,
      declaredLanguage:sourceLanguage,
      declaredBasis:"user_declared"
    });
    assert.equal(metadata.source_language,canonicalizeDeclaredLanguage(sourceLanguage));
    assert.equal(metadata.language_metadata_status,"declared");
    assert.equal(metadata.source_language_basis,"user_declared");
    assert.equal(metadata.language_review_required,true);
    assert.deepEqual(metadata.language_review_reasons,["declared_language_requires_review"]);
  }
});

test("an English declaration cannot suppress the existing Unicode review signal",()=>{
  const metadata=buildEvidenceLanguageMetadata({
    content:"Café résumé",
    declaredLanguageProvided:true,
    declaredLanguage:"en-ZA",
    declaredBasis:"user_declared"
  });
  assert.equal(metadata.source_language,"en-ZA");
  assert.equal(metadata.language_review_required,true);
  assert.deepEqual(metadata.language_review_reasons,["non_ascii_letter_mark_or_number"]);
  assert.equal(hasNonAsciiLanguageSignal("plain ASCII 123"),false);
  assert.equal(hasNonAsciiLanguageSignal("中文 １２"),true);
});
