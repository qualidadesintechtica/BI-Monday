document.addEventListener("DOMContentLoaded", async function () {
  "use strict";

  // ============================================================
  // AUTENTICAÇÃO
  // ============================================================

  async function obterUsuarioAutenticado() {
    try {
      // Mantém compatibilidade com o auth.js existente
      if (typeof window.protegerDashboard === "function") {
        return await window.protegerDashboard();
      }

      console.warn(
        "window.protegerDashboard não está disponível. Verificando a sessão diretamente no Supabase."
      );

      if (!window.biSupabase?.auth) {
        console.error(
          "Supabase/Auth não está disponível."
        );

        return null;
      }

      const { data, error } =
        await window.biSupabase.auth.getSession();

      if (error) {
        console.error(
          "Erro ao verificar sessão:",
          error
        );

        return null;
      }

      return data?.session?.user || null;

    } catch (error) {
      console.error(
        "Erro durante a verificação de autenticação:",
        error
      );

      return null;
    }
  }


  const usuario =
    await obterUsuarioAutenticado();


  if (!usuario) {
    console.warn(
      "Usuário não autenticado."
    );

    if (
      !location.pathname
        .toLowerCase()
        .endsWith("/login.html")
    ) {
      location.href = "login.html";
    }

    return;
  }


  // ============================================================
  // ELEMENTOS PRINCIPAIS
  // ============================================================

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

  const tituloPagina =
    document.querySelector(
      ".topbar h1"
    );


  // ============================================================
  // DADOS
  // ============================================================

  let dadosCompletos = [];

  let dadosOperacaoCompletos = [];

  let paginaAtual =
    "resumo";


  // ============================================================
  // NORMALIZAÇÃO DOS RESPONSÁVEIS NQ
  // ============================================================

  function normalizarResponsavelNQ(
    valor
  ) {

    return String(
      valor ?? ""
    )
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim()
      .toLowerCase();
  }


  // ============================================================
  // RESPONSÁVEIS NQ
  // ============================================================

  async function carregarResponsaveisNQ() {

    const estrutura = {
      gestores:
        new Map(),

      revisores:
        new Map()
    };


    try {

      if (!window.biSupabase) {

        console.warn(
          "Supabase indisponível para carregar nq_responsaveis."
        );

        window.BI_RESPONSAVEIS_NQ =
          estrutura;

        return;
      }


      const {
        data,
        error
      } =
        await window.biSupabase
          .from(
            "nq_responsaveis"
          )
          .select(
            "nome_oficial,aliases,emails,eh_gestor,eh_revisor,ativo"
          )
          .eq(
            "ativo",
            true
          );


      if (error) {
        throw error;
      }


      (data || [])
        .forEach(
          item => {

            const nomeOficial =
              String(
                item.nome_oficial ||
                ""
              ).trim();


            if (!nomeOficial) {
              return;
            }


            const aliases =
              Array.isArray(
                item.aliases
              )
                ? item.aliases
                : [];


            const emails =
              Array.isArray(
                item.emails
              )
                ? item.emails
                : [];


            const chaves = [
              nomeOficial,
              ...aliases,
              ...emails
            ];


            chaves.forEach(
              valor => {

                const chave =
                  normalizarResponsavelNQ(
                    valor
                  );


                if (!chave) {
                  return;
                }


                if (
                  item.eh_gestor
                ) {

                  estrutura
                    .gestores
                    .set(
                      chave,
                      nomeOficial
                    );
                }


                if (
                  item.eh_revisor
                ) {

                  estrutura
                    .revisores
                    .set(
                      chave,
                      nomeOficial
                    );
                }

              }
            );

          }
        );


      console.log(
        "Responsáveis NQ carregados:",
        {
          gestoresAliases:
            estrutura
              .gestores
              .size,

          revisoresAliases:
            estrutura
              .revisores
              .size
        }
      );


    } catch (error) {

      console.warn(
        "Cadastro nq_responsaveis indisponível; filtros de pessoas usarão o comportamento anterior.",
        error
      );

    }


    window.BI_RESPONSAVEIS_NQ =
      estrutura;
  }


  // ============================================================
  // FILTROS GLOBAIS
  // ============================================================

  const filtros = [

    "filtroEsteira",

    "filtroMatriz",

    "filtroBloco",

    "filtroStatus",

    "filtroCategoria",

    "filtroGestor",

    "filtroRevisor",

    "filtroUAName"

  ];


  // ============================================================
  // TÍTULOS DAS PÁGINAS
  // ============================================================

  const titulosPaginas = {

    resumo:
      "Resumo Executivo",

    resultados:
      "Resultados Alcançados",

    "reuniao-nq":
      "Reunião NQ | Indicadores Executivos",

    "indicadores-uc":
      "Indicadores da Unidade Curricular",

    "gestores-materiais":
      "Gestores e Materiais",

    certificados:
      "Certificados de Revisores",

    "projeto-qualidade":
      "Projeto Qualidade",

    operacao:
      "Operação",

    ajustes:
      "Ajustes",

    equipe:
      "Equipe",

    "grafico-operacional":
      "Gráfico Operacional",

    "dias-validacao":
      "Análise de Dias para Validação",

    historico:
      "Histórico de Atualizações"

  };


  // ============================================================
  // PREENCHIMENTO DOS FILTROS
  // ============================================================

  function popularFiltros() {

    const defs = [

      [
        "filtroEsteira",
        "esteira_producao",
        "Todas as esteiras"
      ],

      [
        "filtroMatriz",
        "matriz_oferta",
        "Todas as matrizes"
      ],

      [
        "filtroBloco",
        "bloco",
        "Todos os blocos"
      ],

      [
        "filtroStatus",
        "status_validacao",
        "Todos os status"
      ],

      [
        "filtroCategoria",
        "categoria_material",
        "Todas as categorias"
      ],

      [
        "filtroGestor",
        "gestor_validacao_nq",
        "Todos os gestores"
      ],

      [
        "filtroRevisor",
        "revisor_validador",
        "Todos os revisores"
      ],

      [
        "filtroUAName",
        "item_name",
        "Todas as UAs/Names"
      ]

    ];


    defs.forEach(
      ([id, campo, label]) => {

        if (
          typeof window.preencherSelect !==
            "function" ||
          typeof window.valoresUnicos !==
            "function" ||
          typeof window.possuiEmBranco !==
            "function"
        ) {

          console.warn(
            "Funções de filtros ainda não estão disponíveis."
          );

          return;
        }


        window.preencherSelect(
          id,

          window.valoresUnicos(
            dadosCompletos,
            campo
          ),

          label,

          window.possuiEmBranco(
            dadosCompletos,
            campo
          )
        );

      }
    );

  }


  // ============================================================
  // ÚLTIMA ATUALIZAÇÃO
  // ============================================================

  function mostrarUltimaAtualizacao() {

    if (
      !ultimaAtualizacao
    ) {
      return;
    }


    const tempos =
      dadosCompletos

        .map(
          x =>
            Date.parse(
              x.sincronizado_validacao ||
              x.sincronizado_esteira ||
              x.sincronizado_em ||
              ""
            )
        )

        .filter(
          Number.isFinite
        );


    ultimaAtualizacao.textContent =
      tempos.length

        ? new Date(
            Math.max(
              ...tempos
            )
          ).toLocaleString(
            "pt-BR"
          )

        : "--";
  }


  // ============================================================
  // ATUALIZAÇÃO DA TELA
  // ============================================================

  function atualizarTela() {

    try {

      const dadosFiltrados =
        typeof window.aplicarFiltros ===
        "function"

          ? window.aplicarFiltros(
              dadosCompletos
            )

          : dadosCompletos;


      // --------------------------------------------------------
      // KPIs
      // --------------------------------------------------------

      if (
        typeof window.calcularKPIs ===
        "function"
      ) {

        const kpis =
          window.calcularKPIs(
            dadosFiltrados
          );


        if (
          typeof window.preencherKPIs ===
          "function"
        ) {

          window.preencherKPIs(
            kpis
          );

        }

      }


      // --------------------------------------------------------
      // GRÁFICOS
      // --------------------------------------------------------

      if (
        typeof window.atualizarGraficos ===
        "function"
      ) {

        window.atualizarGraficos(
          dadosFiltrados
        );

      }


      // --------------------------------------------------------
      // OPERAÇÃO
      // --------------------------------------------------------

      const dadosOperacaoFiltrados =
        typeof window.aplicarFiltros ===
        "function"

          ? window.aplicarFiltros(
              dadosOperacaoCompletos
            )

          : dadosOperacaoCompletos;


      window.atualizarPaginasBI?.(
        dadosFiltrados,
        dadosOperacaoFiltrados
      );


      // --------------------------------------------------------
      // INDICADORES
      // --------------------------------------------------------

      window.atualizarIndicadoresBI?.(
        dadosFiltrados
      );


      // --------------------------------------------------------
      // RESULTADOS
      // --------------------------------------------------------

      window.atualizarResultadosAlcancados?.();


      // --------------------------------------------------------
      // REUNIÃO NQ
      // --------------------------------------------------------

      window.atualizarReuniaoNQ?.(
        dadosFiltrados
      );


      // --------------------------------------------------------
      // INDICADORES UC
      // --------------------------------------------------------

      window.inicializarIndicadoresUC?.();


      // --------------------------------------------------------
      // GESTORES E MATERIAIS
      // --------------------------------------------------------

      window.atualizarGestoresMateriais?.(
        dadosFiltrados
      );


      // --------------------------------------------------------
      // PROJETO QUALIDADE
      // --------------------------------------------------------

      window.atualizarProjetoQualidade?.();


      // --------------------------------------------------------
      // CERTIFICADOS V25.44
      //
      // A página Certificados recebe a base completa.
      // O certificados.js aplica:
      //
      // Status Validação = Validado
      // Semestre
      // Revisor
      // Pesquisa
      // E-mail
      // Deduplicação
      // Geração PDF
      // Envio Supabase / Resend
      // Histórico
      // --------------------------------------------------------

      window.atualizarCertificados?.(
        dadosFiltrados
      );


      // --------------------------------------------------------
      // CONTADOR GLOBAL
      // --------------------------------------------------------

      if (
        quantidadeFiltrada
      ) {

        quantidadeFiltrada
          .textContent =
            `${dadosFiltrados.length} registros no filtro atual`;

      }


    } catch (error) {

      console.error(
        "Erro ao atualizar tela:",
        error
      );

    }

  }


  // ============================================================
  // TROCA DE PÁGINA
  // ============================================================

  function trocarPagina(
    nome
  ) {

    if (
      !titulosPaginas[
        nome
      ]
    ) {

      nome =
        "resumo";

    }


    paginaAtual =
      nome;


    // ----------------------------------------------------------
    // PAGE VIEW
    // ----------------------------------------------------------

    document
      .querySelectorAll(
        ".page-view"
      )
      .forEach(
        el => {

          el.classList.toggle(
            "active",
            el.dataset.page ===
              nome
          );

        }
      );


    // ----------------------------------------------------------
    // MENU
    // ----------------------------------------------------------

    document
      .querySelectorAll(
        ".nav [data-view]"
      )
      .forEach(
        el => {

          el.classList.toggle(
            "active",
            el.dataset.view ===
              nome
          );

        }
      );


    // ----------------------------------------------------------
    // TÍTULO
    // ----------------------------------------------------------

    if (
      tituloPagina
    ) {

      tituloPagina.textContent =
        titulosPaginas[
          nome
        ];

    }


    // ----------------------------------------------------------
    // HASH
    // ----------------------------------------------------------

    try {

      history.replaceState(
        null,
        "",
        `#${nome}`
      );

    } catch (error) {

      console.warn(
        "Não foi possível atualizar a URL.",
        error
      );

    }


    // ----------------------------------------------------------
    // FILTROS GLOBAIS
    // ----------------------------------------------------------

    const filtrosGlobais =
      document.querySelector(
        ".filters"
      );


    const statusGlobal =
      document.querySelector(
        ".status-line"
      );


    const paginaUc =
      nome ===
      "indicadores-uc";


    filtrosGlobais
      ?.classList
      .toggle(
        "page-filters-hidden",
        paginaUc
      );


    statusGlobal
      ?.classList
      .toggle(
        "page-status-hidden",
        paginaUc
      );


    // ----------------------------------------------------------
    // REDIMENSIONAMENTO
    // ----------------------------------------------------------

    if (
      [
        "resumo",
        "resultados",
        "reuniao-nq",
        "indicadores-uc",
        "gestores-materiais",
        "certificados",
        "projeto-qualidade",
        "grafico-operacional",
        "ajustes",
        "dias-validacao",
        "historico",
        "equipe",
        "operacao"
      ].includes(
        nome
      )
    ) {

      setTimeout(
        () => {

          window.dispatchEvent(
            new Event(
              "resize"
            )
          );

        },
        0
      );

    }

  }


  // ============================================================
  // CLIQUE NO MENU
  // ============================================================

  document.addEventListener(
    "click",
    function (
      event
    ) {

      const link =
        event.target.closest(
          ".nav [data-view]"
        );


      if (
        !link
      ) {
        return;
      }


      event.preventDefault();


      trocarPagina(
        link.dataset.view
      );

    }
  );


  // ============================================================
  // ALTERAÇÃO DOS FILTROS
  // ============================================================

  document.addEventListener(
    "multifilterchange",
    function (
      event
    ) {

      const alvo =
        event.target;


      if (
        alvo &&
        filtros.includes(
          alvo.id
        )
      ) {

        atualizarTela();

      }

    }
  );


  // ============================================================
  // LOGOUT
  // ============================================================

  const logoutButton =
    document.getElementById(
      "logoutButton"
    );


  if (
    logoutButton
  ) {

    logoutButton.addEventListener(
      "click",
      async function () {

        try {

          if (
            typeof window.sairBI ===
            "function"
          ) {

            await window.sairBI();

            return;

          }


          if (
            window.biSupabase
              ?.auth
          ) {

            await window
              .biSupabase
              .auth
              .signOut();

          }


          location.href =
            "login.html";


        } catch (
          error
        ) {

          console.error(
            "Erro ao sair:",
            error
          );

        }

      }
    );

  }


  // ============================================================
  // CARREGAMENTO DO DASHBOARD
  // ============================================================

  async function carregarDashboard() {

    try {

      if (
        statusCarregamento
      ) {

        statusCarregamento
          .textContent =
            "Carregando dados...";

      }


      // --------------------------------------------------------
      // DADOS PRINCIPAIS
      // --------------------------------------------------------

      if (
        typeof window.carregarDadosBI !==
        "function"
      ) {

        throw new Error(
          "A função carregarDadosBI não foi encontrada."
        );

      }


      dadosCompletos =
        await window.carregarDadosBI();


      if (
        !Array.isArray(
          dadosCompletos
        )
      ) {

        dadosCompletos =
          [];

      }


      console.log(
        "Total de registros:",
        dadosCompletos.length
      );


      // --------------------------------------------------------
      // FONTE DA OPERAÇÃO
      // --------------------------------------------------------

      if (
        typeof window.carregarDadosOperacaoCompleta ===
        "function"
      ) {

        dadosOperacaoCompletos =
          await window.carregarDadosOperacaoCompleta(
            dadosCompletos
          );

      } else {

        dadosOperacaoCompletos =
          dadosCompletos;

      }


      if (
        !Array.isArray(
          dadosOperacaoCompletos
        )
      ) {

        dadosOperacaoCompletos =
          dadosCompletos;

      }


      console.log(
        "Total da fonte Operação:",
        dadosOperacaoCompletos.length
      );


      // --------------------------------------------------------
      // RESPONSÁVEIS NQ
      // --------------------------------------------------------

      await carregarResponsaveisNQ();


      // --------------------------------------------------------
      // FILTROS
      // --------------------------------------------------------

      popularFiltros();


      // --------------------------------------------------------
      // ÚLTIMA ATUALIZAÇÃO
      // --------------------------------------------------------

      mostrarUltimaAtualizacao();


      // --------------------------------------------------------
      // ATUALIZA TELA
      // --------------------------------------------------------

      atualizarTela();


      // --------------------------------------------------------
      // PÁGINA INICIAL
      // --------------------------------------------------------

      const paginaHash =
        location.hash
          .replace(
            "#",
            ""
          )
          .trim();


      trocarPagina(
        paginaHash ||
        "resumo"
      );


      // --------------------------------------------------------
      // STATUS
      // --------------------------------------------------------

      if (
        statusCarregamento
      ) {

        statusCarregamento
          .textContent =
            `${dadosCompletos.length} registros carregados`;

      }


      console.log(
        "Dashboard V25.44 carregado."
      );


    } catch (
      error
    ) {

      console.error(
        "Erro no dashboard:",
        error
      );


      if (
        statusCarregamento
      ) {

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


  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================

  await carregarDashboard();

});