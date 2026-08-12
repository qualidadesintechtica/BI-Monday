document.addEventListener(
  "DOMContentLoaded",
  async function () {

    "use strict";

    /* ==================================================
       AUTENTICAÇÃO
    ================================================== */

    const usuario =
      await window.protegerDashboard();

    if (!usuario) {
      return;
    }

    /* ==================================================
       ELEMENTOS
    ================================================== */

    const statusCarregamento =
      document.getElementById(
        "statusCarregamento"
      );

    const quantidadeFiltrada =
      document.getElementById(
        "quantidadeFiltrada"
      );

    const ultimaAtualizacao =
      document.getElementById(
        "ultimaAtualizacao"
      );

    let dadosCompletos = [];

    /* ==================================================
       IDS DOS FILTROS
    ================================================== */

    const filtros = [

      "filtroEsteira",

      "filtroMatriz",

      "filtroBloco",

      "filtroStatus",

      "filtroCategoria",

      "filtroGestor",

      "filtroRevisor"

    ];

    /* ==================================================
       POPULAR FILTROS
    ================================================== */

    function popularFiltros() {

      /* ------------------------------
         ESTEIRA
      ------------------------------ */

      window.preencherSelect(

        "filtroEsteira",

        window.valoresUnicos(
          dadosCompletos,
          "esteira_producao"
        ),

        "Todas as esteiras",

        window.possuiEmBranco(
          dadosCompletos,
          "esteira_producao"
        )

      );

      /* ------------------------------
         MATRIZ
      ------------------------------ */

      window.preencherSelect(

        "filtroMatriz",

        window.valoresUnicos(
          dadosCompletos,
          "matriz_oferta"
        ),

        "Todas as matrizes",

        window.possuiEmBranco(
          dadosCompletos,
          "matriz_oferta"
        )

      );

      /* ------------------------------
         BLOCO
      ------------------------------ */

      window.preencherSelect(

        "filtroBloco",

        window.valoresUnicos(
          dadosCompletos,
          "bloco"
        ),

        "Todos os blocos",

        window.possuiEmBranco(
          dadosCompletos,
          "bloco"
        )

      );

      /* ------------------------------
         STATUS
      ------------------------------ */

      window.preencherSelect(

        "filtroStatus",

        window.valoresUnicos(
          dadosCompletos,
          "status_validacao"
        ),

        "Todos os status",

        window.possuiEmBranco(
          dadosCompletos,
          "status_validacao"
        )

      );

      /* ------------------------------
         CATEGORIA
      ------------------------------ */

      window.preencherSelect(

        "filtroCategoria",

        window.valoresUnicos(
          dadosCompletos,
          "categoria_material"
        ),

        "Todas as categorias",

        window.possuiEmBranco(
          dadosCompletos,
          "categoria_material"
        )

      );

      /* ------------------------------
         GESTOR
      ------------------------------ */

      window.preencherSelect(

        "filtroGestor",

        window.valoresUnicos(
          dadosCompletos,
          "gestor_validacao_nq"
        ),

        "Todos os gestores",

        window.possuiEmBranco(
          dadosCompletos,
          "gestor_validacao_nq"
        )

      );

      /* ------------------------------
         REVISOR
      ------------------------------ */

      window.preencherSelect(

        "filtroRevisor",

        window.valoresUnicos(
          dadosCompletos,
          "revisor_validador"
        ),

        "Todos os revisores",

        window.possuiEmBranco(
          dadosCompletos,
          "revisor_validador"
        )

      );

    }

    /* ==================================================
       ATUALIZA TELA
    ================================================== */

    function atualizarTela() {

      const dadosFiltrados =
        window.aplicarFiltros(
          dadosCompletos
        );

      /* ------------------------------
         KPIs
      ------------------------------ */

      const kpis =
        window.calcularKPIs(
          dadosFiltrados
        );

      window.preencherKPIs(
        kpis
      );

      /* ------------------------------
         GRÁFICOS
      ------------------------------ */

      window.atualizarGraficos(
        dadosFiltrados
      );

      /* ------------------------------
         QUANTIDADE
      ------------------------------ */

      if (quantidadeFiltrada) {

        const uasFiltradas =
          typeof window.consolidarUAs === "function"
            ? window.consolidarUAs(dadosFiltrados).length
            : dadosFiltrados.length;

        quantidadeFiltrada.textContent =
          uasFiltradas +
          " UAs no filtro atual" +
          (dadosFiltrados.length !== uasFiltradas
            ? " (" + dadosFiltrados.length + " linhas da base)"
            : "");

      }

    }

    /* ==================================================
       ÚLTIMA ATUALIZAÇÃO
    ================================================== */

    function mostrarUltimaAtualizacao() {

      if (!ultimaAtualizacao) {
        return;
      }

      const datas =
        dadosCompletos
          .map(
            function (item) {

              return (
                item.sincronizado_em
              );

            }
          )
          .filter(Boolean)
          .map(
            function (valor) {

              return new Date(
                valor
              );

            }
          )
          .filter(
            function (data) {

              return (
                !Number.isNaN(
                  data.getTime()
                )
              );

            }
          );

      if (datas.length === 0) {

        ultimaAtualizacao
          .textContent =
          "--";

        return;

      }

      const maiorData =
        Math.max.apply(

          null,

          datas.map(
            function (data) {

              return (
                data.getTime()
              );

            }
          )

        );

      ultimaAtualizacao
        .textContent =
        new Date(
          maiorData
        ).toLocaleString(
          "pt-BR"
        );

    }

    /* ==================================================
       CARREGAMENTO
    ================================================== */

    async function carregarDashboard() {

      try {

        if (statusCarregamento) {

          statusCarregamento
            .textContent =
            "Carregando dados...";

        }

        /*
          Carrega todos os dados da View.
        */

        dadosCompletos =
          await window.carregarDadosBI();

        console.log(
          "Total de registros:",
          dadosCompletos.length
        );

        /* ------------------------------
           FILTROS
        ------------------------------ */

        popularFiltros();

        /* ------------------------------
           ÚLTIMA ATUALIZAÇÃO
        ------------------------------ */

        mostrarUltimaAtualizacao();

        /* ------------------------------
           TELA
        ------------------------------ */

        atualizarTela();

        if (statusCarregamento) {

          statusCarregamento
            .textContent =
            dadosCompletos.length +
            " registros carregados";

        }

      } catch (error) {

        console.error(
          "Erro no dashboard:",
          error
        );

        if (statusCarregamento) {

          statusCarregamento
            .textContent =
            "Erro ao carregar dados: " +
            (
              error?.message ||
              "erro desconhecido"
            );

        }

      }

    }

    /* ==================================================
       EVENTOS DOS FILTROS
    ================================================== */

    /*
      Usamos delegação porque os SELECTs
      originais são substituídos por DIVs
      quando preencherSelect() é executado.
    */

    document.addEventListener(
      "multifilterchange",
      function (event) {

        const alvo =
          event.target;

        if (!alvo) {
          return;
        }

        if (
          filtros.includes(
            alvo.id
          )
        ) {

          atualizarTela();

        }

      }
    );

    /* ==================================================
       LOGOUT
    ================================================== */

    const logoutButton =
      document.getElementById(
        "logoutButton"
      );

    if (logoutButton) {

      logoutButton.addEventListener(
        "click",
        window.sairBI
      );

    }

    /* ==================================================
       INICIALIZA
    ================================================== */

    await carregarDashboard();

  }
);