import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
const cors = {
 'Access-Control-Allow-Origin': '*',
 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
 'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const text = (v: unknown) => String(v ?? '').trim();
function json(body: unknown, status = 200) {
 return new Response(JSON.stringify(body), {status, headers: {...cors, 'Content-Type': 'application/json'}});
}
function admin() {
 return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
 {auth: {persistSession: false, autoRefreshToken: false}});
}
async function authenticate(req: Request, db: ReturnType<typeof admin>) {
 const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
 if (!token) return null;
 const {data, error} = await db.auth.getUser(token);
 const domains = (Deno.env.get('CERTIFICADOS_DOMINIOS_PERMITIDOS') || 'animaeducacao.com.br').split(',').map(x => x.trim().toLowerCase());
 if (error || !data.user?.email_confirmed_at || !domains.includes(data.user.email?.toLowerCase().split('@')[1] || '')) return null;
 return data.user;
}
async function rpc(db: ReturnType<typeof admin>, name: string, args: Record<string, unknown>) {
 const {data,error} = await db.rpc(name,args);
 if (error) throw new Error(error.message);
 return data;
}

Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
 if(req.method!=='POST') return json({success:false,error:'Método não permitido.'},405);
 try {
  const db=admin(); if(!await authenticate(req,db)) return json({success:false,error:'Sessão inválida.'},401);
  const config=await db.from('certificados_fila_config').select('pausado,motivo,iniciar_apos,ultima_execucao,ultimo_erro').single();
  if(config.error) throw config.error;
  const rows=[];
  for(let start=0;;start+=1000){
   const r=await db.from('certificados_fila').select('chave_certificado,status,aceito_em,smtp2go_id,erro,email,revisor').order('id').range(start,start+999);
   if(r.error) throw r.error; rows.push(...r.data); if(r.data.length<1000) break;
  }
  const conf=await db.from('certificados_fila_conferencia').select('monday_item_id,email,revisor').eq('ativo',true);
  if(conf.error) throw conf.error;
  return json({success:true,config:config.data,registros:rows,conferencia:conf.data});
 }catch(e){return json({success:false,error:e instanceof Error?e.message:String(e)},500);}
});
