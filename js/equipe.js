(function() {
  'use strict';
  const C=window.BIEquipeCore,$=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const statusLabels={ativo:'Ativo',desligado:'Desligado',agendado:'Desligamento agendado','nao-informado':'Não informado'};
  const state={rows:[],loaded:false,pending:null,bound:false,tab:'cadastro',page:1,size:25,workbook:null,preview:null,file:null,saving:false,editing:null};
  function message(text,error=false){$('eqMessage').textContent=text;$('eqMessage').dataset.error=String(error);}
  function failure(error){
    if(['42P01','PGRST205','PGRST202','42883'].includes(error?.code)) return 'Instale o arquivo docs/26_BANCO_VALIDADORES_EQUIPE.sql no Supabase do BI e tente novamente.';
    if(error?.code==='42501') return 'A sessão não tem acesso ao Banco de Validadores. Entre com seu e-mail institucional.';
    return error?.message || 'Não foi possível acessar o Banco de Validadores. Tente novamente.';
  }
  function filters(){const f={search:$('eqSearch').value};for(const k of ['ies','titulacao','formacao','semestre','uc','status','avaliacao'])f[k]=$('eqFilter_'+k).value;return f;}
  function populate(){for(const key of ['ies','titulacao','formacao','semestre','uc']){
    const el=$('eqFilter_'+key),v=el.value,values=[...new Set(state.rows.map(r=>r[key]).filter(C.present))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    el.innerHTML='<option value="">Todos</option>'+values.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
    if(values.includes(v))el.value=v;
  }}
  const cell=v=>esc(C.present(v)?v:'—');
  const date=v=>v?v.split('-').reverse().join('/'):'—';
  function render(){
    const rows=C.filter(state.rows,filters()),s=C.stats(rows),pages=Math.max(1,Math.ceil(rows.length/state.size));
    state.page=Math.max(1,Math.min(state.page,pages));
    for(const [id,value] of Object.entries({eqPeople:s.people,eqLinks:s.links,eqActive:s.active,eqDeparted:s.departed}))$(id).textContent=value;
    $('eqCount').textContent=`${s.people} docente(s) · ${s.links} vínculo(s) de UC/semestre · ${s.evaluated} com avaliação`;
    const visible=rows.slice((state.page-1)*state.size,state.page*state.size);
    $('eqBody').innerHTML=visible.map(r=>{const st=C.state(r),days=C.elapsed(r);return `<tr><td>${cell(r.docente)}</td><td>${cell(r.ies)}</td><td><span class="eq-badge ${st}">${statusLabels[st]}</span></td><td>${date(r.data_desligamento)}</td><td>${days===null?(st==='agendado'?'Ainda não iniciado':'—'):`${days} dia(s)`}</td><td>${cell(r.email)}</td><td>${cell(r.formacao)}</td><td>${cell(r.titulacao)}</td><td>${C.safeURL(r.lattes)?`<a href="${esc(C.safeURL(r.lattes))}" target="_blank" rel="noopener noreferrer">Abrir Lattes</a>`:'—'}</td><td>${cell(r.uc)}</td><td>${cell(r.semestre)}</td><td>${C.present(r.avaliacao)?cell(r.avaliacao):'Sem avaliação'}</td><td>${cell(r.comentarios)}</td></tr>`;}).join('') || '<tr><td colspan="13">Nenhum vínculo encontrado. Ajuste os filtros ou importe a planilha em Importar Excel.</td></tr>';
    $('eqEvaluationBody').innerHTML=visible.map(r=>`<tr><td>${cell(r.docente)}</td><td>${cell(r.ies)}</td><td>${cell(r.uc)}</td><td>${cell(r.semestre)}</td><td>${C.present(r.avaliacao)?cell(r.avaliacao):'Sem avaliação'}</td><td>${cell(r.comentarios)}</td><td><button type="button" data-eq-edit="${esc(r.vinculo_id)}">Registrar / editar</button></td></tr>`).join('') || '<tr><td colspan="7">Nenhum vínculo encontrado.</td></tr>';
    $('eqPageInfo').textContent=`Página ${state.page} de ${pages}`;
    $('eqPrev').disabled=state.page<=1;$('eqNext').disabled=state.page>=pages;
    $('eqPager').hidden=state.tab==='importar';
  }
  function tab(name){
    state.tab=name;state.page=1;
    document.querySelectorAll('[data-eq-tab]').forEach(b=>{const on=b.dataset.eqTab===name;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});
    document.querySelectorAll('[data-eq-panel]').forEach(p=>p.hidden=p.dataset.eqPanel!==name);
    $('eqFilters').hidden=name==='importar';$('eqCount').hidden=name==='importar';$('eqEditor').hidden=true;state.editing=null;render();
  }
  async function load(force=false){
    bind();if(state.pending)return state.pending;if(state.loaded&&!force){render();return;}
    message('Carregando o Banco de Validadores…');$('eqReload').disabled=true;
    state.pending=(async()=>{
      const rows=[];let start=0;
      for(;;){
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
        try {
          const response=await window.biSupabase.from('bi_validadores_banco').select('*').order('email').order('vinculo_id').range(start,start+999).abortSignal(controller.signal);
          if(response.error)throw response.error;
          const batch=response.data||[];rows.push(...batch);if(batch.length<1000)break;start+=1000;
        } finally {clearTimeout(timer);}
      }
      state.rows=rows;state.loaded=true;populate();render();
      message(rows.length?'Banco atualizado.':'Banco vazio. Abra Importar Excel e selecione a planilha Banco_de_Validadores.xlsx.');
    })().catch(error=>{state.loaded=false;state.rows=[];render();message(failure(error),true);throw error;})
      .finally(()=>{state.pending=null;$('eqReload').disabled=false;});
    return state.pending;
  }
  function preview(){
    state.preview=null;$('eqCommit').disabled=true;$('eqPreview').innerHTML='';$('eqImportSummary').textContent='';
    if(!state.workbook)return;
    try {
      const sheet=state.workbook.Sheets[$('eqSheet').value],matrix=window.XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true,blankrows:true});
      // Preserva erros que já existam no Excel como texto visível, sem transformá-los em informação preenchida.
      const origin=window.XLSX.utils.decode_range(sheet['!ref']||'A1').s;
      for(const [address,cell] of Object.entries(sheet))if(cell?.t==='e'){
        const p=window.XLSX.utils.decode_cell(address),i=p.r-origin.r,j=p.c-origin.c;
        if(matrix[i])matrix[i][j]=cell.w||'#ERRO';
      }
      const result=C.parseRows(matrix,$('eqMode').value,!!state.workbook.Workbook?.WBProps?.date1904,state.rows);
      state.preview=result;
      $('eqImportSummary').textContent=`${result.rows.length} registro(s) · ${result.people} docente(s) · ${result.skipped.length} linha(s) ignorada(s) · ${result.errors.length} erro(s).`;
      const problems=result.errors.map(x=>`Linha ${x.line}: ${x.message}`).join('\n');
      $('eqImportErrors').textContent=problems;$('eqImportErrors').dataset.error=String(!!problems);
      $('eqPreview').innerHTML='<table class="data-table eq-preview-table"><thead><tr><th>Docente</th><th>E-mail</th><th>IES</th><th>UC</th><th>Semestre</th><th>Desligamento</th></tr></thead><tbody>'+result.rows.slice(0,50).map(r=>`<tr><td>${cell(r.docente)}</td><td>${cell(r.email)}</td><td>${cell(r.ies)}</td><td>${cell(r.uc)}</td><td>${cell(r.semestre)}</td><td>${date(r.data_desligamento)}</td></tr>`).join('')+'</tbody></table>';
      $('eqPreviewNote').textContent=[result.rows.length>50?'Prévia das primeiras 50 linhas. Todos os registros válidos serão importados.':'',result.skipped.length?`Linhas ignoradas (${ $('eqMode').value==='cadastro'?'duplicadas idênticas':'datas vazias'}): ${result.skipped.join(', ')}.`:''].filter(Boolean).join(' ');
      $('eqCommit').disabled=!!result.errors.length||!result.rows.length||state.saving;
    }catch(error){$('eqImportErrors').textContent=error.message;$('eqImportErrors').dataset.error='true';}
  }
  async function openFile(){
    state.workbook=null;state.preview=null;state.file=$('eqFile').files?.[0]||null;$('eqCommit').disabled=true;
    $('eqImportErrors').textContent='';$('eqPreview').innerHTML='';$('eqImportSummary').textContent='';
    if(!state.file)return;
    try {
      if(state.file.size>10*1024*1024)throw new Error('Use um Excel de até 10 MB.');
      await window.biCarregarRecurso('excel');
      state.workbook=window.XLSX.read(await state.file.arrayBuffer(),{type:'array',cellDates:false});
      const names=state.workbook.SheetNames;if(!names?.length)throw new Error('A planilha não contém abas.');
      $('eqSheet').innerHTML=names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
      $('eqSheet').value=names.find(n=>C.norm(n)==='banco')||names[0];preview();
    }catch(error){$('eqImportErrors').textContent=error.message;$('eqImportErrors').dataset.error='true';}
  }
  function lockImport(on){state.saving=on;for(const id of ['eqFile','eqMode','eqSheet'])$(id).disabled=on;$('eqCommit').disabled=on||!state.preview||!!state.preview.errors.length;}
  async function commit(){
    if(state.saving||!state.preview?.rows.length||state.preview.errors.length)return;
    lockImport(true);let saved=false;
    try {
      $('eqImportErrors').textContent='';$('eqImportSummary').textContent='Salvando a importação…';
      const {data,error}=await window.biSupabase.rpc('bi_validadores_importar',{p_linhas:state.preview.rows,p_modo:$('eqMode').value,p_arquivo:state.file.name});
      if(error)throw error;saved=true;state.preview=null;$('eqCommit').disabled=true;
      await load(true);
      $('eqImportSummary').textContent=`Importação salva: ${data.docentes} docente(s), ${data.registros_processados} registro(s), ${data.vinculos_atingidos} vínculo(s) atingido(s).`;
      $('eqPreview').innerHTML='';$('eqPreviewNote').textContent='';
    }catch(error){$('eqImportErrors').textContent=(saved?'A importação foi salva, mas a leitura não foi atualizada. Clique em Atualizar banco. ':'')+failure(error);$('eqImportErrors').dataset.error='true';}
    finally{lockImport(false);}
  }
  function edit(id){
    const r=state.rows.find(x=>x.vinculo_id===id);if(!r)return;
    state.editing=r;$('eqEditorTitle').textContent=`${r.docente} · ${r.ies||'IES não informada'} · ${r.uc||'UC não informada'} · ${r.semestre||'sem semestre'}`;
    $('eqRating').value=r.avaliacao||'';$('eqComments').value=r.comentarios||'';$('eqEditor').hidden=false;$('eqEditFeedback').textContent='';$('eqRating').focus();
  }
  async function saveEvaluation(event){
    event.preventDefault();const r=state.editing;if(!r)return;$('eqSaveEvaluation').disabled=true;
    try{
      const {data,error}=await window.biSupabase.rpc('bi_validadores_salvar_avaliacao',{p_id:r.vinculo_id,p_avaliacao:$('eqRating').value,p_comentarios:$('eqComments').value,p_atualizado_em:r.atualizado_em});
      if(error)throw error;Object.assign(r,{avaliacao:data.avaliacao,comentarios:data.comentarios,atualizado_em:data.atualizado_em});
      $('eqEditor').hidden=true;state.editing=null;render();message('Avaliação da atuação salva.');
    }catch(error){$('eqEditFeedback').textContent=failure(error);$('eqEditFeedback').dataset.error='true';}
    finally{$('eqSaveEvaluation').disabled=false;}
  }
  function bind(){
    if(state.bound)return;state.bound=true;
    document.querySelectorAll('[data-eq-tab]').forEach(b=>{
      b.addEventListener('click',()=>tab(b.dataset.eqTab));
      b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...document.querySelectorAll('[data-eq-tab]')],i=buttons.indexOf(b),j=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;tab(buttons[j].dataset.eqTab);buttons[j].focus();});
    });
    $('eqReload').addEventListener('click',()=>load(true).catch(()=>{}));
    $('eqSearch').addEventListener('input',()=>{state.page=1;render();});
    document.querySelectorAll('#eqFilters select').forEach(el=>el.addEventListener('change',()=>{state.page=1;render();}));
    $('eqReset').addEventListener('click',()=>{$('eqSearch').value='';document.querySelectorAll('#eqFilters select').forEach(el=>el.value='');state.page=1;render();});
    $('eqPrev').addEventListener('click',()=>{state.page--;render();});$('eqNext').addEventListener('click',()=>{state.page++;render();});
    $('eqFile').addEventListener('change',openFile);$('eqSheet').addEventListener('change',preview);$('eqMode').addEventListener('change',preview);$('eqCommit').addEventListener('click',commit);
    $('eqEvaluationBody').addEventListener('click',e=>{const b=e.target.closest('[data-eq-edit]');if(b)edit(b.dataset.eqEdit);});
    $('eqEditor').addEventListener('submit',saveEvaluation);$('eqCancelEdit').addEventListener('click',()=>{$('eqEditor').hidden=true;state.editing=null;});
    // Atualiza dias/status ao voltar à aba e na virada do dia, sem reimportação.
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.loaded)render();});
    setInterval(()=>{if(state.loaded&&$('viewEquipe').classList.contains('active'))render();},60000);
  }
  window.atualizarEquipeValidadores=load;
})();
