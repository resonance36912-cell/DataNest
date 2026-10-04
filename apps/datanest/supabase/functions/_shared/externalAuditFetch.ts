function isNonPublicIpv4(host:string){
  const parts=host.split(".").map(Number);
  if(parts.length!==4||parts.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
  const [a,b,c]=parts;
  return a===0||a===10||a===127||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||
    (a===172&&b>=16&&b<=31)||(a===192&&b===0)||(a===192&&b===168)||
    (a===198&&(b===18||b===19))||(a===198&&b===51&&c===100)||
    (a===203&&b===0&&c===113)||a>=224;
}

function normalizeHost(hostname:string){
  return hostname.toLowerCase().replace(/\.$/,"").replace(/^\[/,"").replace(/\]$/,"");
}

function isNonPublicIpv6(address:string){
  const host=normalizeHost(address);
  if(!host.includes(":"))return false;
  return host==="::"||host==="::1"||host.startsWith("fc")||host.startsWith("fd")||
    /^fe[89ab]/.test(host)||host.startsWith("ff")||host.startsWith("2001:db8:")||
    host.startsWith("::ffff:");
}

function forbiddenHostname(hostname:string){
  const host=normalizeHost(hostname);
  return host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||
    host==="0.0.0.0"||isNonPublicIpv4(host);
}

export function validatePublicSourceUrl(raw:string):URL{
  const url=new URL(raw);
  if(url.protocol!=="https:")throw new Error("https_required");
  if(url.username||url.password)throw new Error("credentials_in_url_rejected");
  const host=normalizeHost(url.hostname);
  if(host.includes(":"))throw new Error("ipv6_literal_rejected");
  if(forbiddenHostname(host))throw new Error("private_or_local_host_rejected");
  return url;
}

export async function assertPublicDns(url:URL){
  const host=normalizeHost(url.hostname);
  if(forbiddenHostname(host))throw new Error("private_or_local_host_rejected");
  if(host.includes(":"))throw new Error("ipv6_literal_rejected");
  const deno=(globalThis as unknown as {Deno?:{resolveDns?:(host:string,record:"A"|"AAAA")=>Promise<string[]>}}).Deno;
  if(!deno?.resolveDns)return;
  for(const record of ["A","AAAA"] as const){
    let addresses:string[]=[];
    try{addresses=await deno.resolveDns(host,record);}catch{continue;}
    for(const address of addresses){
      if(record==="A"&&isNonPublicIpv4(address))throw new Error("private_dns_resolution_rejected");
      if(record==="AAAA"&&isNonPublicIpv6(address))throw new Error("private_dns_resolution_rejected");
    }
  }
}

async function digest(body:string){
  const bytes=new TextEncoder().encode(body);
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,"0")).join("");
}

export async function fetchPublicSnapshot(url:URL,limits:{maxBytes:number;timeoutMs:number;maxRedirects:number}){
  let current=validatePublicSourceUrl(url.toString());
  for(let redirect=0;redirect<=limits.maxRedirects;redirect++){
    await assertPublicDns(current);
    const response=await fetch(current,{redirect:"manual",signal:AbortSignal.timeout(limits.timeoutMs),headers:{"User-Agent":"DataNest-External-Auditor/1.0"}});
    if(response.status>=300&&response.status<400){
      const location=response.headers.get("location");
      if(!location)throw new Error("redirect_without_location");
      current=validatePublicSourceUrl(new URL(location,current).toString());
      continue;
    }
    if(!response.ok)throw new Error("source_http_"+response.status);
    const reader=response.body?.getReader();
    if(!reader)throw new Error("source_body_unavailable");
    const chunks:Uint8Array[]=[]; let total=0;
    while(true){
      const next=await reader.read();
      if(next.done)break;
      total+=next.value.byteLength;
      if(total>limits.maxBytes){await reader.cancel();throw new Error("source_too_large");}
      chunks.push(next.value);
    }
    const merged=new Uint8Array(total);let offset=0;
    for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength;}
    const body=new TextDecoder("utf-8",{fatal:false}).decode(merged);
    return {finalUrl:current.toString(),contentType:response.headers.get("content-type")||"application/octet-stream",body,sha256:await digest(body),fetchedAt:new Date().toISOString()};
  }
  throw new Error("redirect_limit_exceeded");
}