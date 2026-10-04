const COOKIE_NAME = "rons_sovereign_session";
const DEFAULT_GATEWAY = "http://127.0.0.1:58600";
const AUTH_PATHS: Record<string,string> = {
  session: "/v1/auth/session", user: "/v1/auth/user",
  "sign-in": "/v1/auth/sign-in", "sign-up": "/v1/auth/sign-up", "sign-out": "/v1/auth/sign-out",
};
function gateway(){ return (process.env["RESONANCE_SOVEREIGN_GATEWAY_URL"] ?? DEFAULT_GATEWAY).replace(/\/$/,""); }
function readCookie(request:Request){
  const raw=request.headers.get("cookie") ?? "";
  for(const part of raw.split(";")){ const [name,...rest]=part.trim().split("="); if(name===COOKIE_NAME) return decodeURIComponent(rest.join("=")); }
  return null;
}
function cookie(request:Request,value:string,maxAge:number){
  const secure=new URL(request.url).protocol==="https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
function clean(payload:any){
  if(payload?.session?.access_token){ payload=structuredClone(payload); delete payload.session.access_token; payload.session.token_transport="httpOnly-cookie"; }
  return payload;
}
export async function proxyAuth(request:Request,action:string){
  const path=AUTH_PATHS[action]; if(!path) return Response.json({error:"Unknown auth action"},{status:404});
  const mutation=action.startsWith("sign-"); const token=readCookie(request); const headers:Record<string,string>={};
  if(token) headers["Authorization"]=`Bearer ${token}`;
  let body:string|undefined; if(action==="sign-in"||action==="sign-up"){ body=await request.text(); headers["Content-Type"]="application/json"; }
  let upstream:Response; try{ upstream=await fetch(`${gateway()}${path}`,{method:mutation?"POST":"GET",headers,body}); }
  catch{
    // Anonymous session/user discovery is optional during isolated SSR/Lighthouse runs.
    // Fail closed whenever a session cookie exists or the request mutates auth state.
    if(!token&&!mutation&&(action==="session"||action==="user")){
      return Response.json(action==="session"?{session:null}:{user:null},{status:200,headers:{"Cache-Control":"no-store","X-RONS-Degraded":"gateway-unavailable"}});
    }
    return Response.json({error:"RONS auth unavailable"},{status:503});
  }
  let payload:any={}; try{ payload=await upstream.json(); }catch{}
  const outHeaders=new Headers({"Cache-Control":"no-store"});
  if(action==="sign-out") outHeaders.set("Set-Cookie",cookie(request,"",0));
  else if(upstream.ok&&(action==="sign-in"||action==="sign-up")&&payload?.session?.access_token){ outHeaders.set("Set-Cookie",cookie(request,payload.session.access_token,86400)); payload=clean(payload); }
  return Response.json(payload,{status:upstream.status,headers:outHeaders});
}