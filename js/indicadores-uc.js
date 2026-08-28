(function(){
  "use strict";

  const ESCALA={"Suficiente":0.50,"Ótimo":0.80,"Excelente":1.00,"Não se aplica":null};
  const INDICADORES=[
    {id:"I1",curto:"Recursos multimídia",dim:"Interatividade"},
    {id:"I2",curto:"Taxonomia da Neuroaprendizagem",dim:"Modelo pedagógico"},
    {id:"I3",curto:"Fundamentação científica",dim:"Teórico"},
    {id:"I4",curto:"Recursos inovadores",dim:"Interatividade"},
    {id:"I5",curto:"Atualização de referenciais",dim:"Teórico"},
    {id:"I6",curto:"Competências profissionais",dim:"Empregabilidade"},
    {id:"I7",curto:"Integração à jornada da UC",dim:"Progressividade"}
  ];
  const UAS_POR_UC=8;
  const DADOS_TESTE=[{"i":"UCD_RAD_SER_MEIOES_26_UA02","uc":"UCD_RAD_SER_MEIOES_26","n":"Meios de Hospedagem e Operações","ua":2,"av":"Adriano Rodrigues Teixeira","d":"2026-08-04","c":"Unidade de Aprendizagem","v":["Ótimo","Excelente","Excelente","Excelente","Excelente","Ótimo","Ótimo"]},{"i":"UCD_RAD_SER_MEIOES_26_UA01","uc":"UCD_RAD_SER_MEIOES_26","n":"Meios de Hospedagem e Operações","ua":1,"av":"Adriano Rodrigues Teixeira","d":"2026-08-12","c":"UC","v":["Excelente","Excelente","Excelente","Excelente","Excelente","Excelente","Excelente"]},{"i":"UCD_RAD_SER_MEIOES_26_UA03","uc":"UCD_RAD_SER_MEIOES_26","n":"Meios de Hospedagem e Operações","ua":3,"av":"Adriano Rodrigues Teixeira","d":"2026-08-12","c":"UC","v":["Excelente","Excelente","Excelente","Excelente","Excelente","Excelente","Excelente"]},{"i":"UCD_RAD_SER_MEIOES_26_UA04","uc":"UCD_RAD_SER_MEIOES_26","n":"Meios de Hospedagem e Operações","ua":4,"av":"Adriano Rodrigues Teixeira","d":"2026-08-12","c":"UC","v":["Excelente","Excelente","Excelente","Ótimo","Ótimo","Excelente","Excelente"]},{"i":"UCD_RAD_SER_MEIOES_26_UA05","uc":"UCD_RAD_SER_MEIOES_26","n":"Meios de Hospedagem e Operações","ua":5,"av":"Adriano Rodrigues Teixeira","d":"2026-08-12","c":"UC","v":["Excelente","Excelente","Excelente","Excelente","Ótimo","Excelente","Excelente"]},{"i":"UCD_RAD_SER_MEIOES_26_UA06","uc":"UCD_RAD_SER_MEIOES_26","n":"Meios de Hospedagem e Operações","ua":6,"av":"Adriano Rodrigues Teixeira","d":"2026-08-12","c":"UC","v":["Excelente","Excelente","Excelente","Excelente","Excelente","Ótimo","Excelente"]},{"i":"UCD_RAD_SER_MEIOES_26_UA07","uc":"UCD_RAD_SER_MEIOES_26","n":"Meios de Hospedagem e Operações","ua":7,"av":"Adriano Rodrigues Teixeira","d":"2026-08-12","c":"UC","v":["Excelente","Excelente","Excelente","Excelente","Excelente","Excelente","Excelente"]},{"i":"UCD_RAD_SER_MEIOES_26_UA08","uc":"UCD_RAD_SER_MEIOES_26","n":"Meios de Hospedagem e Operações","ua":8,"av":"Adriano Rodrigues Teixeira","d":"2026-08-12","c":"UC","v":["Excelente","Excelente","Excelente","Excelente","Excelente","Excelente","Excelente"]},{"i":"UCD_RAD_SAU_FUNIAL_26_UA01","uc":"UCD_RAD_SAU_FUNIAL_26","n":"Fundamentos do Serviço Social","ua":1,"av":"Nilmar Francisco da Silva Santos","d":"2026-08-12","c":"UC","v":["Ótimo","Ótimo","Ótimo","Suficiente","Ótimo","Ótimo","Ótimo"]},{"i":"UCD_RAD_SAU_FUNIAL_26_UA02","uc":"UCD_RAD_SAU_FUNIAL_26","n":"Fundamentos do Serviço Social","ua":2,"av":"Nilmar Francisco da Silva Santos","d":"2026-08-12","c":"UC","v":["Ótimo","Ótimo","Ótimo","Ótimo","Ótimo","Suficiente","Ótimo"]},{"i":"UCD_RAD_SAU_FUNIAL_26_UA03","uc":"UCD_RAD_SAU_FUNIAL_26","n":"Fundamentos do Serviço Social","ua":3,"av":"Nilmar Francisco da Silva Santos","d":"2026-08-12","c":"UC","v":["Ótimo","Ótimo","Ótimo","Ótimo","Ótimo","Ótimo","Ótimo"]},{"i":"UCD_RAD_SAU_FUNIAL_26_UA04","uc":"UCD_RAD_SAU_FUNIAL_26","n":"Fundamentos do Serviço Social","ua":4,"av":"Nilmar Francisco da Silva Santos","d":"2026-08-12","c":"UC","v":["Ótimo","Suficiente","Suficiente","Suficiente","Suficiente","Suficiente","Suficiente"]},{"i":"UCD_RAD_SAU_FUNIAL_26_UA05","uc":"UCD_RAD_SAU_FUNIAL_26","n":"Fundamentos do Serviço Social","ua":5,"av":"Nilmar Francisco da Silva Santos","d":"2026-08-12","c":"UC","v":["Suficiente","Suficiente","Suficiente","Suficiente","Suficiente","Ótimo","Suficiente"]},{"i":"UCD_RAD_SAU_FUNIAL_26_UA06","uc":"UCD_RAD_SAU_FUNIAL_26","n":"Fundamentos do Serviço Social","ua":6,"av":"Nilmar Francisco da Silva Santos","d":"2026-08-12","c":"UC","v":["Suficiente","Suficiente","Suficiente","Suficiente","Suficiente","Suficiente","Suficiente"]},{"i":"UCD_RAD_SAU_FUNIAL_26_UA07","uc":"UCD_RAD_SAU_FUNIAL_26","n":"Fundamentos do Serviço Social","ua":7,"av":"Nilmar Francisco da Silva Santos","d":"2026-08-12","c":"UC","v":["Ótimo","Ótimo","Suficiente","Ótimo","Suficiente","Suficiente","Suficiente"]},{"i":"UCD_RAD_SAU_FUNIAL_26_UA08","uc":"UCD_RAD_SAU_FUNIAL_26","n":"Fundamentos do Serviço Social","ua":8,"av":"Nilmar Francisco da Silva Santos","d":"2026-08-12","c":"UC","v":["Ótimo","Suficiente","Suficiente","Suficiente","Suficiente","Suficiente","Suficiente"]},{"i":"UCD_RAD_SAU_POLSTA_26_UA01","uc":"UCD_RAD_SAU_POLSTA_26","n":"Políticas Sociais e Estado Capitalista","ua":1,"av":"Nilmar Francisco da Silva Santos","d":"2026-08-12","c":"UC","v":["Excelente","Excelente","Excelente","Excelente","Excelente","Excelente","Excelente"]},{"i":"UCD_RAD_SAU_POLSTA_26_UA02","uc":"UCD_RAD_SAU_POLSTA_26","n":"Políticas Sociais e Estado Capitalista","ua":2,"av":"Nilmar Francisco da Silva Santos","d":"2026-08-12","c":"UC","v":["Excelente","Excelente","Excelente","Excelente","Excelente","Excelente","Excelente"]},{"i":"UCD_RAD_SAU_POLSTA_26_UA03","uc":"UCD_RAD_SAU_POLSTA_26","n":"Políticas Sociais e Estado Capitalista","ua":3,"av":"Nilmar Francisco da Silva Santos","d":"2026-08-12","c":"UC","v":["Excelente","Excelente","Excelente","Excelente","Excelente","Excelente","Excelente"]},{"i":"UCD_RAD_SAU_POLSTA_26_UA04","uc":"UCD_RAD_SAU_POLSTA_26","n":"Políticas Sociais e Estado Capitalista","ua":4,"av":"Nilmar Francisco da Silva Santos","d":"2026-08-12","c":"UC","v":["Excelente","Excelente","Excelente","Excelente","Excelente","Excelente","Excelente"]},{"i":"UCD_RAD_SAU_POLSTA_26_UA05","uc":"UCD_RAD_SAU_POLSTA_26","n":"Políticas Sociais e Estado Capitalista","ua":5,"av":"Nilmar Francisco da Silva Santos","d":"2026-08-12","c":"UC","v":["Excelente","Excelente","Excelente","Excelente","Excelente","Excelente","Excelente"]},{"i":"UCD_RAD_SAU_POLSTA_26_UA06","uc":"UCD_RAD_SAU_POLSTA_26","n":"Políticas Sociais e Estado Capitalista","ua":6,"av":"Nilmar Francisco da Silva Santos","d":"2026-08-12","c":"UC","v":["Excelente","Excelente","Excelente","Excelente","Excelente","Excelente","Excelente"]},{"i":"UCD_RAD_CIS_TEOICA_26_UA01","uc":"UCD_RAD_CIS_TEOICA_26","n":"Teoria e Filosofia Política","ua":1,"av":"alexia.lopes@ulife.com.br","d":"2026-08-13","c":"UC","v":["Excelente","Excelente","Excelente","Excelente","Excelente","Excelente","Excelente"]},{"i":"UCD_RAD_CIS_TEOICA_26_UA02","uc":"UCD_RAD_CIS_TEOICA_26","n":"Teoria e Filosofia Política","ua":2,"av":"alexia.lopes@ulife.com.br","d":"2026-08-13","c":"UC","v":["Ótimo","Excelente","Excelente","Ótimo","Ótimo","Ótimo","Excelente"]},{"i":"UCD_RAD_CIS_TEOICA_26_UA03","uc":"UCD_RAD_CIS_TEOICA_26","n":"Teoria e Filosofia Política","ua":3,"av":"alexia.lopes@ulife.com.br","d":"2026-08-13","c":"UC","v":["Excelente","Ótimo","Excelente","Excelente","Ótimo","Ótimo","Excelente"]},{"i":"UCD_RAD_CIS_TEOICA_26_UA04","uc":"UCD_RAD_CIS_TEOICA_26","n":"Teoria e Filosofia Política","ua":4,"av":"alexia.lopes@ulife.com.br","d":"2026-08-13","c":"UC","v":["Excelente","Excelente","Excelente","Excelente","Excelente","Excelente","Excelente"]},{"i":"UCD_RAD_CIS_TEOICA_26_UA05","uc":"UCD_RAD_CIS_TEOICA_26","n":"Teoria e Filosofia Política","ua":5,"av":"alexia.lopes@ulife.com.br","d":"2026-08-13","c":"UC","v":["Excelente","Ótimo","Excelente","Excelente","Excelente","Excelente","Excelente"]},{"i":"UCD_RAD_CIS_TEOICA_26_UA06","uc":"UCD_RAD_CIS_TEOICA_26","n":"Teoria e Filosofia Política","ua":6,"av":"alexia.lopes@ulife.com.br","d":"2026-08-13","c":"UC","v":["Ótimo","Excelente","Excelente","Ótimo","Excelente","Excelente","Excelente"]},{"i":"UCD_RAD_CIS_TEOICA_26_UA07","uc":"UCD_RAD_CIS_TEOICA_26","n":"Teoria e Filosofia Política","ua":7,"av":"alexia.lopes@ulife.com.br","d":"2026-08-13","c":"UC","v":["Ótimo","Excelente","Excelente","Ótimo","Excelente","Ótimo","Ótimo"]},{"i":"UCD_RAD_CIS_TEOICA_26_UA08","uc":"UCD_RAD_CIS_TEOICA_26","n":"Teoria e Filosofia Política","ua":8,"av":"alexia.lopes@ulife.com.br","d":"2026-08-13","c":"UC","v":["Ótimo","Excelente","Excelente","Ótimo","Excelente","Excelente","Excelente"]},{"i":"UCD_RAD_SAU_POLSTA_26_UA07","uc":"UCD_RAD_SAU_POLSTA_26","n":"Políticas Sociais e Estado Capitalista","ua":7,"av":"Nilmar Francisco da Silva Santos","d":"2026-08-14","c":"UC","v":["Suficiente","Excelente","Excelente","Ótimo","Excelente","Excelente","Excelente"]},{"i":"UCD_RAD_SAU_GESUDE_26_UA01","uc":"UCD_RAD_SAU_GESUDE_26","n":"Gestão das tecnologias de saúde","ua":1,"av":"Suellen Fonseca","d":"2026-08-14","c":"UC","v":["Excelente","Ótimo","Suficiente","Ótimo","Suficiente","Ótimo","Suficiente"]},{"i":"UCD_RAD_SAU_GESUDE_26_UA02","uc":"UCD_RAD_SAU_GESUDE_26","n":"Gestão das tecnologias de saúde","ua":2,"av":"Suellen Fonseca","d":"2026-08-14","c":"UC","v":["Excelente","Suficiente","Suficiente","Suficiente","Suficiente","Ótimo","Suficiente"]},{"i":"UCD_RAD_SAU_GESUDE_26_UA03","uc":"UCD_RAD_SAU_GESUDE_26","n":"Gestão das tecnologias de saúde","ua":3,"av":"Suellen Fonseca","d":"2026-08-14","c":"UC","v":["Excelente","Ótimo","Suficiente","Suficiente","Ótimo","Ótimo","Ótimo"]},{"i":"UCD_RAD_SAU_GESUDE_26_UA04","uc":"UCD_RAD_SAU_GESUDE_26","n":"Gestão das tecnologias de saúde","ua":4,"av":"Suellen Fonseca","d":"2026-08-14","c":"UC","v":["Ótimo","Suficiente","Suficiente","Suficiente","Ótimo","Suficiente","Suficiente"]},{"i":"UCD_RAD_SAU_GESUDE_26_UA05","uc":"UCD_RAD_SAU_GESUDE_26","n":"Gestão das tecnologias de saúde","ua":5,"av":"Suellen Fonseca","d":"2026-08-14","c":"UC","v":["Excelente","Ótimo","Suficiente","Suficiente","Suficiente","Ótimo","Ótimo"]},{"i":"UCD_RAD_SAU_GESUDE_26_UA06","uc":"UCD_RAD_SAU_GESUDE_26","n":"Gestão das tecnologias de saúde","ua":6,"av":"Suellen Fonseca","d":"2026-08-14","c":"UC","v":["Excelente","Suficiente","Suficiente","Suficiente","Suficiente","Ótimo","Suficiente"]},{"i":"UCD_RAD_SAU_GESUDE_26_UA07","uc":"UCD_RAD_SAU_GESUDE_26","n":"Gestão das tecnologias de saúde","ua":7,"av":"Suellen Fonseca","d":"2026-08-14","c":"UC","v":["Excelente","Excelente","Suficiente","Suficiente","Ótimo","Ótimo","Ótimo"]},{"i":"UCD_RAD_SAU_GESUDE_26_UA08","uc":"UCD_RAD_SAU_GESUDE_26","n":"Gestão das tecnologias de saúde","ua":8,"av":"Suellen Fonseca","d":"2026-08-14","c":"UC","v":["Excelente","Excelente","Ótimo","Suficiente","Ótimo","Ótimo","Ótimo"]},{"i":"UCD_RAD_EDU_CIEICO_26_UA01","uc":"UCD_RAD_EDU_CIEICO_26","n":"Ciências humanas: saberes, práticas e pensamento crítico","ua":1,"av":"alexia.lopes@ulife.com.br","d":"2026-08-14","c":"UC","v":["Ótimo","Suficiente","Ótimo","Ótimo","Ótimo","Excelente","Ótimo"]},{"i":"UCD_RAD_EDU_CIEICO_26_UA02","uc":"UCD_RAD_EDU_CIEICO_26","n":"Ciências humanas: saberes, práticas e pensamento crítico","ua":2,"av":"alexia.lopes@ulife.com.br","d":"2026-08-14","c":"UC","v":["Ótimo","Ótimo","Excelente","Ótimo","Excelente","Excelente","Excelente"]},{"i":"UCD_RAD_AGR_SEMRIA_26_UA01","uc":"UCD_RAD_AGR_SEMRIA_26","n":"Semiologia Veterinária","ua":1,"av":"Giuliano Barros","d":"2026-08-14","c":"UC","v":["Ótimo","Ótimo","Excelente","Excelente","Excelente","Ótimo","Excelente"]},{"i":"UCD_RAD_AGR_SEMRIA_26_UA02","uc":"UCD_RAD_AGR_SEMRIA_26","n":"Semiologia Veterinária","ua":2,"av":"Giuliano Barros","d":"2026-08-14","c":"UC","v":["Excelente","Excelente","Excelente","Excelente","Excelente","Ótimo","Excelente"]},{"i":"UCD_RAD_AGR_SEMRIA_26_UA03","uc":"UCD_RAD_AGR_SEMRIA_26","n":"Semiologia Veterinária","ua":3,"av":"Giuliano Barros","d":"2026-08-14","c":"UC","v":["Ótimo","Excelente","Excelente","Excelente","Excelente","Excelente","Excelente"]},{"i":"UCD_CIS_PSIOES_25_UA04","uc":"UCD_CIS_PSIOES_25","n":"Psicologia, neurociências e cognição: interfaces e aplicações","ua":4,"av":"alexia.lopes@ulife.com.br","d":"2026-08-26","c":"UC","v":["Ótimo","Excelente","Excelente","Suficiente","Ótimo","Ótimo","Ótimo"]},{"i":"UCD_CIS_PSIOES_25_UA05","uc":"UCD_CIS_PSIOES_25","n":"Psicologia, neurociências e cognição: interfaces e aplicações","ua":5,"av":"alexia.lopes@ulife.com.br","d":"2026-08-26","c":"UC","v":["Ótimo","Excelente","Ótimo","Suficiente","Ótimo","Ótimo","Ótimo"]},{"i":"UCD_CIS_PSIOES_25_UA06","uc":"UCD_CIS_PSIOES_25","n":"Psicologia, neurociências e cognição: interfaces e aplicações","ua":6,"av":"alexia.lopes@ulife.com.br","d":"2026-08-26","c":"UC","v":["Ótimo","Ótimo","Ótimo","Suficiente","Ótimo","Ótimo","Ótimo"]},{"i":"UCD_CIS_PSIOES_25_UA07","uc":"UCD_CIS_PSIOES_25","n":"Psicologia, neurociências e cognição: interfaces e aplicações","ua":7,"av":"alexia.lopes@ulife.com.br","d":"2026-08-26","c":"UC","v":["Ótimo","Excelente","Excelente","Suficiente","Excelente","Excelente","Excelente"]}];

  let cortes={exc:.90,oti:.70,suf:.50};
  let ucs=[]; let selecionada=null; let ordem="nota"; let busca=""; let vista="uc";

  const $=id=>document.getElementById(id);
  const esc=s=>String(s??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
  const pontos=v=>(v&&v in ESCALA)?ESCALA[v]:null;
  const media=a=>{const n=a.filter(x=>x!==null&&x!==undefined);return n.length?n.reduce((s,x)=>s+x,0)/n.length:null;};
  const conceito=n=>n===null?null:n>=cortes.exc?"Excelente":n>=cortes.oti?"Ótimo":n>=cortes.suf?"Suficiente":"Insuficiente";
  const nivel=n=>n===null?"na":n>=cortes.exc?"exc":n>=cortes.oti?"oti":n>=cortes.suf?"suf":"ins";
  const num=n=>n===null?"—":n.toFixed(2).replace(".",",");

  function normalizar(brutos){return brutos.map(r=>({item:r.i,uc:r.uc,nome:r.n,ua:r.ua,avaliador:r.av,data:r.d,categoria:r.c,valores:r.v}));}
  function agrupar(registros){
    const mapa=new Map();
    registros.forEach(r=>{if(!mapa.has(r.uc))mapa.set(r.uc,{cod:r.uc,nome:r.nome,linhas:[]});const g=mapa.get(r.uc);if(!g.nome&&r.nome)g.nome=r.nome;g.linhas.push(r);});
    const arr=[...mapa.values()];
    arr.forEach(uc=>{
      uc.linhas.sort((a,b)=>a.ua-b.ua);
      uc.porIndicador=INDICADORES.map((_,j)=>media(uc.linhas.map(l=>pontos(l.valores[j]))));
      uc.nota=media(uc.porIndicador); uc.uas=uc.linhas.length;
      uc.incompleta=uc.uas<UAS_POR_UC;
    });
    return arr;
  }

  function valorOrdem(uc){return ordem==="nota"?uc.nota:uc.porIndicador[Number(ordem)];}
  function ordenadas(){
    const q=busca.trim().toLowerCase();
    return ucs.filter(uc=>!q||(uc.nome+" "+uc.cod).toLowerCase().includes(q))
      .sort((a,b)=>(valorOrdem(b)??-1)-(valorOrdem(a)??-1)||(b.nota??-1)-(a.nota??-1));
  }

  function renderResumo(){
    const notas=ucs.map(u=>u.nota).filter(v=>v!==null); const geral=media(notas);
    const exc=ucs.filter(u=>conceito(u.nota)==="Excelente").length;
    const oti=ucs.filter(u=>conceito(u.nota)==="Ótimo").length;
    const inc=ucs.filter(u=>u.incompleta).length;
    $("ucxTotal").textContent=ucs.length;
    $("ucxMedia").textContent=num(geral);
    $("ucxExcelentes").textContent=exc+oti;
    $("ucxIncompletas").textContent=inc;
    $("ucxResumoConceitos").textContent=`${exc} excelentes · ${oti} ótimas · ${inc} com UAs pendentes`;
  }

  function renderRanking(){
    const list=$("ucxLista"), itens=ordenadas();
    $("ucxContagem").textContent=`${itens.length} de ${ucs.length} UCs`;
    list.innerHTML="";
    if(!itens.length){list.innerHTML='<div class="ucx-empty">Nenhuma UC encontrada.</div>';return;}
    itens.forEach((uc,i)=>{
      const c=conceito(valorOrdem(uc)); const b=document.createElement("button");
      b.className="ucx-rank-row"+(uc.cod===selecionada?" active":"");
      b.onclick=()=>{selecionada=uc.cod;render();};
      b.innerHTML=`<span class="ucx-pos">${i+1}</span><span class="ucx-rank-name"><b>${esc(uc.nome||uc.cod)}</b><small>${esc(uc.cod)}${uc.incompleta?` · ${uc.uas}/${UAS_POR_UC} UAs`:""}</small></span><span class="ucx-strip">${uc.porIndicador.map(m=>`<i class="${nivel(m)}"></i>`).join("")}</span><strong>${num(valorOrdem(uc))}</strong><span class="ucx-concept ${nivel(valorOrdem(uc))}">${c?c.slice(0,3).toUpperCase():"—"}</span>`;
      list.appendChild(b);
    });
  }

  function renderDetalhe(uc){
    if(!uc)return '<div class="ucx-empty">Selecione uma UC.</div>';
    const porUA={}; uc.linhas.forEach(l=>porUA[l.ua]=l);
    const uas=Array.from({length:UAS_POR_UC},(_,i)=>i+1);
    const rows=INDICADORES.map((ind,j)=>{
      const cells=uas.map(u=>{const l=porUA[u];const v=l?l.valores[j]:null;return `<td><span class="ucx-cell ${v? nivel(pontos(v)):'na'}" title="${v||'UA ainda não avaliada'}">${v==='Excelente'?'E':v==='Ótimo'?'Ó':v==='Suficiente'?'S':l?'n/a':'—'}</span></td>`;}).join("");
      return `<tr><th>${esc(ind.curto)}<small>${ind.id} · ${esc(ind.dim)}</small></th>${cells}<td class="ucx-med">${num(uc.porIndicador[j])}</td></tr>`;
    }).join("");
    const avaliadores=[...new Set(uc.linhas.map(l=>l.avaliador).filter(Boolean))];
    return `<div class="ucx-panel-head"><div><span class="ucx-kicker">Detalhe da UC</span><h3>${esc(uc.nome||uc.cod)}</h3><p>${esc(uc.cod)} · ${uc.uas}/${UAS_POR_UC} UAs avaliadas</p></div><div class="ucx-score"><strong>${num(uc.nota)}</strong><span>${conceito(uc.nota)||'Sem nota'}</span></div></div>
      <div class="ucx-table-wrap"><table class="ucx-matrix"><thead><tr><th>Indicador</th>${uas.map(u=>`<th>UA${String(u).padStart(2,'0')}</th>`).join('')}<th>Média</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="ucx-meta"><span><b>Avaliador(es):</b> ${esc(avaliadores.join(', ')||'—')}</span><span><b>Legenda:</b> E Excelente · Ó Ótimo · S Suficiente</span></div>`;
  }

  function renderComparativo(){
    const itens=ordenadas();
    const rows=itens.map((uc,i)=>`<tr><th><span>${i+1}</span>${esc(uc.nome||uc.cod)}<small>${esc(uc.cod)}</small></th>${uc.porIndicador.map(m=>`<td><span class="ucx-heat ${nivel(m)}">${num(m)}</span></td>`).join('')}<td><b>${num(uc.nota)}</b></td></tr>`).join('');
    const medias=INDICADORES.map((_,j)=>num(media(itens.map(u=>u.porIndicador[j]))));
    return `<div class="ucx-panel-head"><div><span class="ucx-kicker">Visão comparativa</span><h3>Comparativo por indicador</h3><p>Clique no seletor de ordenação para priorizar um indicador.</p></div></div><div class="ucx-table-wrap"><table class="ucx-compare"><thead><tr><th>Unidade Curricular</th>${INDICADORES.map(i=>`<th title="${esc(i.curto)}">${i.id}<small>${esc(i.curto)}</small></th>`).join('')}<th>Nota</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th>Média</th>${medias.map(m=>`<td>${m}</td>`).join('')}<td>${num(media(itens.map(u=>u.nota)))}</td></tr></tfoot></table></div>`;
  }

  function renderPainel(){
    const el=$("ucxPainel");
    if(vista==="comparativo") el.innerHTML=renderComparativo();
    else el.innerHTML=renderDetalhe(ucs.find(u=>u.cod===selecionada)||ordenadas()[0]);
  }

  function render(){renderResumo();renderRanking();renderPainel();}

  function init(){
    if(!$("viewIndicadoresUC"))return;
    ucs=agrupar(normalizar(DADOS_TESTE)); selecionada=ucs[0]?.cod||null;
    $("ucxBusca").addEventListener("input",e=>{busca=e.target.value;render();});
    $("ucxOrdem").innerHTML='<option value="nota">Nota final</option>'+INDICADORES.map((ind,j)=>`<option value="${j}">${ind.id} · ${esc(ind.curto)}</option>`).join('');
    $("ucxOrdem").addEventListener("change",e=>{ordem=e.target.value;render();});
    document.querySelectorAll('[data-ucx-view]').forEach(btn=>btn.addEventListener('click',()=>{vista=btn.dataset.ucxView;document.querySelectorAll('[data-ucx-view]').forEach(b=>b.classList.toggle('active',b===btn));renderPainel();}));
    $("ucxApplyCuts").addEventListener("click",()=>{cortes={exc:Number($("ucxExc").value),oti:Number($("ucxOti").value),suf:Number($("ucxSuf").value)};render();});
    render();
  }

  window.inicializarIndicadoresUC=init;
  document.addEventListener('DOMContentLoaded',init);
})();
