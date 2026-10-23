(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BIAtuacaoCore=api;})(typeof window!=='undefined'?window:globalThis,function(){
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
});
