document.addEventListener("DOMContentLoaded", async function () {
  "use strict";

  const usuario = await window.protegerDashboard();
  if (!usuario) return;

  const statusCarregamento = document.getElementById("statusCarregamento");
  const quantidadeFiltrada = document.getElementById("quantidadeFiltrada");
  const ultimaAtualizacao = document.getElementById("ultimaAtualizacao");
  const tituloPagina = document.querySelector(".topbar h1");

  let dadosCompletos = [];
  let paginaAtual = "resumo";

  const filtros = [
    "filtroEsteira",
    "filtroMatriz",
    "filtroBloco",
    "filtroStatus",
    "filtroCategoria",
    "filtroGestor",
    "filtroRevisor"
  ];

  const titulosPaginas = {
    resumo: "Resumo Executivo",
    operacao: "Operação",
    ajustes: "Ajustes",
    equipe: "Equipe"
  };

  function popularFiltros() {
    const defs = [
      ["filtroEsteira", "esteira_producao", "Todas as esteiras"],
      ["filtroMatriz", "matriz_oferta", "Todas as matrizes"],
      ["filtroBloco", "bloco", "Todos os blocos"],
      ["filtroStatus", "status_validacao", "Todos os status"],
      ["filtroCategoria", "categoria_material", "Todas as categorias"],
      ["filtroGestor", "gestor_validacao_nq", "Todos os gestores"],
      ["filtroRevisor", "revisor_validador", "Todos os revisores"]
    ];

    defs.forEach(([id, campo, label]) => {
      window.preencherSelect(
        id,
        window.valoresUnicos(dadosCompletos, campo),
        label,
        window.possuiEmBranco(dadosCompletos, campo)
      );
    });
  }

  function mostrarUltimaAtualizacao() {
    if (!ultimaAtualizacao) return;
    const tempos = dadosCompletos
      .map(x => Date.parse(x.sincronizado_em || ""))
      .filter(Number.isFinite);
    ultimaAtualizacao.textContent = tempos.length
      ? new Date(Math.max(...tempos)).toLocaleString("pt-BR")
      : "--";
  }

  function atualizarTela() {
    const dadosFiltrados = window.aplicarFiltros(dadosCompletos);
    const kpis = window.calcularKPIs(dadosFiltrados);

    window.preencherKPIs(kpis);
    window.atualizarGraficos(dadosFiltrados);
    window.atualizarPaginasBI?.(dadosFiltrados);

    if (quantidadeFiltrada) {
      quantidadeFiltrada.textContent = `${dadosFiltrados.length} registros no filtro atual`;
    }
  }

  function trocarPagina(nome) {
    if (!titulosPaginas[nome]) nome = "resumo";
    paginaAtual = nome;

    document.querySelectorAll(".page-view").forEach(el => {
      el.classList.toggle("active", el.dataset.page === nome);
    });

    document.querySelectorAll(".nav [data-view]").forEach(el => {
      el.classList.toggle("active", el.dataset.view === nome);
    });

    if (tituloPagina) tituloPagina.textContent = titulosPaginas[nome];
    history.replaceState(null, "", `#${nome}`);

    if (nome === "resumo") {
      setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
    }
  }

  document.addEventListener("click", function (event) {
    const link = event.target.closest(".nav [data-view]");
    if (!link) return;
    event.preventDefault();
    trocarPagina(link.dataset.view);
  });

  document.addEventListener("multifilterchange", function (event) {
    const alvo = event.target;
    if (alvo && filtros.includes(alvo.id)) atualizarTela();
  });

  const logoutButton = document.getElementById("logoutButton");
  if (logoutButton) logoutButton.addEventListener("click", window.sairBI);

  async function carregarDashboard() {
    try {
      if (statusCarregamento) statusCarregamento.textContent = "Carregando dados...";
      dadosCompletos = await window.carregarDadosBI();
      console.log("Total de registros:", dadosCompletos.length);
      popularFiltros();
      mostrarUltimaAtualizacao();
      atualizarTela();
      trocarPagina(location.hash.replace("#", "") || "resumo");
      if (statusCarregamento) {
        statusCarregamento.textContent = `${dadosCompletos.length} registros carregados`;
      }
    } catch (error) {
      console.error("Erro no dashboard:", error);
      if (statusCarregamento) {
        statusCarregamento.textContent = "Erro ao carregar dados: " + (error?.message || "erro desconhecido");
      }
    }
  }

  await carregarDashboard();
});
