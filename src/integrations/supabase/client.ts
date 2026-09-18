type User={id:string;email?:string|null};
type Session={user:User;token_transport?:string;access_token?:string;provider_token?:string|null};
type AuthEvent="INITIAL_SESSION"|"SIGNED_IN"|"SIGNED_OUT";
type Listener=(event:AuthEvent,session:Session|null)=>void|Promise<void>;
const listeners=new Set<Listener>();
async function authRequest(action:string,init?:RequestInit){
  const response=await fetch(`/api/rons/auth/${action}`,{credentials:"include",headers:{Accept:"application/json",...(init?.headers??{})},...init});
  const body=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(body.error??`RONS auth failed (${response.status})`);
  return body;
}
async function emit(event:AuthEvent,session:Session|null){ await Promise.all([...listeners].map(x=>Promise.resolve(x(event,session)).catch(()=>{}))); }
class QueryBuilder implements PromiseLike<any>{
  filters:any[]=[]; options:any={}; columns="*"; action="select"; values:any=undefined; countRequested=false; head=false;
  constructor(public table:string){}
  select(columns="*",opts?:{count?:string;head?:boolean}){this.action="select";this.columns=columns;this.countRequested=opts?.count==="exact";this.head=!!opts?.head;return this;}
  insert(values:any){this.action="insert";this.values=values;return this.execute();}
  eq(column:string,value:any){this.filters.push({column,op:"eq",value});return this;}
  gte(column:string,value:any){this.filters.push({column,op:"gte",value});return this;}
  order(column:string,opts?:{ascending?:boolean}){this.options.order={column,ascending:opts?.ascending!==false};return this;}
  limit(value:number){this.options.limit=value;return this;}
  maybeSingle(){this.options.single=true;return this.execute();}
  async execute(){
    const r=await fetch("/api/rons/db",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({table:this.table,action:this.action,columns:this.columns,values:this.values,filters:this.filters,options:this.options})});
    const data=await r.json().catch(()=>null); if(!r.ok)return{data:null,count:null,error:new Error(data?.detail??data?.error??`RONS DB ${r.status}`)};
    const count=this.countRequested?(Array.isArray(data)?data.length:(data?1:0)):null; return{data:this.head?null:data,count,error:null};
  }
  then<TResult1=any,TResult2=never>(ok?:((v:any)=>TResult1|PromiseLike<TResult1>)|null,bad?:((e:any)=>TResult2|PromiseLike<TResult2>)|null){return this.execute().then(ok,bad);}
}
export const supabase={
  auth:{
    async getSession(){try{const b=await authRequest("session");return{data:{session:b.session??null},error:null};}catch(error){return{data:{session:null},error};}},
    async getUser(){try{const b=await authRequest("user");return{data:{user:b.user??null},error:null};}catch(error){return{data:{user:null},error};}},
    onAuthStateChange(callback:Listener){listeners.add(callback);void this.getSession().then(({data})=>callback("INITIAL_SESSION",data.session));return{data:{subscription:{unsubscribe:()=>{listeners.delete(callback);}}}};},
    async signInWithPassword({email,password}:{email:string;password:string}){try{const b=await authRequest("sign-in",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});const session=b.session??null;await emit("SIGNED_IN",session);return{data:{session,user:b.user??session?.user??null},error:null};}catch(error){return{data:{session:null,user:null},error:error as Error};}},
    async signUp({email,password}:{email:string;password:string}){try{const b=await authRequest("sign-up",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});const session=b.session??null;if(session)await emit("SIGNED_IN",session);return{data:{session,user:b.user??session?.user??null},error:null};}catch(error){return{data:{session:null,user:null},error:error as Error};}},
    async signOut(){try{await authRequest("sign-out",{method:"POST"});await emit("SIGNED_OUT",null);return{error:null};}catch(error){return{error:error as Error};}},
    async signInWithOAuth(){return{data:{provider:null,url:null},error:new Error("OAuth disabled in sovereign local mode")};},
  },
  from(table:string){return new QueryBuilder(table);},
};