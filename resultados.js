(function () {
  "use strict";

  let dadosResultados = null;
  let carregando = null;
  let graficoMateriais = null;
  let graficoIndicadores = null;

  const fmt = new Intl.NumberFormat("pt-BR");
  const categoriaPorTipo = {
    UA: "Unidade de Aprendizagem",
    BDQ: "Avaliação Lato",
    PP: "Plano de Produção"
  };

  function selecionados(id) {
    return window.obterSelecionados ? window.obterSelecionados(id) : [];
  }

  function normalizar(v) { return String(v ?? "").trim().toLowerCase(); }

  function passa(valor, lista) {
    if (!lista.length) return true;
    return lista.some(v => normalizar(v) === normalizar(valor));
  }

  async function carregarResultados() {
    if (dadosResultados) return dadosResultados;
    if (carregando) return carregando;

    carregando = (async function () {
      const view = window.BI_CONFIG?.RESULTADOS_VIEW_NAME || "vw_resultados_alcancados";
      const lote = 1000;
      let inicio = 0;
      let todos = [];
      while (true) {
        const { data, error } = await window.biSupabase
          .from(view)
          .select("tipo_material,chave_material,esteira_producao,matriz_oferta,bloco,status_validacao,indicadores_por_material")
          .range(inicio, inicio + lote - 1);
        if (error) throw error;
        const parte = data || [];
        todos = todos.concat(parte);
        if (parte.length < lote) break;
        inicio += lote;
      }
      dadosResultados = todos;
      console.log("Resultados alcançados carregados:", todos.length);
      return todos;
    })();

    try { return await carregando; }
    finally { carregando = null; }
  }

  function filtrar(dados) {
    const esteiras = selecionados("filtroEsteira");
    const matrizes = selecionados("filtroMatriz");
    const blocos = selecionados("filtroBloco");
    const status = selecionados("filtroStatus");
    const categorias = selecionados("filtroCategoria");

    return dados.filter(item => {
      if (!passa(item.esteira_producao, esteiras)) return false;
      if (!passa(item.matriz_oferta, matrizes)) return false;
      if (!passa(item.bloco, blocos)) return false;
      if (status.length && !status.some(v => normalizar(v) === "validado")) return false;
      if (categorias.length && !passa(categoriaPorTipo[item.tipo_material], categorias)) return false;
      return true;
    });
  }

  function resumir(dados) {
    const tipos = ["UA", "BDQ", "PP"];
    const r = {};
    tipos.forEach(tipo => {
      const linhas = dados.filter(x => x.tipo_material === tipo);
      const chaves = new Set(linhas.map(x => x.chave_material).filter(Boolean));
      const multiplicador = linhas.length ? Number(linhas[0].indicadores_por_material || 0) : ({UA:25,BDQ:17,PP:10}[tipo]);
      r[tipo] = { materiais: chaves.size, indicadores: chaves.size * multiplicador };
    });
    r.totalMateriais = tipos.reduce((a,t) => a + r[t].materiais, 0);
    r.totalIndicadores = tipos.reduce((a,t) => a + r[t].indicadores, 0);
    return r;
  }

  function texto(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = fmt.format(valor);
  }

  function desenhar(r) {
    texto("resultadoUaValidados", r.UA.materiais);
    texto("resultadoUaIndicadores", r.UA.indicadores);
    texto("resultadoBdqValidados", r.BDQ.materiais);
    texto("resultadoBdqIndicadores", r.BDQ.indicadores);
    texto("resultadoPpValidados", r.PP.materiais);
    texto("resultadoPpIndicadores", r.PP.indicadores);
    texto("resultadoTotalMateriais", r.totalMateriais);
    texto("resultadoTotalIndicadores", r.totalIndicadores);

    if (!window.echarts) return;
    const el1 = document.getElementById("graficoResultadosMateriais");
    const el2 = document.getElementById("graficoResultadosIndicadores");
    if (el1) {
      graficoMateriais ||= echarts.init(el1);
      graficoMateriais.setOption({
        tooltip: { trigger: "axis" }, grid: { left: 45, right: 20, top: 20, bottom: 35 },
        xAxis: { type: "category", data: ["UA","BDQ","PP"] }, yAxis: { type: "value" },
        series: [{ type: "bar", data: [r.UA.materiais,r.BDQ.materiais,r.PP.materiais], itemStyle: { borderRadius: [8,8,0,0] } }]
      });
    }
    if (el2) {
      graficoIndicadores ||= echarts.init(el2);
      graficoIndicadores.setOption({
        tooltip: { trigger: "axis" }, grid: { left: 60, right: 20, top: 20, bottom: 35 },
        xAxis: { type: "category", data: ["UA","BDQ","PP"] }, yAxis: { type: "value" },
        series: [{ type: "bar", data: [r.UA.indicadores,r.BDQ.indicadores,r.PP.indicadores], itemStyle: { borderRadius: [8,8,0,0] } }]
      });
    }
  }

  async function atualizarResultadosAlcancados() {
    try {
      const dados = await carregarResultados();
      desenhar(resumir(filtrar(dados)));
    } catch (e) {
      console.error("Erro ao carregar Resultados Alcançados:", e);
    }
  }

  window.addEventListener("resize", function () {
    graficoMateriais?.resize();
    graficoIndicadores?.resize();
  });
  window.atualizarResultadosAlcancados = atualizarResultadosAlcancados;
})();
