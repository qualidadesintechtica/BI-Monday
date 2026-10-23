import { createClient } from 'npm:@supabase/supabase-js@2';
import { createHandler } from './handler.mjs';

function serviceKey(): string {
  const legacy=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(legacy)return legacy;
  try {
    const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
    return Object.values(keys).find((v):v is string=>typeof v==='string'&&(v.startsWith('sb_secret_')||v.startsWith('eyJ'))) || '';
  } catch {return '';}
}
const url=Deno.env.get('SUPABASE_URL'),key=serviceKey();
const db=url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null;
Deno.serve(createHandler({
  token:Deno.env.get('MONDAY_API_TOKEN'),
  async getUser(bearer:string){
    if(!db)throw new Error('Configuração do Supabase ausente na função.');
    const {data,error}=await db.auth.getUser(bearer);return error?null:data.user;
  },
  async readState(){
    const {data,error}=await db!.from('bi_atuacao_estado').select('versao').eq('id',1).maybeSingle();
    if(error)throw new Error('Instale docs/27_ATUACAO_VALIDADORES_MONDAY.sql antes de sincronizar.');
    return data;
  },
  async publish(respostas:unknown[],versao:number|null){
    const {data,error}=await db!.rpc('bi_atuacao_publicar',{p_respostas:respostas,p_fonte:'monday',p_arquivo:'Monday • 18430296590',p_versao_esperada:versao});
    if(error){const e=new Error(error.code==='40001'?'Outra sessão atualizou as avaliações. Tente novamente.':'Não foi possível salvar as avaliações. Confira a instalação do SQL 27.');Object.assign(e,{code:error.code});throw e;}
    return data;
  }
}));
