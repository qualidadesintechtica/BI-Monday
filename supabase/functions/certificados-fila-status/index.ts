import {admin,authenticate,cors,json} from '../_shared/fila.ts';
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
