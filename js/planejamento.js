(function () {
  'use strict';
  const PAGINAS = {
    resumo: 'Resumo Executivo', resultados: 'Resultados Alcançados', 'reuniao-nq': 'Reunião NQ',
    operacao: 'Operação', ajustes: 'Ajustes', equipe: 'Equipe', 'gestores-materiais': 'Gestores e Materiais',
    certificados: 'Certificados', 'projeto-qualidade': 'Projeto Qualidade', 'indicadores-uc': 'Indicadores da UC',
    'grafico-operacional': 'Gráfico Operacional', 'dias-validacao': 'Dias para Validação', historico: 'Histórico de Atualizações'
  };
  const STATUS = {a_fazer: 'A fazer', em_andamento: 'Em andamento', bloqueada: 'Bloqueada', concluida: 'Concluída'};
  const PRIORIDADES = {baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica'};
  const TIPOS = {visao: 'Visão do BI', material: 'UC / UA / Material', projeto: 'Projeto Qualidade', tarefa_projeto: 'Tarefa do projeto', professor: 'Professor NQ', revisor: 'Revisor UA', certificado: 'Certificado'};
  const RESPONSAVEIS_FIXOS = ['João Guilherme', 'Ligia Paolilo', 'Cléa Domingues', 'Cristina Quiteria', 'Luciana Bandeira', 'Paula Madalena'];
  const $ = id => document.getElementById(id);
  const txt = v => String(v ?? '').trim();
  const norm = v => txt(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const chaveNome = v => norm(v).replace(/\s+/g, ' ');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = v => JSON.parse(JSON.stringify(v));
  const hoje = () => new Intl.DateTimeFormat('sv-SE', {timeZone: 'America/Sao_Paulo'}).format(new Date());
  const dataBR = v => v ? v.slice(0, 10).split('-').reverse().join('/') : 'Sem prazo';
  const idNovo = () => crypto.randomUUID();
  const chaveRef = r => `${r.tipo}|${r.id}|${r.pagina}`;
  const estado = {tarefas: [], refs: new Map(), pagina: location.pathname.endsWith('projetos.html') ? 'projeto-qualidade' : 'resumo',
    pronto: false, carregando: false, salvando: false, lista: false, draft: null, fontes: new Map(), projetos: [], tarefasProjeto: [],
    persistidas: [], qualidadeFonte: null, qualidadeErro: '', importando: false, importacao: null, importacaoToken: 0, recarregarDepois: false, pessoas: [], extrasCarregados: false, buscaRefs: [], filtroPagina: '', historicoToken: 0, ultimoArquivado: null};
  const atraso = t => !t.arquivada && t.status !== 'concluida' && !!t.prazo && t.prazo < hoje();
  const exigeAtencao = t => !t.arquivada && t.status !== 'concluida' && (t.atencao || t.status === 'bloqueada' || atraso(t));
  const opcoes = (obj, atual, vazio = '') => (vazio ? `<option value="">${esc(vazio)}</option>` : '') +
    Object.entries(obj).map(([v, l]) => `<option value="${esc(v)}" ${v === atual ? 'selected' : ''}>${esc(l)}</option>`).join('');
  function listaResponsaveis() {
    const nomes = [...RESPONSAVEIS_FIXOS];
    estado.tarefas.forEach(t => {
      nomes.push(...window.biPlanejamentoQualidade.nomes(t.responsavel));
      (t.etapas || []).forEach(e => nomes.push(...window.biPlanejamentoQualidade.nomes(e.responsavel)));
    });
    [window.BI_RESPONSAVEIS_NQ?.gestores, window.BI_RESPONSAVEIS_NQ?.revisores].forEach(m => m?.forEach(n => nomes.push(n)));
    estado.refs.forEach(r => {
      if (r.tipo === 'professor') nomes.push(r.dados.professor);
      if (r.tipo === 'revisor') nomes.push(r.dados.nome);
    });
    const unicos = new Map();
    nomes.forEach(n => {
      const nome = txt(n).replace(/\s+/g, ' '), chave = chaveNome(nome);
      if (nome && !unicos.has(chave)) unicos.set(chave, nome);
    });
    return [...unicos.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
  function atualizarListaResponsaveis() {
    if ($('planResponsaveis')) $('planResponsaveis').innerHTML = listaResponsaveis().map(n => `<option value="${esc(n)}"></option>`).join('');
  }
  function registrar(r) {
    const ref = {...r, id: txt(r.id).slice(0, 500), label: txt(r.label).slice(0, 600), dados: r.dados || {}};
    estado.refs.set(chaveRef(ref), ref);
    return chaveRef(ref);
  }
  function materialRef(x, pagina = 'operacao') {
    // O identificador Monday distingue itens com a mesma UA ou nome.
    const id = txt(x.monday_item_validacao || x.monday_item_id) || txt(x.chave_ua || x.chave_material) ||
      JSON.stringify([x.id_titulo, x.id_ua, x.semestre_oferta, x.matriz_oferta, x.item_name]);
    const campos = ['monday_item_validacao','monday_item_id','id_titulo','id_ua','chave_material','chave_ua','titulo','titulo_uc',
      'titulo_ua','item_name','unidade_material','semestre_oferta','matriz_oferta','bloco','status_validacao','categoria_material',
      'esteira_producao','gestor_validacao_nq','revisor_validador','sincronizado_em'];
    return {tipo:'material', id, pagina, label:[x.titulo || x.titulo_uc, x.titulo_ua || x.unidade_material || x.item_name, x.semestre_oferta, `ID ${id}`].filter(Boolean).join(' · '),
      dados:Object.fromEntries(campos.filter(c => x[c] != null).map(c => [c, x[c]]))};
  }
  function definirDados(base, operacao, monday) {
    estado.fontes = new Map();
    // Primeiro a view completa; os itens diretos de validação complementam a fonte.
    [base || [], operacao || [], monday || []].forEach(arr => arr.forEach(x => {
      const ref = materialRef(x); const k = ref.id;
      const anterior = estado.fontes.get(k);
      const completo = anterior ? {...anterior, ...Object.fromEntries(Object.entries(x).filter(([, v]) => v != null && v !== ''))} : x;
      estado.fontes.set(k, completo);
    }));
    estado.fontes.forEach(x => registrar(materialRef(x)));
  }
  function certificadoRef(ua, r, situacao, chave) {
    const id = txt(chave) || [ua.idEnvio || ua.chaveUa || ua.mondayItemId || ua.monday_item_id || ua.name, r.mondayUserId || r.revisor, ua.semestre].join('|');
    return {tipo:'certificado',id,pagina:'certificados',label:[ua.name, r.revisor || 'Revisor não localizado', ua.semestre].filter(Boolean).join(' · '),
      dados:{ua:ua.name, uc:ua.titulo, semestre:ua.semestre, revisor:r.revisor || '', email:r.email || '', situacao, status_validacao:ua.statusValidacao || 'Validado'}};
  }
  function projetoRef(x) {
    return {tipo:'projeto',id:txt(x.id),pagina:'projeto-qualidade',label:txt(x.nome || x.projeto),
      dados:{id:txt(x.id),nome:x.nome || x.projeto,sponsor:x.sponsor || x.responsavel || '',status:x.status || '',azure_id:x.azure_id || ''}};
  }
  function tarefaProjetoRef(x) {
    return {tipo:'tarefa_projeto',id:txt(x.id),pagina:'projeto-qualidade',label:txt(x.descricao || x.tarefa || x.nome || x.titulo || `Tarefa ${x.id}`),
      dados:{id:txt(x.id),projeto_id:txt(x.projeto_id || ''),projeto:x.projeto || '',descricao:x.descricao || x.tarefa || x.nome || '',status:x.status || ''}};
  }
  function definirProjetos(projetos, tarefas) {
    estado.projetos = projetos || []; estado.tarefasProjeto = tarefas || [];
    estado.projetos.forEach(x => registrar(projetoRef(x)));
    estado.tarefasProjeto.forEach(x => registrar(tarefaProjetoRef(x)));
  }
  function paginaRef(pagina) {
    const filtros = {};
    ['filtroEsteira','filtroMatriz','filtroBloco','filtroStatus','filtroCategoria','filtroGestor','filtroRevisor'].forEach(id => {
      const itens = window.obterSelecionados?.(id) || []; if (itens.length) filtros[id] = itens;
    });
    ['pesquisaOperacao','certSemestre','certRevisor','certEmail','certEnvio','certBusca','pqBusca','pqFiltroStatus','pqFiltroSponsor'].forEach(id => {
      if ($(id)?.value) filtros[id] = $(id).value;
    });
    const painel = document.querySelector(`.page-view[data-page="${pagina}"]`);
    const indicadores = painel ? [...painel.querySelectorAll('.kpis article,.mini-kpis article,.pq-kpis article')].map(x => txt(x.innerText)).filter(Boolean).slice(0, 20) : [];
    return {tipo:'visao',id:pagina,pagina,label:PAGINAS[pagina],dados:{filtros,indicadores,capturado_em:new Date().toISOString()}};
  }
  function paginasDaTarefa(t) { return new Set((t.vinculos || []).map(r => r.pagina)); }
  function atualizarSinais() {
    const abertas = estado.tarefas.filter(exigeAtencao);
    document.querySelectorAll('.nav a').forEach(link => {
      const pagina = link.dataset.view || (link.getAttribute('href')?.includes('projetos.html') ? 'projeto-qualidade' : (link.getAttribute('href') || '').split('#')[1]);
      link.querySelector('.plan-nav-badge')?.remove();
      const n = pagina === 'planejamento' ? abertas.length : abertas.filter(t => paginasDaTarefa(t).has(pagina)).length;
      if (n) { const b = document.createElement('span'); b.className='plan-nav-badge'; b.textContent=n; b.title=`${n} tarefa(s) que exigem atenção`; link.appendChild(b); }
    });

  }
  function paginaAlterada(pagina) {
    estado.pagina=pagina; atualizarSinais(); if (pagina === 'planejamento') {render();if(estado.pronto)void carregar(true);}
    const params=new URLSearchParams(location.search), termo=params.get('buscaPlanejamento');
    const campo=pagina==='operacao'?$('pesquisaOperacao'):pagina==='certificados'?$('certBusca'):null;
    if (termo && campo) {campo.value=termo;campo.dispatchEvent(new Event('input',{bubbles:true}));params.delete('buscaPlanejamento');history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);}
  }
  function mensagemErro(error) {
    if (error?.message?.includes('bi_planejamento_qualidade_salvar')) return 'Instale as anotações vinculadas com docs/16_ANOTACOES_PLANEJAMENTO_QUALIDADE.sql e clique em Atualizar.';
    if (['PGRST202','PGRST205','42P01','42883'].includes(error?.code)) return 'Instale a estrutura de Planejamento no Supabase com o arquivo docs/15_INSTALAR_PLANEJAMENTO.sql e clique em Atualizar.';
    return error?.message || 'Não foi possível concluir a operação. Tente novamente.';
  }
  function aviso(msg, erro = false) {
    const el=$('planStatus'); if (el) {el.textContent=msg; el.classList.toggle('plan-error', erro);}
  }
  async function todasLinhas(tabela, ordem = 'id') {
    let linhas=[];
    for (let i=0;;i+=1000) {
      const {data,error}=await window.biSupabase.from(tabela).select('*').order(ordem,{ascending:true}).range(i,i+999);
      if (error) throw error;
      linhas.push(...(data || [])); if ((data || []).length < 1000) return linhas;
    }
  }
  function estaArquivadoQualidade(fonte,tipo='projeto') {
    const chave=window.biPlanejamentoQualidade.chave(fonte,tipo);
    return estado.persistidas.some(t=>t.qualidade_chave===chave && t.arquivada);
  }
  function notificarArquivos() {
    window.dispatchEvent(new CustomEvent('bi:planejamento-atualizado'));
  }
  function montarTarefas() {
    estado.tarefas=window.biPlanejamentoQualidade.projetar(estado.persistidas,estado.qualidadeFonte || {projetos:[],tarefas:[],lidoEm:new Date().toISOString()});
  }
  async function carregar(silencioso = false) {
    if (estado.carregando) {estado.recarregarDepois=true;return;}
    estado.carregando=true; if(!silencioso) aviso('Carregando tarefas e Projeto Qualidade…');
    try {
      const {data,error} = await window.biSupabase.auth.getSession();
      if(error) throw error;
      if(!data?.session?.user) {estado.pronto=false;return;}
      const res=await Promise.allSettled([todasLinhas('bi_planejamento_tarefas'),window.biPlanejamentoQualidade.ler(todasLinhas)]);
      if(res[0].status==='rejected') throw res[0].reason;
      estado.persistidas=res[0].value;
      if(res[1].status==='fulfilled') {estado.qualidadeFonte=res[1].value;estado.qualidadeErro='';}
      else estado.qualidadeErro=res[1].reason?.message || 'Projeto Qualidade indisponível.';
      montarTarefas(); estado.pronto=true; notificarArquivos();
      aviso(estado.qualidadeErro ? `Tarefas carregadas. ${estado.qualidadeErro} ${estado.qualidadeFonte?'Exibindo a última leitura completa.':''}` : 'Projeto Qualidade conectado · Atualização automática a cada 60 segundos, ao abrir a aba e após importar.',!!estado.qualidadeErro);
      if($('planFonteQualidade')) $('planFonteQualidade').textContent=estado.qualidadeFonte ? `Última leitura: ${new Date(estado.qualidadeFonte.lidoEm).toLocaleString('pt-BR')}` : 'Aguardando a base de Projeto Qualidade.';
    } catch(error) {estado.pronto=false; aviso(mensagemErro(error),true);}
    finally {estado.carregando=false; render(); atualizarSinais();if(estado.recarregarDepois){estado.recarregarDepois=false;void carregar(true);}}
  }
  function filtradas() {
    const q=norm($('planBusca')?.value), status=$('planFiltroStatus')?.value, prio=$('planFiltroPrioridade')?.value,
      resp=$('planFiltroResponsavel')?.value, atencao=$('planSomenteAtencao')?.checked, arquivo=$('planArquivadas')?.checked;
    return estado.tarefas.filter(t => t.arquivada === !!arquivo && (!status || t.status===status) && (!prio || t.prioridade===prio) &&
      (!resp || window.biPlanejamentoQualidade.nomes(t.responsavel).some(n=>chaveNome(n)===chaveNome(resp)) || (t.etapas || []).some(e=>window.biPlanejamentoQualidade.nomes(e.responsavel).some(n=>chaveNome(n)===chaveNome(resp)))) && (!atencao || arquivo || exigeAtencao(t)) && (!estado.filtroPagina || paginasDaTarefa(t).has(estado.filtroPagina)) &&
      (!q || norm([t.titulo,t.descricao,t.qualidade?.fonte?.contexto_objetivo_original,t.responsavel,...(t.vinculos || []).map(r=>r.label),...(t.etapas || []).map(e=>e.titulo)].join(' ')).includes(q)))
      .sort((a,b) => Number(exigeAtencao(b))-Number(exigeAtencao(a)) || ['critica','alta','media','baixa'].indexOf(a.prioridade)-['critica','alta','media','baixa'].indexOf(b.prioridade) ||
        (a.prazo || '9999').localeCompare(b.prazo || '9999') || b.atualizado_em.localeCompare(a.atualizado_em));
  }
  function botaoArquivo(t) {
    const indisponivel=t.qualidade && !t.qualidade.ativo;
    const acao=t.arquivada?'Restaurar':'Arquivar';
    return `<button type="button" class="plan-card-archive" data-plan-archive="${esc(t.id)}"
      aria-label="${acao} card: ${esc(t.titulo)}" ${estado.salvando || indisponivel?'disabled':''}
      ${indisponivel?'title="Este item saiu da base ativa. Restaure após ele voltar ao Projeto Qualidade."':''}>${acao} card</button>`;
  }
  function card(t) {
    const etapas=t.etapas || [], feitas=etapas.filter(e=>e.concluida).length;
    return `<article class="plan-task ${exigeAtencao(t)?'plan-task-attention':''}" draggable="${!t.arquivada}" data-plan-drag="${esc(t.id)}">
      <div class="plan-card-top"><span class="plan-priority plan-priority-${t.prioridade}">${PRIORIDADES[t.prioridade]}</span>
      ${t.arquivada?'<span class="plan-archive-tag">Arquivado</span>':''}${t.qualidade?'<span class="plan-source-tag">Projeto Qualidade</span>':''}${t.atencao && t.status!=='concluida'?'<span class="plan-tag">Atenção</span>':''}${atraso(t)?'<span class="plan-tag plan-late">Atrasada</span>':''}</div>
      <button type="button" class="plan-task-title" data-plan-open="${esc(t.id)}">${esc(t.titulo)}</button>
      ${t.descricao?`<p class="plan-task-description">${esc(t.descricao.slice(0,130))}</p>`:''}
      <p class="plan-task-meta">${esc(t.responsavel || 'Sem responsável')}<br><span class="${atraso(t)?'plan-late':''}">${dataBR(t.prazo)}</span></p>
      ${etapas.length?`<div class="plan-progress"><span style="width:${Math.round(feitas/etapas.length*100)}%"></span></div><small>${feitas}/${etapas.length} passos concluídos</small>`:'<small>Sem passos cadastrados</small>'}
      <div class="plan-card-links">${(t.vinculos || []).slice(0,2).map(r=>`<span title="${esc(r.label)}">${esc(TIPOS[r.tipo])}: ${esc(r.label.slice(0,75))}</span>`).join('')}${(t.vinculos || []).length>2?`<small>+${t.vinculos.length-2} vínculos</small>`:''}</div>
      <label class="plan-card-status">Status<select data-plan-status="${esc(t.id)}" ${t.arquivada || estado.salvando?'disabled':''}>${opcoes(STATUS,t.status)}</select>${t.qualidade?`<small>Status na fonte: ${esc(t.qualidade.fonte?.status || 'Indisponível')}</small>`:''}</label><div class="plan-card-actions">${botaoArquivo(t)}</div></article>`;
  }
  function render() {
    if (!$('planBoard')) return;
    $('planNova').disabled=!estado.pronto; $('planExportar').disabled=!estado.pronto;
    if($('planImportarQualidade')) $('planImportarQualidade').disabled=!estado.pronto || !estado.importacao || estado.importando;
    const resp=$('planFiltroResponsavel'), prev=resp.value;
    const nomes=listaResponsaveis();
    resp.innerHTML='<option value="">Todos os responsáveis</option>'+nomes.map(n=>`<option>${esc(n)}</option>`).join(''); resp.value=nomes.find(n=>chaveNome(n)===chaveNome(prev)) || '';
    const arquivo=!!$('planArquivadas')?.checked;
    $('planSomenteAtencao').disabled=arquivo;
    if($('planArquivoRotulo')) $('planArquivoRotulo').textContent=`Arquivados (${estado.tarefas.filter(t=>t.arquivada).length})`;
    const lista=filtradas(), abertas=estado.tarefas.filter(t=>!t.arquivada);
    $('planTotal').textContent=abertas.length;
    $('planEmAndamento').textContent=abertas.filter(t=>t.status==='em_andamento').length;
    $('planAtrasadas').textContent=abertas.filter(atraso).length;
    $('planAtencaoTotal').textContent=abertas.filter(exigeAtencao).length;
    $('planConcluidas').textContent=abertas.filter(t=>t.status==='concluida').length;
    $('planContagem').textContent=`${lista.length} ${lista.length===1?'card':'cards'} ${arquivo?(lista.length===1?'arquivado':'arquivados'):'nesta visão'}`;
    $('planFiltroArea').hidden=!estado.filtroPagina;
    $('planFiltroArea').textContent=estado.filtroPagina?`Área: ${PAGINAS[estado.filtroPagina]} · Limpar`:'';
    if (!estado.pronto) {$('planBoard').innerHTML='<div class="plan-empty">O Planejamento estará disponível após a instalação da estrutura de tarefas.</div>';return;}
    $('planBoard').classList.toggle('plan-archive-board',arquivo && !estado.lista);
    if (estado.lista) {
      $('planBoard').classList.add('plan-list');
      $('planBoard').innerHTML=lista.length?`<div class="plan-table-scroll"><table class="plan-table"><thead><tr><th>Tarefa</th><th>Status</th><th>Responsável</th><th>Prazo</th><th>Prioridade</th><th>Passos</th><th>Ações</th></tr></thead><tbody>${lista.map(t=>`<tr><td><button class="plan-task-title" data-plan-open="${esc(t.id)}">${esc(t.titulo)}</button>${t.qualidade?'<span class="plan-source-tag">Projeto Qualidade</span>':''}${exigeAtencao(t)?'<span class="plan-tag">Atenção</span>':''}</td><td>${STATUS[t.status]}</td><td>${esc(t.responsavel || '—')}</td><td class="${atraso(t)?'plan-late':''}">${dataBR(t.prazo)}</td><td>${PRIORIDADES[t.prioridade]}</td><td>${(t.etapas||[]).filter(e=>e.concluida).length}/${(t.etapas||[]).length}</td><td>${botaoArquivo(t)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="plan-empty">Nenhuma tarefa corresponde aos filtros.</div>';
    } else if(arquivo) {
      $('planBoard').classList.remove('plan-list');
      $('planBoard').innerHTML=lista.length?lista.map(card).join(''):'<div class="plan-empty">Nenhum card arquivado corresponde aos filtros.</div>';
    } else {
      $('planBoard').classList.remove('plan-list');
      $('planBoard').innerHTML=Object.entries(STATUS).map(([s,l])=>{
        const tarefas=lista.filter(t=>t.status===s);
        return `<section class="plan-column plan-column-${s}" data-plan-drop="${s}" aria-label="${l}"><h3>${l}<span>${tarefas.length}</span></h3><div>${tarefas.length?tarefas.map(card).join(''):'<p class="plan-empty-column">Sem tarefas</p>'}</div></section>`;
      }).join('');
    }
    $('planModo').textContent=estado.lista?'Ver quadro':'Ver lista';
  }
  async function fontesExtras() {
    if (estado.extrasCarregados) return;
    const fontes=[['vw_pq_projetos_v245','id'],['vw_pq_tarefas_v245','id'],['vw_nq_perfil_academico','professor'],['revisores_ua','id']];
    const res=await Promise.allSettled(fontes.map(([t,c])=>todasLinhas(t,c)));
    const faltas=[];
    res.forEach((r,i)=>{
      if(r.status!=='fulfilled') {faltas.push(TIPOS[['projeto','tarefa_projeto','professor','revisor'][i]]);return;}
      if (i===0) {estado.projetos=r.value; r.value.forEach(x=>registrar(projetoRef(x)));}
      if (i===1) {estado.tarefasProjeto=r.value; r.value.forEach(x=>registrar(tarefaProjetoRef(x)));}
      if(i===2) r.value.forEach(x=>registrar({tipo:'professor',id:txt(x.especialista_id || x.id || x.professor),pagina:'reuniao-nq',label:x.professor || x.nome,
        dados:{professor:x.professor || x.nome,titulacao:x.titulacao_maxima || x.titulacao || '',especialista_id:txt(x.especialista_id || x.id || '')}}));
      if(i===3) r.value.filter(x=>x.ativo!==false).forEach(x=>registrar({tipo:'revisor',id:txt(x.id),pagina:'certificados',label:[x.docente_revisor,x.uc,x.email].filter(Boolean).join(' · '),
        dados:{nome:x.docente_revisor,uc:x.uc,email:x.email,nq_responsavel:x.nq_responsavel}}));
    });
    estado.extrasCarregados=!faltas.length;
    if ($('planFonteAviso')) $('planFonteAviso').textContent=faltas.length?`Fontes temporariamente indisponíveis: ${faltas.join(', ')}. Os outros vínculos continuam disponíveis.`:'';
  }
  function buscarRefs() {
    const q=norm($('planBuscaVinculo').value), tipo=$('planTipoVinculo').value;
    const paginas=Object.keys(PAGINAS).map(p=>({tipo:'visao',id:p,pagina:p,label:PAGINAS[p],dados:{}}));
    const todas=[...paginas,...[...estado.refs.values()].filter(r=>r.tipo!=='visao')];
    const encontradas=todas.filter(r=>(!tipo || r.tipo===tipo) && (!q || norm(r.label+' '+JSON.stringify(r.dados)).includes(q)));
    estado.buscaRefs=encontradas.slice(0,60);
    $('planResultadosVinculos').innerHTML=estado.buscaRefs.map((r,i)=>`<button type="button" data-plan-add-ref="${i}"><small>${esc(TIPOS[r.tipo])}</small><strong>${esc(r.label)}</strong></button>`).join('') || '<p>Nenhum registro encontrado.</p>';
    $('planBuscaContagem').textContent=encontradas.length>60?`${encontradas.length} registros encontrados. Refine a busca; exibindo 60.`:`${encontradas.length} registro(s) encontrado(s).`;
  }
  function renderEtapas() {
    $('planEtapas').innerHTML=estado.draft.etapas.map((e,i)=>`<div class="plan-step" data-plan-step="${i}">
      <input type="checkbox" data-step-field="concluida" aria-label="Concluir passo ${i+1}" ${e.concluida?'checked':''}>
      <div><input data-step-field="titulo" aria-label="Título do passo ${i+1}" maxlength="300" value="${esc(e.titulo)}" placeholder="O que precisa ser feito?" required>
      <div class="plan-step-extra"><input data-step-field="responsavel" list="planResponsaveis" aria-label="Responsável pelo passo ${i+1}" maxlength="300" value="${esc(e.responsavel || '')}" placeholder="Responsável"><input data-step-field="prazo" type="date" aria-label="Prazo do passo ${i+1}" value="${esc(e.prazo || '')}"></div></div>
      <div class="plan-step-actions"><button type="button" data-plan-step-up="${i}" aria-label="Mover passo ${i+1} para cima" ${!i?'disabled':''}>↑</button><button type="button" data-plan-step-delete="${i}" aria-label="Remover passo ${i+1}">×</button></div></div>`).join('');
    $('planEtapasContagem').textContent=`${estado.draft.etapas.filter(e=>e.concluida).length}/${estado.draft.etapas.length} passos concluídos`;
  }
  function renderQualidade() {
    const q=estado.draft.qualidade, box=$('planQualidadeDetalhe');box.hidden=!q;
    const scroll=box.querySelector('.plan-source-steps')?.scrollTop || 0;
    const detalhes=[...box.querySelectorAll('details')].map(e=>e.open);
    ['titulo','responsavel','prazo','prioridade'].forEach(k=>{const el=$('planCampo_'+k);el.disabled=!!q;});
    $('planCampo_status').disabled=estado.salvando || !!estado.draft.arquivada || (!!q && !q.ativo);
    if(!q) {box.innerHTML='';return;}
    const fonte=q.fonte;
    box.innerHTML=`<p class="plan-source-note">${q.ativo?'Você pode alterar o status neste cartão: ele será salvo também no Projeto Qualidade. Responsáveis, prazos e passos acompanham a fonte. Marque os passos como feitos para atualizar a tarefa no Projeto Qualidade. A marcação é salva na hora; desmarcar devolve a tarefa para A Fazer. As anotações e passos adicionais ficam salvos neste cartão.':'Este item saiu da base ativa de Projeto Qualidade. Suas anotações e seu histórico foram preservados.'}</p>
      <button type="button" id="planAbrirQualidade">Abrir Projeto Qualidade</button>
      ${fonte?`<details><summary>Objetivo, resultados e dados da planilha</summary>${contextoLegivel({projeto:fonte.projeto,azure_id:fonte.id_azure,status:fonte.status,sponsor:fonte.sponsor,data_inicio:fonte.data_inicio,data_fim:fonte.data_fim,objetivo:fonte.contexto_objetivo_original,resultados_esperados:fonte.resultados_esperados_original,acoes:fonte.acoes_tarefas_original,impacto:fonte.impacto_original,resultados_alcancados:fonte.resultados_alcancados_original,link_evidencias:fonte.link_evidencias,aba_origem:fonte.aba_origem})}
      <details><summary>Todas as colunas originais</summary><pre>${esc(JSON.stringify(fonte.dados_origem || {},null,2))}</pre></details></details>`:''}
      ${q.etapas.length?`<h3 id="planSourceStepsHeading">Passos do Projeto Qualidade · ${q.etapas.filter(e=>e.concluida).length}/${q.etapas.length}</h3><div class="plan-source-steps">${q.etapas.map(e=>`<article class="${e.concluida?'plan-source-step-done':''}"><input type="checkbox" data-plan-source-step="${esc(e.id)}" aria-label="Marcar tarefa como feita: ${esc(e.titulo)}" ${e.concluida?'checked':''} ${estado.salvando || estado.draft.arquivada || !q.ativo || e.fonte?.ativo===false?'disabled':''}><div><strong>${esc(e.titulo)}</strong><span class="plan-step-done-label" ${e.concluida?'':'hidden'}>Feita</span><small data-source-step-meta>${esc(e.statusOriginal || 'Status não informado')} · ${esc(e.responsavel || 'Sem responsável')} · ${dataBR(e.prazo)}</small><details><summary>Dados originais deste passo</summary><pre>${esc(JSON.stringify(e.fonte.dados_origem || e.fonte,null,2))}</pre></details></div></article>`).join('')}</div>`:''}`;
    const passos=box.querySelector('.plan-source-steps');if(passos)passos.scrollTop=scroll;
    [...box.querySelectorAll('details')].forEach((e,i)=>{if(detalhes[i]!==undefined)e.open=detalhes[i];});
  }
  function renderVinculos() {
    $('planVinculos').innerHTML=estado.draft.vinculos.map((r,i)=>{
      const atual=estado.refs.get(chaveRef(r)) || [...estado.refs.values()].find(v=>v.tipo===r.tipo && v.id===r.id);
      return `<article class="plan-linked"><div><small>${esc(TIPOS[r.tipo])}</small><strong>${esc(r.label)}</strong>
        ${r.tipo==='material'?`<p>Status atual: ${esc(atual?.dados.status_validacao || 'Indisponível nesta carga')}</p>`:''}
        <details><summary>Contexto registrado</summary>${contextoLegivel(r.dados)}</details></div>
        <div><button type="button" data-plan-origin="${i}">Abrir no BI</button><button type="button" data-plan-remove-ref="${i}" aria-label="Remover vínculo" ${r.dados?.planejamento_qualidade?'disabled':''}>×</button></div></article>`;
    }).join('') || '<p class="plan-muted">Nenhum vínculo. Use a busca abaixo para associar o ponto do processo.</p>';
  }
  function contextoLegivel(dados) {
    const labels={monday_item_validacao:'Item Monday',monday_item_id:'Item Monday',id_titulo:'ID da UC',id_ua:'ID da UA',chave_material:'Referência do material',chave_ua:'Referência da UA',titulo:'UC',titulo_uc:'UC',titulo_ua:'UA',item_name:'Nome',unidade_material:'Material',semestre_oferta:'Semestre',matriz_oferta:'Matriz',bloco:'Bloco',status_validacao:'Status de validação',categoria_material:'Categoria',esteira_producao:'Esteira',gestor_validacao_nq:'Gestor',revisor_validador:'Revisor',sincronizado_em:'Atualização da fonte',uc:'UC',ua:'UA',nome:'Nome',projeto_id:'ID do projeto',projeto:'Projeto',descricao:'Descrição',sponsor:'Responsável',azure_id:'ID Azure',nq_responsavel:'Responsável NQ',capturado_em:'Registro do contexto',indicadores:'Indicadores registrados',filtros:'Filtros da visão',titulacao:'Titulação',especialista_id:'ID do professor',professor:'Professor',email:'E-mail',situacao:'Situação',semestre:'Semestre',revisor:'Revisor',status:'Status',id:'ID',data_inicio:'Data de início',data_fim:'Prazo',objetivo:'Contexto / Objetivo',resultados_esperados:'Resultados esperados',acoes:'Ações / Tarefas',impacto:'Impacto',resultados_alcancados:'Resultados alcançados',link_evidencias:'Link de evidências',aba_origem:'Aba de origem'};
    const format=v=>Array.isArray(v)?v.join(' · '):v && typeof v==='object'?Object.entries(v).map(([k,x])=>`${k.replace(/^filtro/,'').replace(/^cert/,'')}: ${Array.isArray(x)?x.join(', '):x}`).join(' | '):txt(v);
    return '<dl class="plan-context-fields">'+Object.entries(dados).filter(([,v])=>v!==null && v!=='' && (!Array.isArray(v)||v.length)).map(([k,v])=>`<dt>${esc(labels[k] || k)}</dt><dd>${esc(format(v))}</dd>`).join('')+'</dl>';
  }
  function adicionarRef(r) {
    if (!r) return;
    if (estado.draft.vinculos.some(v=>chaveRef(v)===chaveRef(r))) return;
    if(estado.draft.vinculos.length>=40) {$('planDialogErro').textContent='Limite de 40 vínculos por tarefa.';return;}
    estado.draft.vinculos.push(clone(r)); renderVinculos();
  }
  async function abrir(tarefa = null, referencia = null) {
    if(estado.pagina!=='planejamento' && $('viewPlanejamento')) window.abrirPaginaBI?.('planejamento');
    if (!estado.pronto) { window.abrirPaginaBI?.('planejamento'); return; }
    if (estado.salvando) return;
    estado.draft=clone(tarefa || {titulo:'',descricao:'',responsavel:'',prazo:'',status:'a_fazer',prioridade:'media',atencao:!!referencia,etapas:[],vinculos:[],arquivada:false});
    const d=estado.draft;
    d.cardId=tarefa?.id;
    if(d.qualidade) {d.id=d.qualidade.salvo?.id;d.versao=d.qualidade.salvo?.versao;d.etapas=clone(d.qualidade.salvo?.etapas || []);}
    $('planDialogTitulo').textContent=d.qualidade?'Projeto Qualidade':d.id?'Editar tarefa':'Nova tarefa';
    $('planSalvar').textContent=d.qualidade?'Salvar alterações':'Salvar tarefa';
    $('planDescricaoRotulo').textContent=d.qualidade?'Anotações de acompanhamento':'Descrição';
    $('planPassosTitulo').textContent=d.qualidade?'Passos adicionais de acompanhamento':'Passos da tarefa';
    ['titulo','descricao','responsavel','prazo'].forEach(k=>$('planCampo_'+k).value=k==='prazo'?txt(d[k]).slice(0,10):(d[k] || ''));
    $('planCampo_status').innerHTML=opcoes(STATUS,d.status);
    $('planCampo_prioridade').innerHTML=opcoes(PRIORIDADES,d.prioridade);
    $('planCampo_atencao').checked=d.atencao;
    $('planDialogErro').textContent=''; $('planComentario').value='';
    $('planArquivar').hidden=!d.cardId;
    $('planArquivar').disabled=!!(d.qualidade && !d.qualidade.ativo);
    $('planArquivar').textContent=d.arquivada?'Restaurar card':'Arquivar card';
    $('planArquivoAviso').hidden=!d.cardId;
    $('planArquivoAviso').textContent=d.qualidade && !d.qualidade.ativo?'Este item saiu da base ativa. Restaure após ele voltar ao Projeto Qualidade.':'Arquivar ou restaurar preserva os dados já salvos. Para guardar alterações deste formulário, use Salvar antes.';
    $('planHistorico').innerHTML=d.id || d.qualidade?'Carregando histórico…':'O histórico será registrado após salvar a tarefa.';
    $('planComentar').disabled=!d.id; $('planComentario').disabled=!d.id;
    $('planBuscaVinculo').value=''; $('planTipoVinculo').value='';
    renderQualidade(); renderEtapas(); if(referencia) adicionarRef(referencia); else renderVinculos(); buscarRefs();
    atualizarListaResponsaveis();
    $('planDialog').showModal(); $('planCampo_titulo').focus();
    if(d.id || d.qualidade) void historico(d.id);
    await fontesExtras(); if(estado.draft===d && $('planDialog').open) {buscarRefs();renderVinculos();}
    atualizarListaResponsaveis();
  }
  function lerFormulario() {
    const d=estado.draft;
    ['titulo','descricao','responsavel','prazo','status','prioridade'].forEach(k=>d[k]=txt($('planCampo_'+k).value));
    d.atencao=$('planCampo_atencao').checked;
    return d;
  }
  function alterarLocal(t) {
    const i=estado.persistidas.findIndex(x=>x.id===t.id); if(i<0) estado.persistidas.push(t); else estado.persistidas[i]=t;montarTarefas();
    render(); atualizarSinais(); notificarArquivos();
  }
  function erroStatusQualidade(error) {
    if(['PGRST202','PGRST205','42883','42P01'].includes(error?.code)) return new Error('Execute docs/21_PRESERVAR_STATUS_QUALIDADE.sql no Supabase para habilitar a persistência do status dos cartões importados.');
    return error;
  }
  async function validarPersistenciaStatus() {
    const {data,error}=await window.biSupabase.rpc('bi_planejamento_qualidade_status_disponivel');
    if(error) throw erroStatusQualidade(error);
    if(!data?.ok || data.versao!=='25.46.64') throw new Error('Execute docs/21_PRESERVAR_STATUS_QUALIDADE.sql no Supabase antes de alterar o status.');
  }
  async function confirmarStatusQualidade(q,resposta,status) {
    const tabela=q.tipo==='projeto'?'pq_projetos_atual':'pq_tarefas_atual';
    if(txt(resposta?.id)!==txt(q.fonte.id) || resposta?.status == null || window.biPlanejamentoQualidade.status(resposta.status)!==status)
      throw new Error('O banco não confirmou o status solicitado. Atualize o quadro.');
    const {data,error}=await window.biSupabase.from(tabela).select('*').eq('id',q.fonte.id).maybeSingle();
    if(error || !data) throw new Error('A gravação foi enviada, mas não foi possível confirmar o status salvo. Atualize o quadro antes de tentar novamente.');
    atualizarFonteQualidade(q,data);
    if(window.biPlanejamentoQualidade.status(data.status)!==status)
      throw new Error('O status atual no banco difere do solicitado. Atualize o quadro para conferir a alteração da equipe.');
    return data;
  }
  function argumentosStatus(q,status) {
    if(!q?.fonte || !q.ativo) throw new Error('O item não está ativo no Projeto Qualidade. Atualize o quadro.');
    return {p_tipo:q.tipo,p_fonte_id:q.fonte.id,p_chave:q.chave,p_status:status,p_status_atual:q.fonte.status ?? null,p_fonte_atualizada_em:q.fonte.updated_at || null};
  }
  function atualizarFonteQualidade(q,fonte) {
    if(!fonte?.id || fonte.status == null) throw new Error('O banco não confirmou o novo status.');
    q.fonte=clone(fonte);
    const campo=q.tipo==='projeto'?'projetos':'tarefas',arr=estado.qualidadeFonte?.[campo];
    if(arr) {const i=arr.findIndex(x=>txt(x.id)===txt(fonte.id));if(i>=0)arr[i]=fonte;}
    window.invalidarProjetoQualidade?.();montarTarefas();
  }
  async function salvar(d) {
    if (!txt(d.titulo)) throw new Error('Informe o título da tarefa.');
    if(d.etapas.some(e=>!txt(e.titulo))) throw new Error('Preencha o título de todos os passos ou remova os passos vazios.');
    if(!d.qualidade && d.status==='concluida' && d.etapas.some(e=>!e.concluida)) throw new Error('Conclua os passos antes de concluir a tarefa.');
    const keys=['titulo','descricao','responsavel','prazo','status','prioridade','atencao','etapas','vinculos','arquivada'];
    const dados=Object.fromEntries(keys.map(k=>[k,d[k]]));
    if(d.qualidade) {dados.titulo=dados.titulo.slice(0,200);dados.responsavel=dados.responsavel.slice(0,300);dados.status='a_fazer';}
    const args={p_id:d.id || null,p_versao:d.versao || null,p_dados:dados};
    if(d.qualidade) args.p_chave=d.qualidade.chave;
    const alterouStatus=d.qualidade && d.status!==window.biPlanejamentoQualidade.status(d.qualidade.fonte?.status);
    let resposta;
    if(alterouStatus) {
      await validarPersistenciaStatus();
      resposta=await window.biSupabase.rpc('bi_planejamento_qualidade_acompanhar',{...args,...argumentosStatus(d.qualidade,d.status)});
      if(resposta.error) throw erroStatusQualidade(resposta.error);

    } else {
      resposta=await window.biSupabase.rpc(d.qualidade?'bi_planejamento_qualidade_salvar':'bi_planejamento_salvar',args);
      if(resposta.error && d.qualidade && ['PGRST202','42883'].includes(resposta.error.code)) throw new Error('Execute docs/16_ANOTACOES_PLANEJAMENTO_QUALIDADE.sql no Supabase para salvar o acompanhamento dos projetos.');
      if(resposta.error) throw resposta.error;
    }
    const data=alterouStatus?resposta.data?.anotacao:resposta.data;
    const t=Array.isArray(data)?data[0]:data;
    if(!t?.id) throw new Error('O banco não confirmou o salvamento.');
    alterarLocal(t);
    if(alterouStatus) {
      // The annotation has committed too: retain its version even if a later read fails.
      if(estado.draft?.qualidade?.chave===d.qualidade.chave) {
        estado.draft.id=t.id;estado.draft.versao=t.versao;
        estado.draft.qualidade.salvo=clone(t);
      }
      await confirmarStatusQualidade(d.qualidade,resposta.data?.fonte,d.status);
    }
    return t;
  }
  function bloqueio(valor) {
    estado.salvando=valor;
    ['planSalvar','planArquivar','planFechar','planCancelar','planComentar'].forEach(id=>{if($(id)) $(id).disabled=valor || (id==='planComentar' && !estado.draft?.id) || (id==='planArquivar' && estado.draft?.qualidade && !estado.draft.qualidade.ativo);});
    if (!valor) render();
  }
  async function salvarFormulario(event) {
    event.preventDefault(); if(estado.salvando || !$('planForm').reportValidity()) return;
    bloqueio(true); $('planDialogErro').textContent='';
    try {await salvar(lerFormulario()); $('planDialog').close(); aviso('Tarefa salva.');}
    catch(error) {$('planDialogErro').textContent=mensagemErro(error);}
    finally {bloqueio(false);}
  }
  async function mudarArquivamento(id, peloDialog=false) {
    if(estado.salvando || !estado.pronto) return;
    const t=peloDialog?estado.draft:estado.tarefas.find(x=>x.id===id);
    if(!t || (t.qualidade && !t.qualidade.ativo)) return;
    const arquivada=!t.arquivada;
    const salvo=t.qualidade?t.qualidade.salvo:t;
    bloqueio(true); render(); aviso(arquivada?'Arquivando card…':'Restaurando card…');
    if(peloDialog) $('planDialogErro').textContent='';
    try {
      const {data,error}=await window.biSupabase.rpc('bi_planejamento_arquivar',{
        p_id:salvo?.id || null,p_versao:salvo?.versao || null,
        p_chave:t.qualidade?.chave || null,p_arquivada:arquivada
      });
      if(error) {
        if(['PGRST202','42883','42P01'].includes(error.code))
          throw new Error('Execute docs/20_ARQUIVAR_CARDS.sql no Supabase para habilitar o arquivamento de todos os cards.');
        throw error;
      }
      const registro=Array.isArray(data)?data[0]:data;
      if(!registro?.id || registro.arquivada!==arquivada) throw new Error('O banco não confirmou o arquivamento. Atualize o quadro.');
      alterarLocal(registro);
      if(peloDialog) $('planDialog').close();
      estado.ultimoArquivado=arquivada?registro.id:null;
      $('planDesfazer').hidden=!arquivada;
      $('planDesfazer').title=arquivada?`Restaurar ${t.titulo}`:'';
      aviso(arquivada?'Card arquivado. Consulte e restaure em Arquivados.':'Card restaurado para o quadro ativo.');
    } catch(error) {
      aviso(mensagemErro(error),true);
      if(peloDialog) $('planDialogErro').textContent=mensagemErro(error);
    } finally {bloqueio(false);}
  }
  async function mudarStatus(id,status) {
    if(estado.salvando) return;
    const t=estado.tarefas.find(x=>x.id===id); if(!t || t.arquivada || t.status===status) return;
    estado.salvando=true;aviso('Salvando status…');render();
    try {
      if(t.qualidade) {
        await validarPersistenciaStatus();
        const {data,error}=await window.biSupabase.rpc('bi_planejamento_qualidade_alterar_status',argumentosStatus(t.qualidade,status));
        if(error)throw erroStatusQualidade(error);
        await confirmarStatusQualidade(t.qualidade,data,status);atualizarSinais();
        aviso('Status salvo no Planejamento e no Projeto Qualidade.');
      } else {await salvar({...clone(t),status});aviso('Status atualizado.');}
    } catch(error) {aviso(mensagemErro(error),true);}
    finally {estado.salvando=false;render();}
  }
  async function marcarPassoQualidade(chave,concluida) {
    const d=estado.draft,q=d?.qualidade,passo=q?.etapas.find(e=>e.id===chave);
    if(estado.salvando || !passo || d.arquivada || !q.ativo) {if(q)atualizarPassosQualidade();return;}
    const manterFoco=document.activeElement?.dataset.planSourceStep===chave;
    const tarefa={tipo:'tarefa',chave,fonte:passo.fonte,ativo:passo.fonte?.ativo!==false};
    bloqueio(true);
    $('planQualidadeDetalhe').querySelectorAll('[data-plan-source-step]').forEach(input=>{input.disabled=true;});
    $('planCampo_status').disabled=true;$('planDialogErro').textContent='';
    try {
      await validarPersistenciaStatus();
      const {data,error}=await window.biSupabase.rpc('bi_planejamento_qualidade_alterar_status',argumentosStatus(tarefa,concluida?'concluida':'a_fazer'));
      if(error)throw erroStatusQualidade(error);
      await confirmarStatusQualidade(tarefa,data,concluida?'concluida':'a_fazer');
      const atual=estado.tarefas.find(t=>t.qualidade?.chave===q.chave);
      if(atual?.qualidade)q.etapas=clone(atual.qualidade.etapas);
      atualizarPassosQualidade();
      atualizarSinais();
      aviso(concluida?'Tarefa marcada como feita no Planejamento e no Projeto Qualidade.':'Tarefa reaberta em A Fazer no Projeto Qualidade.');
      await historico(d.id);
    } catch(error) {$('planDialogErro').textContent=mensagemErro(error);}
    finally {
      bloqueio(false);atualizarPassosQualidade();
      if(manterFoco) [...$('planQualidadeDetalhe').querySelectorAll('[data-plan-source-step]')].find(e=>e.dataset.planSourceStep===chave)?.focus({preventScroll:true});
    }
  }
  function atualizarPassosQualidade() {
    const d=estado.draft,q=d?.qualidade;if(!q)return;
    if($('planSourceStepsHeading')) $('planSourceStepsHeading').textContent=`Passos do Projeto Qualidade · ${q.etapas.filter(e=>e.concluida).length}/${q.etapas.length}`;
    const passos=new Map(q.etapas.map(e=>[e.id,e]));
    $('planQualidadeDetalhe').querySelectorAll('[data-plan-source-step]').forEach(input=>{
      const e=passos.get(input.dataset.planSourceStep);if(!e)return;
      input.checked=e.concluida;
      input.disabled=estado.salvando || d.arquivada || !q.ativo || e.fonte?.ativo===false;
      const artigo=input.closest('article');artigo.classList.toggle('plan-source-step-done',e.concluida);
      artigo.querySelector('.plan-step-done-label').hidden=!e.concluida;
      artigo.querySelector('[data-source-step-meta]').textContent=`${e.statusOriginal || 'Status não informado'} · ${e.responsavel || 'Sem responsável'} · ${dataBR(e.prazo)}`;
      artigo.querySelector('pre').textContent=JSON.stringify(e.fonte.dados_origem || e.fonte,null,2);
    });
    $('planCampo_status').disabled=estado.salvando || d.arquivada || !q.ativo;
  }
  async function historicoStatusQualidade(d) {
    if(!d.qualidade)return {data:[]};
    const chaves=[...new Set([d.qualidade.chave,...d.qualidade.etapas.map(e=>e.id)])];
    const lotes=[];let lote=[],tamanho=0;
    for(const chave of chaves) {
      const bytes=encodeURIComponent(chave).length;
      if(lote.length && (lote.length>=40 || tamanho+bytes>3500)){lotes.push(lote);lote=[];tamanho=0;}
      lote.push(chave);tamanho+=bytes;
    }
    if(lote.length)lotes.push(lote);
    const respostas=await Promise.all(lotes.map(chaves=>window.biSupabase.from('bi_planejamento_qualidade_status_historico').select('*').in('qualidade_chave',chaves).order('criado_em',{ascending:false}).order('id',{ascending:false}).limit(100)));
    return {data:respostas.flatMap(r=>r.data || []),error:respostas.find(r=>r.error)?.error};
  }
  async function historico(id) {
    const token=++estado.historicoToken,d=estado.draft;
    const consultas=[id?window.biSupabase.from('bi_planejamento_historico').select('*').eq('tarefa_id',id).order('criado_em',{ascending:false}).order('id',{ascending:false}).limit(100):Promise.resolve({data:[]}),
      historicoStatusQualidade(d)];
    const [anotacoes,status]=await Promise.all(consultas);
    if(token!==estado.historicoToken || estado.draft!==d) return;
    const nomes={criada:'Tarefa criada',alterada:'Tarefa alterada',arquivada:'Tarefa arquivada',restaurada:'Tarefa restaurada',comentario:'Comentário'};
    const dados=[...(anotacoes.data || []),...(status.data || []).map(h=>({...h,acao:'status_qualidade'}))].sort((a,b)=>b.criado_em.localeCompare(a.criado_em) || Number(b.id)-Number(a.id)).slice(0,100);
    const erros=[anotacoes.error?mensagemErro(anotacoes.error):'',status.error?'Histórico de status indisponível. Execute docs/17_STATUS_PLANEJAMENTO_QUALIDADE.sql.':''].filter(Boolean);
    $('planHistorico').innerHTML=dados.map(h=>{
      const campos=h.acao!=='status_qualidade' && h.antes && h.depois?['titulo','descricao','responsavel','prazo','status','prioridade','atencao','etapas','vinculos'].filter(k=>JSON.stringify(h.antes[k])!==JSON.stringify(h.depois[k])):[];
      return `<article><strong>${h.acao==='status_qualidade'?(h.fonte_tipo==='tarefa'?'Tarefa do Projeto Qualidade alterada':'Status do Projeto Qualidade alterado'):nomes[h.acao] || esc(h.acao)}</strong><small>${esc(h.usuario_email)} · ${esc(new Date(h.criado_em).toLocaleString('pt-BR'))}</small>${h.acao==='status_qualidade'?`${h.fonte_tipo==='tarefa'?`<p>${esc(h.depois?.acao || h.antes?.acao || 'Tarefa')}</p>`:''}<p>${esc(h.antes?.status || 'Sem status')} → ${esc(h.depois?.status)}</p>`:''}${h.comentario?`<p>${esc(h.comentario)}</p>`:''}${campos.length?`<p>Campos alterados: ${esc(campos.join(', '))}</p>`:''}</article>`;
    }).join('') || 'Nenhum registro de histórico.';
    if(erros.length)$('planHistorico').insertAdjacentHTML('beforeend',`<p class="plan-error">${esc(erros.join(' '))}</p>`);
  }
  async function comentar() {
    if(!estado.draft?.id || estado.salvando) return;
    const texto=txt($('planComentario').value); if(!texto) return;
    bloqueio(true); $('planDialogErro').textContent='';
    try {
      const {error}=await window.biSupabase.rpc('bi_planejamento_comentar',{p_tarefa_id:estado.draft.id,p_comentario:texto});
      if(error) throw error; $('planComentario').value=''; await historico(estado.draft.id);
    } catch(error) {$('planDialogErro').textContent=mensagemErro(error);} finally {bloqueio(false);}
  }
  function origem(r) {
    if (!r) return;
    if(r.dados?.planejamento_qualidade) {window.open('index.html?projetoQualidade='+encodeURIComponent(r.dados.projeto || r.label)+'&consultarCard='+encodeURIComponent(r.dados.qualidade_chave)+'#projeto-qualidade','_blank','noopener');return;}
    if (r.tipo==='projeto' || r.tipo==='tarefa_projeto') {
      const id=r.tipo==='projeto'?r.id:r.dados.projeto_id;
      window.open('projetos.html'+(id?'?projeto='+encodeURIComponent(id):''),'_blank','noopener'); return;
    }
    const termo=r.tipo==='material' && r.pagina==='operacao'?(r.dados.monday_item_validacao || r.dados.monday_item_id || r.dados.id_ua || r.dados.titulo || ''):r.tipo==='certificado'?r.dados.ua:'';
    window.open('index.html'+(termo?'?buscaPlanejamento='+encodeURIComponent(termo):'')+'#'+r.pagina,'_blank','noopener');
  }
  function exportar() {
    const c=v=>{let s=String(v ?? ''); if(/^[=+@-]/.test(s)) s="'"+s; return '"'+s.replace(/"/g,'""')+'"';};
    const linhas=filtradas().map(t=>[t.id,t.titulo,STATUS[t.status],t.responsavel,t.prazo,PRIORIDADES[t.prioridade],exigeAtencao(t)?'Sim':'Não',
      (t.etapas||[]).map(e=>`${e.concluida?'[x]':'[ ]'} ${e.titulo}`).join(' | '),(t.vinculos||[]).map(r=>`${TIPOS[r.tipo]}: ${r.label} (ID ${r.id})`).join(' | '),t.descricao]);
    const csv='\uFEFF'+[['ID','Tarefa','Status','Responsável','Prazo','Prioridade','Atenção','Passos','Vínculos','Descrição'],...linhas].map(row=>row.map(c).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); const a=document.createElement('a');
    a.href=url;a.download=`Planejamento_${hoje()}.csv`;a.click();URL.revokeObjectURL(url);
  }

  function configurarImportacaoQualidade() {
    const input=$('planArquivoQualidade');if(!input)return;
    input.addEventListener('change',async()=>{
      const token=++estado.importacaoToken,file=input.files?.[0];estado.importacao=null;$('planImportarQualidade').disabled=true;
      const el=$('planImportResumo');el.textContent=file?'Conferindo abas e itens da planilha…':'Selecione uma planilha Excel para conferir os itens.';el.classList.remove('plan-error');
      if(!file)return;
      try {
        const preparada=await window.biQualidadeImportacao.preparar(file);
        if(token!==estado.importacaoToken)return;
        estado.importacao=preparada;const d=preparada.diagnostico;
        el.textContent=`${file.name} · ${d.projetos} projetos · ${d.tarefas} tarefas · ${d.linhas} linhas. Abas atuais: ${preparada.abas.join(', ')}.${d.semId?` Atenção: ${d.semId} linhas sem ID. Mantenha IDs únicos para preservar o acompanhamento quando os itens mudarem de aba.`:''}`;
        $('planImportarQualidade').disabled=!estado.pronto;
      } catch(error) {if(token===estado.importacaoToken){el.textContent=error.message;el.classList.add('plan-error');}}
    });
  }
  async function importarQualidade() {
    if(!estado.importacao || estado.importando)return;
    const preparada=estado.importacao;estado.importando=true;
    $('planImportarQualidade').disabled=true;$('planArquivoQualidade').disabled=true;
    $('planImportResumo').textContent='Atualizando a base de Projeto Qualidade…';$('planImportResumo').classList.remove('plan-error');
    try {
      const {payload,conferencia}=await window.biQualidadeImportacao.enviar(preparada);
      estado.importando=false;await carregar();
      const ok=conferencia.ok && !estado.qualidadeErro;
      $('planImportResumo').textContent=ok?`Importação concluída e conferida: ${payload.projetos_gravados} projetos e ${payload.tarefas_gravadas} tarefas na base. O Planejamento acompanha o Projeto Qualidade.`:`O servidor concluiu a importação, mas a conferência precisa de atenção. ${conferencia.erro || estado.qualidadeErro || `Esperados ${preparada.diagnostico.projetos} projetos e ${preparada.diagnostico.tarefas} tarefas; encontrados ${conferencia.projetosBanco} e ${conferencia.tarefasBanco}.`}`;
      $('planImportResumo').classList.toggle('plan-error',!ok);
      estado.importacao=null;$('planArquivoQualidade').value='';
    } catch(error) {$('planImportResumo').textContent=error.message;$('planImportResumo').classList.add('plan-error');}
    finally {estado.importando=false;$('planArquivoQualidade').disabled=false;$('planImportarQualidade').disabled=!estado.importacao || !estado.pronto;}
  }
  function instalarUI() {
    document.body.insertAdjacentHTML('beforeend', `<dialog id="planDialog" class="plan-dialog"><form id="planForm">
      <header><div><small>Planejamento do processo</small><h2 id="planDialogTitulo">Nova tarefa</h2></div><button id="planFechar" type="button" aria-label="Fechar">×</button></header>
      <div class="plan-dialog-body"><div class="plan-dialog-main">
      <label>Tarefa<input id="planCampo_titulo" maxlength="200" required placeholder="Qual ação precisa ser realizada?"></label>
      <div id="planQualidadeDetalhe" hidden></div><label><span id="planDescricaoRotulo">Descrição</span><textarea id="planCampo_descricao" maxlength="12000" rows="3" placeholder="Explique o problema e o resultado esperado."></textarea></label>
      <div class="plan-fields"><label>Responsável<input id="planCampo_responsavel" maxlength="300" list="planResponsaveis" placeholder="Nome da pessoa"><datalist id="planResponsaveis"></datalist></label><label>Prazo<input id="planCampo_prazo" type="date"></label><label>Status<select id="planCampo_status"></select></label><label>Prioridade<select id="planCampo_prioridade"></select></label></div>
      <label class="plan-checkbox"><input id="planCampo_atencao" type="checkbox">Sinalizar atenção no processo</label>
      <section><div class="plan-section-head"><h3 id="planPassosTitulo">Passos da tarefa</h3><button id="planAddEtapa" type="button">+ Adicionar passo</button></div><small id="planEtapasContagem"></small><div id="planEtapas"></div></section>
      <section><h3>Vínculos com o BI</h3><div id="planVinculos"></div><div class="plan-ref-search"><label>Tipo de registro<select id="planTipoVinculo">${opcoes(TIPOS,'','Todos')}</select></label><label>Buscar registro<input id="planBuscaVinculo" type="search" placeholder="Nome, UA, UC, pessoa ou ID"></label></div><small id="planFonteAviso"></small><small id="planBuscaContagem"></small><div id="planResultadosVinculos"></div></section>
      </div><aside class="plan-dialog-history"><h3>Histórico e comentários</h3><textarea id="planComentario" maxlength="4000" rows="3" placeholder="Registre uma atualização após salvar a tarefa."></textarea><button id="planComentar" type="button">Adicionar comentário</button><div id="planHistorico"></div><small>Exibe os 100 registros mais recentes.</small></aside></div>
      <p id="planArquivoAviso" class="plan-archive-note" hidden></p><p id="planDialogErro" class="plan-error" role="alert"></p><footer><button id="planArquivar" type="button" hidden>Arquivar tarefa</button><div><button id="planCancelar" type="button">Cancelar</button><button id="planSalvar" class="plan-primary" type="submit">Salvar tarefa</button></div></footer></form></dialog>`);
    $('planStatus')?.insertAdjacentHTML('afterend','<button id="planDesfazer" type="button" class="plan-undo" hidden>Desfazer arquivamento</button>');
    $('planForm').addEventListener('submit',salvarFormulario);
    $('planDialog').addEventListener('cancel',e=>{if(estado.salvando)e.preventDefault();});
    document.addEventListener('click',event=>{
      const b=event.target.closest('button');if(!b)return;
      const has=k=>Object.prototype.hasOwnProperty.call(b.dataset,k);
      if(has('planArchive')) {void mudarArquivamento(b.dataset.planArchive);return;}
      if(has('planOpen')) {void abrir(estado.tarefas.find(t=>t.id===b.dataset.planOpen));return;}
      if(has('planRef')) {void abrir(null,estado.refs.get(b.dataset.planRef));return;}
      if(has('planAddRef')) {const r=estado.buscaRefs[Number(b.dataset.planAddRef)]; adicionarRef(r?.tipo==='visao'?paginaRef(r.pagina):r);return;}
      if(has('planRemoveRef')) {if(estado.draft.vinculos[Number(b.dataset.planRemoveRef)]?.dados?.planejamento_qualidade)return;estado.draft.vinculos.splice(Number(b.dataset.planRemoveRef),1);renderVinculos();return;}
      if(has('planOrigin')) {origem(estado.draft.vinculos[Number(b.dataset.planOrigin)]);return;}
      if(has('planStepDelete')) {estado.draft.etapas.splice(Number(b.dataset.planStepDelete),1);renderEtapas();return;}
      if(has('planStepUp')) {const i=Number(b.dataset.planStepUp);if(i>0){const a=estado.draft.etapas;[a[i-1],a[i]]=[a[i],a[i-1]];renderEtapas();}return;}
      switch(b.id) {
        case 'planAbrirQualidade': origem(estado.draft.qualidade?.ref);break;
        case 'planImportarQualidade': void importarQualidade();break;
        case 'planNova': void abrir();break;
        case 'planAtualizar': void carregar();break;
        case 'planModo': estado.lista=!estado.lista;render();break;
        case 'planExportar': exportar();break;
        case 'planFiltroArea': estado.filtroPagina='';render();break;
        case 'planAddEtapa': if(estado.draft.etapas.length<100){estado.draft.etapas.push({id:idNovo(),titulo:'',concluida:false,responsavel:'',prazo:''});renderEtapas();$('planEtapas').lastElementChild.querySelector('[data-step-field="titulo"]').focus();}break;
        case 'planCancelar':case 'planFechar': if(!estado.salvando)$('planDialog').close();break;
        case 'planComentar': void comentar();break;
        case 'planArquivar': void mudarArquivamento(estado.draft?.cardId,true);break;
        case 'planDesfazer': {
          const t=estado.tarefas.find(t=>(t.qualidade?.salvo?.id || t.id)===estado.ultimoArquivado);
          if(t?.arquivada) void mudarArquivamento(t.id);
          break;
        }
      }
    });
    document.addEventListener('input',event=>{
      const e=event.target, step=e.closest('[data-plan-step]');
      if(step && e.dataset.stepField) {estado.draft.etapas[Number(step.dataset.planStep)][e.dataset.stepField]=e.type==='checkbox'?e.checked:e.value;
        $('planEtapasContagem').textContent=`${estado.draft.etapas.filter(x=>x.concluida).length}/${estado.draft.etapas.length} passos concluídos`;}
      if(e.id==='planBuscaVinculo')buscarRefs();if(e.id==='planBusca')render();
    });
    document.addEventListener('change',event=>{
      const e=event.target;if(e.dataset.planSourceStep){void marcarPassoQualidade(e.dataset.planSourceStep,e.checked);return;}if(e.dataset.planStatus)void mudarStatus(e.dataset.planStatus,e.value);
      if(e.id==='planTipoVinculo')buscarRefs();if(['planFiltroStatus','planFiltroPrioridade','planFiltroResponsavel','planSomenteAtencao','planArquivadas'].includes(e.id))render();
    });
    document.addEventListener('dragstart',e=>{const card=e.target.closest('[data-plan-drag]');if(card)e.dataTransfer.setData('text/plain',card.dataset.planDrag);});
    document.addEventListener('dragover',e=>{if(e.target.closest('[data-plan-drop]'))e.preventDefault();});
    document.addEventListener('drop',e=>{const col=e.target.closest('[data-plan-drop]');if(col){e.preventDefault();void mudarStatus(e.dataTransfer.getData('text/plain'),col.dataset.planDrop);}});
    if($('planFiltroStatus')) $('planFiltroStatus').innerHTML=opcoes(STATUS,'','Todos os status');
    if($('planFiltroPrioridade')) $('planFiltroPrioridade').innerHTML=opcoes(PRIORIDADES,'','Todas as prioridades');
    const area = new URLSearchParams(location.search).get('areaPlanejamento');
    if (PAGINAS[area] && $('planSomenteAtencao')) {estado.filtroPagina=area;$('planSomenteAtencao').checked=true;}
    configurarImportacaoQualidade();
    window.addEventListener('bi:qualidade-atualizada',()=>{if(!estado.importando)void carregar(true);});
    const atualizarVisivel=()=>{if(document.visibilityState==='visible' && estado.pronto && !estado.importando)void carregar(true);};
    window.addEventListener('focus',atualizarVisivel);
    document.addEventListener('visibilitychange',atualizarVisivel);
    setInterval(atualizarVisivel,60000);
    atualizarSinais(); void carregar();
  }
  window.biPlanejamento={definirDados,definirProjetos,paginaAlterada,registrarMaterial:(x,p)=>registrar(materialRef(x,p)),
    registrarCertificado:(ua,r,s,k)=>registrar(certificadoRef(ua,r,s,k)),registrarProjeto:x=>registrar(projetoRef(x)),
    abrirTarefa:(r)=>abrir(null,r),atualizarSinais,estaArquivadoQualidade};
  document.addEventListener('DOMContentLoaded',instalarUI);
})();
