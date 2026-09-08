(function () {
  "use strict";

  let resumo = null;
  let naoConformidades = null;
  let carregando = null;
  let grafico = null;
  let revisoresDistintos = null;
  let formacoesNQ = [];
  let experienciasNQ = [];
  let graficoCineNQ = null;
  let graficoFormacoesNQ = null;
  const fmt = new Intl.NumberFormat("pt-BR");

  function setText(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
  }

  function n(v) { return fmt.format(Number(v || 0)); }
  function pct(v) { return `${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`; }
  function dataBR(v) {
    if (!v) return "--";
    const [a,m,d] = String(v).slice(0,10).split("-");
    return `${d}/${m}/${a}`;
  }
  function escapeHtml(v) {
    return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  }

  async function carregar() {
    if (resumo && naoConformidades) return;
    if (carregando) return carregando;
    carregando = (async () => {
      const resumoView = window.BI_CONFIG?.REUNIAO_RESUMO_VIEW_NAME || "vw_nq_reuniao_resumo";
      const ncView = window.BI_CONFIG?.REUNIAO_NC_VIEW_NAME || "vw_nq_reuniao_nao_conformidades";
      const [r1, r2] = await Promise.all([
        window.biSupabase.from(resumoView).select("*").limit(1),
        window.biSupabase.from(ncView).select("criterio,nao_conformidades,criterios_avaliados,percentual_nao_conformidade").order("nao_conformidades", { ascending: false }).limit(10)
      ]);
      if (r1.error) throw r1.error;
      if (r2.error) throw r2.error;
      resumo = r1.data?.[0] || null;
      naoConformidades = r2.data || [];
      if (!resumo) throw new Error("A view de resumo da reunião não retornou dados.");

      // Revisores distintos: calculados diretamente da view consolidada no mesmo período.
      const nomes = new Set();
      let inicio = 0;
      const lote = 1000;
      while (true) {
        const { data, error } = await window.biSupabase
          .from(window.BI_CONFIG.VIEW_NAME)
          .select("revisor_validador,data_validacao")
          .gte("data_validacao", resumo.periodo_inicio)
          .lte("data_validacao", resumo.periodo_fim)
          .range(inicio, inicio + lote - 1);
        if (error) throw error;
        const parte = data || [];
        parte.forEach(item => String(item.revisor_validador || "").split(",").map(v => v.trim()).filter(Boolean).forEach(v => nomes.add(v)));
        if (parte.length < lote) break;
        inicio += lote;
      }
      revisoresDistintos = nomes.size;
    })();
    try { await carregando; } finally { carregando = null; }
  }

  function renderResumo() {
    setText("nqPeriodo", `${dataBR(resumo.periodo_inicio)} a ${dataBR(resumo.periodo_fim)}`);
    setText("nqUa", n(resumo.uas_validadas));
    setText("nqPp", n(resumo.pp_validados));
    setText("nqA1", n(resumo.a1_validadas));
    setText("nqA2", n(resumo.a2_validadas));
    setText("nqA3", n(resumo.a3_validadas));
    setText("nqLato", n(resumo.lato_validadas));
    setText("nqRevisores", n(revisoresDistintos));
    setText("nqTotal", n(resumo.total_materiais));
    setText("nqValidados", n(resumo.validados));
    setText("nqLiberados", n(resumo.liberados_validacao));
    setText("nqRevalidacao", n(resumo.revalidacao));
    setText("nqAjustes", n(resumo.ajustes_conteudista_da));
    setText("nqALiberar", n(resumo.a_liberar));
    setText("nqCriterios", n(resumo.criterios_avaliados));
    setText("nqConformes", n(resumo.conformes));
    setText("nqNaoConformes", n(resumo.nao_conformes));
    setText("nqTaxaConformidade", pct(resumo.taxa_conformidade));
    setText("nqTaxaNaoConformidade", pct(resumo.taxa_nao_conformidade));
  }

  function renderTabela() {
    const tbody = document.getElementById("tbodyNQConformidades");
    if (!tbody) return;
    tbody.innerHTML = naoConformidades.map(x => `<tr><td>${escapeHtml(x.criterio)}</td><td>${n(x.nao_conformidades)}</td><td>${n(x.criterios_avaliados)}</td><td>${pct(x.percentual_nao_conformidade)}</td></tr>`).join("") || '<tr><td colspan="4">Nenhuma não conformidade encontrada.</td></tr>';
  }

  function renderGrafico() {
    if (!window.echarts) return;
    const el = document.getElementById("graficoNQConformidades");
    if (!el) return;
    grafico ||= echarts.init(el);
    const dados = [...naoConformidades].reverse();
    grafico.setOption({
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 12, right: 24, top: 10, bottom: 10, containLabel: true },
      xAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: "#eee8f3" } } },
      yAxis: { type: "category", data: dados.map(x => x.criterio), axisLabel: { width: 180, overflow: "truncate", fontSize: 11 } },
      series: [{ type: "bar", data: dados.map(x => x.nao_conformidades), barMaxWidth: 18, itemStyle: { borderRadius: [0, 7, 7, 0] }, label: { show: true, position: "right" } }]
    });
  }

  async function atualizarReuniaoNQ() {
    const status = document.getElementById("nqStatus");
    try {
      await carregar();
      renderResumo();
      renderTabela();
      renderGrafico();
      configurarImportacaoNQ();
      await carregarHistoricoImportacoesNQ();
      configurarFiltroCoberturaNQ();
      await carregarFormacaoCoberturaNQ();
      renderCoberturaNQ();
      if (status) status.textContent = "Dados carregados diretamente das views executivas do Supabase.";
    } catch (e) {
      console.error("Erro ao carregar Reunião NQ:", e);
      if (status) status.textContent = "Erro ao carregar a página da reunião: " + (e?.message || "erro desconhecido");
    }
  }


  // ============================================================
  // V23 · Importação da base de especialistas NQ
  // ============================================================


  async function carregarFormacaoCoberturaNQ() {
    const [f, e] = await Promise.all([
      window.biSupabase.from("vw_nq_especialistas_formacoes")
        .select("especialista_id,professor,marca_area_contratante,marca_origem,titulacao_maxima,situacao_contratacao,formacao,area_formacao,area_cine,subarea_cine")
        .order("professor", { ascending: true }),
      window.biSupabase.from("nq_especialistas_experiencias")
        .select("especialista_id,area_experiencia")
    ]);
    if (f.error) throw f.error;
    if (e.error) console.warn("Experiências NQ:", e.error);
    formacoesNQ = (f.data || []).filter(r => r.professor);
    experienciasNQ = e.data || [];
  }

  function uniq(arr) {
    return [...new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== ""))];
  }

  function normalizar(v) {
    return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  }

  function renderKPIsCoberturaNQ() {
    const professores = uniq(formacoesNQ.map(r => r.professor));
    const formacoes = formacoesNQ.filter(r => r.formacao);
    const formacoesUnicas = uniq(formacoes.map(r => normalizar(r.formacao)));
    const areasCine = uniq(formacoes.map(r => r.area_cine));

    const porProfessor = new Map();
    formacoes.forEach(r => {
      if (!porProfessor.has(r.professor)) porProfessor.set(r.professor, new Set());
      porProfessor.get(r.professor).add(normalizar(r.formacao));
    });

    const filtro = Number(document.getElementById("nqFiltroMaisAreas")?.value || 2);
    const acima = [...porProfessor.values()].filter(s => s.size > filtro).length;

    setText("nqProfessoresTotal", n(professores.length));
    setText("nqFormacoesUnicas", n(formacoesUnicas.length));
    setText("nqFormacoesTotal", n(formacoes.length));
    setText("nqMediaFormacoes", professores.length ? (formacoes.length / professores.length).toLocaleString("pt-BR", {minimumFractionDigits:1, maximumFractionDigits:1}) : "0,0");
    setText("nqMaisAreas", n(acima));
    setText("nqAreasCineTotal", n(areasCine.length));
    setText("nqMaisAreasLegenda", `mais de ${filtro} área${filtro === 1 ? "" : "s"}`);
  }

  function renderGraficoCineNQ() {
    const el = document.getElementById("graficoNQCine");
    if (!el || !window.echarts) return;
    const mapa = new Map();
    formacoesNQ.filter(r => r.area_cine && r.professor).forEach(r => {
      if (!mapa.has(r.area_cine)) mapa.set(r.area_cine, new Set());
      mapa.get(r.area_cine).add(r.professor);
    });
    const dados = [...mapa.entries()].map(([area, profs]) => ({area,total:profs.size})).sort((a,b)=>b.total-a.total);
    graficoCineNQ?.dispose();
    graficoCineNQ = echarts.init(el);
    graficoCineNQ.setOption({
      grid:{left:42,right:18,top:24,bottom:100},
      tooltip:{trigger:"axis",axisPointer:{type:"shadow"}},
      xAxis:{type:"category",data:dados.map(d=>d.area.replace(/^\d+\s*[·-]\s*/,"")),axisLabel:{rotate:30,fontSize:10,interval:0}},
      yAxis:{type:"value",minInterval:1,name:"Professores"},
      series:[{type:"bar",data:dados.map(d=>d.total),barMaxWidth:42,label:{show:true,position:"top"},itemStyle:{borderRadius:[5,5,0,0]}}]
    });
  }

  function renderGraficoFormacoesProfessorNQ() {
    const el = document.getElementById("graficoNQFormacoesProfessor");
    if (!el || !window.echarts) return;
    const mapa = new Map();
    formacoesNQ.filter(r=>r.professor && r.formacao).forEach(r=>{
      if(!mapa.has(r.professor)) mapa.set(r.professor,new Set());
      mapa.get(r.professor).add(normalizar(r.formacao));
    });
    const dados=[...mapa.entries()].map(([professor,s])=>({professor,total:s.size})).sort((a,b)=>b.total-a.total||a.professor.localeCompare(b.professor,"pt-BR"));
    graficoFormacoesNQ?.dispose();
    graficoFormacoesNQ=echarts.init(el);
    graficoFormacoesNQ.setOption({
      grid:{left:170,right:24,top:18,bottom:28},
      tooltip:{trigger:"axis",axisPointer:{type:"shadow"}},
      xAxis:{type:"value",minInterval:1,name:"Formações"},
      yAxis:{type:"category",inverse:true,data:dados.map(d=>d.professor),axisLabel:{fontSize:9,width:155,overflow:"truncate"}},
      series:[{type:"bar",data:dados.map(d=>d.total),barMaxWidth:18,label:{show:true,position:"right"},itemStyle:{borderRadius:[0,4,4,0]}}]
    });
  }


  function consolidarProfessoresNQ() {
    const mapa = new Map();

    formacoesNQ.forEach(r => {
      const professor = String(r.professor || "").trim();
      if (!professor) return;

      if (!mapa.has(professor)) {
        mapa.set(professor, {
          professor,
          formacoes: new Map(),
          areasCine: new Map(),
          titulacoes: new Map(),
          marcas: new Map(),
          situacoes: new Map()
        });
      }

      const item = mapa.get(professor);

      const adicionar = (map, valor) => {
        const texto = String(valor || "").trim();
        if (!texto) return;
        const chave = normalizar(texto);
        if (!map.has(chave)) map.set(chave, texto);
      };

      adicionar(item.formacoes, r.formacao);
      adicionar(item.areasCine, r.area_cine);
      adicionar(item.titulacoes, r.titulacao_maxima);
      adicionar(item.marcas, r.marca_origem);
      adicionar(item.situacoes, r.situacao_contratacao);
    });

    return [...mapa.values()]
      .map(item => ({
        professor: item.professor,
        formacoes: [...item.formacoes.values()].sort((a,b) => a.localeCompare(b, "pt-BR")),
        areasCine: [...item.areasCine.values()].sort((a,b) => a.localeCompare(b, "pt-BR")),
        titulacoes: [...item.titulacoes.values()].sort((a,b) => a.localeCompare(b, "pt-BR")),
        marcas: [...item.marcas.values()].sort((a,b) => a.localeCompare(b, "pt-BR")),
        situacoes: [...item.situacoes.values()].sort((a,b) => a.localeCompare(b, "pt-BR"))
      }))
      .sort((a,b) => a.professor.localeCompare(b.professor, "pt-BR"));
  }

  function renderMatrizFormacaoNQ() {
    const tbody = document.getElementById("tbodyNQFormacaoMatriz");
    if (!tbody) return;

    const professores = consolidarProfessoresNQ();

    tbody.innerHTML = professores.length ? professores.map(p => `
      <tr>
        <td><strong>${escapeHtml(p.professor)}</strong></td>
        <td class="nq-multivalue-cell">${p.formacoes.length ? p.formacoes.map(f => `<span class="nq-chip">${escapeHtml(f)}</span>`).join("") : "--"}</td>
        <td class="nq-center">${p.formacoes.length}</td>
        <td class="nq-multivalue-cell">${p.areasCine.length ? p.areasCine.map(a => `<span class="nq-chip nq-chip-cine">${escapeHtml(a)}</span>`).join("") : '<span class="nq-chip nq-chip-empty">Não classificada</span>'}</td>
        <td>${escapeHtml(p.titulacoes.join(" · ") || "--")}</td>
      </tr>
    `).join("") : '<tr><td colspan="5">Nenhum professor encontrado.</td></tr>';
  }

  function renderListaFormacoesNQ() {
    const tbody = document.getElementById("tbodyNQFormacoesDetalhe");
    if (!tbody) return;

    const professores = consolidarProfessoresNQ();

    tbody.innerHTML = professores.length ? professores.map(p => `
      <tr>
        <td><strong>${escapeHtml(p.professor)}</strong></td>
        <td class="nq-multivalue-cell">${p.formacoes.length ? p.formacoes.map(f => `<span class="nq-chip">${escapeHtml(f)}</span>`).join("") : "--"}</td>
        <td>${escapeHtml(p.titulacoes.join(" · ") || "--")}</td>
        <td class="nq-multivalue-cell">${p.areasCine.length ? p.areasCine.map(a => `<span class="nq-chip nq-chip-cine">${escapeHtml(a)}</span>`).join("") : '<span class="nq-chip nq-chip-empty">Não classificada</span>'}</td>
        <td>${escapeHtml(p.marcas.join(" · ") || "--")}</td>
        <td>${escapeHtml(p.situacoes.join(" · ") || "--")}</td>
      </tr>
    `).join("") : '<tr><td colspan="6">Nenhum professor encontrado.</td></tr>';
  }

  function renderExperienciasNQ() {
    const el=document.getElementById("nqExperienciaStatus");
    if(!el) return;
    const areas=uniq(experienciasNQ.map(r=>r.area_experiencia));
    el.textContent=areas.length?`${areas.length} área(s) de experiência cadastrada(s): ${areas.join(", ")}.`:"Nenhuma área de experiência foi cadastrada na fonte atual. A estrutura já está pronta para receber essa informação.";
  }

  function renderCoberturaNQ() {
    renderKPIsCoberturaNQ();
    renderGraficoCineNQ();
    renderGraficoFormacoesProfessorNQ();
    renderMatrizFormacaoNQ();
    renderListaFormacoesNQ();
    renderExperienciasNQ();
    const fonte=document.getElementById("nqCoberturaFonte");
    if(fonte) fonte.textContent=`Dados reais · ${uniq(formacoesNQ.map(r=>r.professor)).length} especialistas`;
  }

  function configurarFiltroCoberturaNQ() {
    const sel=document.getElementById("nqFiltroMaisAreas");
    if(!sel||sel.dataset.ready==="1") return;
    sel.dataset.ready="1";
    sel.addEventListener("change",renderKPIsCoberturaNQ);
  }

  function formatarDataHoraBR(valor) {
    if (!valor) return "--";
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return String(valor);
    return d.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  async function carregarHistoricoImportacoesNQ() {
    const tbody = document.getElementById("tbodyNQImportacoes");
    if (!tbody) return;

    const { data, error } = await window.biSupabase
      .from("nq_importacoes")
      .select("id,arquivo_nome,status,total_linhas,especialistas_gravados,formacoes_gravadas,linhas_com_erro,mensagem,created_at,finished_at")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.warn("Histórico de importação NQ:", error);
      tbody.innerHTML = `<tr><td colspan="7">Não foi possível carregar o histórico: ${escapeHtml(error.message || "erro")}</td></tr>`;
      return;
    }

    const linhas = data || [];
    if (!linhas.length) {
      tbody.innerHTML = '<tr><td colspan="7">Nenhuma importação realizada.</td></tr>';
      return;
    }

    tbody.innerHTML = linhas.map(r => `
      <tr>
        <td>${escapeHtml(formatarDataHoraBR(r.finished_at || r.created_at))}</td>
        <td>${escapeHtml(r.arquivo_nome || "--")}</td>
        <td><span class="nq-status-pill nq-status-${escapeHtml(String(r.status || "").toLowerCase())}">${escapeHtml(r.status || "--")}</span></td>
        <td>${n(r.total_linhas)}</td>
        <td>${n(r.especialistas_gravados)}</td>
        <td>${n(r.formacoes_gravadas)}</td>
        <td>${n(r.linhas_com_erro)}</td>
      </tr>
    `).join("");
  }

  function configurarImportacaoNQ() {
    const input = document.getElementById("nqArquivoEspecialistas");
    const btn = document.getElementById("nqBtnImportarEspecialistas");
    const nome = document.getElementById("nqArquivoNome");
    const status = document.getElementById("nqImportStatus");
    const resultado = document.getElementById("nqImportResultado");

    if (!input || !btn || input.dataset.v23Ready === "1") return;
    input.dataset.v23Ready = "1";

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        nome.textContent = "Nenhum arquivo selecionado";
        btn.disabled = true;
        status.textContent = "Aguardando planilha.";
        return;
      }

      const ext = String(file.name).toLowerCase();
      if (!ext.endsWith(".xlsx") && !ext.endsWith(".xls")) {
        nome.textContent = file.name;
        btn.disabled = true;
        status.textContent = "Selecione um arquivo Excel (.xlsx ou .xls).";
        return;
      }

      nome.textContent = `${file.name} · ${(file.size / 1024 / 1024).toLocaleString("pt-BR", {maximumFractionDigits:1})} MB`;
      btn.disabled = false;
      status.textContent = "Planilha pronta para envio.";
      resultado.hidden = true;
      resultado.innerHTML = "";
    });

    btn.addEventListener("click", async () => {
      const file = input.files?.[0];
      if (!file) return;

      btn.disabled = true;
      btn.textContent = "Processando...";
      status.textContent = "Lendo a aba Export no seu computador...";
      resultado.hidden = true;

      try {
        if (!window.XLSX) {
          throw new Error("Leitor de Excel não foi carregado. Atualize a página com Ctrl+F5.");
        }

        const { data: sessionData, error: sessionError } = await window.biSupabase.auth.getSession();
        const session = sessionData?.session;

        if (sessionError || !session?.access_token) {
          throw new Error("Sessão expirada. Entre novamente no BI.");
        }

        const buffer = await file.arrayBuffer();

        // Importante:
        // A planilha é aberta no navegador do usuário, evitando estourar
        // a memória da Edge Function do Supabase.
        const workbook = window.XLSX.read(buffer, {
          type: "array",
          cellDates: true,
          cellText: false
        });

        const sheetName = "Export";
        const worksheet = workbook.Sheets[sheetName];

        if (!worksheet) {
          throw new Error(`A aba "${sheetName}" não foi encontrada. Abas disponíveis: ${workbook.SheetNames.join(", ")}.`);
        }

        const rows = window.XLSX.utils.sheet_to_json(worksheet, {
          defval: null,
          raw: true
        });

        if (!rows.length) {
          throw new Error('A aba "Export" está vazia.');
        }

        status.textContent = `${rows.length} linha(s) localizadas. Enviando somente os dados necessários...`;
        btn.textContent = "Enviando...";

        const response = await fetch(
          `${window.BI_CONFIG.SUPABASE_URL}/functions/v1/import-nq-especialistas`,
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
              aba: sheetName,
              rows
            })
          }
        );

        const payload = await response.json().catch(() => ({}));

        if (!response.ok || payload?.success === false) {
          throw new Error(payload?.error || payload?.mensagem || `Falha HTTP ${response.status}`);
        }

        const r = payload;
        resultado.hidden = false;
        resultado.innerHTML = `
          <strong>Importação concluída.</strong>
          <div class="nq-import-summary">
            <span><b>${n(r.total_linhas)}</b> linhas</span>
            <span><b>${n(r.especialistas_gravados)}</b> especialistas</span>
            <span><b>${n(r.formacoes_gravadas)}</b> formações</span>
            <span><b>${n(r.linhas_com_erro)}</b> erros</span>
          </div>
          <small>${escapeHtml(r.mensagem || "Base atualizada com sucesso.")}</small>
        `;

        status.textContent = "Base NQ atualizada com sucesso.";
        input.value = "";
        nome.textContent = "Nenhum arquivo selecionado";

        await carregarHistoricoImportacoesNQ();
      } catch (e) {
        console.error("Erro na importação NQ:", e);
        resultado.hidden = false;
        resultado.innerHTML = `
          <strong>Não foi possível importar.</strong>
          <small>${escapeHtml(e?.message || "Erro desconhecido")}</small>
        `;
        status.textContent = "A importação não foi concluída.";
      } finally {
        btn.textContent = "Enviar para o banco";
        btn.disabled = !input.files?.[0];
      }
    });
  }


  window.addEventListener("resize", () => { grafico?.resize(); graficoCineNQ?.resize(); graficoFormacoesNQ?.resize(); });
  window.atualizarReuniaoNQ = atualizarReuniaoNQ;
})();
