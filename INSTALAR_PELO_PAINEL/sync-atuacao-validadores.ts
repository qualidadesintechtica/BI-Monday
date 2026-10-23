// @ts-nocheck
// V25.46.71 | Arquivo completo para o editor do painel. Verify JWT: ativado.
import { createClient } from 'npm:@supabase/supabase-js@2';
const A=(function(){
'use strict';
  const BOARD='18430296590';
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const label=v=>norm(v).replace(/[.?]+$/,'');
  const headers={
    avaliador:'Gestores Validadores - NQ',revisor:'Revisores - NQ',
    c1:'Realizou as atividades dentro dos prazos estabelecidos.',
    c2:'Respondeu aos contatos realizados, dando os retornos necessários.',
    c3:'Demonstrou postura colaborativa e abertura para receber orientações e realizar ajustes.',
    c4:'Demonstrou compreensão dos critérios e orientações estabelecidos para validação dos materiais.',
    c5:'Apresentou atenção aos detalhes durante a análise dos materiais.',
    c6:'Demonstrou postura crítica e colaborativa na análise dos materiais.',
    media_p1:'Média Critérios (P1)',
    avaliacao_geral:'De forma geral, como você avalia a atuação pontual do professor revisor durante o período em que apoiou as validações?',
    recomendacao:'Qual a probabilidade de você recomendar este professor para participar novamente da atividade de validação dos materiais didáticos digitais?',
    comentarios:'Há algum comentário, observação ou consideração adicional que você gostaria de registrar sobre a atuação deste professor?'
  };
  function mapping(values){
    const out={};
    for(const [key,title] of Object.entries(headers)){
      const hits=values.map((v,i)=>label(v)===label(title)?i:-1).filter(i=>i>=0);
      if(hits.length!==1)throw new Error(`${hits.length?'Coluna duplicada':'Coluna ausente'}: ${title}`);
      out[key]=hits[0];
    }
    return out;
  }
  function score(v){
    if(v===null||v===undefined||text(v)==='')return null;
    const s=text(v).replace(',','.');
    if(!/^\d+(?:\.\d+)?(?:\s*\/\s*5)?$/.test(s))throw new Error('Nota inválida: '+s);
    const n=Number(s.split('/')[0]);
    if(!Number.isFinite(n)||n<0||n>5)throw new Error('Nota fora do intervalo de 0 a 5: '+s);
    return n;
  }
  function record(get,meta){
    const revisor=text(get('revisor'));
    if(!revisor)throw new Error('Revisores - NQ não preenchido.');
    return {...meta,revisor,avaliador:text(get('avaliador')),criterios:[1,2,3,4,5,6].map(i=>score(get('c'+i))),
      media_p1:score(get('media_p1')),avaliacao_geral:score(get('avaliacao_geral')),recomendacao:score(get('recomendacao')),
      comentarios:String(get('comentarios')??'').trim()};
  }
  function parseExcel(matrix){
    const header=matrix.slice(0,30).findIndex(r=>r.some(v=>label(v)===label(headers.revisor)));
    if(header<0)throw new Error('Use a exportação do quadro Avaliação da Atuação na Validação, com a coluna Revisores - NQ.');
    const map=mapping(matrix[header]),name=matrix[header].findIndex(v=>norm(v)==='name'),rows=[],errors=[],skipped=[];
    for(let i=header+1;i<matrix.length;i++){
      const raw=matrix[i],line=i+1;
      if(!raw.some(v=>text(v)!==''))continue;
      // O rodapé exportado tem totais e nenhum identificador/revisor/avaliador.
      // Não trata um registro incompleto como total apenas porque o revisor está vazio.
      const summaryValues=[1,2,3,4,5,6].map(n=>raw[map['c'+n]]).concat([raw[map.avaliacao_geral],raw[map.recomendacao]]);
      const summary=summaryValues.filter(v=>/^\d+(?:[.,]\d+)?\s*\/\s*5$/.test(text(v))).length>=2;
      if(summary&&!text(raw[map.revisor])&&!text(raw[map.avaliador])&&(name<0||!text(raw[name]))&&!text(raw[map.comentarios])){skipped.push(line);continue;}
      try{rows.push(record(k=>raw[map[k]],{chave:'excel:'+line,monday_item_id:null,nome_item:name<0?'':text(raw[name])}));}
      catch(e){errors.push({line,message:e.message});}
    }
    if(!rows.length&&!errors.length)errors.push({line:header+2,message:'Nenhuma avaliação encontrada.'});
    if(rows.length>10000)throw new Error('Limite de 10.000 avaliações por importação.');
    return {rows,errors,skipped,header:header+1,people:new Set(rows.map(r=>norm(r.revisor))).size};
  }
  function columnValue(c){
    if(c?.display_value!==undefined&&c.display_value!==null)return c.display_value;
    if(c?.text!==undefined&&c.text!==null&&text(c.text)!=='')return c.text;
    let v;try{v=typeof c?.value==='string'?JSON.parse(c.value):c?.value;}catch{throw new Error('Valor de coluna inválido na Monday.');}
    if(v===null||v===undefined)return null;
    if(typeof v==='number'||typeof v==='string')return v;
    if(typeof v.rating==='number')return v.rating;
    if(typeof v.number==='number'||typeof v.number==='string')return v.number;
    return null;
  }
  function fromMonday(columns,items){
    const map=mapping(columns.map(c=>c.title)),seen=new Set();
    return items.map(item=>{
      if(!/^\d+$/.test(String(item.id))||seen.has(String(item.id)))throw new Error('Identificador repetido ou inválido no quadro.');
      seen.add(String(item.id));
      const values=new Map((item.column_values||[]).map(c=>[c.id,c]));
      for(const key of Object.keys(headers))if(!values.has(columns[map[key]].id))throw new Error('Resposta incompleta da Monday: '+headers[key]);
      return record(k=>columnValue(values.get(columns[map[k]].id)),{chave:'monday:'+item.id,monday_item_id:String(item.id),nome_item:text(item.name)});
    });
  }
  function recognize(responses,rows){
    const names=new Map(),people=new Map();
    for(const r of rows){
      const mail=norm(r.email);if(!mail||!norm(r.docente))continue;
      people.set(mail,r);
      if(!names.has(norm(r.docente)))names.set(norm(r.docente),new Set());
      names.get(norm(r.docente)).add(mail);
    }
    return responses.map(r=>{
      const matches=[...(names.get(norm(r.revisor))||[])];
      const email=matches.length===1?matches[0]:null;
      return {...r,email,docente:email?people.get(email).docente:null,reconhecimento:email?'reconhecido':matches.length>1?'ambiguo':'sem-cadastro'};
    });
  }
  function attach(rows,responses){
    const byEmail=new Map();for(const r of responses)if(r.email){if(!byEmail.has(r.email))byEmail.set(r.email,[]);byEmail.get(r.email).push(r);}
    return rows.map(r=>({...r,atuacoes:byEmail.get(norm(r.email))||[]}));
  }
  return {BOARD,headers,text,norm,mapping,score,parseExcel,columnValue,fromMonday,recognize,attach};
})();
const fields='id name column_values(ids:$cols){id text value ... on FormulaValue{display_value} ... on MirrorValue{display_value} ... on BoardRelationValue{display_value}}';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
function createHandler({getUser,readState,publish,token,fetchImpl=fetch}){
  return async request=>{
    const respond=(status,body)=>new Response(JSON.stringify(body),{status,headers:cors});
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST')return respond(405,{error:'Use POST.'});
    try{
      const bearer=request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
      if(!bearer)return respond(401,{error:'Sessão não autenticada.'});
      const user=await getUser(bearer);
      if(!user?.id)return respond(401,{error:'Sessão expirada. Entre novamente.'});
      if(String(user.email||'').trim().toLowerCase().split('@')[1]!=='animaeducacao.com.br')return respond(403,{error:'Acesso restrito ao e-mail institucional.'});
      if(!token)return respond(503,{error:'Configure MONDAY_API_TOKEN na função sync-atuacao-validadores.'});
      const previous=await readState();
      async function query(query,variables){
        let response;
        try{response=await fetchImpl('https://api.monday.com/v2',{method:'POST',headers:{Authorization:token,'Content-Type':'application/json','API-Version':'2026-07'},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(20000)});}
        catch{throw new Error('Não foi possível ler a Monday. As avaliações anteriores foram preservadas.');}
        if(!response.ok)throw new Error(response.status===429?'Limite de consultas da Monday atingido. Tente novamente mais tarde.':'A Monday recusou a consulta. Confira o token e o acesso ao quadro 18430296590.');
        let json;try{json=await response.json();}catch{throw new Error('A Monday retornou uma resposta inválida.');}
        if(json.errors?.length||!json.data)throw new Error('A consulta à Monday falhou. Confira o acesso ao quadro e as colunas da avaliação.');
        return json.data;
      }
      const meta=await query('query($boards:[ID!]!){boards(ids:$boards){id columns{id title}}}',{boards:[A.BOARD]});
      const board=meta.boards?.find(b=>String(b.id)===A.BOARD);
      if(!board?.columns)throw new Error('O token não tem acesso ao quadro 18430296590.');
      const map=A.mapping(board.columns.map(c=>c.title)),cols=Object.values(map).map(i=>board.columns[i].id);
      const first=await query(`query($boards:[ID!]!,$cols:[String!]){boards(ids:$boards){id items_page(limit:200){cursor items{${fields}}}}}`,{boards:[A.BOARD],cols});
      let page=first.boards?.find(b=>String(b.id)===A.BOARD)?.items_page;
      const items=[],cursors=new Set();
      for(;;){
        if(!page||!Array.isArray(page.items))throw new Error('Página incompleta da Monday. Nenhuma alteração foi salva.');
        items.push(...page.items);
        if(items.length>10000)throw new Error('O quadro ultrapassou o limite de 10.000 avaliações. Nenhuma alteração foi salva.');
        if(!page.cursor)break;
        if(cursors.has(page.cursor))throw new Error('Paginação repetida da Monday. Nenhuma alteração foi salva.');
        cursors.add(page.cursor);
        const next=await query(`query($cursor:String!,$cols:[String!]){next_items_page(cursor:$cursor,limit:200){cursor items{${fields}}}}`,{cursor:page.cursor,cols});
        page=next.next_items_page;
      }
      if(!items.length)throw new Error('O quadro retornou vazio. As avaliações anteriores foram preservadas.');
      const responses=A.fromMonday(board.columns,items).sort((a,b)=>a.monday_item_id.localeCompare(b.monday_item_id,'en',{numeric:true}));
      const result=await publish(responses,previous?.versao??null);
      return respond(200,{...result,quadro_id:A.BOARD});
    }catch(error){return respond(error?.code==='40001'?409:502,{error:error?.safeMessage||error?.message||'Não foi possível atualizar as avaliações.'});}
  };
}

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
