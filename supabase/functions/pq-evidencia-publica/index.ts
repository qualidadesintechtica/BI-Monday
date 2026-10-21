// @ts-nocheck
// Arquivo completo para publicação pelo editor do Supabase.
import {createClient} from 'npm:@supabase/supabase-js@2';

export function createPublicEvidenceHandler({createClient,env}) {
  return async req=>{
    const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
      'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS'};
    const reply=(status,message)=>new Response(message,{status,headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(req.method!=='GET')return reply(405,'Use o link de download do relatório.');
    const params=new URL(req.url).searchParams,token=params.get('token');
    try{
      const url=env('SUPABASE_URL');
      const key=(env('SUPABASE_SECRET_KEYS')?JSON.parse(env('SUPABASE_SECRET_KEYS')).default:'')||env('SUPABASE_SERVICE_ROLE_KEY');
      if(!url||!key)return reply(503,'Serviço de download ainda não configurado.');
      if(params.get('status')==='1')return new Response(JSON.stringify({ok:true,versao:'25.46.69'}),{status:200,headers:{...headers,'Content-Type':'application/json'}});
      if(!token||!/^[0-9a-f]{64}$/.test(token))return reply(404,'Link de evidência inválido ou desativado.');
      const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      const {data:link,error}=await client.rpc('pq_resolver_evidencia_compartilhada',{p_token:token});
      if(error)return reply(503,'Serviço de evidências indisponível. Solicite a conferência da instalação.');
      if(!link?.storage_path)return reply(404,'Link de evidência inválido ou desativado.');
      const {data:file,error:fileError}=await client.storage.from('pq-evidencias').download(link.storage_path);
      if(fileError||!file)return reply(404,'Arquivo indisponível. Solicite uma nova emissão do relatório.');
      if(file.size>20*1024*1024)return reply(413,'O arquivo excede o limite de download de 20 MB.');
      const name=String(link.arquivo_nome||'evidencia').normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g,'_').replace(/^\.+|[. ]+$/g,'').slice(0,180)||'evidencia';
      const encoded=encodeURIComponent(name).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
      return new Response(file,{status:200,headers:{...headers,'Content-Type':'application/octet-stream','Content-Length':String(file.size),
        'Content-Disposition':"attachment; filename=\"evidencia\"; filename*=UTF-8''"+encoded}});
    }catch{return reply(503,'Não foi possível baixar a evidência. Tente novamente ou solicite uma nova emissão do relatório.');}
  };
}
Deno.serve(createPublicEvidenceHandler({createClient,env:name=>Deno.env.get(name)}));
