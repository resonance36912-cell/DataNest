"use client";

import { Upload } from "tus-js-client";
import { getSupabase } from "./supabase";
import {
  FILE_BUCKET,
  MAX_BATCH_FILES,
  MAX_FILE_BYTES,
  canonicalBlobPath,
  validateBatch,
  validateFileDescriptor
} from "../../supabase/functions/_shared/datanestFileDomain";

export {FILE_BUCKET,MAX_BATCH_FILES,MAX_FILE_BYTES,canonicalBlobPath,validateBatch,validateFileDescriptor};

export async function sha256File(file:Blob){
  const bytes=await file.arrayBuffer();
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,"0")).join("");
}

export type SignedTusUploadOptions={
  file:File;
  endpoint:string;
  token:string;
  objectPath:string;
  onProgress?:(uploaded:number,total:number,percent:number)=>void;
};

export function startSignedTusUpload({
  file,
  endpoint,
  token,
  objectPath,
  onProgress
}:SignedTusUploadOptions){
  validateFileDescriptor(file);
  if(!/^https:\/\/[a-z0-9-]+\.storage\.supabase\.co\/storage\/v1\/upload\/resumable$/i.test(endpoint)){
    throw new Error("A direct Supabase Storage resumable endpoint is required.");
  }
  if(!token)throw new Error("A signed upload token is required.");
  if(!objectPath)throw new Error("An upload object path is required.");

  return new Promise<string>((resolve,reject)=>{
    const upload=new Upload(file,{
      endpoint,
      retryDelays:[0,3000,5000,10000,20000],
      headers:{"x-signature":token},
      uploadDataDuringCreation:true,
      removeFingerprintOnSuccess:true,
      chunkSize:6*1024*1024,
      metadata:{
        bucketName:FILE_BUCKET,
        objectName:objectPath,
        contentType:file.type||"application/octet-stream"
      },
      onError:error=>reject(error),
      onProgress:(uploaded,total)=>{
        onProgress?.(uploaded,total,total?uploaded/total*100:0);
      },
      onSuccess:()=>resolve(upload.url||"")
    });

    upload.findPreviousUploads()
      .then(previous=>{
        if(previous.length)upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      })
      .catch(reject);
  });
}

type UploadSlot={
  itemId:string;
  traceId:string;
  clientIndex:number;
  path:string;
  token:string|null;
  status:string;
};

type CreateSubmissionResponse={
  submissionId:string;
  traceId:string;
  jobId:string;
  sessionId:string;
  tusEndpoint:string;
  items:UploadSlot[];
};

export type DataNestUploadProgress={
  index:number;
  file:File;
  uploaded:number;
  total:number;
  percent:number;
};

export type DataNestUploadItemResult={
  index:number;
  fileName:string;
  itemId:string|null;
  traceId:string|null;
  status:"QUEUED"|"FAILED";
  error:string|null;
};

export type DataNestFileSubmissionResult={
  submissionId:string;
  traceId:string;
  items:DataNestUploadItemResult[];
};

export type DataNestUploadInvoke=(body:Record<string,unknown>)=>Promise<Record<string,unknown>>;
export type DataNestTusStarter=(options:SignedTusUploadOptions)=>Promise<string>;

async function invokeUploadGateway(body:Record<string,unknown>){
  const supabase=getSupabase();
  if(!supabase)throw new Error("DataNest connection is unavailable.");
  const {data,error}=await supabase.functions.invoke("datanest-ai-upload",{body});
  if(error)throw error;
  return (data||{}) as Record<string,unknown>;
}

function parseCreateResponse(payload:Record<string,unknown>):CreateSubmissionResponse{
  const items=Array.isArray(payload.items)?payload.items as Array<Record<string,unknown>>:[];
  return {
    submissionId:String(payload.submissionId||""),
    traceId:String(payload.traceId||""),
    jobId:String(payload.jobId||""),
    sessionId:String(payload.sessionId||""),
    tusEndpoint:String(payload.tusEndpoint||""),
    items:items.map(item=>({
      itemId:String(item.itemId||""),
      traceId:String(item.traceId||""),
      clientIndex:Number(item.clientIndex),
      path:String(item.path||""),
      token:item.token===null?null:String(item.token||""),
      status:String(item.status||"")
    }))
  };
}

export async function submitDataNestFiles(input:{
  jobId:string;
  sessionId:string;
  clientRequestId:string;
  instruction?:string|null;
  files:File[];
  onProgress?:(progress:DataNestUploadProgress)=>void;
  invoke?:DataNestUploadInvoke;
  upload?:DataNestTusStarter;
}):Promise<DataNestFileSubmissionResult>{
  validateBatch(input.files);

  const invoke=input.invoke||invokeUploadGateway;
  const upload=input.upload||startSignedTusUpload;
  const descriptors=await Promise.all(input.files.map(async file=>({
    name:file.name,
    size:file.size,
    type:file.type||null,
    clientSha256:await sha256File(file)
  })));

  const created=parseCreateResponse(await invoke({
    action:"create_submission",
    jobId:input.jobId,
    sessionId:input.sessionId,
    clientRequestId:input.clientRequestId,
    instruction:input.instruction?.trim()||null,
    files:descriptors
  }));

  if(!created.submissionId||!created.traceId||!created.tusEndpoint){
    throw new Error("DataNest did not return a valid file submission.");
  }

  const results=await Promise.all(input.files.map(async(file,index):Promise<DataNestUploadItemResult>=>{
    const slot=created.items.find(item=>item.clientIndex===index);
    if(!slot?.itemId||!slot.path||!slot.token){
      return {
        index,fileName:file.name,itemId:slot?.itemId||null,traceId:slot?.traceId||null,
        status:"FAILED",error:"DataNest did not return a valid upload slot."
      };
    }

    try{
      await upload({
        file,
        endpoint:created.tusEndpoint,
        token:slot.token,
        objectPath:slot.path,
        onProgress:(uploaded,total,percent)=>input.onProgress?.({
          index,file,uploaded,total,percent
        })
      });

      await invoke({
        action:"finalize_item",
        jobId:input.jobId,
        itemId:slot.itemId
      });

      return {
        index,fileName:file.name,itemId:slot.itemId,traceId:slot.traceId,
        status:"QUEUED",error:null
      };
    }catch(error){
      return {
        index,fileName:file.name,itemId:slot.itemId,traceId:slot.traceId,
        status:"FAILED",
        error:error instanceof Error?error.message:"File upload failed."
      };
    }
  }));

  return {submissionId:created.submissionId,traceId:created.traceId,items:results};
}
