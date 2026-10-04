export type ProviderConnection={
  id:string;
  provider:string;
  label:string;
  api_base_url:string;
  endpoint_host:string;
  model:string;
  secret:string;
  metadata?:Record<string,unknown>|null;
};

export type ProviderCallResult={
  content:string;
  inputTokens:number;
  outputTokens:number;
};

export function validateProviderConnection(connection:ProviderConnection):string {
  const url=new URL(connection.api_base_url);
  if(url.protocol!=="https:"||url.hostname.toLowerCase()!==connection.endpoint_host.toLowerCase()){
    throw new Error("provider_endpoint_rejected");
  }
  if(url.username||url.password||(url.port&&url.port!=="443")){
    throw new Error("provider_endpoint_rejected");
  }
  return url.toString();
}

export async function callOpenAiCompatibleProvider(input:{
  connection:ProviderConnection;
  governedPrompt:string;
  maxOutputTokens:number;
  chatTemplateKwargs?:Record<string,unknown>;
}):Promise<ProviderCallResult> {
  const endpoint=validateProviderConnection(input.connection);
  let response:Response;
  try{
    response=await fetch(endpoint,{
      method:"POST",
      redirect:"error",
      signal:AbortSignal.timeout(30000),
      headers:{
        Authorization:`Bearer ${input.connection.secret}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        model:input.connection.model,
        messages:[
          {
            role:"system",
            content:[
              "You are DataNest AI inside Resonance DataNest.",
              "Collaborate on one Job Manifest at a time.",
              "Treat uncertified current-session evidence as provisional.",
              "Use certified project memory as reusable project knowledge.",
              "Be concise, operational, evidence-aware, and do not claim actions not present in context."
            ].join("\n")
          },
          {role:"user",content:input.governedPrompt}
        ],
        temperature:0.2,
        max_tokens:input.maxOutputTokens,
        chat_template_kwargs:input.chatTemplateKwargs
      })
    });
  }catch(error){
    const wrapped=new Error("provider_network_or_redirect_error");
    (wrapped as Error&{category?:string}).category="unknown";
    (wrapped as Error&{cause?:unknown}).cause=error;
    throw wrapped;
  }

  if(!response.ok){
    const wrapped=new Error("provider_http_error");
    (wrapped as Error&{category?:string}).category="failed";
    throw wrapped;
  }

  const payload=await response.json() as {
    choices?:Array<{message?:{content?:unknown}}>;
    usage?:Record<string,unknown>;
  };
  const content=payload.choices?.[0]?.message?.content;
  if(typeof content!=="string"||!content.trim()){
    const wrapped=new Error("provider_empty_response");
    (wrapped as Error&{category?:string}).category="failed";
    throw wrapped;
  }
  const usage=payload.usage??{};
  return {
    content:content.trim(),
    inputTokens:Number(usage.prompt_tokens??usage.input_tokens??0),
    outputTokens:Number(usage.completion_tokens??usage.output_tokens??0)
  };
}


export function resolveOcrPdfRoute(connection:ProviderConnection):string|null{
  const metadata=(connection.metadata||{}) as Record<string,unknown>;
  const capabilities=(metadata.capabilities||{}) as Record<string,unknown>;
  if(capabilities.ocr_pdf!==true)return null;

  const raw=typeof metadata.ocr_endpoint==="string"
    ?metadata.ocr_endpoint.trim()
    :"";
  if(!raw)return null;

  const url=new URL(raw);
  if(url.protocol!=="https:"||url.hostname.toLowerCase()!==connection.endpoint_host.toLowerCase()){
    throw new Error("provider_endpoint_rejected");
  }
  if(url.username||url.password||(url.port&&url.port!=="443")){
    throw new Error("provider_endpoint_rejected");
  }
  return url.toString();
}
