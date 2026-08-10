document.addEventListener("DOMContentLoaded", async () => {
  await window.protegerDashboard();

  let dados = [];
  const ids = ["filtroBloco","filtroStatus","filtroCategoria","filtroGestor","filtroRevisor"];

  function atualizar() {
    const filtrados = window.aplicarFiltros(dados);
    window.preencherKPIs(window.calcularKPIs(filtrados));
    window.atualizarGraficos(filtrados);
    document.getElementById("quantidadeFiltrada").textContent = `${filtrados.length} registros no filtro atual`;
  }

  async function carregar(esteira) {
    document.getElementById("statusCarregamento").textContent = "Atualizando...";
    try {
      dados = await window.carregarDadosBI(esteira || null);
      preencherSelect("filtroBloco", valoresUnicos(dados,"bloco"), "Todos os blocos");
      preencherSelect("filtroStatus", valoresUnicos(dados,"status_validacao"), "Todos os status");
      preencherSelect("filtroCategoria", valoresUnicos(dados,"categoria_material"), "Todas as categorias");
      preencherSelect("filtroGestor", valoresUnicos(dados,"gestor_validacao_nq"), "Todos os gestores");
      preencherSelect("filtroRevisor", valoresUnicos(dados,"revisor_validador"), "Todos os revisores");
      atualizar();
      document.getElementById("statusCarregamento").textContent = `${dados.length} registros carregados`;
      const datas = dados.map(x=>x.sincronizado_em).filter(Boolean).map(x=>new Date(x)).filter(d=>!isNaN(d));
      if (datas.length) document.getElementById("ultimaAtualizacao").textContent =
        new Date(Math.max(...datas)).toLocaleString("pt-BR");
    } catch (e) {
      console.error(e);
      document.getElementById("statusCarregamento").textContent = "Erro ao carregar dados";
    }
  }

  document.getElementById("logoutButton").addEventListener("click", window.sairBI);
  ids.forEach(id => document.getElementById(id).addEventListener("change", atualizar));
  document.getElementById("filtroEsteira").addEventListener("change", e => carregar(e.target.value));

  document.getElementById("filtroEsteira").value = window.BI_CONFIG.ESTEIRA_PADRAO;
  await carregar(window.BI_CONFIG.ESTEIRA_PADRAO);
});
