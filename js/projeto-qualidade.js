(() => {
  "use strict";

  let carregado = false;
  let carregando = false;
  let projetos = [];
  let tarefas = [];
  let importacoes = [];

  const $ = id => document.getElementById(id);

  function txt(v) {
    return String(v ?? "").replace(/\s+/g, " ").trim();
  }

  function norm(v) {
    return txt(v)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function escapeHtml(v) {
    return txt(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizarStatus(v) {
    const n = norm(v);
    if (!n) return "Não informado";
    if (n.includes("finaliz") || n.includes("conclu")) return "Finalizado";
    if (n.includes("progres")) return "Em Progresso";
    if (n.includes("fazer")) return "A Fazer";
    if (n.includes("paus")) return "Pausado";
    return txt(v);
  }

  function dataBR(v) {
    if (!v) return "--";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return txt(v);
    return d.toLocaleDateString("pt-BR");
  }

  function popularSelect(id, valores) {
    const el = $(id);
    if (!el) return;
    const atual = el.value;
    const unicos = [...new Set(valores.map(txt).filter(Boolean))]
      .sort((a,b) => a.localeCompare(b, "pt-BR"));
    el.innerHTML = '<option value="">Todos</option>' +
      unicos.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
    if (unicos.includes(atual)) el.value = atual;
  }

  async function carregar() {
    if (carregando) return;
    carregando = true;

    try {
      const sb = window.biSupabase;
      if (!sb) throw new Error("Cliente Supabase não disponível.");

      const [p, t, i] = await Promise.all([
        sb.from("pq_projetos").select("*").order("id", { ascending: true }),
        sb.from("pq_tarefas").select("*").order("id", { ascending: true }),
        sb.from("pq_importacoes").select("*").order("created_at", { ascending: false }).limit(10)
      ]);

      if (p.error) throw p.error;
      if (t.error) throw t.error;

      projetos = p.data || [];
      tarefas = t.data || [];
      importacoes = i.error ? [] : (i.data || []);

      popularSelect("pqFiltroStatus", projetos.map(x => normalizarStatus(x.status)));
      popularSelect("pqFiltroSponsor", projetos.map(x => x.sponsor || x.responsavel || x.patrocinador));

      carregado = true;
      render();
    } catch (e) {
      console.error("Projeto Qualidade:", e);
      const lista = $("pqListaProjetos");
      if (lista) {
        lista.innerHTML = `<div class="pq-error"><strong>Não foi possível carregar o Projeto Qualidade.</strong><span>${escapeHtml(e?.message || "Erro desconhecido")}</span></div>`;
      }
      const fonte = $("pqFonte");
      if (fonte) fonte.textContent = "Falha ao carregar Supabase";
    } finally {
      carregando = false;
    }
  }

  function projetoId(p) {
    return txt(p.id_azure || p.projeto_id || p.id || p.codigo || p.id_projeto);
  }

  function tarefaProjetoId(t) {
    return txt(t.projeto_id || t.pq_projeto_id || t.id_projeto || t.projeto_fk || t.projeto_id_azure);
  }

  function nomeProjeto(p) {
    return txt(p.projeto || p.nome || p.titulo || p.name || p.nome_projeto) || `Projeto ${projetoId(p)}`;
  }

  function nomeTarefa(t) {
    return txt(t.acao || t.tarefa || t.nome || t.titulo || t.name) || `Tarefa ${txt(t.id)}`;
  }

  function sponsorProjeto(p) {
    return txt(p.sponsor || p.responsavel || p.patrocinador || p.owner) || "Não informado";
  }

  function statusProjeto(p) {
    return normalizarStatus(p.status || p.state || p.situacao);
  }

  function tarefasDoProjeto(p) {
    const pid = projetoId(p);
    const nome = norm(nomeProjeto(p));

    return tarefas.filter(t => {
      const fk = tarefaProjetoId(t);
      if (pid && fk && fk === pid) return true;

      const nomePai = norm(t.projeto || t.projeto_nome || t.nome_projeto || t.parent_project);
      return !!nomePai && nomePai === nome;
    });
  }

  function tarefasSemVinculo() {
    return tarefas.filter(t => {
      const fk = tarefaProjetoId(t);
      const nomePai = norm(t.projeto || t.projeto_nome || t.nome_projeto || t.parent_project);

      return !projetos.some(p => {
        const pid = projetoId(p);
        if (fk && pid && fk === pid) return true;
        return nomePai && nomePai === norm(nomeProjeto(p));
      });
    });
  }

  function aplicarFiltros() {
    const busca = norm($("pqBusca")?.value);
    const status = txt($("pqFiltroStatus")?.value);
    const sponsor = txt($("pqFiltroSponsor")?.value);

    return projetos.filter(p => {
      const tp = tarefasDoProjeto(p);
      const haystack = norm([
        nomeProjeto(p),
        sponsorProjeto(p),
        statusProjeto(p),
        p.prioridade,
        p.esforco,
        ...tp.map(nomeTarefa),
        ...tp.map(x => x.status || x.state || x.situacao)
      ].join(" | "));

      if (busca && !haystack.includes(busca)) return false;
      if (status && statusProjeto(p) !== status) return false;
      if (sponsor && sponsorProjeto(p) !== sponsor) return false;
      return true;
    });
  }

  function statusClass(status) {
    const n = norm(status);
    if (n.includes("final")) return "finalizado";
    if (n.includes("progres")) return "progresso";
    if (n.includes("fazer")) return "afazer";
    if (n.includes("paus")) return "pausado";
    return "neutro";
  }

  function renderKPIs() {
    const emProgresso = projetos.filter(p => statusProjeto(p) === "Em Progresso").length;
    const finalizados = projetos.filter(p => statusProjeto(p) === "Finalizado").length;
    const semVinculo = tarefasSemVinculo().length;

    if ($("pqTotalProjetos")) $("pqTotalProjetos").textContent = projetos.length.toLocaleString("pt-BR");
    if ($("pqTotalTarefas")) $("pqTotalTarefas").textContent = tarefas.length.toLocaleString("pt-BR");
    if ($("pqEmProgresso")) $("pqEmProgresso").textContent = emProgresso.toLocaleString("pt-BR");
    if ($("pqFinalizados")) $("pqFinalizados").textContent = finalizados.toLocaleString("pt-BR");
    if ($("pqSemVinculo")) $("pqSemVinculo").textContent = semVinculo.toLocaleString("pt-BR");
  }

  function renderLista() {
    const lista = $("pqListaProjetos");
    if (!lista) return;

    const filtrados = aplicarFiltros();

    if ($("pqResumoFiltro")) {
      $("pqResumoFiltro").textContent = `${filtrados.length} de ${projetos.length} projetos exibidos`;
    }

    if (!filtrados.length) {
      lista.innerHTML = '<div class="pq-empty">Nenhum projeto encontrado com os filtros selecionados.</div>';
      return;
    }

    lista.innerHTML = filtrados.map(p => {
      const ts = tarefasDoProjeto(p);
      const status = statusProjeto(p);
      const finalizadas = ts.filter(t => normalizarStatus(t.status || t.state || t.situacao) === "Finalizado").length;
      const inicio = p.data_inicio || p.start_date || p.inicio;
      const fim = p.data_fim || p.target_date || p.fim;

      const tarefasHtml = ts.length
        ? ts.map(t => {
            const st = normalizarStatus(t.status || t.state || t.situacao);
            return `<tr>
              <td>${escapeHtml(nomeTarefa(t))}</td>
              <td><span class="pq-status pq-status-${statusClass(st)}">${escapeHtml(st)}</span></td>
              <td>${escapeHtml(dataBR(t.data_inicio || t.start_date || t.inicio))}</td>
              <td>${escapeHtml(dataBR(t.data_fim || t.target_date || t.fim))}</td>
            </tr>`;
          }).join("")
        : '<tr><td colspan="4">Nenhuma tarefa vinculada.</td></tr>';

      return `<article class="pq-project-card">
        <button type="button" class="pq-project-toggle" aria-expanded="false">
          <div class="pq-project-main">
            <span class="pq-status pq-status-${statusClass(status)}">${escapeHtml(status)}</span>
            <strong>${escapeHtml(nomeProjeto(p))}</strong>
            <small>${escapeHtml(sponsorProjeto(p))}</small>
          </div>
          <div class="pq-project-metrics">
            <span><b>${ts.length}</b> tarefas</span>
            <span><b>${finalizadas}</b> finalizadas</span>
            <span>${escapeHtml(p.prioridade || "--")}</span>
            <span class="pq-chevron">⌄</span>
          </div>
        </button>

        <div class="pq-project-details" hidden>
          <div class="pq-project-meta">
            <span><b>ID:</b> ${escapeHtml(projetoId(p) || "--")}</span>
            <span><b>Início:</b> ${escapeHtml(dataBR(inicio))}</span>
            <span><b>Fim:</b> ${escapeHtml(dataBR(fim))}</span>
            <span><b>Esforço:</b> ${escapeHtml(p.esforco || "--")}</span>
            <span><b>Prioridade:</b> ${escapeHtml(p.prioridade || "--")}</span>
          </div>

          <div class="table-scroll">
            <table class="data-table pq-task-table">
              <thead><tr><th>Tarefa / Ação</th><th>Status</th><th>Início</th><th>Fim</th></tr></thead>
              <tbody>${tarefasHtml}</tbody>
            </table>
          </div>
        </div>
      </article>`;
    }).join("");
  }

  function renderImportacao() {
    const fonte = $("pqFonte");
    if (fonte) fonte.textContent = `Dados reais · ${projetos.length} projetos · ${tarefas.length} tarefas`;

    const ultima = importacoes[0];
    const el = $("pqUltimaImportacao");
    if (!el) return;

    if (!ultima) {
      el.textContent = "Última importação: não localizada";
      return;
    }

    const dt = ultima.finished_at || ultima.created_at;
    const d = dt ? new Date(dt) : null;
    const quando = d && !Number.isNaN(d.getTime())
      ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
      : "--";

    const total = ultima.total_linhas ?? "";
    el.textContent = `Última importação: ${quando}${total !== "" ? ` · ${total} linhas` : ""}`;
  }

  function render() {
    renderKPIs();
    renderLista();
    renderImportacao();
  }

  function configurar() {
    const busca = $("pqBusca");
    const status = $("pqFiltroStatus");
    const sponsor = $("pqFiltroSponsor");
    const limpar = $("pqLimparFiltros");
    const lista = $("pqListaProjetos");

    if (busca && busca.dataset.ready !== "1") {
      busca.dataset.ready = "1";
      busca.addEventListener("input", renderLista);
    }

    [status, sponsor].forEach(el => {
      if (el && el.dataset.ready !== "1") {
        el.dataset.ready = "1";
        el.addEventListener("change", renderLista);
      }
    });

    if (limpar && limpar.dataset.ready !== "1") {
      limpar.dataset.ready = "1";
      limpar.addEventListener("click", () => {
        if (busca) busca.value = "";
        if (status) status.value = "";
        if (sponsor) sponsor.value = "";
        renderLista();
      });
    }

    if (lista && lista.dataset.ready !== "1") {
      lista.dataset.ready = "1";
      lista.addEventListener("click", ev => {
        const btn = ev.target.closest(".pq-project-toggle");
        if (!btn) return;
        const details = btn.parentElement?.querySelector(".pq-project-details");
        if (!details) return;
        const abrir = details.hidden;
        details.hidden = !abrir;
        btn.setAttribute("aria-expanded", abrir ? "true" : "false");
      });
    }
  }

  async function atualizarProjetoQualidade() {
    configurar();
    if (!carregado) {
      await carregar();
    } else {
      render();
    }
  }

  window.atualizarProjetoQualidade = atualizarProjetoQualidade;
})();
