(function () {
  "use strict";

  const estado = {
    usuario: null,
    projetos: [],
    tarefas: [],
    edicoes: [],
    projetoId: null,
    origemPreview: null,
    edicaoVisualizada: null,
    importacaoAtual: null,
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

  function urlSegura(valor) {
    const url = texto(valor);
    if (!/^https?:\/\//i.test(url)) return "";
    return url;
  }

  function projetoAtual() {
    return estado.projetos.find((item) => item.id === estado.projetoId) || null;
  }

  function tarefasAtuais() {
    return estado.tarefas.filter((item) => item.projeto_id === estado.projetoId);
  }

  function edicoesAtuais() {
    return estado.edicoes.filter((item) => item.projeto_id === estado.projetoId);
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
          .from("pq_projetos")
          .select("*")
          .eq("ativo", true)
          .eq("presente_ultima_importacao", true)
          .order("nome", { ascending: true }),
        window.biSupabase
          .from("pq_tarefas")
          .select("*")
          .eq("ativo", true)
          .eq("presente_ultima_importacao", true)
          .order("data_inicio", { ascending: true, nullsFirst: false }),
        window.biSupabase
          .from("pq_projetos_edicoes")
          .select("*")
          .order("criado_em", { ascending: false }),
        window.biSupabase
          .from("pq_importacoes")
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

      renderizarResumo();
      preencherStatus();
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

  function preencherStatus() {
    const atual = $("statusFilter").value;
    const status = [...new Set(estado.projetos.map((p) => texto(p.status)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    $("statusFilter").innerHTML = '<option value="">Todos</option>';
    status.forEach((valor) => {
      const option = document.createElement("option");
      option.value = valor;
      option.textContent = valor;
      $("statusFilter").appendChild(option);
    });
    $("statusFilter").value = atual;
  }

  function filtrarProjetos() {
    const busca = normalizar($("projectSearch").value);
    const status = $("statusFilter").value;
    const filtrados = estado.projetos.filter((projeto) => {
      const pilha = normalizar(`${projeto.nome} ${projeto.azure_id} ${projeto.sponsor}`);
      return (!busca || pilha.includes(busca)) && (!status || projeto.status === status);
    });

    const selecionado = estado.projetoId;
    $("projectSelect").innerHTML = '<option value="">Selecione um projeto…</option>';
    filtrados.forEach((projeto) => {
      const option = document.createElement("option");
      option.value = projeto.id;
      option.textContent = `${projeto.nome} · ${projeto.status || "Sem status"}`;
      $("projectSelect").appendChild(option);
    });
    if (filtrados.some((p) => p.id === selecionado)) $("projectSelect").value = selecionado;
    $("projectMatchCount").textContent = `${filtrados.length} de ${estado.projetos.length} projeto(s) exibido(s).`;
  }

  function selecionarProjeto(id) {
    estado.projetoId = id || null;
    estado.edicaoVisualizada = null;
    estado.origemPreview = null;
    $("editorWorkspace").hidden = !estado.projetoId;
    mostrarFeedback("");
    if (!estado.projetoId) return;

    const projeto = projetoAtual();
    $("selectedProjectTitle").textContent = projeto.nome;
    $("selectedProjectMeta").textContent = `ID ${projeto.azure_id} · ${projeto.status || "Sem status"}`;
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
    $("editorWorkspace").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function metadado(rotulo, valor) {
    return `<div><dt>${escapar(rotulo)}</dt><dd>${escapar(valor || "—")}</dd></div>`;
  }

  function renderizarOrigem() {
    const origem = origemAtual();
    const projeto = origem.projeto || {};
    const tarefas = Array.isArray(origem.tarefas) ? origem.tarefas : [];

    $("sourceMetadata").innerHTML = [
      metadado("ID", projeto.azure_id),
      metadado("Status", projeto.status),
      metadado("Início", formatarData(projeto.data_inicio)),
      metadado("Fim", formatarData(projeto.data_fim)),
      metadado("Sponsor", projeto.sponsor),
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
        <strong>${escapar(tarefa.descricao || "Ação sem descrição")}</strong>
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
    const projeto = origem.projeto || projetoAtual() || {};
    const tarefas = Array.isArray(origem.tarefas) ? origem.tarefas : [];
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
        ${metadadoRelatorio("Sponsor", projeto.sponsor)}
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
    $("projectSearch").addEventListener("input", filtrarProjetos);
    $("statusFilter").addEventListener("change", filtrarProjetos);
    $("projectSelect").addEventListener("change", (evento) => selecionarProjeto(evento.target.value));
    $("addEvidenceButton").addEventListener("click", () => {
      adicionarEvidencia();
      atualizarPreview();
    });
    Object.values(campos).forEach((id) => $(id).addEventListener("input", atualizarPreview));
    $("saveDraftButton").addEventListener("click", () => salvar(false));
    $("finalizeButton").addEventListener("click", () => salvar(true));
    $("printDraftButton").addEventListener("click", imprimirRelatorio);
  }

  document.addEventListener("DOMContentLoaded", () => {
    ligarEventos();
    carregarDados();
  });
})();
