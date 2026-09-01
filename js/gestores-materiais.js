(function () {
  "use strict";

  let chart = null;
  let dadosAtuais = [];
  let gestorSelecionado = null;
  let ordenacao = { campo: "gestor", direcao: "asc" };

  function texto(v, padrao = "Em branco") {
    const s = String(v ?? "").trim();
    return s || padrao;
  }

  function normalizar(v) {
    return String(v ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function ehUA(item) {
    if (item?.eh_ua === true) return true;
    if (item?.id_ua || item?.chave_ua) return true;
    return normalizar(item?.categoria_material) === normalizar("Unidade de Aprendizagem");
  }

  function chaveUA(item) {
    return item?.chave_ua || item?.id_ua || item?.unidade_material || item?.chave_material || null;
  }

  function chaveUC(item) {
    return item?.id_titulo || item?.titulo || null;
  }

  function gestor(item) {
    return texto(item?.gestor_validacao_nq, "Sem gestor");
  }

  function resumir(dados) {
    const mapa = new Map();

    (dados || []).forEach(item => {
      const g = gestor(item);
      if (!mapa.has(g)) mapa.set(g, { gestor: g, uas: new Set(), ucs: new Set(), materiais: 0 });
      const r = mapa.get(g);
      r.materiais += 1;
      const uc = chaveUC(item);
      if (uc) r.ucs.add(String(uc));
      if (ehUA(item)) {
        const ua = chaveUA(item);
        if (ua) r.uas.add(String(ua));
      }
    });

    return [...mapa.values()]
      .map(r => ({ gestor: r.gestor, uas: r.uas.size, ucs: r.ucs.size, materiais: r.materiais }))
      .sort((a, b) => b.uas - a.uas || b.ucs - a.ucs || a.gestor.localeCompare(b.gestor, "pt-BR"));
  }

  function totais(dados) {
    const uas = new Set();
    const ucs = new Set();
    const gestores = new Set();
    (dados || []).forEach(item => {
      gestores.add(gestor(item));
      const uc = chaveUC(item);
      if (uc) ucs.add(String(uc));
      if (ehUA(item)) {
        const ua = chaveUA(item);
        if (ua) uas.add(String(ua));
      }
    });
    return { uas: uas.size, ucs: ucs.size, gestores: gestores.size, materiais: (dados || []).length };
  }

  function setText(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
  }

  function renderKPIs(dados) {
    const t = totais(dados);
    setText("gmTotalUAs", t.uas.toLocaleString("pt-BR"));
    setText("gmTotalUCs", t.ucs.toLocaleString("pt-BR"));
    setText("gmTotalGestores", t.gestores.toLocaleString("pt-BR"));
    setText("gmTotalMateriais", t.materiais.toLocaleString("pt-BR"));
  }

  function renderChart(dados) {
    const el = document.getElementById("graficoGestoresMateriais");
    if (!el || !window.echarts) return;
    const resumo = resumir(dados);
    if (!chart) chart = echarts.init(el);

    const nomes = resumo.map(x => x.gestor);
    chart.setOption({
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { data: ["UAs", "UCs"] },
      grid: { left: 20, right: 30, top: 55, bottom: 20, containLabel: true },
      xAxis: { type: "value", minInterval: 1 },
      yAxis: { type: "category", inverse: true, data: nomes, axisLabel: { width: 190, overflow: "truncate" } },
      series: [
        { name: "UAs", type: "bar", data: resumo.map(x => x.uas), barMaxWidth: 24 },
        { name: "UCs", type: "bar", data: resumo.map(x => x.ucs), barMaxWidth: 24 }
      ]
    }, true);

    chart.off("click");
    chart.on("click", params => {
      if (!params?.name) return;
      gestorSelecionado = gestorSelecionado === params.name ? null : params.name;
      renderTabela(dadosAtuais);
      setText("gmGestorAtivo", gestorSelecionado ? `Gestor selecionado: ${gestorSelecionado}` : "Todos os gestores do filtro atual");
    });
  }

  function materialNome(item) {
    return texto(item?.unidade_material || item?.titulo_ua || item?.item_name || item?.titulo);
  }

  function valorOrdenacao(item, campo) {
    const mapa = {
      gestor: () => gestor(item),
      titulo: () => texto(item?.titulo),
      material: () => materialNome(item),
      categoria: () => texto(item?.categoria_material),
      status: () => texto(item?.status_validacao),
      matriz: () => texto(item?.matriz_oferta),
      bloco: () => texto(item?.bloco)
    };
    return mapa[campo] ? mapa[campo]() : "";
  }

  function compararItens(a, b) {
    const va = valorOrdenacao(a, ordenacao.campo);
    const vb = valorOrdenacao(b, ordenacao.campo);
    const principal = String(va).localeCompare(String(vb), "pt-BR", {
      numeric: true,
      sensitivity: "base"
    });
    if (principal !== 0) return ordenacao.direcao === "asc" ? principal : -principal;

    // desempates previsíveis para a tabela não "pular" entre cliques
    const dg = gestor(a).localeCompare(gestor(b), "pt-BR", { sensitivity: "base" });
    if (dg !== 0) return dg;
    return texto(a?.titulo).localeCompare(texto(b?.titulo), "pt-BR", { sensitivity: "base" });
  }

  function atualizarCabecalhosOrdenacao() {
    document.querySelectorAll('#viewGestoresMateriais th[data-gm-sort]').forEach(th => {
      const campo = th.dataset.gmSort;
      const ativo = campo === ordenacao.campo;
      const icone = th.querySelector(".gm-sort-icon");
      th.setAttribute("aria-sort", ativo ? (ordenacao.direcao === "asc" ? "ascending" : "descending") : "none");
      th.classList.toggle("gm-sort-active", ativo);
      if (icone) icone.textContent = ativo ? (ordenacao.direcao === "asc" ? "↑" : "↓") : "↕";
      const button = th.querySelector(".gm-sort-button");
      if (button) {
        const rotulo = button.textContent.replace(/[↕↑↓]/g, "").trim();
        button.setAttribute("aria-label", `${rotulo}. ${ativo ? (ordenacao.direcao === "asc" ? "Ordenado crescente. Clique para ordenar decrescente." : "Ordenado decrescente. Clique para ordenar crescente.") : "Clique para ordenar."}`);
      }
    });
  }

  function definirOrdenacao(campo) {
    if (!campo) return;
    if (ordenacao.campo === campo) {
      ordenacao.direcao = ordenacao.direcao === "asc" ? "desc" : "asc";
    } else {
      ordenacao = { campo, direcao: "asc" };
    }
    atualizarCabecalhosOrdenacao();
    renderTabela(dadosAtuais);
  }

  function renderTabela(dados) {
    const tbody = document.getElementById("tbodyGestoresMateriais");
    const contador = document.getElementById("contadorGestoresMateriais");
    if (!tbody) return;

    const busca = normalizar(document.getElementById("buscaGestoresMateriais")?.value);
    let linhas = (dados || []).filter(item => !gestorSelecionado || gestor(item) === gestorSelecionado);
    if (busca) {
      linhas = linhas.filter(item => normalizar([
        gestor(item), item?.titulo, materialNome(item), item?.categoria_material,
        item?.status_validacao, item?.matriz_oferta, item?.bloco
      ].join(" ")).includes(busca));
    }

    linhas.sort(compararItens);

    if (contador) {
      const nomeCampo = {
        gestor: "Gestor",
        titulo: "Nome da UC",
        material: "Material / UA",
        categoria: "Categoria",
        status: "Status",
        matriz: "Matriz",
        bloco: "Bloco"
      }[ordenacao.campo] || ordenacao.campo;
      const sentido = ordenacao.direcao === "asc" ? "crescente" : "decrescente";
      contador.textContent = `${linhas.length.toLocaleString("pt-BR")} material(is) no recorte atual · ordenado por ${nomeCampo} (${sentido})${linhas.length > 500 ? " · exibindo os primeiros 500" : ""}`;
    }

    if (!linhas.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-table">Nenhum material corresponde aos filtros atuais.</td></tr>';
      return;
    }

    tbody.innerHTML = linhas.slice(0, 500).map(item => `
      <tr>
        <td>${esc(gestor(item))}</td>
        <td>${esc(texto(item?.titulo))}</td>
        <td>${esc(materialNome(item))}</td>
        <td>${esc(texto(item?.categoria_material))}</td>
        <td>${esc(texto(item?.status_validacao))}</td>
        <td>${esc(texto(item?.matriz_oferta))}</td>
        <td>${esc(texto(item?.bloco))}</td>
      </tr>
    `).join("");
  }

  function atualizar(dados) {
    dadosAtuais = dados || [];
    if (gestorSelecionado && !dadosAtuais.some(x => gestor(x) === gestorSelecionado)) gestorSelecionado = null;
    renderKPIs(dadosAtuais);
    renderChart(dadosAtuais);
    atualizarCabecalhosOrdenacao();
    renderTabela(dadosAtuais);
    setText("gmGestorAtivo", gestorSelecionado ? `Gestor selecionado: ${gestorSelecionado}` : "Todos os gestores do filtro atual");
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("buscaGestoresMateriais")?.addEventListener("input", () => renderTabela(dadosAtuais));
    document.getElementById("gmLimparGestor")?.addEventListener("click", () => {
      gestorSelecionado = null;
      renderTabela(dadosAtuais);
      setText("gmGestorAtivo", "Todos os gestores do filtro atual");
    });

    document.querySelectorAll('#viewGestoresMateriais .gm-sort-button[data-gm-sort]').forEach(button => {
      button.addEventListener("click", () => definirOrdenacao(button.dataset.gmSort));
    });

    atualizarCabecalhosOrdenacao();
    window.addEventListener("resize", () => chart?.resize());
  });

  window.atualizarGestoresMateriais = atualizar;
})();
