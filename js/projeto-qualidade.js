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
      return v.toISOString();
    }

    if (typeof v === "number" && window.XLSX?.SSF?.parse_date_code) {
      const d = window.XLSX.SSF.parse_date_code(v);
      if (d) {
        const mm = String(d.m).padStart(2, "0");
        const dd = String(d.d).padStart(2, "0");
        return `${d.y}-${mm}-${dd}`;
      }
    }

    return v;
  }

  function prepararLinhasProjetoQualidade(rows) {
    return rows.map(r => ({
      "ID": r["ID"] ?? null,
      "Work Item Type": r["Work Item Type"] ?? null,
      "Projetos": (r["Projetos"] ?? r["Projeto"]) ?? r["Projeto"] ?? null,
      "Ações": r["Ações"] ?? r["Acoes"] ?? null,
      "State": (r["State"] ?? r["Status"]) ?? null,
      "Start Date": excelDateToISO(r["Start Date"]),
      "Target Date": excelDateToISO(r["Target Date"]),
      "Sponsor": (r["Sponsor"] ?? r["Responsável"] ?? r["Responsavel"]) ?? null,
      "Esforço": r["Esforço"] ?? r["Esforco"] ?? null,
      "Prioridade": r["Prioridade"] ?? null,
      "link evidências": r["link evidências"] ?? r["link evidencias"] ?? null
    }));
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

        const abasPrioritarias = [
          "Em Progresso_14_08",
          "Não Iniciado",
          "Pausado",
          "Finalizados"
        ];

        const normalizarAba = (v) => String(v || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase();

        const mapaAbas = new Map(
          workbook.SheetNames.map(nome => [normalizarAba(nome), nome])
        );

        const abasEncontradas = abasPrioritarias
          .map(nome => mapaAbas.get(normalizarAba(nome)))
          .filter(Boolean);

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

          dados.forEach(row => rawRows.push({
            ...row,
            __aba_origem: sheetName
          }));
        });

        if (!rawRows.length) {
          throw new Error("Nenhuma linha foi localizada nas abas atuais da planilha.");
        }

        const rowsPreparadas = prepararLinhasProjetoQualidade(rawRows);
        const vistos = new Set();
        const rows = rowsPreparadas.filter(row => {
          const id = String(row["ID Azure"] || row["ID"] || "").trim();
          const projeto = String(row["Projetos"] || row["Projeto"] || "").trim().toLowerCase();
          const acao = String(row["Ações"] || row["Ações / Tarefas"] || row["Tarefa"] || "").trim().toLowerCase();
          const sponsor = String(row["Sponsor"] || row["Responsável"] || row["Responsavel"] || "").trim().toLowerCase();
          const chave = id ? `id:${id}` : `txt:${projeto}|${acao}|${sponsor}`;
          if (vistos.has(chave)) return false;
          vistos.add(chave);
          return true;
        });

        status.textContent = `${rows.length} linha(s) únicas em ${abasParaLer.length} aba(s). Enviando atualização...`;
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

        resultado.hidden = false;
        resultado.innerHTML = `
          <strong>Atualização concluída.</strong>
          <div class="pq-import-summary">
            <span><b>${payload.total_linhas ?? 0}</b> linhas</span>
            <span><b>${payload.projetos_gravados ?? 0}</b> projetos</span>
            <span><b>${payload.tarefas_gravadas ?? 0}</b> tarefas</span>
            <span><b>${payload.linhas_com_erro ?? 0}</b> erros</span>
          </div>
          <small>${escapeHtml(payload.mensagem || "Base atualizada com sucesso.")}</small>
        `;

        status.textContent = "Projeto Qualidade atualizado com sucesso.";
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
