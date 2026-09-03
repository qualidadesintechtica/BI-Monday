(function () {
  "use strict";

  let resumo = null;
  let naoConformidades = null;
  let carregando = null;
  let grafico = null;
  let revisoresDistintos = null;
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
      if (status) status.textContent = "Dados carregados diretamente das views executivas do Supabase.";
    } catch (e) {
      console.error("Erro ao carregar Reunião NQ:", e);
      if (status) status.textContent = "Erro ao carregar a página da reunião: " + (e?.message || "erro desconhecido");
    }
  }

  window.addEventListener("resize", () => grafico?.resize());
  window.atualizarReuniaoNQ = atualizarReuniaoNQ;
})();
