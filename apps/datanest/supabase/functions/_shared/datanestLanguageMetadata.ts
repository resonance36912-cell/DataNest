export type DeclaredLanguageBasis =
  | "user_declared"
  | "user_declared_for_external_evidence";

const validEnglishTag=/^en(?:-|$)/i;
const nonAsciiLanguageSignal=/[\p{L}\p{M}\p{N}]/u;

export function canonicalizeDeclaredLanguage(value:unknown):string{
  if(typeof value!=="string"||!value.trim()){
    throw new Error("sourceLanguage must be a non-empty BCP 47 language tag.");
  }
  try{
    const canonical=Intl.getCanonicalLocales(value.trim());
    if(canonical.length!==1||!canonical[0]){
      throw new Error("invalid language tag");
    }
    return canonical[0];
  }catch{
    throw new Error("sourceLanguage must be a valid BCP 47 language tag.");
  }
}

export function hasNonAsciiLanguageSignal(content:string):boolean{
  return Array.from(content).some(character=>
    character.codePointAt(0)!>127&&nonAsciiLanguageSignal.test(character)
  );
}

export function buildEvidenceLanguageMetadata(input:{
  content:string;
  declaredLanguageProvided?:boolean;
  declaredLanguage?:unknown;
  declaredBasis?:DeclaredLanguageBasis;
}):Record<string,unknown>{
  const provided=input.declaredLanguageProvided===true;
  const reviewReasons:string[]=[];
  const metadata:Record<string,unknown>={
    language_metadata_status:provided?"declared":"not_supplied",
    source_language_basis:provided
      ?input.declaredBasis||"user_declared"
      :"not_supplied"
  };

  if(provided){
    const sourceLanguage=canonicalizeDeclaredLanguage(input.declaredLanguage);
    metadata.source_language=sourceLanguage;
    if(!validEnglishTag.test(sourceLanguage)){
      reviewReasons.push("declared_language_requires_review");
    }
  }

  if(hasNonAsciiLanguageSignal(input.content)){
    reviewReasons.push("non_ascii_letter_mark_or_number");
  }

  metadata.language_review_required=reviewReasons.length>0;
  metadata.language_review_reasons=reviewReasons;
  return metadata;
}
