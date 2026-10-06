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

// Apenas enfileira. O envio real é feito exclusivamente pelo worker.
Deno.serve(async req => {
 if (req.method==='OPTIONS') return new Response('ok',{headers:cors});
 if (req.method!=='POST') return json({success:false,error:'Método não permitido.'},405);
 try {
  const db=admin(); const user=await authenticate(req,db);
  if (!user) return json({success:false,error:'Sessão inválida ou domínio não autorizado.'},401);
  const raw=await req.text();
  if (raw.length>8_000_000) return json({success:false,error:'PDF excede o limite de 6 MB.'},413);
  const b=JSON.parse(raw);
  const p=Object.fromEntries(['chave_certificado','destinatario','nome_revisor','name','titulo','semestre_oferta','pdf_base64','nome_arquivo'].map(k=>[k,text(b[k])]));
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(p.destinatario)) throw new Error('Destinatário inválido.');
  if (!/^(?:UNIDADE|UA|UNIDADE DE APRENDIZAGEM)\s*0?\d{1,2}\b/i.test(p.name)) throw new Error('Envio permitido somente para UA.');
  if (!p.chave_certificado || p.chave_certificado.length>2000 || !p.nome_revisor || !p.titulo || !p.semestre_oferta) throw new Error('Dados do certificado incompletos.');
  if (p.pdf_base64.length>8_000_000 || !/^JVBERi0[A-Za-z0-9+/=\s]+$/.test(p.pdf_base64)) throw new Error('PDF inválido.');
  p.nome_arquivo=p.nome_arquivo.replace(/[\r\n]/g,'') || 'certificado.pdf';
  return json(await rpc(db,'certificados_fila_adicionar',{p,usuario:user.id}),202);
 } catch(e) {return json({success:false,error:e instanceof Error ? e.message : String(e)},400);}
});
