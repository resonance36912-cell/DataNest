export const MAX_FILE_BYTES=25*1024*1024;
export const MAX_BATCH_FILES=10;
export const FILE_BUCKET="datanest-ai-staging-files";

export const SUPPORTED_FILE_TYPES={
  ".pdf":["application/pdf"],
  ".docx":["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".txt":["text/plain"],
  ".csv":["text/csv","application/csv","text/plain"],
  ".json":["application/json","text/json","text/plain"]
} as const;

export type SupportedExtension=keyof typeof SUPPORTED_FILE_TYPES;

export type FileDescriptor={
  name:string;
  size:number;
  type?:string|null;
};

export type SubmissionStatus=
  |"UPLOADING"
  |"QUEUED"
  |"PROCESSING"
  |"ANALYZING"
  |"RESPONDED"
  |"RESPONDED_WITH_WARNINGS"
  |"FAILED";

export type FileItemStatus=
  |"UPLOADING"
  |"QUEUED"
  |"VALIDATING"
  |"EXTRACTING"
  |"OCR"
  |"CHUNKING"
  |"READY"
  |"FAILED";

export class DataNestFileError extends Error{
  code:string;
  constructor(code:string,message:string){
    super(message);
    this.name="DataNestFileError";
    this.code=code;
  }
}

function extensionOf(name:string){
  const index=name.lastIndexOf(".");
  return (index>=0?name.slice(index):"").toLowerCase() as SupportedExtension|"";
}

export function validateFileDescriptor(file:FileDescriptor){
  if(!file.name?.trim())throw new DataNestFileError("UNSUPPORTED_TYPE","A file name is required.");
  if(!Number.isFinite(file.size)||file.size<0)throw new DataNestFileError("FILE_TOO_LARGE","Invalid file size.");
  if(file.size>MAX_FILE_BYTES)throw new DataNestFileError("FILE_TOO_LARGE","Files must be 25 MB or smaller.");

  const extension=extensionOf(file.name);
  const allowed=SUPPORTED_FILE_TYPES[extension as SupportedExtension];
  if(!allowed)throw new DataNestFileError("UNSUPPORTED_TYPE","Supported file types are PDF, DOCX, TXT, CSV and JSON.");

  const mime=String(file.type||"").toLowerCase();
  if(mime&&!allowed.includes(mime as never)){
    throw new DataNestFileError(
      "UNSUPPORTED_TYPE",
      "The file extension and declared MIME type do not match a supported DataNest AI file type."
    );
  }

  return {extension,mime:mime||null,size:file.size};
}

export function validateBatch(files:FileDescriptor[]){
  if(files.length<1)throw new DataNestFileError("BATCH_LIMIT_EXCEEDED","Select at least one file.");
  if(files.length>MAX_BATCH_FILES)throw new DataNestFileError("BATCH_LIMIT_EXCEEDED","A maximum of 10 files can be uploaded at once.");
  return files.map(validateFileDescriptor);
}

export function canonicalBlobPath(value:string){
  const hash=value.toLowerCase();
  if(!/^[0-9a-f]{64}$/.test(hash))throw new Error("A verified SHA-256 digest is required.");
  return `sha256/${hash.slice(0,2)}/${hash.slice(2,4)}/${hash}`;
}

export function isRetryableFileError(codeOrStatus:string|number){
  if(typeof codeOrStatus==="number")return codeOrStatus===408||codeOrStatus===409||codeOrStatus===425||codeOrStatus===429||codeOrStatus>=500;
  return new Set([
    "UPLOAD_EXPIRED",
    "OCR_FAILED",
    "EXTRACTION_FAILED",
    "CHUNKING_FAILED",
    "ANALYSIS_FAILED",
    "NETWORK_ERROR"
  ]).has(codeOrStatus);
}

export function reduceSubmissionStatus(statuses:FileItemStatus[],analysisStarted=false,responseRecorded=false):SubmissionStatus{
  if(!statuses.length)return "FAILED";
  if(responseRecorded)return statuses.some(status=>status==="FAILED")?"RESPONDED_WITH_WARNINGS":"RESPONDED";
  if(statuses.every(status=>status==="FAILED"))return "FAILED";
  if(analysisStarted||statuses.every(status=>status==="READY"||status==="FAILED"))return "ANALYZING";
  if(statuses.some(status=>["VALIDATING","EXTRACTING","OCR","CHUNKING","READY"].includes(status)))return "PROCESSING";
  if(statuses.every(status=>status==="QUEUED"||status==="FAILED"))return "QUEUED";
  return "UPLOADING";
}
