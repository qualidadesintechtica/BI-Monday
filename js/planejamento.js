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
  const RESPONSAVEIS_FIXOS = ['João Guilherme', 'Ligia Paolilo', 'Cléa Domingues', 'Cristina Quiteria', 'Luciana Bandeira'];
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
    pessoas: [], extrasCarregados: false, buscaRefs: [], filtroPagina: '', historicoToken: 0};
  const atraso = t => !t.arquivada && t.status !== 'concluida' && !!t.prazo && t.prazo < hoje();
  const exigeAtencao = t => !t.arquivada && t.status !== 'concluida' && (t.atencao || t.status === 'bloqueada' || atraso(t));
  const opcoes = (obj, atual, vazio = '') => (vazio ? `<option value="">${esc(vazio)}</option>` : '') +
    Object.entries(obj).map(([v, l]) => `<option value="${esc(v)}" ${v === atual ? 'selected' : ''}>${esc(l)}</option>`).join('');
  function listaResponsaveis() {
    const nomes = [...RESPONSAVEIS_FIXOS];
    estado.tarefas.forEach(t => {
      nomes.push(t.responsavel);
      (t.etapas || []).forEach(e => nomes.push(e.responsavel));
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
    const banner = $('planContexto'); if (!banner) return;
    banner.hidden = estado.pagina === 'planejamento';
    const n = abertas.filter(t => paginasDaTarefa(t).has(estado.pagina)).length;
    $('planContextoTexto').textContent = n ? `${n} tarefa(s) exigem atenção nesta área.` : 'Registre uma ação para acompanhar este ponto do processo.';
    $('planVerAtencao').hidden = !n;
    $('planCriarContexto').disabled = !estado.pronto;
  }
  function paginaAlterada(pagina) {
    estado.pagina=pagina; atualizarSinais(); if (pagina === 'planejamento') render();
    const params=new URLSearchParams(location.search), termo=params.get('buscaPlanejamento');
    const campo=pagina==='operacao'?$('pesquisaOperacao'):pagina==='certificados'?$('certBusca'):null;
    if (termo && campo) {campo.value=termo;campo.dispatchEvent(new Event('input',{bubbles:true}));params.delete('buscaPlanejamento');history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);}
  }
  function mensagemErro(error) {
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
  async function carregar() {
    if (estado.carregando) return;
    estado.carregando=true; aviso('Carregando tarefas…');
    try {
      const {data,error} = await window.biSupabase.auth.getSession();
      if(error) throw error;
      if(!data?.session?.user) return;
      estado.tarefas=await todasLinhas('bi_planejamento_tarefas');
      estado.pronto=true;
      aviso('Tarefas compartilhadas com a equipe · Atualize para ver novas alterações.');
    } catch(error) {estado.pronto=false; aviso(mensagemErro(error),true);}
    finally {estado.carregando=false; render(); atualizarSinais();}
  }
  function filtradas() {
    const q=norm($('planBusca')?.value), status=$('planFiltroStatus')?.value, prio=$('planFiltroPrioridade')?.value,
      resp=$('planFiltroResponsavel')?.value, atencao=$('planSomenteAtencao')?.checked, arquivo=$('planArquivadas')?.checked;
    return estado.tarefas.filter(t => t.arquivada === !!arquivo && (!status || t.status===status) && (!prio || t.prioridade===prio) &&
      (!resp || chaveNome(t.responsavel)===chaveNome(resp)) && (!atencao || exigeAtencao(t)) && (!estado.filtroPagina || paginasDaTarefa(t).has(estado.filtroPagina)) &&
      (!q || norm([t.titulo,t.descricao,t.responsavel,...(t.vinculos || []).map(r=>r.label),...(t.etapas || []).map(e=>e.titulo)].join(' ')).includes(q)))
      .sort((a,b) => Number(exigeAtencao(b))-Number(exigeAtencao(a)) || ['critica','alta','media','baixa'].indexOf(a.prioridade)-['critica','alta','media','baixa'].indexOf(b.prioridade) ||
        (a.prazo || '9999').localeCompare(b.prazo || '9999') || b.atualizado_em.localeCompare(a.atualizado_em));
  }
  function card(t) {
    const etapas=t.etapas || [], feitas=etapas.filter(e=>e.concluida).length;
    return `<article class="plan-task ${exigeAtencao(t)?'plan-task-attention':''}" draggable="${!t.arquivada}" data-plan-drag="${esc(t.id)}">
      <div class="plan-card-top"><span class="plan-priority plan-priority-${t.prioridade}">${PRIORIDADES[t.prioridade]}</span>
      ${t.atencao && t.status!=='concluida'?'<span class="plan-tag">Atenção</span>':''}${atraso(t)?'<span class="plan-tag plan-late">Atrasada</span>':''}</div>
      <button type="button" class="plan-task-title" data-plan-open="${esc(t.id)}">${esc(t.titulo)}</button>
      ${t.descricao?`<p class="plan-task-description">${esc(t.descricao.slice(0,130))}</p>`:''}
      <p class="plan-task-meta">${esc(t.responsavel || 'Sem responsável')}<br><span class="${atraso(t)?'plan-late':''}">${dataBR(t.prazo)}</span></p>
      ${etapas.length?`<div class="plan-progress"><span style="width:${Math.round(feitas/etapas.length*100)}%"></span></div><small>${feitas}/${etapas.length} passos concluídos</small>`:'<small>Sem passos cadastrados</small>'}
      <div class="plan-card-links">${(t.vinculos || []).slice(0,2).map(r=>`<span title="${esc(r.label)}">${esc(TIPOS[r.tipo])}: ${esc(r.label.slice(0,75))}</span>`).join('')}${(t.vinculos || []).length>2?`<small>+${t.vinculos.length-2} vínculos</small>`:''}</div>
      <label class="plan-card-status">Status<select data-plan-status="${esc(t.id)}" ${t.arquivada || estado.salvando?'disabled':''}>${opcoes(STATUS,t.status)}</select></label></article>`;
  }
  function render() {
    if (!$('planBoard')) return;
    $('planNova').disabled=!estado.pronto; $('planExportar').disabled=!estado.pronto;
    const resp=$('planFiltroResponsavel'), prev=resp.value;
    const nomes=listaResponsaveis();
    resp.innerHTML='<option value="">Todos os responsáveis</option>'+nomes.map(n=>`<option>${esc(n)}</option>`).join(''); resp.value=nomes.find(n=>chaveNome(n)===chaveNome(prev)) || '';
    const lista=filtradas(), abertas=estado.tarefas.filter(t=>!t.arquivada);
    $('planTotal').textContent=abertas.length;
    $('planEmAndamento').textContent=abertas.filter(t=>t.status==='em_andamento').length;
    $('planAtrasadas').textContent=abertas.filter(atraso).length;
    $('planAtencaoTotal').textContent=abertas.filter(exigeAtencao).length;
    $('planConcluidas').textContent=abertas.filter(t=>t.status==='concluida').length;
    $('planContagem').textContent=`${lista.length} tarefa(s) nesta visão`;
    $('planFiltroArea').hidden=!estado.filtroPagina;
    $('planFiltroArea').textContent=estado.filtroPagina?`Área: ${PAGINAS[estado.filtroPagina]} · Limpar`:'';
    if (!estado.pronto) {$('planBoard').innerHTML='<div class="plan-empty">O Planejamento estará disponível após a instalação da estrutura de tarefas.</div>';return;}
    if (estado.lista) {
      $('planBoard').classList.add('plan-list');
      $('planBoard').innerHTML=lista.length?`<div class="plan-table-scroll"><table class="plan-table"><thead><tr><th>Tarefa</th><th>Status</th><th>Responsável</th><th>Prazo</th><th>Prioridade</th><th>Passos</th></tr></thead><tbody>${lista.map(t=>`<tr><td><button class="plan-task-title" data-plan-open="${esc(t.id)}">${esc(t.titulo)}</button>${exigeAtencao(t)?'<span class="plan-tag">Atenção</span>':''}</td><td>${STATUS[t.status]}</td><td>${esc(t.responsavel || '—')}</td><td class="${atraso(t)?'plan-late':''}">${dataBR(t.prazo)}</td><td>${PRIORIDADES[t.prioridade]}</td><td>${(t.etapas||[]).filter(e=>e.concluida).length}/${(t.etapas||[]).length}</td></tr>`).join('')}</tbody></table></div>`:'<div class="plan-empty">Nenhuma tarefa corresponde aos filtros.</div>';
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
  function renderVinculos() {
    $('planVinculos').innerHTML=estado.draft.vinculos.map((r,i)=>{
      const atual=estado.refs.get(chaveRef(r)) || [...estado.refs.values()].find(v=>v.tipo===r.tipo && v.id===r.id);
      return `<article class="plan-linked"><div><small>${esc(TIPOS[r.tipo])}</small><strong>${esc(r.label)}</strong>
        ${r.tipo==='material'?`<p>Status atual: ${esc(atual?.dados.status_validacao || 'Indisponível nesta carga')}</p>`:''}
        <details><summary>Contexto registrado</summary>${contextoLegivel(r.dados)}</details></div>
        <div><button type="button" data-plan-origin="${i}">Abrir no BI</button><button type="button" data-plan-remove-ref="${i}" aria-label="Remover vínculo">×</button></div></article>`;
    }).join('') || '<p class="plan-muted">Nenhum vínculo. Use a busca abaixo para associar o ponto do processo.</p>';
  }
  function contextoLegivel(dados) {
    const labels={monday_item_validacao:'Item Monday',monday_item_id:'Item Monday',id_titulo:'ID da UC',id_ua:'ID da UA',chave_material:'Referência do material',chave_ua:'Referência da UA',titulo:'UC',titulo_uc:'UC',titulo_ua:'UA',item_name:'Nome',unidade_material:'Material',semestre_oferta:'Semestre',matriz_oferta:'Matriz',bloco:'Bloco',status_validacao:'Status de validação',categoria_material:'Categoria',esteira_producao:'Esteira',gestor_validacao_nq:'Gestor',revisor_validador:'Revisor',sincronizado_em:'Atualização da fonte',uc:'UC',ua:'UA',nome:'Nome',projeto_id:'ID do projeto',projeto:'Projeto',descricao:'Descrição',sponsor:'Responsável',azure_id:'ID Ajure',nq_responsavel:'Responsável NQ',capturado_em:'Registro do contexto',indicadores:'Indicadores registrados',filtros:'Filtros da visão',titulacao:'Titulação',especialista_id:'ID do professor',professor:'Professor',email:'E-mail',situacao:'Situação',semestre:'Semestre',revisor:'Revisor',status:'Status',id:'ID'};
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
    if (!estado.pronto) { window.abrirPaginaBI?.('planejamento'); return; }
    if (estado.salvando) return;
    estado.draft=clone(tarefa || {titulo:'',descricao:'',responsavel:'',prazo:'',status:'a_fazer',prioridade:'media',atencao:!!referencia,etapas:[],vinculos:[],arquivada:false});
    const d=estado.draft;
    $('planDialogTitulo').textContent=d.id?'Editar tarefa':'Nova tarefa';
    ['titulo','descricao','responsavel','prazo'].forEach(k=>$('planCampo_'+k).value=k==='prazo'?txt(d[k]).slice(0,10):(d[k] || ''));
    $('planCampo_status').innerHTML=opcoes(STATUS,d.status);
    $('planCampo_prioridade').innerHTML=opcoes(PRIORIDADES,d.prioridade);
    $('planCampo_atencao').checked=d.atencao;
    $('planDialogErro').textContent=''; $('planComentario').value='';
    $('planArquivar').hidden=!d.id; $('planArquivar').textContent=d.arquivada?'Restaurar tarefa':'Arquivar tarefa';
    $('planHistorico').innerHTML=d.id?'Carregando histórico…':'O histórico será registrado após salvar a tarefa.';
    $('planComentar').disabled=!d.id; $('planComentario').disabled=!d.id;
    $('planBuscaVinculo').value=''; $('planTipoVinculo').value='';
    renderEtapas(); if(referencia) adicionarRef(referencia); else renderVinculos(); buscarRefs();
    atualizarListaResponsaveis();
    $('planDialog').showModal(); $('planCampo_titulo').focus();
    if(d.id) void historico(d.id);
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
    const i=estado.tarefas.findIndex(x=>x.id===t.id); if(i<0) estado.tarefas.push(t); else estado.tarefas[i]=t;
    render(); atualizarSinais();
  }
  async function salvar(d) {
    if (!txt(d.titulo)) throw new Error('Informe o título da tarefa.');
    if(d.etapas.some(e=>!txt(e.titulo))) throw new Error('Preencha o título de todos os passos ou remova os passos vazios.');
    if(d.status==='concluida' && d.etapas.some(e=>!e.concluida)) throw new Error('Conclua os passos antes de concluir a tarefa.');
    const keys=['titulo','descricao','responsavel','prazo','status','prioridade','atencao','etapas','vinculos','arquivada'];
    const {data,error}=await window.biSupabase.rpc('bi_planejamento_salvar', {p_id:d.id || null,p_versao:d.versao || null,p_dados:Object.fromEntries(keys.map(k=>[k,d[k]]))});
    if(error) throw error;
    const t=Array.isArray(data)?data[0]:data;
    if(!t?.id) throw new Error('O banco não confirmou o salvamento.');
    alterarLocal(t); return t;
  }
  function bloqueio(valor) {
    estado.salvando=valor;
    ['planSalvar','planArquivar','planFechar','planCancelar','planComentar'].forEach(id=>{if($(id)) $(id).disabled=valor || (id==='planComentar' && !estado.draft?.id);});
    if (!valor) render();
  }
  async function salvarFormulario(event) {
    event.preventDefault(); if(estado.salvando || !$('planForm').reportValidity()) return;
    bloqueio(true); $('planDialogErro').textContent='';
    try {await salvar(lerFormulario()); $('planDialog').close(); aviso('Tarefa salva.');}
    catch(error) {$('planDialogErro').textContent=mensagemErro(error);}
    finally {bloqueio(false);}
  }
  async function mudarStatus(id,status) {
    if(estado.salvando) return;
    const t=estado.tarefas.find(x=>x.id===id); if(!t || t.arquivada || t.status===status) return;
    estado.salvando=true;
    try {await salvar({...clone(t),status}); aviso('Status atualizado.');}
    catch(error) {aviso(mensagemErro(error),true);render();}
    finally {estado.salvando=false;render();}
  }
  async function historico(id) {
    const token=++estado.historicoToken;
    const {data,error}=await window.biSupabase.from('bi_planejamento_historico').select('*').eq('tarefa_id',id).order('criado_em',{ascending:false}).order('id',{ascending:false}).limit(100);
    if(token!==estado.historicoToken || estado.draft?.id!==id) return;
    if(error) {$('planHistorico').textContent=mensagemErro(error);return;}
    const nomes={criada:'Tarefa criada',alterada:'Tarefa alterada',arquivada:'Tarefa arquivada',restaurada:'Tarefa restaurada',comentario:'Comentário'};
    $('planHistorico').innerHTML=(data || []).map(h=>{
      const campos=h.antes && h.depois?['titulo','descricao','responsavel','prazo','status','prioridade','atencao','etapas','vinculos'].filter(k=>JSON.stringify(h.antes[k])!==JSON.stringify(h.depois[k])):[];
      return `<article><strong>${nomes[h.acao] || esc(h.acao)}</strong><small>${esc(h.usuario_email)} · ${esc(new Date(h.criado_em).toLocaleString('pt-BR'))}</small>${h.comentario?`<p>${esc(h.comentario)}</p>`:''}${campos.length?`<p>Campos alterados: ${esc(campos.join(', '))}</p>`:''}</article>`;
    }).join('') || 'Nenhum registro de histórico.';
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
  function contextoAtual() {return window.BI_PLANEJAMENTO_PROJETO?projetoRef(window.BI_PLANEJAMENTO_PROJETO):paginaRef(estado.pagina);}
  function instalarUI() {
    const top=document.querySelector('.topbar');
    if(top) top.insertAdjacentHTML('afterend', `<div id="planContexto" class="plan-context no-print"><span id="planContextoTexto"></span><div><button id="planVerAtencao" type="button" hidden>Ver tarefas de atenção</button><button id="planCriarContexto" type="button" disabled>+ Criar tarefa nesta área</button></div></div>`);
    document.body.insertAdjacentHTML('beforeend', `<dialog id="planDialog" class="plan-dialog"><form id="planForm">
      <header><div><small>Planejamento do processo</small><h2 id="planDialogTitulo">Nova tarefa</h2></div><button id="planFechar" type="button" aria-label="Fechar">×</button></header>
      <div class="plan-dialog-body"><div class="plan-dialog-main">
      <label>Tarefa<input id="planCampo_titulo" maxlength="200" required placeholder="Qual ação precisa ser realizada?"></label>
      <label>Descrição<textarea id="planCampo_descricao" maxlength="12000" rows="3" placeholder="Explique o problema e o resultado esperado."></textarea></label>
      <div class="plan-fields"><label>Responsável<input id="planCampo_responsavel" maxlength="300" list="planResponsaveis" placeholder="Nome da pessoa"><datalist id="planResponsaveis"></datalist></label><label>Prazo<input id="planCampo_prazo" type="date"></label><label>Status<select id="planCampo_status"></select></label><label>Prioridade<select id="planCampo_prioridade"></select></label></div>
      <label class="plan-checkbox"><input id="planCampo_atencao" type="checkbox">Sinalizar atenção no processo</label>
      <section><div class="plan-section-head"><h3>Passos da tarefa</h3><button id="planAddEtapa" type="button">+ Adicionar passo</button></div><small id="planEtapasContagem"></small><div id="planEtapas"></div></section>
      <section><h3>Vínculos com o BI</h3><div id="planVinculos"></div><div class="plan-ref-search"><label>Tipo de registro<select id="planTipoVinculo">${opcoes(TIPOS,'','Todos')}</select></label><label>Buscar registro<input id="planBuscaVinculo" type="search" placeholder="Nome, UA, UC, pessoa ou ID"></label></div><small id="planFonteAviso"></small><small id="planBuscaContagem"></small><div id="planResultadosVinculos"></div></section>
      </div><aside class="plan-dialog-history"><h3>Histórico e comentários</h3><textarea id="planComentario" maxlength="4000" rows="3" placeholder="Registre uma atualização após salvar a tarefa."></textarea><button id="planComentar" type="button">Adicionar comentário</button><div id="planHistorico"></div><small>Exibe os 100 registros mais recentes.</small></aside></div>
      <p id="planDialogErro" class="plan-error" role="alert"></p><footer><button id="planArquivar" type="button" hidden>Arquivar tarefa</button><div><button id="planCancelar" type="button">Cancelar</button><button id="planSalvar" class="plan-primary" type="submit">Salvar tarefa</button></div></footer></form></dialog>`);
    $('planForm').addEventListener('submit',salvarFormulario);
    $('planDialog').addEventListener('cancel',e=>{if(estado.salvando)e.preventDefault();});
    document.addEventListener('click',event=>{
      const b=event.target.closest('button');if(!b)return;
      const has=k=>Object.prototype.hasOwnProperty.call(b.dataset,k);
      if(has('planOpen')) {void abrir(estado.tarefas.find(t=>t.id===b.dataset.planOpen));return;}
      if(has('planRef')) {void abrir(null,estado.refs.get(b.dataset.planRef));return;}
      if(has('planAddRef')) {const r=estado.buscaRefs[Number(b.dataset.planAddRef)]; adicionarRef(r?.tipo==='visao'?paginaRef(r.pagina):r);return;}
      if(has('planRemoveRef')) {estado.draft.vinculos.splice(Number(b.dataset.planRemoveRef),1);renderVinculos();return;}
      if(has('planOrigin')) {origem(estado.draft.vinculos[Number(b.dataset.planOrigin)]);return;}
      if(has('planStepDelete')) {estado.draft.etapas.splice(Number(b.dataset.planStepDelete),1);renderEtapas();return;}
      if(has('planStepUp')) {const i=Number(b.dataset.planStepUp);if(i>0){const a=estado.draft.etapas;[a[i-1],a[i]]=[a[i],a[i-1]];renderEtapas();}return;}
      switch(b.id) {
        case 'planNova': void abrir();break;
        case 'planCriarContexto': void abrir(null,contextoAtual());break;
        case 'planAtualizar': void carregar();break;
        case 'planModo': estado.lista=!estado.lista;render();break;
        case 'planExportar': exportar();break;
        case 'planFiltroArea': estado.filtroPagina='';render();break;
        case 'planVerAtencao': estado.filtroPagina=estado.pagina;if($('planSomenteAtencao')) {$('planSomenteAtencao').checked=true;window.abrirPaginaBI?.('planejamento');render();}else location.href='index.html?areaPlanejamento='+encodeURIComponent(estado.pagina)+'#planejamento';break;
        case 'planAddEtapa': if(estado.draft.etapas.length<100){estado.draft.etapas.push({id:idNovo(),titulo:'',concluida:false,responsavel:'',prazo:''});renderEtapas();$('planEtapas').lastElementChild.querySelector('[data-step-field="titulo"]').focus();}break;
        case 'planCancelar':case 'planFechar': if(!estado.salvando)$('planDialog').close();break;
        case 'planComentar': void comentar();break;
        case 'planArquivar': if(!estado.salvando) {estado.draft.arquivada=!estado.draft.arquivada;void salvarFormulario(new Event('submit',{cancelable:true}));}break;
      }
    });
    document.addEventListener('input',event=>{
      const e=event.target, step=e.closest('[data-plan-step]');
      if(step && e.dataset.stepField) {estado.draft.etapas[Number(step.dataset.planStep)][e.dataset.stepField]=e.type==='checkbox'?e.checked:e.value;
        $('planEtapasContagem').textContent=`${estado.draft.etapas.filter(x=>x.concluida).length}/${estado.draft.etapas.length} passos concluídos`;}
      if(e.id==='planBuscaVinculo')buscarRefs();if(e.id==='planBusca')render();
    });
    document.addEventListener('change',event=>{
      const e=event.target;if(e.dataset.planStatus)void mudarStatus(e.dataset.planStatus,e.value);
      if(e.id==='planTipoVinculo')buscarRefs();if(['planFiltroStatus','planFiltroPrioridade','planFiltroResponsavel','planSomenteAtencao','planArquivadas'].includes(e.id))render();
    });
    document.addEventListener('dragstart',e=>{const card=e.target.closest('[data-plan-drag]');if(card)e.dataTransfer.setData('text/plain',card.dataset.planDrag);});
    document.addEventListener('dragover',e=>{if(e.target.closest('[data-plan-drop]'))e.preventDefault();});
    document.addEventListener('drop',e=>{const col=e.target.closest('[data-plan-drop]');if(col){e.preventDefault();void mudarStatus(e.dataTransfer.getData('text/plain'),col.dataset.planDrop);}});
    if($('planFiltroStatus')) $('planFiltroStatus').innerHTML=opcoes(STATUS,'','Todos os status');
    if($('planFiltroPrioridade')) $('planFiltroPrioridade').innerHTML=opcoes(PRIORIDADES,'','Todas as prioridades');
    const area = new URLSearchParams(location.search).get('areaPlanejamento');
    if (PAGINAS[area] && $('planSomenteAtencao')) {estado.filtroPagina=area;$('planSomenteAtencao').checked=true;}
    atualizarSinais(); void carregar();
  }
  window.biPlanejamento={definirDados,definirProjetos,paginaAlterada,registrarMaterial:(x,p)=>registrar(materialRef(x,p)),
    registrarCertificado:(ua,r,s,k)=>registrar(certificadoRef(ua,r,s,k)),registrarProjeto:x=>registrar(projetoRef(x)),
    abrirTarefa:(r)=>abrir(null,r),atualizarSinais};
  document.addEventListener('DOMContentLoaded',instalarUI);
})();
