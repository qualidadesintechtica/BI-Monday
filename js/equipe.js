(function(){
  'use strict';
  const C=window.BIEquipeCore,A=window.BIAtuacaoCore,$=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cell=v=>esc(C.present(v)?v:'—'),date=v=>v?v.split('-').reverse().join('/'):'—';
  const rating=v=>v===null||v===undefined?'Não informada':Number(v).toLocaleString('pt-BR',{maximumFractionDigits:4});
  const labels={ativo:'Ativo',desligado:'Desligado',agendado:'Desligamento agendado','nao-informado':'Não informado'};
  const matchLabels={reconhecido:'Reconhecido automaticamente','sem-cadastro':'Sem cadastro correspondente',ambiguo:'Mais de um cadastro com este nome'};
  const state={rows:[],source:null,responses:[],evaluated:[],enriched:[],sourceReady:false,loaded:false,pending:null,syncPending:null,lastAttempt:0,bound:false,tab:'cadastro',page:1,size:25,workbook:null,preview:null,file:null,saving:false};
  const freshness=15*60*1000;
  function message(id,text,error=false){$(id).textContent=text;$(id).dataset.error=String(error);}
  function failure(error,source=false){
    if(['42P01','PGRST205','PGRST202','42883'].includes(error?.code))return source?'Instale docs/27_ATUACAO_VALIDADORES_MONDAY.sql no Supabase para carregar as avaliações.':'Instale docs/26_BANCO_VALIDADORES_EQUIPE.sql no Supabase para carregar o cadastro.';
    if(error?.code==='42501')return 'A sessão não tem acesso. Entre com seu e-mail institucional.';
    return error?.message||'Não foi possível carregar os dados. Tente novamente.';
  }
  function filters(){const f={search:$('eqSearch').value};for(const k of ['ies','titulacao','formacao','semestre','uc','status','avaliacao'])f[k]=$('eqFilter_'+k).value;return f;}
  function populate(){for(const k of ['ies','titulacao','formacao','semestre','uc']){
    const el=$('eqFilter_'+k),v=el.value,values=[...new Set(state.rows.map(r=>r[k]).filter(C.present))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    el.innerHTML='<option value="">Todos</option>'+values.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');if(values.includes(v))el.value=v;
  }}
  function reconcile(){state.evaluated=A.recognize(state.responses,state.rows);state.enriched=A.attach(state.rows,state.evaluated);}
  function sourceInfo(){
    if(!state.sourceReady){$('eqSourceInfo').textContent='Avaliações indisponíveis';return;}
    if(!state.source){$('eqSourceInfo').textContent='Nenhuma leitura de avaliações salva';return;}
    const d=new Date(state.source.verificado_em||state.source.atualizado_em);
    const when=Number.isFinite(d.getTime())?d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'data não informada';
    $('eqSourceInfo').textContent=`${state.source.fonte==='monday'?'Monday':'Exportação Excel'} · ${state.responses.length} avaliação(ões) · conferida em ${when}`;
  }
  function comments(items){return items.map(r=>`<div class="eq-response"><strong>${cell(r.avaliador)}</strong><div>${C.present(r.comentarios)?cell(r.comentarios):'Sem comentário'}</div></div>`).join('');}
  function criteria(r){return '<details><summary>Ver seis critérios</summary><ol>'+r.criterios.map((n,i)=>`<li>${cell(A.headers['c'+(i+1)])} <strong>${rating(n)}</strong></li>`).join('')+'</ol></details>';}
  function sourceLink(r){return r.monday_item_id?`<a href="https://anima-educacao.monday.com/boards/${A.BOARD}/pulses/${encodeURIComponent(r.monday_item_id)}" target="_blank" rel="noopener noreferrer">Abrir avaliação</a>`:`Exportação Excel · resposta ${cell(r.nome_item)}`;}
  function evaluationRows(f){
    const q=C.norm(f.search),linkFilters={...f,search:''};
    const validEmails=new Set(C.filter(state.enriched,linkFilters).map(r=>C.email(r.email)));
    const hasLinkFilter=['ies','titulacao','formacao','semestre','uc','status'].some(k=>f[k]);
    return state.evaluated.filter(r=>{
      if($('eqMatch').value&&r.reconhecimento!==$('eqMatch').value)return false;
      if(f.avaliacao==='sem')return false;
      if(r.email&&!validEmails.has(r.email))return false;
      if(!r.email&&hasLinkFilter)return false;
      const profile=r.email?state.rows.filter(x=>C.email(x.email)===r.email).flatMap(x=>Object.values(x).filter(v=>typeof v==='string')).join(' '):'';
      return !q||C.norm([r.revisor,r.docente,r.avaliador,r.comentarios,profile].join(' ')).includes(q);
    });
  }
  function render(){
    reconcile();sourceInfo();const f=filters(),rows=C.filter(state.enriched,f),s=C.stats(rows),evaluations=evaluationRows(f);
    $('eqSyncMonday').disabled=!state.sourceReady||!!state.syncPending;
    const list=state.tab==='avaliacao'?evaluations:rows,pages=Math.max(1,Math.ceil(list.length/state.size));state.page=Math.max(1,Math.min(state.page,pages));
    for(const [id,value] of Object.entries({eqPeople:s.people,eqLinks:s.links,eqActive:s.active,eqDeparted:s.departed}))$(id).textContent=value;
    const recognized=new Set(evaluations.filter(r=>r.email).map(r=>r.email)).size;
    $('eqCount').textContent=state.tab==='avaliacao'?`${evaluations.length} avaliação(ões) · ${recognized} docente(s) reconhecido(s) · ${evaluations.filter(r=>!r.email).length} sem vínculo automático`:`${s.people} docente(s) · ${s.links} vínculo(s) de UC/semestre · ${state.sourceReady?s.evaluated+' docente(s) com avaliação':'avaliações indisponíveis'}`;
    const visible=list.slice((state.page-1)*state.size,state.page*state.size);
    if(state.tab==='cadastro')$('eqBody').innerHTML=visible.map(r=>{
      const st=C.state(r),days=C.elapsed(r),av=!state.sourceReady?'Avaliações indisponíveis':r.atuacoes.length?r.atuacoes.map(a=>`<div class="eq-response">P1: ${rating(a.media_p1)}<br><small>${cell(a.avaliador)}</small></div>`).join(''):'Sem avaliação vinculada';
      return `<tr><td>${cell(r.docente)}</td><td>${cell(r.ies)}</td><td><span class="eq-badge ${st}">${labels[st]}</span></td><td>${date(r.data_desligamento)}</td><td>${days===null?(st==='agendado'?'Ainda não iniciado':'—'):`${days} dia(s)`}</td><td>${cell(r.email)}</td><td>${cell(r.formacao)}</td><td>${cell(r.titulacao)}</td><td>${C.safeURL(r.lattes)?`<a href="${esc(C.safeURL(r.lattes))}" target="_blank" rel="noopener noreferrer">Abrir Lattes</a>`:'—'}</td><td>${cell(r.uc)}</td><td>${cell(r.semestre)}</td><td>${av}</td><td>${comments(r.atuacoes)||'—'}</td></tr>`;
    }).join('')||'<tr><td colspan="13">Nenhum vínculo encontrado. Ajuste os filtros ou importe o cadastro.</td></tr>';
    if(state.tab==='avaliacao')$('eqEvaluationBody').innerHTML=visible.map(r=>`<tr><td>${cell(r.revisor)}</td><td><span class="eq-badge ${r.reconhecimento==='reconhecido'?'ativo':'agendado'}">${matchLabels[r.reconhecimento]}</span>${r.email?`<div>${cell(r.docente)}<br>${cell(r.email)}</div>`:''}</td><td>${cell(r.avaliador)}</td><td>${rating(r.media_p1)}</td><td>${rating(r.avaliacao_geral)}</td><td>${rating(r.recomendacao)}</td><td>${criteria(r)}</td><td>${cell(r.comentarios)}</td><td>${sourceLink(r)}</td></tr>`).join('')||`<tr><td colspan="9">${state.sourceReady?'Nenhuma avaliação encontrada. Ajuste os filtros ou atualize a fonte.':'Avaliações indisponíveis. Confira a mensagem acima.'}</td></tr>`;
    $('eqPageInfo').textContent=`Página ${state.page} de ${pages}`;$('eqPrev').disabled=state.page<=1;$('eqNext').disabled=state.page>=pages;$('eqPager').hidden=state.tab==='importar';
  }
  function tab(name){
    state.tab=name;state.page=1;document.querySelectorAll('[data-eq-tab]').forEach(b=>{const on=b.dataset.eqTab===name;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});
    document.querySelectorAll('[data-eq-panel]').forEach(p=>p.hidden=p.dataset.eqPanel!==name);$('eqFilters').hidden=name==='importar';$('eqCount').hidden=name==='importar';$('eqMatchLabel').hidden=name!=='avaliacao';render();
  }
  async function readEvaluations(){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const {data,error}=await window.biSupabase.from('bi_atuacao_estado').select('*').eq('id',1).abortSignal(controller.signal).maybeSingle();if(error)throw error;
      state.source=data||null;state.responses=data?.respostas||[];state.sourceReady=true;
    }finally{clearTimeout(timer);}
  }
  async function syncEvaluations(force=false){
    if(state.syncPending)return state.syncPending;
    if(!state.sourceReady)return;
    const last=state.source?.fonte==='monday'?Date.parse(state.source.verificado_em):0;
    if(!force&&(Date.now()-state.lastAttempt<freshness||Date.now()-last<freshness))return;
    state.lastAttempt=Date.now();$('eqSyncMonday').disabled=true;message('eqMondayMessage','Atualizando avaliações da Monday…');
    state.syncPending=(async()=>{
      const {data,error}=await window.biSupabase.functions.invoke('sync-atuacao-validadores',{body:{},timeout:120000});
      if(error){let detail;try{detail=await error.context?.json();}catch{}throw new Error(detail?.error||'Não foi possível acessar sync-atuacao-validadores. Confira a implantação da função e MONDAY_API_TOKEN.');}
      if(data?.error)throw new Error(data.error);
      await readEvaluations();render();message('eqMondayMessage',`Monday atualizada: ${state.responses.length} avaliação(ões). Os nomes foram reconhecidos automaticamente.`);
    })().catch(error=>{message('eqMondayMessage',failure(error,true)+(state.source?' A última leitura salva continua disponível.':''),true);})
      .finally(()=>{state.syncPending=null;$('eqSyncMonday').disabled=false;});
    return state.syncPending;
  }
  async function load(force=false,{skipSync=false}={}){
    bind();if(state.pending)return state.pending;
    if(state.loaded&&!force){render();if(!skipSync)await syncEvaluations();return;}
    message('eqMessage','Carregando o Banco de Validadores…');$('eqReload').disabled=true;
    state.pending=(async()=>{
      const rows=[];let start=0;
      for(;;){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
        try{const {data,error}=await window.biSupabase.from('bi_validadores_banco').select('*').order('email').order('vinculo_id').range(start,start+999).abortSignal(controller.signal);if(error)throw error;const batch=data||[];rows.push(...batch);if(batch.length<1000)break;start+=1000;}finally{clearTimeout(timer);}}
      state.rows=rows;state.loaded=true;populate();
      try{await readEvaluations();message('eqMondayMessage','');}catch(error){state.sourceReady=false;message('eqMondayMessage',failure(error,true),true);}
      render();message('eqMessage',rows.length?'Banco atualizado.':'Banco vazio. Importe Banco_de_Validadores.xlsx em Importar Excel.');
    })().catch(error=>{state.loaded=false;state.rows=[];render();message('eqMessage',failure(error),true);throw error;}).finally(()=>{state.pending=null;$('eqReload').disabled=false;});
    await state.pending;if(!skipSync)await syncEvaluations();
  }
  function preview(){
    state.preview=null;$('eqCommit').disabled=true;$('eqPreview').innerHTML='';$('eqImportSummary').textContent='';$('eqImportErrors').textContent='';
    if(!state.workbook)return;
    try{
      const sheet=state.workbook.Sheets[$('eqSheet').value],matrix=window.XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true,blankrows:true});
      const origin=window.XLSX.utils.decode_range(sheet['!ref']||'A1').s;
      for(const [address,c] of Object.entries(sheet))if(c?.t==='e'){const p=window.XLSX.utils.decode_cell(address),i=p.r-origin.r,j=p.c-origin.c;if(matrix[i])matrix[i][j]=c.w||'#ERRO';}
      const atuacao=$('eqMode').value==='atuacao';
      const result=atuacao?A.parseExcel(matrix):C.parseRows(matrix,$('eqMode').value,!!state.workbook.Workbook?.WBProps?.date1904,state.rows);
      state.preview={...result,version:state.source?.versao??null};
      $('eqImportSummary').textContent=`${result.rows.length} registro(s) · ${result.people} docente(s) · ${result.skipped.length} linha(s) ignorada(s) · ${result.errors.length} erro(s).`;
      message('eqImportErrors',result.errors.map(x=>`Linha ${x.line}: ${x.message}`).join('\n'),!!result.errors.length);
      const titles=atuacao?['Revisor avaliado','Gestor / avaliador','Média P1','Comentário','Reconhecimento']:['Docente','E-mail','IES','UC','Semestre','Desligamento'];
      const values=atuacao?A.recognize(result.rows,state.rows).map(r=>[r.revisor,r.avaliador,rating(r.media_p1),r.comentarios,matchLabels[r.reconhecimento]]):result.rows.map(r=>[r.docente,r.email,r.ies,r.uc,r.semestre,date(r.data_desligamento)]);
      $('eqPreview').innerHTML='<table class="data-table eq-preview-table"><thead><tr>'+titles.map(t=>`<th>${t}</th>`).join('')+'</tr></thead><tbody>'+values.slice(0,50).map(r=>'<tr>'+r.map(v=>`<td>${cell(v)}</td>`).join('')+'</tr>').join('')+'</tbody></table>';
      $('eqPreviewNote').textContent=[result.rows.length>50?'Prévia das primeiras 50 linhas. Todos os registros válidos serão importados.':'',result.skipped.length?`Linhas ignoradas (${atuacao?'rodapé de totais':$('eqMode').value==='cadastro'?'duplicadas idênticas':'datas vazias'}): ${result.skipped.join(', ')}.`:'',atuacao?'As avaliações gerais serão vinculadas automaticamente ao cadastro pelo nome.':''].filter(Boolean).join(' ');
      $('eqCommit').disabled=!!result.errors.length||!result.rows.length||state.saving||(atuacao&&!state.sourceReady);
      if(atuacao&&!state.sourceReady)message('eqImportErrors','Carregue as avaliações primeiro. Confira a instalação do SQL 27 e clique em Atualizar banco.',true);
    }catch(error){message('eqImportErrors',error.message,true);}
  }
  async function openFile(){
    state.workbook=null;state.preview=null;state.file=$('eqFile').files?.[0]||null;$('eqCommit').disabled=true;message('eqImportErrors','');$('eqPreview').innerHTML='';$('eqImportSummary').textContent='';if(!state.file)return;
    try{if(state.file.size>10*1024*1024)throw new Error('Use um Excel de até 10 MB.');await window.biCarregarRecurso('excel');state.workbook=window.XLSX.read(await state.file.arrayBuffer(),{type:'array',cellDates:false});const names=state.workbook.SheetNames;if(!names?.length)throw new Error('A planilha não contém abas.');$('eqSheet').innerHTML=names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');$('eqSheet').value=names.find(n=>C.norm(n)==='banco')||names[0];preview();}catch(error){message('eqImportErrors',error.message,true);}
  }
  function lockImport(on){state.saving=on;for(const id of ['eqFile','eqMode','eqSheet'])$(id).disabled=on;$('eqCommit').disabled=on||!state.preview||!!state.preview.errors.length;}
  async function commit(){
    if(state.saving||!state.preview?.rows.length||state.preview.errors.length)return;lockImport(true);let saved=false;
    try{
      message('eqImportErrors','');$('eqImportSummary').textContent='Salvando a importação…';const atuacao=$('eqMode').value==='atuacao';
      const args=atuacao?{p_respostas:state.preview.rows,p_fonte:'excel',p_arquivo:state.file.name,p_versao_esperada:state.preview.version}:{p_linhas:state.preview.rows,p_modo:$('eqMode').value,p_arquivo:state.file.name};
      const {data,error}=await window.biSupabase.rpc(atuacao?'bi_atuacao_publicar':'bi_validadores_importar',args);if(error)throw error;
      saved=true;state.preview=null;state.lastAttempt=Date.now();await load(true,{skipSync:true});
      $('eqImportSummary').textContent=atuacao?`Importação salva: ${data.registros} avaliação(ões). Correspondências por nome atualizadas automaticamente.`:`Importação salva: ${data.docentes} docente(s), ${data.registros_processados} registro(s), ${data.vinculos_atingidos} vínculo(s) atingido(s).`;
      $('eqPreview').innerHTML='';$('eqPreviewNote').textContent='';
    }catch(error){message('eqImportErrors',(saved?'A importação foi salva, mas a leitura não foi atualizada. Clique em Atualizar banco. ':'')+failure(error,$('eqMode').value==='atuacao'),true);}
    finally{lockImport(false);}
  }
  function bind(){
    if(state.bound)return;state.bound=true;
    document.querySelectorAll('[data-eq-tab]').forEach(b=>{b.addEventListener('click',()=>tab(b.dataset.eqTab));b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const bs=[...document.querySelectorAll('[data-eq-tab]')],i=bs.indexOf(b),j=e.key==='Home'?0:e.key==='End'?bs.length-1:(i+(e.key==='ArrowRight'?1:-1)+bs.length)%bs.length;tab(bs[j].dataset.eqTab);bs[j].focus();});});
    $('eqReload').addEventListener('click',()=>load(true).catch(()=>{}));$('eqSyncMonday').addEventListener('click',()=>syncEvaluations(true));
    const update=()=>{state.page=1;render();};$('eqSearch').addEventListener('input',update);document.querySelectorAll('#eqFilters select').forEach(el=>el.addEventListener('change',update));
    $('eqReset').addEventListener('click',()=>{$('eqSearch').value='';document.querySelectorAll('#eqFilters select').forEach(el=>el.value='');update();});
    $('eqPrev').addEventListener('click',()=>{state.page--;render();});$('eqNext').addEventListener('click',()=>{state.page++;render();});
    $('eqFile').addEventListener('change',openFile);$('eqSheet').addEventListener('change',preview);$('eqMode').addEventListener('change',preview);$('eqCommit').addEventListener('click',commit);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.loaded){render();syncEvaluations();}});
    setInterval(()=>{if(state.loaded&&!document.hidden&&$('viewEquipe').classList.contains('active')){render();syncEvaluations();}},60000);
  }
  window.atualizarEquipeValidadores=load;
})();
