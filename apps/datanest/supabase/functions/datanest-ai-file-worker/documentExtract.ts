// @ts-nocheck -- Deno worker resolves pinned npm: imports via its local deno.json.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import {
  MAX_EXTRACT_CHARS,
  assertDocxArchiveBudget,
  pdfPageAssessment,
  type ExtractedChunk,
  type StructuredExtraction
} from "../_shared/datanestFileExtract.ts";

export const MAX_DOCX_ENTRIES=10_000;
export const MAX_DOCX_EXPANDED_BYTES=100*1024*1024;

function splitBounded(text:string,locator:ExtractedChunk["locator"]):ExtractedChunk[]{
  if(text.length<=MAX_EXTRACT_CHARS)return [{text,locator}];
  const chunks:ExtractedChunk[]=[];
  for(let offset=0;offset<text.length;offset+=MAX_EXTRACT_CHARS){
    chunks.push({text:text.slice(offset,offset+MAX_EXTRACT_CHARS),locator});
  }
  return chunks;
}

export async function extractPdf(bytes:Uint8Array):Promise<StructuredExtraction&{
  pages:Array<{page:number;text:string;needsOcr:boolean}>
}>{
  const loading=getDocument({data:bytes,disableWorker:true});
  const pdf=await loading.promise;
  const pages:Array<{page:number;text:string;needsOcr:boolean}>=[];
  const chunks:ExtractedChunk[]=[];
  const fullText:string[]=[];

  try{
    for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
      const page=await pdf.getPage(pageNumber);
      const content=await page.getTextContent();
      const text=(content.items as Array<{str?:string}>)
        .map(item=>typeof item.str==="string"?item.str:"")
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g," ")
        .trim();
      const assessed=pdfPageAssessment(pageNumber,text);
      const needsOcr=assessed.needsOcr;
      pages.push({page:pageNumber,text:assessed.text,needsOcr});
      fullText.push(text);
      chunks.push(...splitBounded(text,{type:"pdf_page",page:pageNumber}));
    }
  }finally{
    await pdf.destroy();
  }

  return {
    text:fullText.join("\n\n"),
    chunks,
    warnings:pages.filter(page=>page.needsOcr).map(page=>"PDF page "+page.page+" needs OCR."),
    pages
  };
}

type PreserveNode=Record<string,unknown>;

function nodeChildren(value:unknown):PreserveNode[]{
  return Array.isArray(value)?value.filter(item=>item&&typeof item==="object") as PreserveNode[]:[];
}

function findNode(nodes:PreserveNode[],name:string):unknown[]{
  const found:unknown[]=[];
  for(const node of nodes){
    for(const [key,value] of Object.entries(node)){
      if(key===name)found.push(value);
      if(Array.isArray(value))found.push(...findNode(nodeChildren(value),name));
    }
  }
  return found;
}

function textFromNodes(nodes:PreserveNode[]):string{
  const pieces:string[]=[];
  const walk=(items:PreserveNode[])=>{
    for(const node of items){
      for(const [key,value] of Object.entries(node)){
        if(key==="#text"&&typeof value==="string"){
          pieces.push(value);
        }else if(Array.isArray(value)){
          walk(nodeChildren(value));
        }
      }
    }
  };
  walk(nodes);
  return pieces.join("").replace(/\s+/g," ").trim();
}

function attributeValue(value:unknown,attribute:string):string|null{
  const nodes=nodeChildren(value);
  for(const node of nodes){
    const attrs=node[":@"];
    if(attrs&&typeof attrs==="object"){
      const record=attrs as Record<string,unknown>;
      const direct=record[attribute]??record["@_"+attribute];
      if(direct!==undefined)return String(direct);
    }
    for(const nested of Object.values(node)){
      if(Array.isArray(nested)){
        const found=attributeValue(nested,attribute);
        if(found)return found;
      }
    }
  }
  return null;
}

function paragraphKind(value:unknown){
  const nodes=nodeChildren(value);
  const styleNodes=findNode(nodes,"w:pStyle");
  const style=styleNodes.map(item=>attributeValue(item,"w:val")).find(Boolean)||null;
  const numbered=findNode(nodes,"w:numPr").length>0;
  if(style&&/^Heading/i.test(style))return {kind:"heading",heading:style};
  if(numbered)return {kind:"list",heading:null};
  return {kind:"paragraph",heading:null};
}

function tableText(value:unknown){
  const rows=findNode(nodeChildren(value),"w:tr");
  return rows.map(row=>{
    const cells=findNode(nodeChildren(row),"w:tc");
    return cells.map(cell=>textFromNodes(nodeChildren(cell))).join(" | ");
  }).filter(Boolean).join("\n");
}

function bodyChildren(parsed:PreserveNode[]):PreserveNode[]{
  const bodies=findNode(parsed,"w:body");
  if(!bodies.length)return [];
  return nodeChildren(bodies[0]);
}

export async function extractDocx(bytes:Uint8Array):Promise<StructuredExtraction&{
  blocks:Array<{block:number;kind:string;heading:string|null;text:string}>
}>{
  const zip=await JSZip.loadAsync(bytes);
  const entries=Object.values(zip.files);
  assertDocxArchiveBudget({
    entryCount:entries.length,
    expandedBytes:0,
    hasDocumentXml:Boolean(zip.file("word/document.xml"))
  });

  let expandedBytes=0;
  const expanded=new Map<string,Uint8Array>();
  for(const entry of entries){
    if(entry.dir)continue;
    const data=await entry.async("uint8array");
    expandedBytes+=data.byteLength;
    assertDocxArchiveBudget({
      entryCount:entries.length,
      expandedBytes,
      hasDocumentXml:true
    });
    expanded.set(entry.name,data);
  }

  const documentBytes=expanded.get("word/document.xml");
  if(!documentBytes)throw new Error("DOCX is missing word/document.xml.");
  const xml=new TextDecoder().decode(documentBytes);
  const parser=new XMLParser({
    preserveOrder:true,
    ignoreAttributes:false,
    attributeNamePrefix:"@_",
    textNodeName:"#text",
    processEntities:false
  });
  const parsed=parser.parse(xml) as PreserveNode[];
  const blocks:Array<{block:number;kind:string;heading:string|null;text:string}>=[];
  const chunks:ExtractedChunk[]=[];
  let currentHeading:string|null=null;

  for(const child of bodyChildren(parsed)){
    if("w:p" in child){
      const value=child["w:p"];
      const text=textFromNodes(nodeChildren(value));
      if(!text)continue;
      const meta=paragraphKind(value);
      if(meta.kind==="heading")currentHeading=text;
      const block=blocks.length+1;
      blocks.push({block,kind:meta.kind,heading:currentHeading,text});
      chunks.push(...splitBounded(text,{
        type:"docx_block",
        block,
        kind:meta.kind,
        heading:currentHeading
      }));
      continue;
    }

    if("w:tbl" in child){
      const text=tableText(child["w:tbl"]);
      if(!text)continue;
      const block=blocks.length+1;
      blocks.push({block,kind:"table",heading:currentHeading,text});
      chunks.push(...splitBounded(text,{
        type:"docx_block",
        block,
        kind:"table",
        heading:currentHeading
      }));
    }
  }

  return {
    text:blocks.map(block=>block.text).join("\n\n"),
    chunks,
    warnings:[],
    blocks
  };
}
