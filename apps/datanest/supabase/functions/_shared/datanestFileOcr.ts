import {
  resolveOcrPdfRoute,
  type ProviderConnection
} from "./provider.ts";

export type OcrPageRequest={
  page:number;
};

export type OcrPageResult={
  page:number;
  text:string;
  confidence:number|null;
  extractionMethod:"ocr";
  extractionVersion:"datanest-ocr-v1";
};

export class DataNestOcrError extends Error{
  code:"OCR_REQUIRED_UNAVAILABLE"|"OCR_FAILED";
  constructor(code:"OCR_REQUIRED_UNAVAILABLE"|"OCR_FAILED",message:string){
    super(message);
    this.name="DataNestOcrError";
    this.code=code;
  }
}

function base64Bytes(bytes:Uint8Array){
  let binary="";
  const chunk=0x8000;
  for(let offset=0;offset<bytes.length;offset+=chunk){
    binary+=String.fromCharCode(...bytes.subarray(offset,offset+chunk));
  }
  return btoa(binary);
}

function normalizePages(pages:number[]){
  const unique=[...new Set(pages)];
  if(!unique.length||unique.some(page=>!Number.isInteger(page)||page<1)){
    throw new DataNestOcrError("OCR_FAILED","OCR page requests must contain positive one-based page numbers.");
  }
  return unique.sort((a,b)=>a-b);
}

function samePageSet(expected:number[],actual:number[]){
  const a=[...expected].sort((x,y)=>x-y);
  const b=[...actual].sort((x,y)=>x-y);
  return a.length===b.length&&a.every((value,index)=>value===b[index]);
}

export async function runPdfOcr(input:{
  connection:ProviderConnection;
  pdfBytes:Uint8Array;
  pages:number[];
  fetchImpl?:typeof fetch;
}):Promise<OcrPageResult[]>{
  let endpoint:string|null;
  try{
    endpoint=resolveOcrPdfRoute(input.connection);
  }catch{
    throw new DataNestOcrError("OCR_REQUIRED_UNAVAILABLE","Configured OCR endpoint is not approved.");
  }
  if(!endpoint){
    throw new DataNestOcrError("OCR_REQUIRED_UNAVAILABLE","No OCR-capable provider route is configured.");
  }

  const requestedPages=normalizePages(input.pages);
  const fetchImpl=input.fetchImpl||fetch;
  let response:Response;
  try{
    response=await fetchImpl(endpoint,{
      method:"POST",
      redirect:"error",
      signal:AbortSignal.timeout(60000),
      headers:{
        Authorization:"Bearer "+input.connection.secret,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        model:input.connection.model,
        task:"ocr_pdf_pages",
        pages:requestedPages,
        pdf_base64:base64Bytes(input.pdfBytes)
      })
    });
  }catch(error){
    const wrapped=new DataNestOcrError("OCR_FAILED","OCR provider request failed.");
    (wrapped as Error&{cause?:unknown}).cause=error;
    throw wrapped;
  }

  if(!response.ok){
    throw new DataNestOcrError("OCR_FAILED","OCR provider returned an unsuccessful response.");
  }

  const payload=await response.json().catch(()=>null) as {
    pages?:Array<{page?:unknown;text?:unknown;confidence?:unknown}>
  }|null;
  const pages=Array.isArray(payload?.pages)?payload!.pages:[];
  const actualPages=pages.map(item=>Number(item.page));

  if(actualPages.some(page=>!Number.isInteger(page)||page<1)
     ||new Set(actualPages).size!==actualPages.length
     ||!samePageSet(requestedPages,actualPages)){
    throw new DataNestOcrError("OCR_FAILED","OCR response page set did not match the requested pages.");
  }

  const byPage=new Map<number,OcrPageResult>();
  for(const item of pages){
    const page=Number(item.page);
    const text=typeof item.text==="string"?item.text.trim():"";
    if(!text){
      throw new DataNestOcrError("OCR_FAILED","OCR response contained blank page text.");
    }
    const confidence=typeof item.confidence==="number"&&Number.isFinite(item.confidence)
      ?Math.max(0,Math.min(1,item.confidence))
      :null;
    byPage.set(page,{
      page,
      text,
      confidence,
      extractionMethod:"ocr",
      extractionVersion:"datanest-ocr-v1"
    });
  }

  return requestedPages.map(page=>byPage.get(page)!);
}
