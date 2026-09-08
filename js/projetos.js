(function () {
  "use strict";

  const estado = {
    usuario: null,
    projetos: [],
    tarefas: [],
    edicoes: [],
    linhasOriginais: [],
    projetoId: null,
    origemPreview: null,
    edicaoVisualizada: null,
    importacaoAtual: null,
    responsaveis: [],
    aliasesResponsaveis: new Map(),
    salvando: false,
  };

  const campos = {
    contexto_objetivo: "contextField",
    resultados_esperados: "expectedField",
    acoes_complementares: "actionsField",
    resultados_alcancados: "achievedField",
    impacto: "impactField",
    observacoes: "notesField",
  };

  const $ = (id) => document.getElementById(id);

  function texto(valor) {
    return String(valor ?? "").trim();
  }

  function escapar(valor) {
    return String(valor ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizar(valor) {
    return texto(valor)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function limparNome(valor) {
    return String(valor ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function separarResponsaveis(valor) {
    const celula = limparNome(valor);
    if (!celula) return [];

    return celula
      .split(/\s*(?:,|;|\||\/|&|\be\b)\s*/i)
      .map(limparNome)
      .filter(Boolean);
  }

  function listarResponsaveis() {
    const nomes = new Map();
    const valores = [
      ...estado.projetos.map((projeto) => projeto.sponsor),
      ...estado.tarefas.map((tarefa) => tarefa.sponsor),
      ...estado.linhasOriginais.map((linha) => linha.dados_originais?.sponsor),
    ];

    valores.flatMap(separarResponsaveis).forEach((nome) => {
      const chave = normalizar(nome);
      const atual = nomes.get(chave);
      const possuiAcento = nome !== nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const atualPossuiAcento = atual
        ? atual !== atual.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        : false;

      if (!atual || (possuiAcento && !atualPossuiAcento)) nomes.set(chave, nome);
    });

    const entradas = [...nomes.entries()].map(([chave, nome]) => ({ chave, nome }));
    const nomesCompletos = entradas.filter((item) => item.chave.includes(" "));
    const nomesAbreviados = entradas.filter((item) => !item.chave.includes(" "));
    const abreviadosIncorporados = new Set();
    estado.aliasesResponsaveis = new Map();

    nomesAbreviados.forEach((abreviado) => {
      const correspondencias = nomesCompletos.filter(
        (completo) => completo.chave.split(" ")[0] === abreviado.chave,
      );
      if (correspondencias.length !== 1) return;

      const principal = correspondencias[0].chave;
      const aliases = estado.aliasesResponsaveis.get(principal) || [];
      aliases.push(abreviado.chave);
      estado.aliasesResponsaveis.set(principal, aliases);
      abreviadosIncorporados.add(abreviado.chave);
    });

    return entradas
      .filter((item) => !abreviadosIncorporados.has(item.chave))
      .map((item) => item.nome)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  function formatarData(valor) {
    if (!valor) return "—";
    const partes = String(valor).slice(0, 10).split("-");
    if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
    return String(valor);
  }

  function formatarDataHora(valor) {
    if (!valor) return "—";
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(valor));
  }

  function linhasOriginaisDoProjeto(projeto) {
    const nome = normalizar(projeto?.nome);
    const azureId = texto(projeto?.azure_id);

    return estado.linhasOriginais.filter((linha) => {
      const dados = linha.dados_originais || {};
      return texto(dados.id) === azureId || normalizar(dados.projeto) === nome;
    });
  }

  function sponsorOriginalPorId(azureId) {
    const id = texto(azureId);
    const linha = estado.linhasOriginais.find(
      (item) => texto(item.dados_originais?.id) === id,
    );
    return limparNome(linha?.dados_originais?.sponsor);
  }

  function urlSegura(valor) {
    const url = texto(valor);
    if (!/^https?:\/\//i.test(url)) return "";
    return url;
  }

  function mesmoId(a, b) {
    return String(a ?? "") === String(b ?? "");
  }

  function projetoAtual() {
    return estado.projetos.find((item) => mesmoId(item.id, estado.projetoId)) || null;
  }

  function tarefasAtuais() {
    return estado.tarefas.filter((item) => mesmoId(item.projeto_id, estado.projetoId));
  }

  function edicoesAtuais() {
    return estado.edicoes.filter((item) => mesmoId(item.projeto_id, estado.projetoId));
  }

  function origemAtual() {
    if (estado.origemPreview) return estado.origemPreview;
    return { projeto: projetoAtual(), tarefas: tarefasAtuais() };
  }

  function mostrarFeedback(mensagem, tipo = "") {
    const alvo = $("feedbackMessage");
    alvo.textContent = mensagem;
    alvo.className = `feedback-message no-print${tipo ? ` ${tipo}` : ""}`;
    alvo.hidden = !mensagem;
  }

  function mensagemErro(error) {
    const bruto = texto(error?.message || error);
    if (/pq_projetos_edicoes|pq_salvar_edicao|does not exist|schema cache/i.test(bruto)) {
      return "O editor ainda não foi instalado no Supabase. Execute o arquivo docs/03_CRIAR_EDITOR_RELATORIOS_PQ.sql no SQL Editor e recarregue esta página.";
    }
    if (/permission|policy|row-level|unauthorized|jwt/i.test(bruto)) {
      return "Sua sessão não tem permissão para esta operação. Entre novamente e confirme se o SQL do editor foi executado no projeto correto.";
    }
    return bruto || "Ocorreu um erro inesperado.";
  }

  async function carregarDados() {
    $("loadingState").hidden = false;
    $("errorState").hidden = true;
    $("projectsApp").hidden = true;

    try {
      estado.usuario = await window.protegerDashboard();
      if (!estado.usuario) return;

      const [projetosResp, tarefasResp, edicoesResp, importacaoResp] = await Promise.all([
        window.biSupabase
          .from("vw_pq_projetos_v245")
          .select("*")
          .order("nome", { ascending: true }),
        window.biSupabase
          .from("vw_pq_tarefas_v245")
          .select("*")
          .order("data_inicio", { ascending: true, nullsFirst: false }),
        window.biSupabase
          .from("pq_projetos_edicoes")
          .select("*")
          .order("criado_em", { ascending: false }),
        window.biSupabase
          .from("vw_pq_importacoes_v245")
          .select("id, total_linhas, linhas_com_erro, finalizado_em")
          .eq("status", "concluida")
          .order("finalizado_em", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const erro = projetosResp.error || tarefasResp.error || edicoesResp.error || importacaoResp.error;
      if (erro) throw erro;

      estado.projetos = projetosResp.data || [];
      estado.tarefas = tarefasResp.data || [];
      estado.edicoes = edicoesResp.data || [];
      estado.importacaoAtual = importacaoResp.data || null;

      // A base atual já preserva os responsáveis diretamente nos projetos/tarefas.
      // A consulta às linhas brutas da estrutura antiga não é necessária na V24.5.
      estado.linhasOriginais = [];

      renderizarResumo();
      preencherFiltros();
      filtrarProjetos();

      $("loadingState").hidden = true;
      $("projectsApp").hidden = false;
    } catch (error) {
      $("loadingState").hidden = true;
      $("errorText").textContent = mensagemErro(error);
      $("errorState").hidden = false;
    }
  }

  function renderizarResumo() {
    $("projectCount").textContent = estado.projetos.length;
    $("taskCount").textContent = estado.tarefas.filter((t) => t.projeto_id).length;
    $("unlinkedCount").textContent = estado.tarefas.filter((t) => !t.projeto_id).length;
    $("issueCount").textContent = estado.importacaoAtual?.linhas_com_erro || 0;
  }

  function preencherFiltros() {
    const atual = $("statusFilter").value;
    const status = [...new Set([
      ...estado.projetos.map((p) => texto(p.status)),
      ...estado.tarefas.map((t) => texto(t.status)),
    ].filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    $("statusFilter").innerHTML = '<option value="">Todos</option>';
    status.forEach((valor) => {
      const option = document.createElement("option");
      option.value = valor;
      option.textContent = valor;
      $("statusFilter").appendChild(option);
    });
    $("statusFilter").value = atual;

    estado.responsaveis = listarResponsaveis();
    $("responsibleCount").textContent = `${estado.responsaveis.length} responsável(is) identificado(s).`;
    renderizarMenuResponsaveis();

    $("projectOptions").innerHTML = estado.projetos
      .map((projeto) => `<option value="${escapar(projeto.nome)}">ID ${escapar(projeto.azure_id)}</option>`)
      .join("");
  }

  function renderizarMenuResponsaveis() {
    const busca = normalizar($("responsibleFilter").value);
    const filtrados = estado.responsaveis.filter((nome) => !busca || normalizar(nome).includes(busca));

    const todos = busca
      ? ""
      : '<button type="button" class="responsible-option all" role="option" data-responsible="">Todos os responsáveis</button>';
    const opcoes = filtrados
      .map((nome) => `<button type="button" class="responsible-option" role="option" data-responsible="${escapar(nome)}">${escapar(nome)}</button>`)
      .join("");

    $("responsibleMenu").innerHTML = todos || opcoes
      ? `${todos}${opcoes}`
      : '<p class="responsible-empty">Nenhum responsável encontrado.</p>';
  }

  function abrirMenuResponsaveis() {
    renderizarMenuResponsaveis();
    $("responsibleMenu").hidden = false;
    $("responsibleFilter").setAttribute("aria-expanded", "true");
    $("responsibleMenuButton").setAttribute("aria-expanded", "true");
  }

  function fecharMenuResponsaveis() {
    $("responsibleMenu").hidden = true;
    $("responsibleFilter").setAttribute("aria-expanded", "false");
    $("responsibleMenuButton").setAttribute("aria-expanded", "false");
  }

  function filtrarProjetos() {
    const responsavel = normalizar($("responsibleFilter").value);
    const status = $("statusFilter").value;
    const projetoBuscado = normalizar($("projectFilter").value);
    const termosResponsavel = [responsavel];

    estado.aliasesResponsaveis.forEach((aliases, nomeCompleto) => {
      if (nomeCompleto.includes(responsavel)) termosResponsavel.push(...aliases);
    });

    const filtrados = estado.projetos.filter((projeto) => {
      const tarefas = estado.tarefas.filter((tarefa) => tarefa.projeto_id === projeto.id);
      const sponsorsOriginais = linhasOriginaisDoProjeto(projeto)
        .map((linha) => linha.dados_originais?.sponsor);
      const celulasResponsaveis = [
        projeto.sponsor,
        ...tarefas.map((tarefa) => tarefa.sponsor),
        ...sponsorsOriginais,
      ];
      const responsaveis = celulasResponsaveis
        .flatMap(separarResponsaveis)
        .map(normalizar)
        .filter(Boolean);
      const combinacoesOriginais = celulasResponsaveis
        .map((valor) => normalizar(limparNome(valor)))
        .filter(Boolean);
      const statusDoGrupo = [projeto.status, ...tarefas.map((tarefa) => tarefa.status)];
      const identificacao = normalizar(`${projeto.nome} ${projeto.azure_id}`);

      return (
        (!responsavel
          || termosResponsavel.some((termo) => responsaveis.some((nome) => nome.includes(termo)))
          || termosResponsavel.some((termo) => combinacoesOriginais.some((nomes) => nomes.includes(termo))))
        && (!status || statusDoGrupo.includes(status))
        && (!projetoBuscado || identificacao.includes(projetoBuscado))
      );
    });

    renderizarTabelaProjetos(filtrados);
  }

  function renderizarTabelaProjetos(projetos) {
    let totalTarefas = 0;
    const linhas = [];

    projetos.forEach((projeto) => {
      const tarefas = estado.tarefas.filter((tarefa) => tarefa.projeto_id === projeto.id);
      const sponsorProjeto = limparNome(
        projeto.sponsor || sponsorOriginalPorId(projeto.azure_id),
      );
      totalTarefas += tarefas.length;
      const selecionado = projeto.id === estado.projetoId ? " selected" : "";

      linhas.push(`
        <tr class="project-main-row${selecionado}" data-project-id="${escapar(projeto.id)}" tabindex="0">
          <td><strong>${escapar(projeto.azure_id || "—")}</strong></td>
          <td><span class="row-type project">Projeto principal</span></td>
          <td><strong>${escapar(projeto.nome || "—")}</strong><small>${tarefas.length} tarefa(s)</small></td>
          <td>—</td>
          <td>${escapar(sponsorProjeto || "—")}</td>
          <td><span class="row-status">${escapar(projeto.status || "—")}</span></td>
          <td>${escapar(formatarData(projeto.data_inicio))}</td>
          <td>${escapar(formatarData(projeto.data_fim))}</td>
        </tr>`);

      tarefas.forEach((tarefa) => {
        linhas.push(`
          <tr class="project-task-row${selecionado}" data-project-id="${escapar(projeto.id)}" tabindex="0">
            <td>${escapar(tarefa.azure_id || "—")}</td>
            <td><span class="row-type task">${escapar(tarefa.tipo || "Tarefa")}</span></td>
            <td><span class="parent-project-name">↳ ${escapar(projeto.nome || "—")}</span></td>
            <td>${escapar(tarefa.descricao || tarefa.nome || "—")}</td>
            <td>${escapar(limparNome(tarefa.sponsor || sponsorOriginalPorId(tarefa.azure_id) || sponsorProjeto) || "—")}</td>
            <td><span class="row-status">${escapar(tarefa.status || "—")}</span></td>
            <td>${escapar(formatarData(tarefa.data_inicio))}</td>
            <td>${escapar(formatarData(tarefa.data_fim))}</td>
          </tr>`);
      });
    });

    $("projectResultsBody").innerHTML = linhas.join("");
    $("emptyProjectResults").hidden = projetos.length > 0;
    $("projectMatchCount").textContent = `${projetos.length} projeto(s) e ${totalTarefas} tarefa(s) encontrados.`;

    $("projectResultsBody").querySelectorAll("[data-project-id]").forEach((linha) => {
      const abrir = () => selecionarProjeto(linha.dataset.projectId);
      linha.addEventListener("click", abrir);
      linha.addEventListener("keydown", (evento) => {
        if (evento.key === "Enter" || evento.key === " ") {
          evento.preventDefault();
          abrir();
        }
      });
    });
  }

  function selecionarProjeto(id) {
    estado.projetoId = id || null;
    estado.edicaoVisualizada = null;
    estado.origemPreview = null;
    $("editorWorkspace").hidden = !estado.projetoId;
    mostrarFeedback("");
    if (!estado.projetoId) return;

    const projeto = projetoAtual();
    if (!projeto) {
      mostrarFeedback("Não foi possível localizar os dados deste projeto na base atual. Recarregue a página.", "error");
      $("editorWorkspace").hidden = true;
      return;
    }
    $("selectedProjectTitle").textContent = projeto.nome || "Projeto da Qualidade";
    $("selectedProjectMeta").textContent = `ID ${projeto.azure_id || "—"} · ${projeto.status || "Sem status"}`;
    renderizarOrigem();
    renderizarHistorico();

    const ultima = edicoesAtuais()[0];
    if (ultima) {
      carregarCampos(ultima);
      $("editionBadge").textContent = `Baseada na versão ${ultima.versao}`;
    } else {
      limparCampos();
      $("editionBadge").textContent = "Primeira versão";
    }
    atualizarPreview();
    filtrarProjetos();
    $("editorWorkspace").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function metadado(rotulo, valor) {
    return `<div><dt>${escapar(rotulo)}</dt><dd>${escapar(valor || "—")}</dd></div>`;
  }

  function renderizarOrigem() {
    const origem = origemAtual();
    const projeto = {
      ...(projetoAtual() || {}),
      ...(origem.projeto || {})
    };
    const tarefasOrigem = Array.isArray(origem.tarefas) ? origem.tarefas : [];
    const tarefas = tarefasOrigem.length ? tarefasOrigem : tarefasAtuais();

    $("sourceMetadata").innerHTML = [
      metadado("ID", projeto.azure_id),
      metadado("Status", projeto.status),
      metadado("Início", formatarData(projeto.data_inicio)),
      metadado("Fim", formatarData(projeto.data_fim)),
      metadado("Sponsor", limparNome(projeto.sponsor)),
      metadado("Esforço", projeto.esforco),
      metadado("Prioridade", projeto.prioridade),
      metadado("Tarefas", tarefas.length),
    ].join("");

    if (!tarefas.length) {
      $("sourceTaskList").innerHTML = '<p class="empty-copy">Nenhuma tarefa vinculada a este projeto.</p>';
      return;
    }

    $("sourceTaskList").innerHTML = tarefas.map((tarefa) => `
      <article class="source-task">
        <strong>${escapar(tarefa.descricao || tarefa.nome || "Ação sem descrição")}</strong>
        <span>ID ${escapar(tarefa.azure_id || "—")} · ${escapar(formatarData(tarefa.data_inicio))} a ${escapar(formatarData(tarefa.data_fim))}</span>
        <span class="task-status">${escapar(tarefa.status || "—")}</span>
      </article>
    `).join("");
  }

  function limparCampos() {
    Object.values(campos).forEach((id) => { $(id).value = ""; });
    $("evidenceList").innerHTML = "";
    adicionarEvidencia();
  }

  function carregarCampos(edicao) {
    Object.entries(campos).forEach(([chave, id]) => {
      $(id).value = edicao?.[chave] || "";
    });
    $("evidenceList").innerHTML = "";
    const evidencias = Array.isArray(edicao?.evidencias) ? edicao.evidencias : [];
    if (!evidencias.length) adicionarEvidencia();
    evidencias.forEach(adicionarEvidencia);
  }

  function adicionarEvidencia(dados = {}) {
    const fragmento = $("evidenceTemplate").content.cloneNode(true);
    const linha = fragmento.querySelector(".evidence-row");
    linha.querySelectorAll("[data-evidence]").forEach((entrada) => {
      entrada.value = dados[entrada.dataset.evidence] || "";
      entrada.addEventListener("input", atualizarPreview);
      entrada.addEventListener("change", atualizarPreview);
    });
    linha.querySelector(".remove-evidence").addEventListener("click", () => {
      linha.remove();
      if (!$("evidenceList").children.length) adicionarEvidencia();
      atualizarPreview();
    });
    $("evidenceList").appendChild(fragmento);
  }

  function obterEvidencias() {
    return [...$("evidenceList").querySelectorAll(".evidence-row")]
      .map((linha) => {
        const evidencia = {};
        linha.querySelectorAll("[data-evidence]").forEach((entrada) => {
          evidencia[entrada.dataset.evidence] = texto(entrada.value);
        });
        return evidencia;
      })
      .filter((item) => item.titulo || item.url || item.descricao);
  }

  function obterFormulario() {
    const dados = {};
    Object.entries(campos).forEach(([chave, id]) => { dados[chave] = texto($(id).value); });
    dados.evidencias = obterEvidencias();
    return dados;
  }

  function validarFinalizacao(dados) {
    const faltantes = [];
    if (!dados.contexto_objetivo) faltantes.push("Contexto e objetivo");
    if (!dados.resultados_esperados) faltantes.push("Resultados esperados");
    if (!dados.resultados_alcancados) faltantes.push("Resultados alcançados");
    if (!dados.impacto) faltantes.push("Impacto gerado");
    if (!dados.evidencias.some((item) => item.titulo && urlSegura(item.url))) {
      faltantes.push("Ao menos uma evidência com título e link http(s)");
    }
    return faltantes;
  }

  function atualizarChecklist(dados) {
    const itens = [
      ["Contexto e objetivo", Boolean(dados.contexto_objetivo)],
      ["Resultados esperados", Boolean(dados.resultados_esperados)],
      ["Resultados alcançados", Boolean(dados.resultados_alcancados)],
      ["Impacto gerado", Boolean(dados.impacto)],
      ["Evidência com título e link", dados.evidencias.some((e) => e.titulo && urlSegura(e.url))],
    ];
    $("completionChecklist").innerHTML = itens
      .map(([rotulo, pronto]) => `<li class="${pronto ? "done" : ""}">${escapar(rotulo)}</li>`)
      .join("");
  }

  function blocoTexto(titulo, conteudo) {
    const valor = texto(conteudo);
    return `
      <section class="report-section">
        <h2>${escapar(titulo)}</h2>
        <p class="${valor ? "" : "report-empty"}">${escapar(valor || "Não informado nesta versão.")}</p>
      </section>`;
  }

  function tabelaTarefas(tarefas) {
    if (!tarefas.length) return '<p class="report-empty">Nenhuma tarefa original vinculada.</p>';
    return `
      <table class="report-task-table">
        <thead><tr><th>ID</th><th>Ação original</th><th>Status</th><th>Período</th></tr></thead>
        <tbody>${tarefas.map((t) => `
          <tr>
            <td>${escapar(t.azure_id || "—")}</td>
            <td>${escapar(t.descricao || "—")}</td>
            <td>${escapar(t.status || "—")}</td>
            <td>${escapar(formatarData(t.data_inicio))} a ${escapar(formatarData(t.data_fim))}</td>
          </tr>`).join("")}</tbody>
      </table>`;
  }

  function tabelaEvidencias(evidencias) {
    const validas = evidencias.filter((item) => item.titulo || item.url || item.descricao);
    if (!validas.length) return '<p class="report-empty">Nenhuma evidência registrada.</p>';
    return `
      <table class="report-evidence-table">
        <thead><tr><th>Evidência</th><th>Tipo</th><th>O que comprova</th><th>Link</th></tr></thead>
        <tbody>${validas.map((item) => {
          const url = urlSegura(item.url);
          return `<tr>
            <td>${escapar(item.titulo || "—")}</td>
            <td>${escapar(item.tipo || "—")}</td>
            <td>${escapar(item.descricao || "—")}</td>
            <td>${url ? `<a href="${escapar(url)}">Abrir evidência</a>` : "—"}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>`;
  }

  function atualizarPreview() {
    if (!estado.projetoId) return;
    const dados = obterFormulario();
    const origem = origemAtual();
    const projetoBase = projetoAtual() || {};
    const projeto = {
      ...projetoBase,
      ...(origem.projeto || {})
    };
    const tarefasOrigem = Array.isArray(origem.tarefas) ? origem.tarefas : [];
    const tarefas = tarefasOrigem.length ? tarefasOrigem : tarefasAtuais();
    const faltantes = validarFinalizacao(dados);
    const edicoes = edicoesAtuais();
    const proximaVersao = edicoes.length ? Math.max(...edicoes.map((e) => e.versao)) + 1 : 1;
    const edicao = estado.edicaoVisualizada;
    const versao = edicao
      ? `Versão ${edicao.versao} · ${edicao.status_edicao}`
      : `Prévia da próxima versão ${proximaVersao}`;
    const autor = edicao?.criado_por_email || estado.usuario?.email || "—";
    const emitidoEm = edicao?.criado_em ? formatarDataHora(edicao.criado_em) : formatarDataHora(new Date());

    $("reportDocument").innerHTML = `
      <header class="report-cover">
        <span class="report-brand">DataHub · Projetos da Qualidade</span>
        <h1>${escapar(projeto.nome || "Projeto da Qualidade")}</h1>
        <p class="report-subtitle">Relatório executivo de projeto</p>
        <span class="report-version">${escapar(versao)}</span>
      </header>
      ${faltantes.length ? `<div class="report-draft-warning">Rascunho · faltam: ${escapar(faltantes.join(", "))}.</div>` : ""}
      <div class="report-meta-grid">
        ${metadadoRelatorio("ID Ajure", projeto.azure_id)}
        ${metadadoRelatorio("Status", projeto.status)}
        ${metadadoRelatorio("Início", formatarData(projeto.data_inicio))}
        ${metadadoRelatorio("Fim", formatarData(projeto.data_fim))}
        ${metadadoRelatorio("Sponsor", limparNome(projeto.sponsor))}
        ${metadadoRelatorio("Esforço", projeto.esforco)}
        ${metadadoRelatorio("Prioridade", projeto.prioridade)}
        ${metadadoRelatorio("Ações originais", tarefas.length)}
      </div>
      ${blocoTexto("Contexto e objetivo", dados.contexto_objetivo)}
      ${blocoTexto("Resultados esperados", dados.resultados_esperados)}
      <section class="report-section"><h2>Ações e tarefas originais</h2>${tabelaTarefas(tarefas)}</section>
      ${blocoTexto("Novas ações e complementos", dados.acoes_complementares)}
      ${blocoTexto("Resultados alcançados", dados.resultados_alcancados)}
      ${blocoTexto("Impacto gerado", dados.impacto)}
      <section class="report-section"><h2>Evidências</h2>${tabelaEvidencias(dados.evidencias)}</section>
      ${dados.observacoes ? blocoTexto("Observações", dados.observacoes) : ""}
      <footer class="report-footer">
        <span>Versão registrada por ${escapar(autor)}</span>
        <span>Gerado em ${escapar(emitidoEm)}</span>
      </footer>`;

    atualizarChecklist(dados);
  }

  function metadadoRelatorio(rotulo, valor) {
    return `<div class="report-meta"><span>${escapar(rotulo)}</span><strong>${escapar(valor || "—")}</strong></div>`;
  }

  function renderizarHistorico() {
    const edicoes = edicoesAtuais();
    if (!edicoes.length) {
      $("historyList").innerHTML = '<p class="empty-copy">Ainda não existem versões salvas.</p>';
      return;
    }
    $("historyList").innerHTML = edicoes.map((edicao) => `
      <article class="history-item ${estado.edicaoVisualizada?.id === edicao.id ? "active" : ""}" data-edition-id="${escapar(edicao.id)}">
        <div class="history-item-head">
          <strong>Versão ${escapar(edicao.versao)}</strong>
          <span class="history-status ${escapar(edicao.status_edicao)}">${escapar(edicao.status_edicao)}</span>
        </div>
        <p>${escapar(formatarDataHora(edicao.criado_em))}<br>${escapar(edicao.criado_por_email)}</p>
        <div class="history-actions">
          <button type="button" data-action="view">Ver versão</button>
          <button type="button" data-action="base">Usar como base</button>
        </div>
      </article>`).join("");

    $("historyList").querySelectorAll(".history-item").forEach((item) => {
      const edicao = estado.edicoes.find((e) => e.id === item.dataset.editionId);
      item.querySelector('[data-action="view"]').addEventListener("click", () => visualizarEdicao(edicao));
      item.querySelector('[data-action="base"]').addEventListener("click", () => usarComoBase(edicao));
    });
  }

  function visualizarEdicao(edicao) {
    estado.edicaoVisualizada = edicao;
    estado.origemPreview = edicao.dados_origem || null;
    carregarCampos(edicao);
    $("editionBadge").textContent = `Visualizando versão ${edicao.versao} · salvar criará outra`;
    renderizarOrigem();
    renderizarHistorico();
    atualizarPreview();
    mostrarFeedback(`Versão ${edicao.versao} aberta. O registro original continua protegido.`, "success");
  }

  function usarComoBase(edicao) {
    estado.edicaoVisualizada = null;
    estado.origemPreview = null;
    carregarCampos(edicao);
    $("editionBadge").textContent = `Nova versão baseada na ${edicao.versao}`;
    renderizarOrigem();
    renderizarHistorico();
    atualizarPreview();
    mostrarFeedback(`Conteúdo da versão ${edicao.versao} carregado como base. Ao salvar, uma nova versão será criada.`, "success");
  }

  function definirSalvando(ativo) {
    estado.salvando = ativo;
    ["saveDraftButton", "finalizeButton"].forEach((id) => { $(id).disabled = ativo; });
    $("saveDraftButton").textContent = ativo ? "Salvando…" : "Salvar nova versão";
    $("finalizeButton").textContent = ativo ? "Salvando…" : "Finalizar e gerar PDF";
  }

  async function salvar(finalizar) {
    if (!estado.projetoId || estado.salvando) return;
    const dados = obterFormulario();
    const faltantes = validarFinalizacao(dados);

    if (finalizar && faltantes.length) {
      mostrarFeedback(`Complete antes de finalizar: ${faltantes.join("; ")}.`, "warning");
      $("completionChecklist").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (finalizar && !window.confirm("Finalizar esta versão? Ela ficará registrada no histórico e não poderá ser sobrescrita.")) return;

    definirSalvando(true);
    mostrarFeedback(finalizar ? "Finalizando a versão…" : "Salvando uma nova versão…");
    try {
      const { data, error } = await window.biSupabase.rpc("pq_salvar_edicao", {
        p_projeto_id: estado.projetoId,
        p_contexto_objetivo: dados.contexto_objetivo || null,
        p_resultados_esperados: dados.resultados_esperados || null,
        p_acoes_complementares: dados.acoes_complementares || null,
        p_resultados_alcancados: dados.resultados_alcancados || null,
        p_impacto: dados.impacto || null,
        p_observacoes: dados.observacoes || null,
        p_evidencias: dados.evidencias,
        p_finalizar: finalizar,
      });
      if (error) throw error;

      const { data: edicao, error: edicaoError } = await window.biSupabase
        .from("pq_projetos_edicoes")
        .select("*")
        .eq("id", data.id)
        .single();
      if (edicaoError) throw edicaoError;

      estado.edicoes.unshift(edicao);
      estado.edicaoVisualizada = edicao;
      estado.origemPreview = edicao.dados_origem;
      $("editionBadge").textContent = `Versão ${edicao.versao} · ${edicao.status_edicao}`;
      renderizarOrigem();
      renderizarHistorico();
      atualizarPreview();
      mostrarFeedback(`Versão ${edicao.versao} ${finalizar ? "finalizada" : "salva como rascunho"} com sucesso.`, "success");

      if (finalizar) imprimirRelatorio();
    } catch (error) {
      mostrarFeedback(mensagemErro(error), "error");
    } finally {
      definirSalvando(false);
    }
  }

  function imprimirRelatorio() {
    atualizarPreview();
    const projeto = origemAtual().projeto || projetoAtual();
    const tituloAnterior = document.title;
    document.title = `Relatorio - ${texto(projeto?.nome || "Projeto da Qualidade")}`;
    const restaurar = () => {
      document.title = tituloAnterior;
      window.removeEventListener("afterprint", restaurar);
    };
    window.addEventListener("afterprint", restaurar);
    window.print();
  }

  function ligarEventos() {
    $("logoutButton").addEventListener("click", window.sairBI);
    $("retryButton").addEventListener("click", carregarDados);
    $("responsibleFilter").addEventListener("input", () => {
      filtrarProjetos();
      abrirMenuResponsaveis();
    });
    $("responsibleFilter").addEventListener("focus", abrirMenuResponsaveis);
    $("responsibleFilter").addEventListener("keydown", (evento) => {
      if (evento.key === "Escape") fecharMenuResponsaveis();
      if (evento.key === "ArrowDown") {
        evento.preventDefault();
        abrirMenuResponsaveis();
        $("responsibleMenu").querySelector("button")?.focus();
      }
    });
    $("responsibleMenuButton").addEventListener("click", () => {
      if ($("responsibleMenu").hidden) abrirMenuResponsaveis();
      else fecharMenuResponsaveis();
    });
    $("responsibleMenu").addEventListener("click", (evento) => {
      const opcao = evento.target.closest("[data-responsible]");
      if (!opcao) return;
      $("responsibleFilter").value = opcao.dataset.responsible;
      fecharMenuResponsaveis();
      filtrarProjetos();
    });
    $("statusFilter").addEventListener("change", filtrarProjetos);
    $("projectFilter").addEventListener("input", filtrarProjetos);
    $("clearFiltersButton").addEventListener("click", () => {
      $("responsibleFilter").value = "";
      $("statusFilter").value = "";
      $("projectFilter").value = "";
      filtrarProjetos();
      fecharMenuResponsaveis();
    });
    $("addEvidenceButton").addEventListener("click", () => {
      adicionarEvidencia();
      atualizarPreview();
    });
    Object.values(campos).forEach((id) => $(id).addEventListener("input", atualizarPreview));
    $("saveDraftButton").addEventListener("click", () => salvar(false));
    $("finalizeButton").addEventListener("click", () => salvar(true));
    $("printDraftButton").addEventListener("click", imprimirRelatorio);
    document.addEventListener("click", (evento) => {
      if (!evento.target.closest(".responsible-combobox")) fecharMenuResponsaveis();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    ligarEventos();
    carregarDados();
  });
})();
