import * as coreModule from './core.js';
const A=coreModule.default||globalThis.BIAtuacaoCore;
const fields='id name column_values(ids:$cols){id text value ... on FormulaValue{display_value} ... on MirrorValue{display_value} ... on BoardRelationValue{display_value}}';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
export function createHandler({getUser,readState,publish,token,fetchImpl=fetch}){
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
