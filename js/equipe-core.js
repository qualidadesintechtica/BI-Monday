(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BIEquipeCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  'use strict';
  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const norm = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const email = value => text(value).toLowerCase();
  const present = value => value !== null && value !== undefined && String(value).trim() !== '';
  const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  function dateISO(value, date1904 = false) {
    if (!present(value)) return null;
    let s;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || value < 1 || value > 100000) throw new Error('Data Excel inválida.');
      s = new Date(Date.UTC(1899,11,30) + (Math.floor(value) + (date1904 ? 1462 : 0)) * 86400000).toISOString().slice(0,10);
    } else if (value instanceof Date) {
      if (!Number.isFinite(value.getTime())) throw new Error('Data inválida.');
      s = value.toISOString().slice(0,10);
    } else {
      const raw = text(value), br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      s = br ? `${br[3]}-${br[2].padStart(2,'0')}-${br[1].padStart(2,'0')}` : raw;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s+'T00:00:00Z')) || new Date(s+'T00:00:00Z').toISOString().slice(0,10) !== s || s < '1900-01-01' || s > '2199-12-31') throw new Error('Use uma data válida em DD/MM/AAAA.');
    return s;
  }
  function active(value) {
    if (!present(value)) return null;
    if ([true,'sim','s','ativo','true','1'].includes(typeof value==='boolean' ? value : norm(value))) return true;
    if ([false,'nao','n','inativo','desligado','false','0'].includes(typeof value==='boolean' ? value : norm(value))) return false;
    throw new Error('Vínculo ativo deve ser SIM ou NÃO.');
  }
  function state(row, reference=today()) {
    if (row.data_desligamento) return row.data_desligamento > reference ? 'agendado' : 'desligado';
    return row.vinculo_ativo === true ? 'ativo' : row.vinculo_ativo === false ? 'desligado' : 'nao-informado';
  }
  function elapsed(row, reference=today()) {
    if (!row.data_desligamento || row.data_desligamento > reference) return null;
    return Math.round((Date.parse(reference+'T00:00:00Z')-Date.parse(row.data_desligamento+'T00:00:00Z'))/86400000);
  }
  function safeURL(value) {
    try { const u=new URL(text(value)); return ['http:','https:'].includes(u.protocol) ? u.href : null; } catch { return null; }
  }
  const fields = {
    docente:['docente validador','docente','professor','nome','nome completo'],
    email:['e-mail institucional','email institucional','e mail institucional','email','e-mail'],
    ies:['ies de vinculo','ies','instituicao'],
    vinculo_ativo:['vinculo ativo','ativo'],
    data_desligamento:['data de desligamento','data desligamento','desligamento'],
    formacao:['area de formacao','formacao'],
    titulacao:['titulacao maxima','titulacao'],
    lattes:['lattes','curriculo lattes'],
    uc:['unidade curricular validada','unidade curricular','uc'],
    semestre:['semestre validacao','semestre de validacao','semestre'],
    avaliacao:['avaliacao','avaliacao da atuacao na validacao'],
    comentarios:['comentarios','comentario','observacoes']
  };
  function mapping(row) {
    const map={};
    for(const [key,aliases] of Object.entries(fields)) {
      const matches=row.map((v,i)=>aliases.includes(norm(v)) ? i : -1).filter(i=>i>=0);
      if(matches.length>1) throw new Error(`Cabeçalho duplicado: ${aliases[0]}.`);
      if(matches.length) map[key]=matches[0];
    }
    return map;
  }
  function parseRows(matrix, mode='cadastro', date1904=false, current=[]) {
    if(!['cadastro','desligamentos'].includes(mode)) throw new Error('Modo de importação inválido.');
    const header=matrix.slice(0,30).findIndex(row=> {
      const keys=row.map(norm);
      return keys.some(k=>fields.email.includes(k)) && keys.some(k=>(mode==='cadastro'?fields.docente:fields.data_desligamento).includes(k));
    });
    if(header<0) throw new Error(mode==='cadastro' ? 'Cabeçalhos não encontrados. Use a aba Banco, com DOCENTE VALIDADOR e E-MAIL INSTITUCIONAL.' : 'Inclua E-MAIL INSTITUCIONAL e DATA DE DESLIGAMENTO.');
    const map=mapping(matrix[header]), rows=[], errors=[], skipped=[], profiles=new Map(), links=new Map(), terminations=new Map();
    const required=mode==='cadastro'?['docente','email','ies','vinculo_ativo','data_desligamento','formacao','titulacao','lattes','uc','semestre','avaliacao','comentarios']:['email','data_desligamento'];
    const missing=required.filter(k=>map[k]===undefined);
    if(missing.length) throw new Error('Colunas ausentes: '+missing.map(k=>fields[k][0]).join(', '));
    const content=matrix.slice(header+1).filter(r=>r.some(present));
    if(content.length>10000) throw new Error('Limite de 10.000 registros por importação.');
    matrix.slice(header+1).forEach((raw,idx)=> {
      if(!raw.some(present)) return;
      const line=header+idx+2;
      try {
        const r={}; for(const key of Object.keys(fields)) if(map[key]!==undefined) r[key]=['avaliacao','comentarios'].includes(key)?String(raw[map[key]]??'').trim():text(raw[map[key]]);
        r.email=email(r.email);
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) throw new Error('E-mail institucional ausente ou inválido.');
        r.data_desligamento=dateISO(map.data_desligamento===undefined?null:raw[map.data_desligamento],date1904);
        if(mode==='desligamentos' && !r.data_desligamento) { skipped.push(line); return; }
        if(mode==='cadastro') {
          if(!r.docente) throw new Error('Docente não informado.');
          r.vinculo_ativo=active(raw[map.vinculo_ativo]);
          if(r.data_desligamento && r.vinculo_ativo===true && r.data_desligamento<=today()) throw new Error('Vínculo SIM conflita com uma data de desligamento já ocorrida.');
          if(r.lattes && !safeURL(r.lattes)) throw new Error('Link Lattes inválido: use http:// ou https://.');
          if(/^#(?:N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!|ERRO)/i.test(r.avaliacao)) throw new Error('A coluna AVALIAÇÃO contém um erro do Excel. Corrija essa célula antes de importar.');
          const old=profiles.get(r.email);
          if(old && norm(old)!==norm(r.docente)) throw new Error('Mesmo e-mail associado a nomes diferentes neste arquivo.');
          profiles.set(r.email,r.docente);
          const key=[r.email,norm(r.ies),norm(r.uc),r.semestre].join('\u001f');
          const signature=JSON.stringify(Object.keys(fields).map(k=>r[k]??null));
          if(links.has(key)) { if(links.get(key)!==signature) throw new Error('Vínculo repetido com informações diferentes.'); skipped.push(line);return; }
          links.set(key,signature);
        } else {
          const existing=current.filter(x=>email(x.email)===r.email && (!r.ies || norm(x.ies)===norm(r.ies)));
          if(!existing.length) throw new Error('Cadastro não encontrado para esse e-mail/IES. Importe primeiro o banco completo.');
          const old=terminations.get(r.email);
          if(old && old!==r.data_desligamento) throw new Error('Datas de desligamento diferentes para o mesmo e-mail.');
          terminations.set(r.email,r.data_desligamento);
          // UC e semestre da planilha não restringem o desligamento do vínculo institucional.
          r.ies=r.ies||'';
        }
        rows.push(r);
      } catch(e) {errors.push({line,message:e.message});}
    });
    if(!rows.length && !errors.length) errors.push({line:header+2,message:'Nenhum registro para importar. Datas vazias são ignoradas.'});
    return {rows,errors,skipped,header:header+1,people:new Set(rows.map(r=>r.email)).size};
  }
  function filter(rows, f={}, reference=today()) {
    const q=norm(f.search);
    return rows.filter(r=>(!q || norm(Object.values(r).filter(x=>typeof x==='string').join(' ')).includes(q)) &&
      ['ies','titulacao','formacao','semestre','uc'].every(key=>!f[key] || norm(r[key])===norm(f[key])) &&
      (!f.status || state(r,reference)===f.status) &&
      (!f.avaliacao || (f.avaliacao==='com' ? (r.atuacoes?r.atuacoes.length>0:present(r.avaliacao)) : (r.atuacoes?r.atuacoes.length===0:!present(r.avaliacao)))));
  }
  function stats(rows, reference=today()) {
    return {people:new Set(rows.map(r=>r.email)).size,links:rows.length,
      active:new Set(rows.filter(r=>state(r,reference)==='ativo').map(r=>r.email)).size,
      departed:new Set(rows.filter(r=>state(r,reference)==='desligado').map(r=>r.email)).size,
      evaluated:new Set(rows.filter(r=>r.atuacoes?r.atuacoes.length>0:present(r.avaliacao)).map(r=>r.email)).size};
  }
  return {text,norm,email,present,today,dateISO,active,state,elapsed,safeURL,mapping,parseRows,filter,stats};
});
