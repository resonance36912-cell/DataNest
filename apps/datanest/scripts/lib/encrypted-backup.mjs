import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";

export function parseBackupKey(value){
  if(Buffer.isBuffer(value)){
    if(value.length!==32)throw new Error("Backup key must be exactly 32 bytes.");
    return value;
  }
  if(typeof value!=="string"||!value.trim()){
    throw new Error("DATANEST_AI_BACKUP_KEY is required.");
  }
  const raw=value.trim();
  let key;
  if(/^[0-9a-f]{64}$/i.test(raw))key=Buffer.from(raw,"hex");
  else key=Buffer.from(raw,"base64");
  if(key.length!==32)throw new Error("Backup key must decode to exactly 32 bytes.");
  return key;
}

export function encryptBackup(plaintext,keyInput){
  const key=parseBackupKey(keyInput);
  const iv=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",key,iv,{authTagLength:16});
  const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  const envelope={
    format:"datanest-ai-backup",
    version:1,
    algorithm:"aes-256-gcm",
    iv:iv.toString("base64"),
    tag:cipher.getAuthTag().toString("base64"),
    ciphertext:ciphertext.toString("base64")
  };
  return JSON.stringify(envelope);
}

export function decryptBackup(encrypted,keyInput){
  const key=parseBackupKey(keyInput);
  const envelope=JSON.parse(String(encrypted));
  if(envelope?.format!=="datanest-ai-backup"||envelope?.version!==1){
    throw new Error("Unsupported DataNest AI backup envelope.");
  }
  const iv=Buffer.from(envelope.iv,"base64");
  const tag=Buffer.from(envelope.tag,"base64");
  if(tag.length!==16)throw new Error("Backup authentication tag must be exactly 16 bytes.");
  const ciphertext=Buffer.from(envelope.ciphertext,"base64");
  const decipher=createDecipheriv("aes-256-gcm",key,iv,{authTagLength:16});
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext),decipher.final()]);
}

function stableValue(value){
  if(Array.isArray(value))return value.map(stableValue);
  if(value&&typeof value==="object"){
    return Object.fromEntries(
      Object.keys(value).sort().map(key=>[key,stableValue(value[key])])
    );
  }
  return value;
}

export function canonicalJson(value){
  return JSON.stringify(stableValue(value));
}

export function canonicalHash(value){
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}


export function validateRestoreRefs({
  backupSourceRef,
  expectedSourceRef,
  targetRef,
  configuredStagingRef,
  productionRef
}){
  for(const [name,value] of Object.entries({
    backupSourceRef,
    expectedSourceRef,
    targetRef,
    configuredStagingRef,
    productionRef
  })){
    if(typeof value!=="string"||!value.trim())throw new Error(name+" is required.");
  }
  if(targetRef===productionRef){
    throw new Error("Refusing to restore DataNest AI raw evidence into the production project.");
  }
  if(targetRef!==configuredStagingRef){
    throw new Error("Target ref must match the configured staging project.");
  }
  if(backupSourceRef!==expectedSourceRef){
    throw new Error("Backup source project ref does not match the explicitly expected source ref.");
  }
  return true;
}
