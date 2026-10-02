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

      const [pAtual, tAtual, iAtual] = await Promise.all([
        sb.from("pq_projetos_atual").select("*").eq("ativo", true).order("projeto", { ascending: true }),
        sb.from("pq_tarefas_atual").select("*").eq("ativo", true).order("projeto", { ascending: true }),
        sb.from("pq_importacoes_atual").select("*").order("created_at", { ascending: false }).limit(10)
      ]);

      let p = pAtual;
      let t = tAtual;
      let i = iAtual;

      // Compatibilidade: enquanto a nova base ainda estiver vazia,
      // usa a estrutura histórica para não quebrar o painel.
      if ((pAtual.error || !(pAtual.data || []).length) && (tAtual.error || !(tAtual.data || []).length)) {
        [p, t] = await Promise.all([
          sb.from("pq_projetos").select("*").order("id", { ascending: true }),
          sb.from("pq_tarefas").select("*").order("id", { ascending: true })
        ]);
      }

      if (iAtual.error || !(iAtual.data || []).length) {
        i = await sb.from("pq_importacoes").select("*").order("created_at", { ascending: false }).limit(10);
      }

      if (p.error) throw new Error(p.error.message || JSON.stringify(p.error));
      if (t.error) throw new Error(t.error.message || JSON.stringify(t.error));

      projetos = (p.data || []).filter(x => x.ativo !== false);
      tarefas = (t.data || []).filter(x => x.ativo !== false);
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
    if (fonte) fonte.textContent = `Base atual · ${projetos.length} projetos · ${tarefas.length} tarefas`;

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


  function excelDateToISO(v) {
    if (v === null || v === undefined || v === "") return null;

    if (v instanceof Date && !Number.isNaN(v.getTime())) {
      return v.toISOString().slice(0, 10);
    }

    // Excel stores many dates as serial numbers (e.g. 46090).
    // Convert without depending on SheetJS date helpers.
    const numero = Number(v);
    if (Number.isFinite(numero) && numero > 20000 && numero < 80000) {
      const diasInteiros = Math.floor(numero);
      const baseUtc = Date.UTC(1899, 11, 30);
      const d = new Date(baseUtc + diasInteiros * 86400000);
      return d.toISOString().slice(0, 10);
    }

    const s = String(v).trim();

    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (br) {
      return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
    }

    return s || null;
  }

  function prepararLinhasProjetoQualidade(rows) {
    return rows.map(r => ({
      "ID": r["ID"] ?? null,
      "Work Item Type": r["Work Item Type"] ?? null,
      "Projetos": r["Projetos"] ?? r["Projeto"] ?? null,

      "Contexto / Objetivo":
        r["Contexto / Objetivo"] ??
        r["Contexto/Objetivo"] ??
        r["Contexto"] ??
        null,

      "Objetivo":
        r["Objetivo"] ??
        null,

      "Resultados Esperados":
        r["Resultados Esperados"] ??
        r["Resultados esperados"] ??
        r["Resultado Esperado"] ??
        null,

      "Ações":
        r["Ações"] ??
        r["Ações / Tarefas"] ??
        r["Acoes"] ??
        r["Acoes / Tarefas"] ??
        r["Tarefa"] ??
        r["Tarefas"] ??
        null,

      "State":
        r["State"] ??
        r["Status"] ??
        null,

      "Start Date": excelDateToISO(
        r["Start Date"] ??
        r["Data de inicio"] ??
        r["Data de início"] ??
        null
      ),

      "Target Date": excelDateToISO(
        r["Target Date"] ??
        r["Data de fim"] ??
        r["Data fim"] ??
        null
      ),

      "Sponsor":
        r["Sponsor"] ??
        r["Responsável"] ??
        r["Responsavel"] ??
        null,

      "Esforço":
        r["Esforço"] ??
        r["Esforco"] ??
        null,

      "Prioridade": r["Prioridade"] ?? null,
      "Impacto": r["Impacto"] ?? null,

      "Resultados Alcançados":
        r["Resultados Alcançados"] ??
        r["Resultados Alcancados"] ??
        null,

      "link evidências":
        r["link evidências"] ??
        r["link evidencias"] ??
        null,

      "Operações EAD":
        r["Operações EAD"] ??
        r["Operacoes EAD"] ??
        null,

      "__aba_origem": r["__aba_origem"] ?? null,
      "__linha_origem": r["__linha_origem"] ?? null,

      // Preserva TODAS as colunas que existirem na planilha, inclusive antes
      // de uma reconciliação de nome de projeto.
      "__dados_originais": r["__dados_originais_original"] ?? r
    }));
  }

  function tipoLinhaImportacao(row) {
    const n = norm(row["Work Item Type"]);
    const projeto = txt(row["Projetos"] || row["Projeto"]);
    const acao = txt(row["Ações"] || row["Ações / Tarefas"] || row["Tarefa"]);
    if (n.includes("projeto")) return "projeto";
    if (n.includes("tarefa") || n.includes("action plan")) return "tarefa";
    if (projeto && acao) return "tarefa";
    return "nao_reconhecida";
  }

  function diagnosticoLocalImportacao(rows, abasParaLer, reconciliacoes = []) {
    const porAba = new Map();
    let projetos = 0;
    let tarefas = 0;
    let naoReconhecidas = 0;

    rows.forEach((row) => {
      const aba = txt(row.__aba_origem) || "Sem aba";
      const item = porAba.get(aba) || { linhas: 0, projetos: 0, tarefas: 0, naoReconhecidas: 0 };
      const tipo = tipoLinhaImportacao(row);
      item.linhas += 1;
      if (tipo === "projeto") { projetos += 1; item.projetos += 1; }
      else if (tipo === "tarefa") { tarefas += 1; item.tarefas += 1; }
      else { naoReconhecidas += 1; item.naoReconhecidas += 1; }
      porAba.set(aba, item);
    });

    return {
      linhas: rows.length,
      projetos,
      tarefas,
      naoReconhecidas,
      abas: abasParaLer.map((aba) => ({ aba, ...(porAba.get(aba) || { linhas: 0, projetos: 0, tarefas: 0, naoReconhecidas: 0 }) })),
      reconciliacoes,
      tarefasReconciliadas: reconciliacoes.length,
    };
  }

  async function conferirSnapshotImportado(esperado) {
    const sb = window.biSupabase;
    const [p, t] = await Promise.all([
      sb.from("pq_projetos_atual").select("id", { count: "exact", head: true }).eq("ativo", true),
      sb.from("pq_tarefas_atual").select("id", { count: "exact", head: true }).eq("ativo", true),
    ]);

    if (p.error || t.error) {
      return { ok: false, erro: p.error?.message || t.error?.message || "Não foi possível conferir o snapshot." };
    }

    const projetosBanco = Number(p.count || 0);
    const tarefasBanco = Number(t.count || 0);
    return {
      ok: projetosBanco === esperado.projetos && tarefasBanco === esperado.tarefas,
      projetosBanco,
      tarefasBanco,
      diferencaProjetos: projetosBanco - esperado.projetos,
      diferencaTarefas: tarefasBanco - esperado.tarefas,
    };
  }

  function htmlDiagnosticoImportacao(diag, conferencia, payload) {
    const abas = diag.abas.map((item) => `
      <tr>
        <td>${escapeHtml(item.aba)}</td>
        <td>${item.linhas}</td>
        <td>${item.projetos}</td>
        <td>${item.tarefas}</td>
        <td>${item.naoReconhecidas}</td>
      </tr>`).join("");

    const banco = conferencia?.erro
      ? `<div class="pq-import-audit-warning">Conferência do banco indisponível: ${escapeHtml(conferencia.erro)}</div>`
      : `<div class="pq-import-audit-${conferencia?.ok ? "ok" : "warning"}">
          <b>Conferência após importação:</b>
          Planilha ${diag.projetos} projetos / ${diag.tarefas} tarefas ·
          Banco ${conferencia?.projetosBanco ?? "—"} projetos / ${conferencia?.tarefasBanco ?? "—"} tarefas.
          ${conferencia?.ok ? "Os totais batem." : "Há diferença e nenhuma linha deve ser considerada descartada silenciosamente."}
        </div>`;

    const erros = Array.isArray(payload?.erros) && payload.erros.length
      ? `<details class="pq-import-audit-errors"><summary>${payload.erros.length} ocorrência(s) informada(s) pelo importador</summary><ul>${payload.erros.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul></details>`
      : "";

    return `
      <div class="pq-import-audit">
        <strong>Auditoria da planilha</strong>
        <div class="pq-import-summary">
          <span><b>${diag.linhas}</b> linhas lidas</span>
          <span><b>${diag.projetos}</b> projetos</span>
          <span><b>${diag.tarefas}</b> tarefas</span>
          <span><b>${diag.tarefasReconciliadas || 0}</b> tarefas reconciliadas</span>
          <span><b>${diag.naoReconhecidas}</b> não reconhecidas</span>
        </div>
        <div class="table-scroll">
          <table class="data-table pq-import-audit-table">
            <thead><tr><th>Aba</th><th>Linhas</th><th>Projetos</th><th>Tarefas</th><th>Não reconhecidas</th></tr></thead>
            <tbody>${abas}</tbody>
          </table>
        </div>
        ${diag.reconciliacoes?.length ? `<details class="pq-import-audit-errors"><summary>${diag.reconciliacoes.length} tarefa(s) vinculada(s) a projeto renomeado</summary><ul>${diag.reconciliacoes.slice(0, 30).map((r) => `<li>${escapeHtml(r.de)} → ${escapeHtml(r.para)} (ID ${escapeHtml(r.id || "—")})</li>`).join("")}</ul></details>` : ""}
        ${banco}
        ${erros}
      </div>`;
  }

  function configurarImportacaoPQ() {
    const input = $("pqArquivoAtualizacao");
    const btn = $("pqBtnImportar");
    const nome = $("pqArquivoNome");
    const status = $("pqImportStatus");
    const resultado = $("pqImportResultado");

    if (!input || !btn || input.dataset.ready === "1") return;
    input.dataset.ready = "1";

    input.addEventListener("change", () => {
      const file = input.files?.[0];

      if (!file) {
        nome.textContent = "Nenhum arquivo selecionado";
        btn.disabled = true;
        status.textContent = "Aguardando planilha.";
        return;
      }

      const low = file.name.toLowerCase();
      if (!low.endsWith(".xlsx") && !low.endsWith(".xls")) {
        nome.textContent = file.name;
        btn.disabled = true;
        status.textContent = "Selecione um arquivo Excel (.xlsx ou .xls).";
        return;
      }

      nome.textContent = `${file.name} · ${(file.size / 1024 / 1024).toLocaleString("pt-BR", {maximumFractionDigits:1})} MB`;
      btn.disabled = false;
      status.textContent = "Planilha pronta para atualização.";
      resultado.hidden = true;
      resultado.innerHTML = "";
    });

    btn.addEventListener("click", async () => {
      const file = input.files?.[0];
      if (!file) return;

      btn.disabled = true;
      btn.textContent = "Processando...";
      status.textContent = "Lendo a planilha no seu computador...";
      resultado.hidden = true;

      try {
        if (!window.XLSX) {
          throw new Error("Leitor de Excel não carregado. Atualize a página com Ctrl+F5.");
        }

        const { data: sessionData, error: sessionError } = await window.biSupabase.auth.getSession();
        const session = sessionData?.session;

        if (sessionError || !session?.access_token) {
          throw new Error("Sessão expirada. Entre novamente no BI.");
        }

        const buffer = await file.arrayBuffer();
        const workbook = window.XLSX.read(buffer, {
          type: "array",
          cellDates: true,
          cellText: false
        });

        const normalizarAba = (v) => String(v || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase();

        // As abas de status podem mudar o sufixo de data (ex.: Em Progresso_09_09).
        // Por isso, localizamos cada aba pelo status e não por um nome/data fixos.
        const encontrarAbaStatus = (statusBase) => {
          const alvo = normalizarAba(statusBase);

          return workbook.SheetNames.find(nome => {
            const atual = normalizarAba(nome);
            return atual === alvo ||
              atual.startsWith(`${alvo}_`) ||
              atual.startsWith(`${alvo} `) ||
              atual.startsWith(`${alvo}-`);
          }) || null;
        };

        const abasEncontradas = [
          encontrarAbaStatus("Em Progresso"),
          encontrarAbaStatus("Não Iniciado"),
          encontrarAbaStatus("Pausado"),
          encontrarAbaStatus("Finalizados")
        ].filter(Boolean);

        const abasParaLer = abasEncontradas.length
          ? [...new Set(abasEncontradas)]
          : [
              workbook.SheetNames.includes("Work item e filhos (1)")
                ? "Work item e filhos (1)"
                : workbook.SheetNames[0]
            ];

        const rawRows = [];
        abasParaLer.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          if (!worksheet) return;

          const dados = window.XLSX.utils.sheet_to_json(worksheet, {
            defval: null,
            raw: true
          });

          dados.forEach((row, indice) => rawRows.push({
            ...row,
            __aba_origem: sheetName,
            __linha_origem: indice + 2
          }));
        });

        if (!rawRows.length) {
          throw new Error("Nenhuma linha foi localizada nas abas atuais da planilha.");
        }

        // Reconciliação segura de projetos renomeados.
        // Exemplo real da planilha atual: as tarefas ainda usam
        // "Validação em Período de Férias Docentes", enquanto o projeto ID 384403
        // passou a se chamar "Validação em Período de Recesso de Aulas".
        // Usamos a aba histórica apenas como mapa nome antigo -> ID e mantemos as
        // quatro abas atuais como fonte oficial do snapshot.
        const nomeProjetoLinha = (row) => String(row["Projetos"] ?? row["Projeto"] ?? "").trim();
        const tipoLinhaBruto = (row) => normalizarAba(row["Work Item Type"]);
        const projetosAtuaisPorId = new Map();
        const nomesProjetosAtuais = new Set();

        rawRows.forEach((row) => {
          if (!tipoLinhaBruto(row).includes("projeto")) return;
          const id = String(row["ID"] ?? "").trim();
          const nomeAtual = nomeProjetoLinha(row);
          if (nomeAtual) nomesProjetosAtuais.add(normalizarAba(nomeAtual));
          if (id && nomeAtual) projetosAtuaisPorId.set(id, nomeAtual);
        });

        const projetoIdHistoricoPorNome = new Map();
        const abaHistorica = workbook.Sheets["Work item e filhos (1)"];
        if (abaHistorica) {
          const historico = window.XLSX.utils.sheet_to_json(abaHistorica, { defval: null, raw: true });
          historico.forEach((row) => {
            if (!normalizarAba(row["Work Item Type"]).includes("projeto")) return;
            const id = String(row["ID"] ?? "").trim();
            const nomeAntigo = nomeProjetoLinha(row);
            if (id && nomeAntigo) projetoIdHistoricoPorNome.set(normalizarAba(nomeAntigo), id);
          });
        }

        const reconciliacoes = [];
        rawRows.forEach((row) => {
          const tipo = tipoLinhaBruto(row);
          if (!(tipo.includes("tarefa") || tipo.includes("action plan") || (!tipo && nomeProjetoLinha(row) && (row["Ações"] || row["Ações / Tarefas"])))) return;

          const nomeInformado = nomeProjetoLinha(row);
          const chaveNome = normalizarAba(nomeInformado);
          if (!nomeInformado || nomesProjetosAtuais.has(chaveNome)) return;

          const idPai = projetoIdHistoricoPorNome.get(chaveNome);
          const nomeAtual = idPai ? projetosAtuaisPorId.get(idPai) : "";
          if (!nomeAtual || normalizarAba(nomeAtual) === chaveNome) return;

          row.__dados_originais_original = { ...row };
          row.__projeto_nome_original = nomeInformado;
          row.__projeto_id_reconciliado = idPai;
          if (Object.prototype.hasOwnProperty.call(row, "Projeto")) row["Projeto"] = nomeAtual;
          if (Object.prototype.hasOwnProperty.call(row, "Projetos")) row["Projetos"] = nomeAtual;
          if (!Object.prototype.hasOwnProperty.call(row, "Projeto") && !Object.prototype.hasOwnProperty.call(row, "Projetos")) row["Projetos"] = nomeAtual;

          reconciliacoes.push({ de: nomeInformado, para: nomeAtual, id: idPai, aba: row.__aba_origem, linha: row.__linha_origem });
        });

        const rowsPreparadas = prepararLinhasProjetoQualidade(rawRows);

        // Valores como "NOVO" são marcadores da planilha, não IDs reais.
        // Se forem tratados como ID, projetos/tarefas diferentes acabam sendo descartados.
        const idEhPlaceholder = (v) => {
          const n = String(v || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim()
            .toLowerCase();

          return [
            "novo",
            "nova",
            "new",
            "n/a",
            "na",
            "sem id",
            "s/id",
            "-"
          ].includes(n);
        };

        // A importação deve ser monotônica em relação à planilha: uma linha válida
        // não pode sumir no navegador. IDs de placeholder são enviados como nulos e
        // cada linha mantém aba + número de origem para ganhar uma chave estável no snapshot.
        const rows = rowsPreparadas.map(row => {
          const copia = { ...row };
          const idBruto = String(copia["ID Azure"] || copia["ID"] || "").trim();
          if (idEhPlaceholder(idBruto)) {
            if ("ID Azure" in copia) copia["ID Azure"] = null;
            copia["ID"] = null;
          }
          return copia;
        });

        const diagnostico = diagnosticoLocalImportacao(rows, abasParaLer, reconciliacoes);
        status.textContent = `${diagnostico.linhas} linha(s): ${diagnostico.projetos} projeto(s) e ${diagnostico.tarefas} tarefa(s). Enviando atualização...`;
        btn.textContent = "Enviando...";

        const response = await fetch(
          `${window.BI_CONFIG.SUPABASE_URL}/functions/v1/import-projeto-qualidade`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
              apikey: window.BI_CONFIG.SUPABASE_PUBLISHABLE_KEY
            },
            body: JSON.stringify({
              arquivo_nome: file.name,
              arquivo_tamanho: file.size,
              aba: abasParaLer.join(", "),
              abas: abasParaLer,
              diagnostico_cliente: diagnostico,
              rows
            })
          }
        );

        const payload = await response.json().catch(() => ({}));

        if (!response.ok || payload?.success === false) {
          const detalhe = payload?.error || payload?.mensagem || `Falha HTTP ${response.status}`;
          throw new Error(
            typeof detalhe === "string"
              ? detalhe
              : JSON.stringify(detalhe)
          );
        }

        const conferencia = await conferirSnapshotImportado(diagnostico);
        console.info("[Projeto Qualidade] Auditoria da importação", { diagnostico, payload, conferencia });

        resultado.hidden = false;
        resultado.innerHTML = `
          <strong>Atualização concluída.</strong>
          <div class="pq-import-summary">
            <span><b>${payload.total_linhas ?? 0}</b> linhas recebidas</span>
            <span><b>${payload.projetos_gravados ?? 0}</b> projetos gravados</span>
            <span><b>${payload.tarefas_gravadas ?? 0}</b> tarefas gravadas</span>
            <span><b>${payload.linhas_com_erro ?? 0}</b> erros</span>
          </div>
          <small>${escapeHtml(payload.mensagem || "Base atualizada com sucesso.")}</small>
          ${htmlDiagnosticoImportacao(diagnostico, conferencia, payload)}
        `;

        status.textContent = conferencia.ok
          ? "Projeto Qualidade atualizado e conferido com a planilha."
          : "Projeto Qualidade atualizado, mas a conferência encontrou diferença nos totais.";
        input.value = "";
        nome.textContent = "Nenhum arquivo selecionado";

        carregado = false;
        await carregar();
      } catch (e) {
        console.error("Importação Projeto Qualidade:", e);
        resultado.hidden = false;
        resultado.innerHTML = `
          <strong>Não foi possível atualizar.</strong>
          <small>${escapeHtml(e?.message || "Erro desconhecido")}</small>
        `;
        status.textContent = "A atualização não foi concluída.";
      } finally {
        btn.textContent = "Enviar atualização para o banco";
        btn.disabled = !input.files?.[0];
      }
    });
  }

  function configurar() {
    configurarImportacaoPQ();
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
