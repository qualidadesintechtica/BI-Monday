import {admin,json,rpc,text} from '../_shared/fila.ts';
const esc=(v:unknown)=>text(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
Deno.serve(async req=>{
 if(req.method!=='POST') return json({success:false},405);
 const secret=Deno.env.get('CERTIFICADOS_WORKER_TOKEN');
 if(!secret || req.headers.get('x-certificados-worker')!==secret) return json({success:false,error:'Não autorizado.'},401);
 const db=admin(); const token=crypto.randomUUID(); let acquired=false; let detalhe:string|null=null;
 try{
  acquired=await rpc(db,'certificados_fila_worker_iniciar',{token});
  if(!acquired) return json({success:true,motivo:'Outro processamento em andamento.'});
  const cfg=await db.from('certificados_fila_config').select('pausado,motivo,iniciar_apos').single();
  if(cfg.error) throw cfg.error;
  if(cfg.data.pausado || Date.parse(cfg.data.iniciar_apos)>Date.now()) return json({success:true,motivo:cfg.data.motivo});
  const apiKey=Deno.env.get('SMTP2GO_API_KEY');
  if(!apiKey) throw new Error('Secret SMTP2GO_API_KEY não configurado.');
  const headers={'Content-Type':'application/json','X-Smtp2go-Api-Key':apiKey};
  const observado_em=new Date().toISOString();
  const quotaResp=await fetch('https://api.smtp2go.com/v3/stats/email_cycle',{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(10000)});
  const quota=await quotaResp.json();
  if(!quotaResp.ok || quota.data?.error || !Number.isInteger(quota.data?.cycle_used) || !Number.isInteger(quota.data?.cycle_remaining)) throw new Error('Não foi possível consultar a cota mensal. Habilite stats/email_cycle na chave SMTP2GO.');
  let aceitos=0; let motivo='';
  // Cinco mensagens por execução, a cada 5 minutos. O banco limita a 25/h.
  for(let i=0;i<5;i++){
   const reservation=await rpc(db,'certificados_fila_reservar',{token,ciclo:quota.data,observado_em});
   const f=reservation.job; if(!f){motivo=reservation.motivo;break;}
   let resultado='conferir'; let provedor_id:string|null=null; let erro:string|null=null;
   try{
    const resp=await fetch('https://api.smtp2go.com/v3/email/send',{method:'POST',headers,signal:AbortSignal.timeout(12000),body:JSON.stringify({
     sender:Deno.env.get('SMTP2GO_FROM') || 'Qualidade Sintechtica <qualidadesintechtica@outlook.com>',
     to:[f.email],subject:`Certificado de participação – Validação de Material Didático – ${f.semestre_oferta}`,
     html_body:`<div style="font-family:Arial,Helvetica,sans-serif;color:#2d1553;line-height:1.6;font-size:15px"><p>Olá, <strong>${esc(f.revisor)}</strong>!</p><p>Agradecemos sua participação no processo de revisão dos materiais didáticos digitais do Ecossistema Ânima.</p><p>Encaminhamos em anexo seu certificado referente à revisão da <strong>Unidade de Aprendizagem ${esc(f.name_ua)}</strong>, vinculada a <strong>${esc(f.titulo)}</strong>, no período de <strong>${esc(f.semestre_oferta)}</strong>.</p><p>Sua contribuição foi muito importante para assegurar a qualidade acadêmica e técnica dos nossos materiais.</p><p>Atenciosamente,<br><strong>Equipe Sintechtica | VPA</strong></p></div>`,
     custom_headers:[{header:'Reply-To',value:'qualidadesintechtica@animaeducacao.com.br'},{header:'X-Certificado-Fila',value:f.id}],
     attachments:[{filename:f.nome_arquivo,fileblob:f.pdf_base64,mimetype:'application/pdf'}],fastaccept:true
    })});
    const out=await resp.json(); const d=out.data;
    // SMTP2GO pode responder HTTP 200 com falhas no corpo.
    if(resp.ok && d?.succeeded===1 && (d.failed===0 || d.failed===undefined) && text(d.email_id)){
     resultado='aceito';provedor_id=text(d.email_id);
    }else if(d?.error || (d?.failed===1 && d?.succeeded===0)){
     resultado='erro';erro=text(d.error || JSON.stringify(d.failures));
    }else{erro='Resposta inconclusiva do SMTP2GO. Conferir Activity antes de repetir.';}
   }catch{erro='Sem confirmação de envio. Conferir no SMTP2GO antes de repetir.';}
   await rpc(db,'certificados_fila_finalizar',{fila:f.id,tentativa:f.token_tentativa,resultado,provedor_id,detalhe:erro});
   if(resultado!=='aceito'){
    detalhe=erro;
    const pause=await db.from('certificados_fila_config').update({pausado:true,motivo:'Envio sem confirmação ou rejeitado: corrigir/conferir antes de retomar.'}).eq('id',true);
    if(pause.error) throw pause.error;
    break;
   } aceitos++;
  }
  return json({success:true,aceitos,motivo,erro:detalhe});
 }catch(e){detalhe=e instanceof Error?e.message:String(e);return json({success:false,error:detalhe},500);}
 finally{if(acquired) await rpc(db,'certificados_fila_worker_encerrar',{token,detalhe}).catch(()=>{});}
});
