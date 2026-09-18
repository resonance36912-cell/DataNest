import { createFileRoute } from "@tanstack/react-router";
const GATEWAY=(process.env["RESONANCE_SOVEREIGN_GATEWAY_URL"] ?? "http://127.0.0.1:58600").replace(/\/$/,"");
export const Route=createFileRoute("/api/rons/db")({server:{handlers:{POST:async({request})=>{
  const body=await request.text();
  if(new TextEncoder().encode(body).byteLength>65536) return Response.json({error:"Request too large"},{status:413});
  let upstream:Response; try{ upstream=await fetch(`${GATEWAY}/v1/db/query`,{method:"POST",headers:{"Content-Type":"application/json"},body}); }
  catch{ return Response.json({error:"RONS database unavailable"},{status:503}); }
  const text=await upstream.text();
  return new Response(text,{status:upstream.status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
}}}});