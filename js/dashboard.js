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

  // Fonte direta do board Validação de Materiais para Certificados.
  let dadosValidacaoMonday = [];

  let paginaAtual = "resumo";
  let cargaBase = null, cargaOperacao = null, cargaMonday = null;
  let cargaCertificados = null, fontesPlanejamento = null;
  let dadosProntos = false, indicadoresIniciados = false, versaoRender = 0;

  async function garantirOperacao() {
    await cargaBase;
    if (!dadosProntos) throw new Error('A base do BI ainda não foi carregada.');
    if (!cargaOperacao) cargaOperacao = (async () => {
      const dados = typeof window.carregarDadosOperacaoCompleta === 'function'
        ? await window.carregarDadosOperacaoCompleta(dadosCompletos) : dadosCompletos;
      dadosOperacaoCompletos = Array.isArray(dados) ? dados : dadosCompletos;
    })().catch(error => {cargaOperacao = null; throw error;});
    return cargaOperacao;
  }

  async function garantirMonday() {
    await cargaBase;
    if (!dadosProntos) throw new Error('A base do BI ainda não foi carregada.');
    if (!cargaMonday) cargaMonday = (async () => {
      try {
        dadosValidacaoMonday = typeof window.carregarDadosOperacaoMonday === 'function'
          ? await window.carregarDadosOperacaoMonday() : [];
      } catch (error) {
        console.warn('Fonte direta de Certificados indisponível; usando a base consolidada.', error);
        dadosValidacaoMonday = [];
      }
    })();
    return cargaMonday;
  }

  window.carregarFontesPlanejamento = function () {
    if (!fontesPlanejamento) fontesPlanejamento = Promise.all([garantirOperacao(), garantirMonday()])
      .then(() => window.biPlanejamento?.definirDados(dadosCompletos, dadosOperacaoCompletos, dadosValidacaoMonday))
      .catch(error => {fontesPlanejamento = null; throw error;});
    return fontesPlanejamento;
  };

  function mostrarCargaPagina(nome, texto) {
    const painel = document.querySelector(`.page-view[data-page="${nome}"]`);
    if (!painel) return;
    let aviso = painel.querySelector('.bi-carga-pagina');
    if (!aviso) {
      aviso = document.createElement('p'); aviso.className = 'bi-carga-pagina table-counter';
      aviso.setAttribute('role', 'status'); aviso.setAttribute('aria-live', 'polite'); painel.prepend(aviso);
    }
    aviso.textContent = texto; aviso.hidden = !texto;
    painel.setAttribute('aria-busy', String(!!texto));
  }


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

    "filtroRevisor"

  ];


  // ============================================================
  // TÍTULOS DAS PÁGINAS
  // ============================================================

  const titulosPaginas = {

    planejamento: "Planejamento",

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

  async function atualizarTela() {
    const pagina = paginaAtual, versao = ++versaoRender;
    if (pagina === 'planejamento') return;
    mostrarCargaPagina(pagina, 'Carregando dados desta aba…');
    const preparacaoCert = pagina === 'certificados' && window.prepararCertificados
      ? window.prepararCertificados().then(() => null, error => error) : Promise.resolve(null);
    try {
      // Essas abas têm fontes próprias e podem abrir antes da base de materiais.
      if (pagina === 'projeto-qualidade') {
        await window.atualizarProjetoQualidade?.();
        return;
      }
      if (pagina === 'indicadores-uc') {
        if (!indicadoresIniciados) {indicadoresIniciados = true; window.inicializarIndicadoresUC?.();}
        return;
      }
      await cargaBase;
      if (!dadosProntos) return;
      if (pagina === 'operacao') await garantirOperacao();
      if (pagina === 'certificados') {
        const [, erro] = await Promise.all([garantirMonday(), preparacaoCert]); if (erro) throw erro;
      }
      if (versao !== versaoRender || pagina !== paginaAtual) return;

      const filtrados = typeof window.aplicarFiltros === 'function'
        ? window.aplicarFiltros(dadosCompletos) : dadosCompletos;
      if (quantidadeFiltrada) quantidadeFiltrada.textContent = `${filtrados.length} registros no filtro atual`;
      if (window.calcularKPIs && window.preencherKPIs) window.preencherKPIs(window.calcularKPIs(filtrados));

      if (pagina === 'resumo') window.atualizarGraficos?.(filtrados);
      if (['operacao', 'ajustes', 'equipe'].includes(pagina)) {
        const operacao = pagina === 'operacao' && typeof window.aplicarFiltros === 'function'
          ? window.aplicarFiltros(dadosOperacaoCompletos) : dadosOperacaoCompletos;
        window.atualizarPaginasBI?.(filtrados, operacao, pagina);
      }
      if (['grafico-operacional', 'dias-validacao', 'historico', 'ajustes'].includes(pagina))
        window.atualizarIndicadoresBI?.(filtrados, pagina);
      if (pagina === 'resultados') await window.atualizarResultadosAlcancados?.();
      if (pagina === 'reuniao-nq') await window.atualizarReuniaoNQ?.(filtrados);
      if (pagina === 'gestores-materiais') window.atualizarGestoresMateriais?.(filtrados);
      if (pagina === 'certificados') {
        if (!cargaCertificados) cargaCertificados = Promise.resolve(window.atualizarCertificados?.(dadosCompletos, dadosValidacaoMonday))
          .finally(() => {cargaCertificados = null;});
        await cargaCertificados;
      }
    } catch (error) {
      console.error('Erro ao carregar a aba:', pagina, error);
      if (versao === versaoRender) mostrarCargaPagina(pagina, 'Falha ao carregar esta aba. Abra a aba novamente para tentar.');
      return;
    } finally {
      if (versao === versaoRender && pagina === paginaAtual) {
        const aviso = document.querySelector(`.page-view[data-page="${pagina}"] .bi-carga-pagina`);
        if (aviso?.textContent === 'Carregando dados desta aba…') mostrarCargaPagina(pagina, '');
      }
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


    const paginaUc = ["indicadores-uc", "planejamento"].includes(nome);


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

    window.biPlanejamento?.paginaAlterada(nome);
    void atualizarTela();

  }


  // ============================================================
  // CLIQUE NO MENU
  // ============================================================

  window.abrirPaginaBI = trocarPagina;

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


      const [base] = await Promise.all([window.carregarDadosBI(), carregarResponsaveisNQ()]);
      dadosCompletos = Array.isArray(base) ? base : [];
      dadosProntos = true;

      // --------------------------------------------------------
      // FILTROS
      // --------------------------------------------------------

      popularFiltros();
      if (quantidadeFiltrada) {
        const filtrados = window.aplicarFiltros ? window.aplicarFiltros(dadosCompletos) : dadosCompletos;
        quantidadeFiltrada.textContent = `${filtrados.length} registros no filtro atual`;
      }


      // --------------------------------------------------------
      // ÚLTIMA ATUALIZAÇÃO
      // --------------------------------------------------------

      mostrarUltimaAtualizacao();


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
        "Dashboard V25.46.67 carregado."
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

  cargaBase = carregarDashboard();
  trocarPagina(location.hash.replace('#', '').trim() || 'resumo');
  await cargaBase;

});
