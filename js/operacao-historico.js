(function () {
  'use strict';
  const $=id=>document.getElementById(id);
  const txt=v=>String(v??'').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cache=new Map(),pendentes=new Map();
  let geracao=0,consulta=0,itemAberto=null,linhas=[],mais=false,carregando=false,controle=null;
  const SQL='docs/24_HISTORICO_STATUS_OPERACAO.sql';
  function idItem(item){
    if(item?.__visao_sintetica||String(item?.tipo_operacao||'').toUpperCase()==='UC'||Number(item?.__subitems_count)>1)return '';
    const id=txt(item?.monday_item_validacao||item?.monday_item_id);
    return /^[0-9]{1,30}$/.test(id)?id:'';
  }
  function dataISO(valor){
    const s=txt(valor),m=s.match(/^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/);
    if(!m)return '';
    const d=new Date(m[1]+'T00:00:00Z');
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===m[1]?m[1]:'';
  }
  const dataBR=v=>{const d=dataISO(v);return d?d.split('-').reverse().join('/'):'Não informada';};
  function dataHora(v){
    const d=new Date(v);return v&&Number.isFinite(d.getTime())?d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Data não informada';
  }
  function chegada(item){
    const id=idItem(item);if(!id)return '';
    const atual=cache.get(id);
    return atual?dataISO(atual.data_liberacao_validacao):dataISO(item?.data_liberacao_validacao);
  }
  function celulaChegada(item){
    const id=idItem(item);
    if(!id)return item?.__visao_sintetica||String(item?.tipo_operacao||'').toUpperCase()==='UC'?'Por material':'Sem vínculo na validação';
    const d=chegada(item);
    return '<span data-op-chegada="'+id+'" data-op-fallback="'+esc(dataISO(item?.data_liberacao_validacao))+'" title="Liberação para validação registrada na Monday">'+dataBR(d)+'</span>';
  }
  function botaoHistorico(item){
    const id=idItem(item);if(!id)return '<span class="op-history-unlinked">Por material vinculado</span>';
    const valor=cache.get(id),quantidade=Number(valor?.mudancas)||0;
    return '<button type="button" class="op-history-button" data-op-history="'+id+'" data-op-title="'+esc(item?.titulo||item?.item_name||item?.id_ua||id)+'" aria-label="Histórico de status do item '+id+'">Ver histórico'+(quantidade?' ('+quantidade+')':'')+'</button>';
  }
  function mensagemErro(error){
    if(['42P01','42883','PGRST202','PGRST205'].includes(error?.code))return 'Instale '+SQL+' no Supabase do BI para habilitar este acompanhamento.';
    if(['42501','PGRST301'].includes(error?.code)||error?.status===401||error?.status===403)return 'A sessão não tem permissão para consultar o histórico. Entre novamente com a conta institucional autorizada.';
    return 'Não foi possível consultar o acompanhamento. Tente atualizar o histórico.';
  }
  async function comPrazo(fazer,sinal){
    const c=new AbortController(),abortar=()=>c.abort();
    if(sinal?.aborted)throw new DOMException('Consulta cancelada','AbortError');
    sinal?.addEventListener('abort',abortar,{once:true});
    let prazo;
    try{
      return await Promise.race([Promise.resolve().then(()=>fazer(c.signal)),new Promise((_,reject)=>{
        prazo=setTimeout(()=>{c.abort();reject(new Error('Tempo de consulta excedido'));},12000);
        c.signal.addEventListener('abort',()=>reject(new DOMException('Consulta cancelada','AbortError')),{once:true});
      })]);
    }finally{clearTimeout(prazo);sinal?.removeEventListener('abort',abortar);}
  }
  async function resumos(ids,forcar=false,sinal){
    const iniciada=geracao;
    const faltantes=[...new Set(ids)].filter(id=>forcar||!cache.has(id)||Date.now()-cache.get(id).__lido>60000);
    for(let inicio=0;inicio<faltantes.length;inicio+=300){
      if(iniciada!==geracao)return;
      const lote=faltantes.slice(inicio,inicio+300),chave=lote.slice().sort().join(',');
      let promessa=pendentes.get(chave);
      if(!promessa){
        const atual=geracao;
        promessa=(async()=>{
          const {data,error}=await comPrazo(signal=>window.biSupabase.rpc('bi_operacao_resumo_acompanhamento',{p_monday_item_ids:lote}).abortSignal(signal),sinal);
          if(error)throw error;if(atual!==geracao)return;
          const vistos=new Set();
          for(const r of data||[]){const id=txt(r.monday_item_id);if(lote.includes(id)){cache.set(id,{...r,__lido:Date.now()});vistos.add(id);}}
          for(const id of lote)if(!vistos.has(id))cache.set(id,{monday_item_id:id,data_liberacao_validacao:null,mudancas:0,__lido:Date.now()});
        })().finally(()=>{if(pendentes.get(chave)===promessa)pendentes.delete(chave);});
        pendentes.set(chave,promessa);
      }
      await promessa;
    }
  }
  function aplicarResumos(root,indisponivel=false){
    if(!root?.isConnected)return;
    for(const cell of root.querySelectorAll('[data-op-chegada]')){
      const r=cache.get(cell.dataset.opChegada);
      cell.textContent=r?dataBR(r.data_liberacao_validacao):cell.dataset.opFallback?dataBR(cell.dataset.opFallback):indisponivel?'Indisponível':'Não informada';
    }
    for(const b of root.querySelectorAll('[data-op-history]')){
      const n=Number(cache.get(b.dataset.opHistory)?.mudancas)||0;
      b.textContent='Ver histórico'+(n?' ('+n+')':'');
    }
  }
  async function atualizar(root){
    aplicarResumos(root);
    const ids=[...new Set([...root.querySelectorAll('[data-op-history]')].filter(b=>!b.closest('[hidden]')).map(b=>b.dataset.opHistory))];
    if(!ids.length)return;
    const atual=geracao;
    try{
      await resumos(ids);if(atual!==geracao)return;aplicarResumos(root);
      if($('operacaoAcompanhamentoAviso'))$('operacaoAcompanhamentoAviso').hidden=true;
    }catch(error){if(atual!==geracao)return;aplicarResumos(root,true);
      if($('operacaoAcompanhamentoAviso')){$('operacaoAcompanhamentoAviso').textContent=mensagemErro(error);$('operacaoAcompanhamentoAviso').hidden=false;}
    }
  }
  function criarDialogo(){
    if($('operacaoHistoricoDialog'))return;
    const d=document.createElement('dialog');d.id='operacaoHistoricoDialog';d.className='op-history-dialog';
    d.setAttribute('aria-labelledby','operacaoHistoricoTitulo');
    d.innerHTML='<header><div><small>ACOMPANHAMENTO DO MATERIAL</small><h2 id="operacaoHistoricoTitulo">Histórico de status</h2><p id="operacaoHistoricoMaterial"></p></div><button type="button" data-op-history-close aria-label="Fechar histórico">×</button></header><div class="op-history-body"><div id="operacaoHistoricoChegada" class="op-history-arrival"></div><p class="op-history-source">Chegada corresponde à liberação para validação registrada na Monday. As datas do histórico indicam quando a base detectou a mudança; horários de Brasília.</p><p id="operacaoHistoricoErro" class="op-history-error" role="alert" hidden></p><div id="operacaoHistoricoEventos" aria-live="polite"></div><button id="operacaoHistoricoMais" class="op-history-button" type="button" hidden>Carregar mais registros</button></div><footer><span id="operacaoHistoricoContador"></span><div><button id="operacaoHistoricoAtualizar" class="op-history-button" type="button">Atualizar histórico</button><button type="button" class="op-history-button" data-op-history-close>Fechar</button></div></footer>';
    document.body.appendChild(d);
    d.addEventListener('close',()=>{consulta++;controle?.abort();itemAberto=null;linhas=[];carregando=false;});
    d.addEventListener('click',e=>{if(e.target.closest('[data-op-history-close]'))d.close();});
    $('operacaoHistoricoMais').addEventListener('click',()=>carregarHistorico(false));
    $('operacaoHistoricoAtualizar').addEventListener('click',()=>carregarHistorico(true));
  }
  function renderEventos(){
    $('operacaoHistoricoEventos').innerHTML=linhas.length?linhas.map(r=>{
      const inicio=r.tipo_evento!=='mudanca_status';
      return '<article class="op-history-event '+(inicio?'op-history-initial':'')+'"><div><strong>'+esc(inicio?r.tipo_evento==='inicio_acompanhamento'?'Estado no início do acompanhamento':'Primeira observação do material':'Mudança de status')+'</strong><time>'+esc(dataHora(r.observado_em))+'</time></div><p class="op-history-transition">'+(inicio?'':esc(r.status_anterior||'Sem status')+' <span aria-hidden="true">→</span> ')+esc(r.status_novo||'Sem status')+'</p>'+(inicio?'<p class="op-history-context">Status existente quando o acompanhamento começou para este material.</p>':'')+'<p class="op-history-context">Revisor atribuído naquele registro: '+esc(r.revisor_validador||'Não informado')+(r.data_liberacao_validacao?' · Liberação: '+esc(dataBR(r.data_liberacao_validacao)):'')+'</p></article>';
    }).join(''):'<p class="op-history-empty">Nenhum evento registrado para este item. O acompanhamento começa após a instalação do SQL 24.</p>';
    $('operacaoHistoricoContador').textContent=linhas.length+' registro(s) exibido(s)';
    $('operacaoHistoricoMais').hidden=!mais;
  }
  async function carregarHistorico(reiniciar){
    if(!itemAberto||carregando)return;
    const token=++consulta,id=itemAberto.id;carregando=true;controle?.abort();controle=new AbortController();
    $('operacaoHistoricoErro').hidden=true;
    $('operacaoHistoricoMais').disabled=true;$('operacaoHistoricoAtualizar').disabled=true;
    if(reiniciar){linhas=[];mais=false;$('operacaoHistoricoEventos').textContent='Consultando histórico…';$('operacaoHistoricoMais').hidden=true;}
    try{
      const resultado=await comPrazo(signal=>{
        let q=window.biSupabase.from('bi_operacao_status_historico')
          .select('id,monday_item_id,tipo_evento,status_anterior,status_novo,observado_em,data_liberacao_validacao,revisor_validador')
          .eq('monday_item_id',id).order('id',{ascending:false}).limit(51);
        if(!reiniciar&&linhas.length)q=q.lt('id',linhas.at(-1).id);
        return q.abortSignal(signal);
      },controle.signal);
      if(token!==consulta)return;if(resultado.error)throw resultado.error;
      const pagina=resultado.data||[];mais=pagina.length>50;
      const existentes=new Set(linhas.map(r=>String(r.id)));
      linhas.push(...pagina.slice(0,50).filter(r=>!existentes.has(String(r.id))));renderEventos();
      try{await resumos([id],true,controle.signal);}catch(error){if(token===consulta){$('operacaoHistoricoErro').textContent=mensagemErro(error);$('operacaoHistoricoErro').hidden=false;}}
      if(token!==consulta)return;
      const valor=cache.get(id);
      $('operacaoHistoricoChegada').textContent='Chegada ao validador: '+dataBR(valor?valor.data_liberacao_validacao:itemAberto.data);
      aplicarResumos($('operacaoBoard'));
    }catch(error){
      if(token!==consulta)return;
      $('operacaoHistoricoErro').textContent=mensagemErro(error);$('operacaoHistoricoErro').hidden=false;
      if(reiniciar)$('operacaoHistoricoEventos').replaceChildren();
    }finally{if(token===consulta){carregando=false;$('operacaoHistoricoMais').disabled=false;$('operacaoHistoricoAtualizar').disabled=false;}}
  }
  function abrir(botao){
    criarDialogo();consulta++;controle?.abort();carregando=false;
    const id=botao.dataset.opHistory;
    itemAberto={id,data:$('operacaoBoard')?.querySelector('[data-op-chegada="'+id+'"]')?.dataset.opFallback||''};
    $('operacaoHistoricoMaterial').textContent=botao.dataset.opTitle+' · Item Monday '+id;
    $('operacaoHistoricoChegada').textContent='Chegada ao validador: '+dataBR(cache.has(id)?cache.get(id).data_liberacao_validacao:itemAberto.data);
    $('operacaoHistoricoContador').textContent='';
    if(!$('operacaoHistoricoDialog').open)$('operacaoHistoricoDialog').showModal();
    void carregarHistorico(true);
  }
  function limpar(){
    geracao++;consulta++;controle?.abort();cache.clear();pendentes.clear();linhas=[];itemAberto=null;carregando=false;
    if($('operacaoHistoricoDialog')){$('operacaoHistoricoDialog').close();$('operacaoHistoricoEventos').replaceChildren();$('operacaoHistoricoMaterial').textContent='';$('operacaoHistoricoChegada').textContent='';$('operacaoHistoricoErro').textContent='';}
  }
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-op-history]');if(b)abrir(b);});
  window.biSupabase?.auth?.onAuthStateChange?.(event=>{if(event==='SIGNED_OUT')limpar();});
  window.addEventListener('pagehide',limpar);
  window.biOperacaoHistorico={idItem,chegada,dataBR,celulaChegada,botaoHistorico,atualizar,limpar};
})();
