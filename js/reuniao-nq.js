(function () {
  "use strict";

  let resumo = null;
  let naoConformidades = null;
  let criteriosDetalhe = null;
  let criteriosFiltrados = [];
  let carregando = null;
  let grafico = null;
  let revisoresDistintos = null;
  // V25.19 · Fonte oficial dos revisores: Base de Especialistas NQ ativa.
  // Evita contar DAs, conteudistas ou outras pessoas que eventualmente
  // apareçam em colunas operacionais, mas não pertencem ao corpo de revisores NQ.
  let revisoresNQAtivos = new Map();
  let formacoesNQ = [];
  let experienciasNQ = [];
  let perfilAcademicoNQ = [];
  let diplomasNQ = [];
  let graficoTitulacaoNQ = null;
  let graficoExperienciasNQ = null;
  let graficoCineNQ = null;
  let graficoFormacoesCineNQ = null;
  let graficoNivelFormacaoNQ = null;
  let graficoFormacoesNQ = null;
  let graficoContratacaoNQ = null;
  let graficoEvolucaoAbrangenciaNQ = null;
  let graficoEvolucaoExperienciasNQ = null;
  let dadosBIAtuais = [];
  let ppsValidadosAtual = 0;
  let campoApontamosInconformidade = null;

  const fmt = new Intl.NumberFormat("pt-BR");

  function setText(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
  }

  function n(v) {
    return fmt.format(Number(v || 0));
  }

  function pct(v) {
    return `${Number(v || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })}%`;
  }

  function dataBR(v) {
    if (!v) return "--";

    const [a, m, d] = String(v)
      .slice(0, 10)
      .split("-");

    return `${d}/${m}/${a}`;
  }

  function escapeHtml(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizar(v) {
    return String(v || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  /* =========================================================
     FONTE OFICIAL DE NÃO CONFORMIDADE · V25.17

     Monday: coluna “Apontamos inconformidade?”
     Regra:
       Sim  -> não conforme
       Não  -> conforme
       vazio/outro -> não avaliado
  ========================================================= */

  function normalizarNomeCampo(v) {
    return normalizar(v)
      .replace(/[^a-z0-9]+/g, "");
  }

  function localizarCampoApontamos(row) {
    if (!row || typeof row !== "object") {
      return null;
    }

    const aliases = [
      "apontamos_inconformidade",
      "apontamos_inconformidades",
      "apontamos inconformidade",
      "apontamos inconformidades",
      "apontamos inconformidade?"
    ];

    for (const alias of aliases) {
      if (Object.prototype.hasOwnProperty.call(row, alias)) {
        return alias;
      }
    }

    return Object.keys(row).find(chave => {
      const k = normalizarNomeCampo(chave);
      return k === "apontamosinconformidade" ||
             k === "apontamosinconformidades";
    }) || null;
  }

  function valorApontamosInconformidade(row) {
    if (!row) return null;

    const campo =
      campoApontamosInconformidade ||
      localizarCampoApontamos(row);

    if (campo) {
      const valor = row[campo];
      if (valor !== null && valor !== undefined && String(valor).trim() !== "") {
        return valor;
      }
    }

    /*
     * Fallback para views que trazem o JSON completo das colunas
     * do Monday em dados_colunas.
     */
    const dadosColunas = row.dados_colunas;

    if (dadosColunas && typeof dadosColunas === "object") {
      for (const [id, coluna] of Object.entries(dadosColunas)) {
        if (!coluna || typeof coluna !== "object") continue;

        const titulo = normalizarNomeCampo(coluna.title || id);

        if (
          titulo === "apontamosinconformidade" ||
          titulo === "apontamosinconformidades"
        ) {
          return coluna.text ?? coluna.value ?? null;
        }
      }
    }

    return null;
  }

  function criterioAvaliado(row) {
    const classificacao = normalizar(
      row?.classificacao_especialista
    );

    /*
     * A coluna Classificação do especialista continua sendo
     * usada apenas para identificar se o critério foi avaliado.
     *
     * A fonte da NÃO CONFORMIDADE é exclusivamente
     * “Apontamos inconformidade?”.
     */
    if (["sim", "nao"].includes(classificacao)) {
      return true;
    }

    // Fallback: se a própria coluna Apontamos possuir Sim/Não,
    // o critério também é considerado avaliado.
    const apontamos = normalizar(
      valorApontamosInconformidade(row)
    );

    return [
      "sim", "s", "yes", "true", "1", "x",
      "nao", "n", "no", "false", "0"
    ].includes(apontamos);
  }

  function ehInconformidadeApontada(row) {
    const valor = normalizar(
      valorApontamosInconformidade(row)
    );

    return [
      "sim", "s", "yes", "true", "1", "x"
    ].includes(valor);
  }

  function criterioDaLinha(row) {
    return row?.criterio ||
      row?.name ||
      row?.nome_item ||
      row?.item_name ||
      "Critério não informado";
  }

  async function carregar() {
    if (
      resumo &&
      naoConformidades &&
      criteriosDetalhe
    ) {
      return;
    }

    if (carregando) {
      return carregando;
    }

    carregando = (async () => {
      const resumoView =
        window.BI_CONFIG
          ?.REUNIAO_RESUMO_VIEW_NAME ||
        "vw_nq_reuniao_resumo";

      const ncView =
        window.BI_CONFIG
          ?.REUNIAO_NC_VIEW_NAME ||
        "vw_nq_reuniao_criterios_resumo";

      const detalheView =
        window.BI_CONFIG
          ?.REUNIAO_DETALHE_VIEW_NAME ||
        "vw_nq_reuniao_criterios_detalhe";

      const [r1, r2] =
        await Promise.all([
          window.biSupabase
            .from(resumoView)
            .select("*")
            .limit(1),

          window.biSupabase
            .from(ncView)
            .select("*")
            .order(
              "percentual_nao_conformidade",
              {
                ascending: false
              }
            )
        ]);

      if (r1.error) throw r1.error;
      if (r2.error) throw r2.error;

      resumo =
        r1.data?.[0] || {};

      naoConformidades =
        r2.data || [];

      /*
       * V25.17
       * Lemos a view completa para garantir a coluna
       * “Apontamos inconformidade?” mesmo quando o alias da view
       * for diferente entre versões do banco.
       */
      const camposDetalhe = "*";

      const statusCarga =
        document.getElementById(
          "nqStatus"
        );

      if (statusCarga) {
        statusCarga.textContent =
          "Carregando critérios da reunião...";
      }

      const contagem =
        await window.biSupabase
          .from(detalheView)
          .select(
            "parent_item_id",
            {
              count: "exact",
              head: true
            }
          );

      if (contagem.error) {
        throw contagem.error;
      }

      const totalDetalhe =
        Number(
          contagem.count || 0
        );

      const loteDetalhe = 1000;

      const paginas =
        Math.ceil(
          totalDetalhe /
          loteDetalhe
        );

      criteriosDetalhe = [];

      for (
        let basePagina = 0;
        basePagina < paginas;
        basePagina += 6
      ) {
        const grupo = [];

        for (
          let pagina = basePagina;
          pagina <
          Math.min(
            basePagina + 6,
            paginas
          );
          pagina++
        ) {
          const inicio =
            pagina *
            loteDetalhe;

          grupo.push(
            window.biSupabase
              .from(detalheView)
              .select(
                camposDetalhe
              )
              .range(
                inicio,
                Math.min(
                  inicio +
                    loteDetalhe -
                    1,
                  totalDetalhe - 1
                )
              )
          );
        }

        const respostas =
          await Promise.all(
            grupo
          );

        respostas.forEach(
          resp => {
            if (resp.error) {
              throw resp.error;
            }

            criteriosDetalhe.push(
              ...(resp.data || [])
            );
          }
        );

        if (statusCarga) {
          const carregados =
            Math.min(
              (
                basePagina +
                grupo.length
              ) *
                loteDetalhe,
              totalDetalhe
            );

          statusCarga.textContent =
            `Carregando critérios da reunião... ` +
            `${fmt.format(carregados)} de ` +
            `${fmt.format(totalDetalhe)}`;
        }
      }

      campoApontamosInconformidade =
        localizarCampoApontamos(
          criteriosDetalhe?.[0] || null
        );

      if (campoApontamosInconformidade) {
        console.log(
          "Reunião NQ · fonte de inconformidade:",
          campoApontamosInconformidade
        );
      } else {
        const possuiFallbackJson =
          (criteriosDetalhe || []).slice(0, 25).some(
            linha => valorApontamosInconformidade(linha) !== null
          );

        if (!possuiFallbackJson) {
          console.warn(
            "Reunião NQ: a coluna 'Apontamos inconformidade?' não foi localizada na view de detalhe."
          );
        }
      }
    })();

    try {
      await carregando;
    } finally {
      carregando = null;
    }
  }

  function statusNQ(v) {
    return normalizar(v);
  }

  function separarPessoasNQ(valor) {
    return String(valor || "")
      .split(/\s*,\s*|\s*;\s*|\s*\|\s*|\r?\n+/)
      .map(v => v.trim())
      .filter(Boolean);
  }

  async function carregarRevisoresNQAtivos() {
    try {
      // Preferimos o cadastro oficial V25.20, que contém aliases/e-mails do Monday.
      const cadastroGlobal = window.BI_RESPONSAVEIS_NQ?.revisores;

      if (cadastroGlobal instanceof Map && cadastroGlobal.size > 0) {
        revisoresNQAtivos = new Map(cadastroGlobal);
        return;
      }

      const { data, error } = await window.biSupabase
        .from("nq_responsaveis")
        .select("nome_oficial,aliases,emails,eh_revisor,ativo")
        .eq("ativo", true)
        .eq("eh_revisor", true);

      if (error) throw error;

      revisoresNQAtivos = new Map();

      (data || []).forEach(r => {
        const nomeOficial = String(r.nome_oficial || "").trim();
        const chaves = [
          nomeOficial,
          ...(Array.isArray(r.aliases) ? r.aliases : []),
          ...(Array.isArray(r.emails) ? r.emails : [])
        ];

        chaves.forEach(valor => {
          const chave = normalizar(valor);
          if (nomeOficial && chave) {
            revisoresNQAtivos.set(chave, nomeOficial);
          }
        });
      });

      console.log(
        "Aliases de revisores NQ carregados:",
        revisoresNQAtivos.size
      );
    } catch (error) {
      console.error(
        "Erro ao carregar nq_responsaveis para Revisores mobilizados:",
        error
      );

      // Fallback: Base de Especialistas, para não quebrar o card se o SQL V25.20
      // ainda não tiver sido executado.
      try {
        const { data, error: fallbackError } = await window.biSupabase
          .from("nq_especialistas")
          .select("professor,ativo")
          .eq("ativo", true);

        if (fallbackError) throw fallbackError;

        revisoresNQAtivos = new Map();
        (data || []).forEach(r => {
          const nome = String(r.professor || "").trim();
          const chave = normalizar(nome);
          if (nome && chave) revisoresNQAtivos.set(chave, nome);
        });
      } catch {
        revisoresNQAtivos = new Map();
      }
    }
  }

  function resumoDosFiltros(dados) {
    if (!Array.isArray(dados)) {
      return null;
    }

    const noPeriodo =
      dados.filter(x =>
        statusNQ(
          x.status_validacao
        ).includes("validado")
      );

    const nome = x =>
      normalizar(
        `${x.item_name || ""} ` +
        `${x.titulo || ""} ` +
        `${x.categoria_material || ""} ` +
        `${x.formato || ""}`
      );

    const contar = rx =>
      noPeriodo.filter(
        x => rx.test(nome(x))
      ).length;

    const revisores =
      new Set();

    const revisoresBrutos =
      new Set();

    noPeriodo.forEach(x => {
      separarPessoasNQ(
        x.revisor_validador
      ).forEach(nome => {
        const chave = normalizar(nome);

        if (!chave) return;

        revisoresBrutos.add(chave);

        /*
         * V25.19
         * O card "Revisores mobilizados" deve representar apenas o corpo
         * de especialistas/revisores NQ. A coluna operacional do Monday pode
         * conter pessoas de outros papéis (DA/conteudista).
         *
         * A Base de Especialistas ativa funciona como lista oficial de
         * revisores válidos para este indicador.
         */
        if (
          revisoresNQAtivos.size > 0 &&
          revisoresNQAtivos.has(chave)
        ) {
          revisores.add(chave);
        }
      });
    });

    // Sem cadastro oficial carregado, não promovemos nomes operacionais
    // automaticamente a revisor NQ; isso evita voltar a contar DA/conteudista.

    const st =
      dados.map(x =>
        statusNQ(
          x.status_validacao
        )
      );

    return {
      uas_validadas:
        contar(
          /unidade de aprendizagem|(^|\s)ua(\s|$)/
        ),

      pp_validados:
        ppsValidadosAtual,

      a1_validadas:
        contar(
          /(^|\s)a1(\s|$)/
        ),

      a2_validadas:
        contar(
          /(^|\s)a2(\s|$)/
        ),

      a3_validadas:
        contar(
          /(^|\s)a3(\s|$)/
        ),

      lato_validadas:
        noPeriodo.filter(
          x =>
            normalizar(
              x.matriz_oferta
            ).includes("lato")
        ).length,

      revisores:
        revisores.size,

      total_materiais:
        new Set(
          dados
            .map(
              x =>
                x.chave_material ||
                x.monday_item_validacao
            )
            .filter(Boolean)
        ).size ||
        dados.length,

      validados:
        st.filter(
          x =>
            x.includes(
              "validado"
            )
        ).length,

      liberados_validacao:
        st.filter(
          x =>
            x.includes(
              "liberado"
            ) &&
            !x.includes(
              "revalidar"
            )
        ).length,

      revalidacao:
        st.filter(
          x =>
            x.includes(
              "revalidar"
            )
        ).length,

      ajustes_conteudista_da:
        st.filter(
          x =>
            x.includes(
              "ajust"
            )
        ).length,

      a_liberar:
        st.filter(
          x =>
            !x ||
            x === "a liberar"
        ).length
    };
  }

  function selecionadosFiltro(id) {
    return typeof
      window.obterSelecionados ===
      "function"
      ? window.obterSelecionados(id)
      : [];
  }

  function correspondeFiltro(
    valor,
    selecionados,
    multiplo = false
  ) {
    if (!selecionados.length) {
      return true;
    }

    const vazio =
      valor === null ||
      valor === undefined ||
      String(valor).trim() === "";

    if (vazio) {
      return selecionados.includes(
        "__EM_BRANCO__"
      );
    }

    const valores =
      multiplo
        ? String(valor)
            .split(",")
            .map(
              v =>
                normalizar(v)
            )
        : [
            normalizar(valor)
          ];

    return selecionados.some(
      sel =>
        sel !==
          "__EM_BRANCO__" &&
        valores.some(
          v =>
            v ===
            normalizar(sel)
        )
    );
  }

  async function carregarPPsValidadosDosFiltros() {
    const filtros = {
      esteira:
        selecionadosFiltro(
          "filtroEsteira"
        ),

      matriz:
        selecionadosFiltro(
          "filtroMatriz"
        ),

      status:
        selecionadosFiltro(
          "filtroStatus"
        ),

      categoria:
        selecionadosFiltro(
          "filtroCategoria"
        )
    };

    /*
     * PP = Projeto Pedagógico.
     *
     * Fonte oficial:
     * public.monday_pp_validacao
     */

    if (
      filtros.status.length &&
      !filtros.status.some(
        v =>
          normalizar(v) ===
          "validado"
      )
    ) {
      return 0;
    }

    const {
      data,
      error
    } =
      await window.biSupabase
        .from(
          "monday_pp_validacao"
        )
        .select(
          "monday_item_id," +
          "id_pp," +
          "status_validacao," +
          "esteira_producao," +
          "matriz_oferta," +
          "categoria_material"
        )
        .eq(
          "status_validacao",
          "Validado"
        );

    if (error) {
      console.error(
        "Erro ao carregar PPs validados:",
        error
      );

      throw error;
    }

    return (data || [])
      .filter(
        x =>
          correspondeFiltro(
            x.esteira_producao,
            filtros.esteira
          ) &&
          correspondeFiltro(
            x.matriz_oferta,
            filtros.matriz
          ) &&
          correspondeFiltro(
            x.categoria_material,
            filtros.categoria
          )
      )
      .length;
  }

  function filtrarCriteriosGlobais() {
    const filtros = {
      esteira:
        selecionadosFiltro(
          "filtroEsteira"
        ),

      matriz:
        selecionadosFiltro(
          "filtroMatriz"
        ),

      bloco:
        selecionadosFiltro(
          "filtroBloco"
        ),

      status:
        selecionadosFiltro(
          "filtroStatus"
        ),

      categoria:
        selecionadosFiltro(
          "filtroCategoria"
        ),

      gestor:
        selecionadosFiltro(
          "filtroGestor"
        ),

      revisor:
        selecionadosFiltro(
          "filtroRevisor"
        )
    };

    return (
      criteriosDetalhe || []
    ).filter(
      x =>
        correspondeFiltro(
          x.esteira_producao,
          filtros.esteira
        ) &&
        correspondeFiltro(
          x.matriz_oferta,
          filtros.matriz
        ) &&
        correspondeFiltro(
          x.bloco,
          filtros.bloco
        ) &&
        correspondeFiltro(
          x.status_validacao,
          filtros.status
        ) &&
        correspondeFiltro(
          x.categoria_material,
          filtros.categoria
        ) &&
        correspondeFiltro(
          x.gestor_validacao_nq,
          filtros.gestor
        ) &&
        correspondeFiltro(
          x.revisor_validador,
          filtros.revisor,
          true
        )
    );
  }

  function agregarCriterios(rows) {
    const mapa = new Map();

    rows.forEach(x => {
      /*
       * V25.18
       *
       * Denominador: todos os critérios efetivamente avaliados.
       * Não conformidade: SOMENTE quando “Apontamos inconformidade?” = Sim.
       *
       * Em muitos itens do Monday, a coluna Apontamos fica vazia quando
       * não há inconformidade; por isso vazio não pode ser descartado
       * depois que o critério já foi identificado como avaliado.
       */
      if (!criterioAvaliado(x)) {
        return;
      }

      const matriz =
        x.matriz_oferta ||
        "Matriz não identificada";

      const criterio =
        criterioDaLinha(x);

      const chave =
        `${matriz}|||${criterio}`;

      if (!mapa.has(chave)) {
        mapa.set(chave, {
          matriz_oferta: matriz,
          criterio,
          nao_conformidades: 0,
          conformidades: 0,
          criterios_avaliados: 0,
          _uas: new Set()
        });
      }

      const r = mapa.get(chave);

      r.criterios_avaliados++;

      if (ehInconformidadeApontada(x)) {
        r.nao_conformidades++;
      } else {
        r.conformidades++;
      }

      if (x.id_ua) {
        r._uas.add(x.id_ua);
      }
    });

    return [...mapa.values()].map(r => ({
      ...r,
      uas: r._uas.size,
      percentual_nao_conformidade:
        r.criterios_avaliados
          ? (r.nao_conformidades * 100 / r.criterios_avaliados)
          : 0
    }));
  }

  function configurarAbasNQ() {
    const botoes = [
      ...document.querySelectorAll(
        "[data-nq-tab]"
      )
    ];

    const secoes = [
      ...document.querySelectorAll(
        "#viewReuniaoNQ > .meeting-section[data-nq-section]"
      )
    ];

    if (
      !botoes.length ||
      !secoes.length
    ) {
      return;
    }

    const aplicar = tab => {
      botoes.forEach(
        b =>
          b.classList.toggle(
            "active",
            b.dataset.nqTab ===
              tab
          )
      );

      secoes.forEach(
        sec =>
          sec.classList.toggle(
            "nq-tab-hidden",
            sec.dataset
              .nqSection !== tab
          )
      );

      /*
       * Corrige os gráficos que
       * foram criados com a aba
       * Professores oculta.
       */
      if (
        tab === "professores"
      ) {
        requestAnimationFrame(
          () => {
            requestAnimationFrame(
              () => {
                graficoFormacoesCineNQ
                  ?.resize();

                graficoNivelFormacaoNQ
                  ?.resize();

                graficoCineNQ
                  ?.resize();

                graficoFormacoesNQ
                  ?.resize();

                graficoContratacaoNQ
                  ?.resize();

                graficoTitulacaoNQ
                  ?.resize();

                graficoExperienciasNQ
                  ?.resize();
              }
            );
          }
        );
      }
    };

    botoes.forEach(b => {
      if (
        b.dataset.ready !==
        "1"
      ) {
        b.dataset.ready =
          "1";

        b.addEventListener(
          "click",
          () =>
            aplicar(
              b.dataset.nqTab
            )
        );
      }
    });

    aplicar(
      document.querySelector(
        "[data-nq-tab].active"
      )?.dataset.nqTab ||
      "operacao"
    );
  }

  function renderResumo() {
    const rf =
      resumoDosFiltros(
        dadosBIAtuais
      ) ||
      resumo ||
      {};

    setText(
      "nqPeriodo",
      "Conforme filtros atuais"
    );

    setText(
      "nqUa",
      n(rf.uas_validadas)
    );

    setText(
      "nqPp",
      n(rf.pp_validados)
    );

    setText(
      "nqA1",
      n(rf.a1_validadas)
    );

    setText(
      "nqA2",
      n(rf.a2_validadas)
    );

    setText(
      "nqA3",
      n(rf.a3_validadas)
    );

    setText(
      "nqLato",
      n(rf.lato_validadas)
    );

    setText(
      "nqRevisores",
      n(
        rf.revisores ??
        revisoresDistintos
      )
    );

    setText(
      "nqTotal",
      n(rf.total_materiais)
    );

    setText(
      "nqValidados",
      n(rf.validados)
    );

    setText(
      "nqLiberados",
      n(
        rf.liberados_validacao
      )
    );

    setText(
      "nqRevalidacao",
      n(rf.revalidacao)
    );

    setText(
      "nqAjustes",
      n(
        rf.ajustes_conteudista_da
      )
    );

    setText(
      "nqALiberar",
      n(rf.a_liberar)
    );

    /*
     * V25.18
     * Critérios avaliados vêm da classificação do especialista.
     * A quantidade de NÃO conformes vem exclusivamente da coluna
     * “Apontamos inconformidade?” = Sim.
     *
     * Assim, um Apontamos vazio em um critério já avaliado representa
     * ausência de inconformidade, e não um registro a ser descartado.
     */
    const validos =
      criteriosFiltrados.filter(
        criterioAvaliado
      );

    const nao =
      validos.filter(
        ehInconformidadeApontada
      ).length;

    const conformes =
      Math.max(
        0,
        validos.length - nao
      );

    setText(
      "nqCriterios",
      n(validos.length)
    );

    setText(
      "nqConformes",
      n(conformes)
    );

    setText(
      "nqNaoConformes",
      n(nao)
    );

    setText(
      "nqTaxaConformidade",
      pct(
        validos.length
          ? conformes *
              100 /
              validos.length
          : 0
      )
    );

    setText(
      "nqTaxaNaoConformidade",
      pct(
        validos.length
          ? nao *
              100 /
              validos.length
          : 0
      )
    );
  }
    function renderTabela() {
    const tbody =
      document.getElementById(
        "tbodyNQConformidades"
      );

    if (!tbody) return;

    const rows =
      [...naoConformidades].sort(
        (a, b) =>
          String(
            a.matriz_oferta ||
            a.matriz ||
            ""
          ).localeCompare(
            String(
              b.matriz_oferta ||
              b.matriz ||
              ""
            ),
            "pt-BR"
          ) ||
          Number(
            b.nao_conformidades ||
            0
          ) -
          Number(
            a.nao_conformidades ||
            0
          )
      );

    tbody.innerHTML =
      rows.map(x => {
        const nao =
          Number(
            x.nao_conformidades ??
            x.nao_conformidade ??
            0
          );

        const avaliados =
          Number(
            x.criterios_avaliados ||
            0
          );

        const conf =
          Math.max(
            0,
            Number(
              x.conformidades ??
              x.conformidade ??
              (
                avaliados -
                nao
              )
            )
          );

        return `
          <tr>
            <td>
              ${escapeHtml(
                x.matriz_oferta ||
                x.matriz ||
                "Não informada"
              )}
            </td>

            <td>
              ${escapeHtml(
                x.uas ??
                x.total_uas ??
                "--"
              )}
            </td>

            <td>
              ${escapeHtml(
                x.criterio
              )}
            </td>

            <td>
              ${n(nao)}
            </td>

            <td>
              ${n(conf)}
            </td>

            <td>
              ${pct(
                x.percentual_nao_conformidade
              )}
            </td>
          </tr>
        `;
      }).join("") ||
      `
        <tr>
          <td colspan="6">
            Nenhuma não conformidade encontrada.
          </td>
        </tr>
      `;
  }


  function renderGrafico() {
    if (!window.echarts) {
      return;
    }

    const el =
      document.getElementById(
        "graficoNQConformidades"
      );

    if (!el) {
      return;
    }

    grafico ||=
      echarts.init(el);

    const dados =
      [...naoConformidades]
        .filter(
          x =>
            Number(
              x.nao_conformidades ??
              x.nao_conformidade ??
              0
            ) > 0
        )
        .sort(
          (a, b) =>
            Number(
              b.nao_conformidades ??
              b.nao_conformidade ??
              0
            ) -
            Number(
              a.nao_conformidades ??
              a.nao_conformidade ??
              0
            )
        )
        .slice(0, 15)
        .reverse();

    el.style.minHeight =
      `${Math.max(
        320,
        dados.length * 28
      )}px`;

    grafico.setOption({
      tooltip: {
        trigger: "axis",

        axisPointer: {
          type: "shadow"
        }
      },

      grid: {
        left: 12,
        right: 24,
        top: 10,
        bottom: 10,
        containLabel: true
      },

      xAxis: {
        type: "value",
        minInterval: 1,

        splitLine: {
          lineStyle: {
            color: "#eee8f3"
          }
        }
      },

      yAxis: {
        type: "category",

        data:
          dados.map(
            x => x.criterio
          ),

        axisLabel: {
          width: 180,
          overflow: "truncate",
          fontSize: 11
        }
      },

      series: [
        {
          type: "bar",

          data:
            dados.map(
              x =>
                Number(
                  x.nao_conformidades ??
                  x.nao_conformidade ??
                  0
                )
            ),

          barMaxWidth: 18,

          itemStyle: {
            borderRadius:
              [0, 7, 7, 0]
          },

          label: {
            show: true,
            position: "right"
          }
        }
      ]
    });
  }


  async function atualizarReuniaoNQ(
    dadosFiltrados
  ) {
    if (
      Array.isArray(
        dadosFiltrados
      )
    ) {
      dadosBIAtuais =
        dadosFiltrados;
    }

    const status =
      document.getElementById(
        "nqStatus"
      );

    try {
      await carregar();

      configurarAbasNQ();

      criteriosFiltrados =
        filtrarCriteriosGlobais();

      naoConformidades =
        agregarCriterios(
          criteriosFiltrados
        );

      /*
       * Consulta os Projetos
       * Pedagógicos validados
       * antes de renderizar
       * os cards.
       */
      ppsValidadosAtual =
        await carregarPPsValidadosDosFiltros();

      // V25.19 · Carrega a lista oficial de revisores NQ antes do KPI.
      await carregarRevisoresNQAtivos();

      renderResumo();

      renderTabela();

      renderGrafico();

      configurarImportacaoNQ();

      await carregarHistoricoImportacoesNQ();

      configurarFiltroCoberturaNQ();

      await carregarFormacaoCoberturaNQ();

      renderCoberturaNQ();

      if (status) {
        const fonteEncontrada =
          (criteriosDetalhe || []).slice(0, 50).some(
            linha => valorApontamosInconformidade(linha) !== null
          );

        status.textContent = fonteEncontrada
          ? "Dados atualizados conforme os filtros globais. Não conformidades: coluna ‘Apontamos inconformidade?’ do Monday."
          : "Atenção: a coluna ‘Apontamos inconformidade?’ não foi localizada na view de critérios. Verifique a view vw_nq_reuniao_criterios_detalhe.";
      }

    } catch (e) {
      console.error(
        "Erro ao carregar Reunião NQ:",
        e
      );

      if (status) {
        status.textContent =
          "Erro ao carregar a página da reunião: " +
          (
            e?.message ||
            "erro desconhecido"
          );
      }
    }
  }


  // ============================================================
  // Importação e cobertura da base de especialistas NQ
  // ============================================================

  async function carregarFormacaoCoberturaNQ() {
    const [f, e, p, d] =
      await Promise.all([
        window.biSupabase
          .from(
            "vw_nq_especialistas_formacoes"
          )
          .select("*")
          .order(
            "professor",
            {
              ascending: true
            }
          ),

        window.biSupabase
          .from(
            "nq_especialistas_experiencias"
          )
          .select(
            "especialista_id,area_experiencia"
          ),

        window.biSupabase
          .from(
            "vw_nq_perfil_academico"
          )
          .select("*")
          .order(
            "professor",
            {
              ascending: true
            }
          ),

        window.biSupabase
          .from(
            "vw_nq_especialistas_diplomas"
          )
          .select("*")
          .order(
            "professor",
            { ascending: true }
          )
      ]);

    if (f.error) {
      throw f.error;
    }

    if (e.error) {
      console.warn(
        "Experiências NQ:",
        e.error
      );
    }

    if (p.error) {
      console.warn(
        "Perfil acadêmico NQ ainda não instalado:",
        p.error
      );
    }

    if (d.error) {
      console.warn(
        "Diplomas NQ ainda não instalados:",
        d.error
      );
    }

    formacoesNQ =
      (f.data || [])
        .filter(
          r => r.professor
        );

    experienciasNQ =
      e.data || [];

    perfilAcademicoNQ =
      p.error
        ? []
        : (p.data || [])
            .filter(
              r => r.professor
            );

    diplomasNQ =
      d.error
        ? []
        : (d.data || [])
            .filter(r => r.professor);
  }


  function uniq(arr) {
    return [
      ...new Set(
        arr.filter(
          v =>
            v !== null &&
            v !== undefined &&
            String(v).trim() !==
              ""
        )
      )
    ];
  }


  function classeTitulacaoFiltro(
    row
  ) {
    const perfil =
      perfilAcademicoNQ.find(
        p =>
          normalizar(p.professor) ===
          normalizar(row.professor)
      );

    const t =
      normalizar(
        `${perfil?.titulacao_maxima_concluida || ""} ` +
        `${row.titulacao_maxima || ""} ` +
        `${row.formacao || ""}`
      );

    if (
      t.includes("dout")
    ) {
      return "doutor";
    }

    if (
      t.includes("mestr") ||
      /\bmsc\b|\bme\b|\bma\b/.test(
        t
      )
    ) {
      return "mestre";
    }

    if (
      t.includes(
        "especial"
      ) ||
      t.includes("mba")
    ) {
      return "especialista";
    }

    if (
      t.includes(
        "bacharel"
      ) ||
      t.includes(
        "licencia"
      ) ||
      t.includes(
        "tecnolog"
      ) ||
      t.includes("gradu")
    ) {
      return "graduado";
    }

    return "";
  }


  function situacaoFormacaoFiltro(
    row
  ) {
    const t =
      normalizar(
        `${row.situacao_formacao || ""} ` +
        `${row.status_formacao || ""} ` +
        `${row.formacao || ""}`
      );

    return (
      /andamento|cursando|em curso|incomplet/.test(
        t
      )
        ? "andamento"
        : "concluido"
    );
  }


  function situacaoEspecialistaFiltro(
    row
  ) {
    const t =
      normalizar(
        row.situacao_contratacao ||
        ""
      );

    if (
      t.includes("inativ") ||
      t.includes("deslig") ||
      t.includes("encerr")
    ) {
      return "inativo";
    }

    if (
      t.includes("ativ")
    ) {
      return "ativo";
    }

    return row.ativo === false
      ? "inativo"
      : "ativo";
  }


  function titulacaoCorrespondeFiltro(
    classe,
    filtro
  ) {
    if (!filtro) {
      return true;
    }

    if (
      filtro ===
      "academico_superior"
    ) {
      return [
        "graduado",
        "mestre",
        "doutor"
      ].includes(classe);
    }

    return classe === filtro;
  }


  function formacoesFiltradasNQ() {
    const tit =
      document.getElementById(
        "nqFiltroTitulacao"
      )?.value || "";

    const sit =
      document.getElementById(
        "nqFiltroSituacaoFormacao"
      )?.value || "";

    const vinculo =
      document.getElementById(
        "nqFiltroSituacaoEspecialista"
      )?.value || "";

    return formacoesNQ.filter(
      r => {
        const classe =
          classeTitulacaoFiltro(
            r
          );

        return (
          titulacaoCorrespondeFiltro(
            classe,
            tit
          ) &&
          (
            !sit ||
            situacaoFormacaoFiltro(
              r
            ) === sit
          ) &&
          (
            !vinculo ||
            situacaoEspecialistaFiltro(
              r
            ) === vinculo
          )
        );
      }
    );
  }


  // ============================================================
  // V25.10
  // GRADUAÇÕES
  //
  // A fonte oficial para contagem de graduações passa a ser
  // o Perfil Acadêmico/Lattes.
  //
  // NÃO utilizar o campo genérico `formacao` da Base de
  // Especialistas para calcular o número de graduações.
  // ============================================================

  function separarValoresAcademicos(
    ...valores
  ) {
    const saida =
      new Map();

    valores.forEach(
      valor => {
        if (
          !temValor(valor)
        ) {
          return;
        }

        String(valor)
          .split(
            /\s*\|\s*|\s*;\s*|\r?\n+/
          )
          .map(
            v => v.trim()
          )
          .filter(
            temValor
          )
          .forEach(v => {
            const chave =
              normalizar(v);

            if (
              chave &&
              !saida.has(
                chave
              )
            ) {
              saida.set(
                chave,
                v
              );
            }
          });
      }
    );

    return [
      ...saida.values()
    ];
  }


  function graduacoesProfessorNQ(
    perfil
  ) {
    if (!perfil) {
      return [];
    }

    return separarValoresAcademicos(
      perfil.graduacao_1,
      perfil.graduacao_2,
      perfil.graduacao_3_mais
    );
  }


  function renderKPIsCoberturaNQ() {
    const baseFiltrada =
      formacoesFiltradasNQ();

    /*
     * Professores existentes na Base de Especialistas.
     */
    const professores =
      uniq(
        baseFiltrada
          .map(
            r => r.professor
          )
          .filter(Boolean)
      );

    /*
     * Cria um conjunto normalizado dos professores
     * que estão sendo considerados pelos filtros.
     */
    const nomesFiltrados =
      new Set(
        professores
          .map(
            normalizar
          )
          .filter(Boolean)
      );

    /*
     * Cruza os professores da Base de Especialistas
     * com o Perfil Acadêmico/Lattes.
     */
    const perfisConsiderados =
      perfilAcademicoNQ.filter(
        r =>
          r.professor &&
          (
            !nomesFiltrados.size ||
            nomesFiltrados.has(
              normalizar(
                r.professor
              )
            )
          )
      );

    /*
     * Graduações serão consolidadas professor por professor.
     *
     * Isso evita:
     * - repetição do mesmo curso;
     * - contagem de área CINE como graduação;
     * - contagem de especialização como graduação;
     * - duplicação causada pela Base de Especialistas.
     */
    const graduacoesPorProfessor =
      new Map();

    perfisConsiderados.forEach(
      perfil => {
        const professor =
          normalizar(
            perfil.professor
          );

        if (!professor) {
          return;
        }

        const graduacoes =
          graduacoesProfessorNQ(
            perfil
          );

        if (
          !graduacoesPorProfessor.has(
            professor
          )
        ) {
          graduacoesPorProfessor.set(
            professor,
            new Map()
          );
        }

        const mapaProfessor =
          graduacoesPorProfessor.get(
            professor
          );

        graduacoes.forEach(
          graduacao => {
            const chave =
              normalizar(
                graduacao
              );

            if (
              chave &&
              !mapaProfessor.has(
                chave
              )
            ) {
              mapaProfessor.set(
                chave,
                graduacao
              );
            }
          }
        );
      }
    );

    /*
     * Total real de graduações:
     *
     * Soma a quantidade de graduações diferentes
     * de cada professor.
     *
     * Exemplo:
     *
     * Professor A = 2
     * Professor B = 1
     * Professor C = 3
     *
     * Total = 6
     */
    let totalGraduacoes = 0;

    graduacoesPorProfessor.forEach(
      mapaProfessor => {
        totalGraduacoes +=
          mapaProfessor.size;
      }
    );

    /*
     * Graduações únicas na equipe.
     *
     * Aqui o mesmo curso realizado por professores
     * diferentes é contado apenas uma vez.
     */
    const cursosUnicos =
      new Map();

    graduacoesPorProfessor.forEach(
      mapaProfessor => {
        mapaProfessor.forEach(
          (
            graduacao,
            chave
          ) => {
            if (
              !cursosUnicos.has(
                chave
              )
            ) {
              cursosUnicos.set(
                chave,
                graduacao
              );
            }
          }
        );
      }
    );

    /*
     * Área CINE continua vindo da Base de Especialistas,
     * pois ela representa a classificação da área e não
     * a titulação acadêmica.
     */
    const areasCine =
      uniq(
        baseFiltrada
          .map(
            r => r.area_cine
          )
          .filter(
            temValor
          )
          .map(
            normalizar
          )
      );

    /*
     * PROFESSORES
     */
    setText(
      "nqProfessoresTotal",
      n(
        professores.length
      )
    );

    const vinculoAtual =
      document.getElementById(
        "nqFiltroSituacaoEspecialista"
      )?.value || "";

    setText(
      "nqProfessoresLegenda",
      vinculoAtual === "ativo"
        ? "especialistas ativos"
        : vinculoAtual === "inativo"
          ? "especialistas inativos"
          : "especialistas na base"
    );

    /*
     * GRADUAÇÕES ÚNICAS
     *
     * Quantidade de cursos diferentes existentes
     * entre todos os professores.
     */
    setText(
      "nqFormacoesUnicas",
      n(
        cursosUnicos.size
      )
    );

    /*
     * TOTAL DE GRADUAÇÕES
     *
     * Soma das graduações individuais dos professores.
     */
    setText(
      "nqFormacoesTotal",
      n(
        totalGraduacoes
      )
    );

    /*
     * MÉDIA DE GRADUAÇÕES POR PROFESSOR
     */
    setText(
      "nqMediaFormacoes",
      professores.length
        ? (
            totalGraduacoes /
            professores.length
          ).toLocaleString(
            "pt-BR",
            {
              minimumFractionDigits:
                1,

              maximumFractionDigits:
                1
            }
          )
        : "0,0"
    );

    /*
     * Professores no filtro atual.
     */
    setText(
      "nqMaisAreas",
      n(
        professores.length
      )
    );

    /*
     * Áreas CINE abrangidas.
     */
    setText(
      "nqAreasCineTotal",
      n(
        areasCine.length
      )
    );
  }

  function diplomasFiltradosNQ() {
    const base =
      formacoesFiltradasNQ();

    // Se a Base de Especialistas ainda não carregou, mantém o fallback
    // para Diplomas. Se um filtro foi aplicado e não encontrou ninguém,
    // o resultado correto é vazio (e não todos os diplomas).
    if (!formacoesNQ.length) {
      return diplomasNQ;
    }

    if (!base.length) {
      return [];
    }

    const nomes =
      new Set(
        base
          .map(
            r =>
              normalizar(
                r.professor
              )
          )
          .filter(Boolean)
      );

    return diplomasNQ.filter(
      r =>
        nomes.has(
          normalizar(
            r.professor
          )
        )
    );
  }

  function renderKPIsFormacoesDiplomasNQ() {
    const dados = diplomasFiltradosNQ();
    const concluidas = dados.filter(r => normalizar(r.situacao).includes("conclu")).length;
    const andamento = dados.filter(r => normalizar(r.situacao).includes("andamento")).length;
    const areas = uniq(dados.map(r => r.area_cine).filter(temValor).map(normalizar));
    setText("nqTotalFormacoesAcademicas", n(dados.length));
    setText("nqFormacoesConcluidas", n(concluidas));
    setText("nqFormacoesAndamento", n(andamento));
    // Se a tabela de Diplomas estiver instalada, ela é a fonte oficial da cobertura CINE.
    if (dados.length) setText("nqAreasCineTotal", n(areas.length));
  }

  function renderGraficoFormacoesCineNQ() {
    const el = document.getElementById("graficoNQFormacoesCine");

    if (!el || !window.echarts) {
      return;
    }

    const mapa = new Map();

    diplomasFiltradosNQ().forEach(r => {
      const area = String(
        r.area_cine || "Sem classificação CINE"
      ).trim();

      if (!mapa.has(area)) {
        mapa.set(area, {
          area,
          concluido: 0,
          andamento: 0
        });
      }

      const item = mapa.get(area);

      if (normalizar(r.situacao).includes("andamento")) {
        item.andamento++;
      } else {
        item.concluido++;
      }
    });

    const dados = [...mapa.values()].sort(
      (a, b) =>
        (b.concluido + b.andamento) -
        (a.concluido + a.andamento)
    );

    /*
     * IMPORTANTE:
     * o tamanho precisa existir ANTES do echarts.init().
     * Como a aba Professores nasce oculta, inicializar o ECharts
     * antes de definir altura/largura fazia o gráfico ficar comprimido.
     */
    const altura = Math.max(420, dados.length * 48 + 90);
    el.style.height = `${altura}px`;
    el.style.minHeight = `${altura}px`;
    el.style.width = "100%";

    graficoFormacoesCineNQ?.dispose();
    graficoFormacoesCineNQ = echarts.init(el);

    if (!dados.length) {
      graficoFormacoesCineNQ.setOption({
        title: {
          text: "Nenhuma formação CINE encontrada para o filtro atual.",
          left: "center",
          top: "middle",
          textStyle: {
            fontSize: 15,
            fontWeight: "normal"
          }
        }
      });
      return;
    }

    graficoFormacoesCineNQ.setOption({
      animationDuration: 350,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" }
      },
      legend: {
        top: 0,
        left: 0,
        data: ["Concluído", "Em andamento"]
      },
      grid: {
        left: 330,
        right: 55,
        top: 55,
        bottom: 40,
        containLabel: false
      },
      xAxis: {
        type: "value",
        min: 0,
        minInterval: 1,
        axisLabel: { formatter: "{value}" },
        splitLine: { show: true }
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: dados.map(x => x.area),
        axisTick: { show: false },
        axisLabel: {
          interval: 0,
          width: 300,
          overflow: "truncate",
          align: "right",
          margin: 14,
          formatter: value => value
        }
      },
      series: [
        {
          name: "Concluído",
          type: "bar",
          stack: "total",
          barMaxWidth: 30,
          data: dados.map(x => x.concluido),
          label: {
            show: true,
            position: "insideRight",
            formatter: p => p.value ? p.value : ""
          }
        },
        {
          name: "Em andamento",
          type: "bar",
          stack: "total",
          barMaxWidth: 30,
          data: dados.map(x => x.andamento),
          label: {
            show: true,
            position: "right",
            formatter: p => p.value ? p.value : ""
          }
        }
      ]
    });

    /*
     * Garante o cálculo final quando a aba acaba de ficar visível.
     */
    requestAnimationFrame(() => {
      graficoFormacoesCineNQ?.resize();
    });
  }


  function nivelDiplomaNQ(valor) {
    const t = normalizar(valor);

    if (t.includes("dout")) {
      return "doutorado";
    }

    if (t.includes("mestr")) {
      return "mestrado";
    }

    if (
      t.includes("especial") ||
      t.includes("mba")
    ) {
      return "especializacao";
    }

    if (
      t.includes("gradu") ||
      t.includes("bacharel") ||
      t.includes("licencia") ||
      t.includes("tecnolog")
    ) {
      return "graduacao";
    }

    return "";
  }


  function renderGraficoNivelFormacaoNQ() {
    const el =
      document.getElementById(
        "graficoNQNivelFormacao"
      );

    if (
      !el ||
      !window.echarts
    ) {
      return;
    }

    const nivelSelecionado =
      document.getElementById(
        "nqFiltroNivelGraficoFormacao"
      )?.value || "";

    const niveis = [
      { chave: "graduacao", nome: "Graduação" },
      { chave: "especializacao", nome: "Especialização" },
      { chave: "mestrado", nome: "Mestrado" },
      { chave: "doutorado", nome: "Doutorado" }
    ];

    const mapa = new Map();

    diplomasFiltradosNQ()
      .forEach(r => {
        const nivel =
          nivelDiplomaNQ(
            r.nivel
          );

        if (
          !nivel ||
          (
            nivelSelecionado &&
            nivel !== nivelSelecionado
          )
        ) {
          return;
        }

        const professor =
          String(
            r.professor ||
            "Professor não identificado"
          ).trim();

        if (!mapa.has(professor)) {
          mapa.set(professor, {
            professor,
            graduacao: 0,
            especializacao: 0,
            mestrado: 0,
            doutorado: 0
          });
        }

        mapa.get(professor)[nivel]++;
      });

    const dados =
      [...mapa.values()]
        .sort(
          (a, b) => {
            const totalA =
              a.graduacao +
              a.especializacao +
              a.mestrado +
              a.doutorado;

            const totalB =
              b.graduacao +
              b.especializacao +
              b.mestrado +
              b.doutorado;

            return (
              totalB - totalA ||
              a.professor.localeCompare(
                b.professor,
                "pt-BR"
              )
            );
          }
        );

    const altura =
      Math.max(
        420,
        dados.length * 34 + 100
      );

    el.style.height =
      `${altura}px`;
    el.style.minHeight =
      `${altura}px`;
    el.style.width = "100%";

    graficoNivelFormacaoNQ
      ?.dispose();

    graficoNivelFormacaoNQ =
      echarts.init(el);

    if (!dados.length) {
      graficoNivelFormacaoNQ.setOption({
        title: {
          text: "Nenhuma formação encontrada para o nível selecionado.",
          left: "center",
          top: "middle",
          textStyle: {
            fontSize: 15,
            fontWeight: "normal"
          }
        }
      });

      return;
    }

    const niveisVisiveis =
      nivelSelecionado
        ? niveis.filter(
            n =>
              n.chave ===
              nivelSelecionado
          )
        : niveis;

    graficoNivelFormacaoNQ.setOption({
      animationDuration: 350,

      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow"
        }
      },

      legend: {
        top: 0,
        left: 0,
        data:
          niveisVisiveis.map(
            n => n.nome
          )
      },

      grid: {
        left: 285,
        right: 55,
        top: 55,
        bottom: 35,
        containLabel: false
      },

      xAxis: {
        type: "value",
        min: 0,
        minInterval: 1,
        name: "Formações"
      },

      yAxis: {
        type: "category",
        inverse: true,
        data:
          dados.map(
            d => d.professor
          ),
        axisLabel: {
          interval: 0,
          width: 255,
          overflow: "truncate",
          margin: 12
        }
      },

      series:
        niveisVisiveis.map(
          nivel => ({
            name: nivel.nome,
            type: "bar",
            stack: "formacoes",
            barMaxWidth: 24,
            data:
              dados.map(
                d =>
                  d[nivel.chave]
              ),
            label: {
              show: true,
              position: "insideRight",
              formatter: p =>
                p.value
                  ? p.value
                  : ""
            }
          })
        )
    });

    requestAnimationFrame(
      () =>
        graficoNivelFormacaoNQ
          ?.resize()
    );
  }

    function renderGraficoCineNQ() {
    const el =
      document.getElementById(
        "graficoNQCine"
      );

    if (
      !el ||
      !window.echarts
    ) {
      return;
    }

    const mapa =
      new Map();

    formacoesFiltradasNQ()
      .filter(
        r =>
          r.area_cine &&
          r.professor
      )
      .forEach(r => {
        if (
          !mapa.has(
            r.area_cine
          )
        ) {
          mapa.set(
            r.area_cine,
            new Set()
          );
        }

        mapa
          .get(
            r.area_cine
          )
          .add(
            r.professor
          );
      });

    const dados =
      [...mapa.entries()]
        .map(
          ([area, profs]) => ({
            area,
            total:
              profs.size
          })
        )
        .sort(
          (a, b) =>
            b.total -
            a.total
        );

    graficoCineNQ?.dispose();

    graficoCineNQ =
      echarts.init(el);

    graficoCineNQ.setOption({
      grid: {
        left: 42,
        right: 18,
        top: 24,
        bottom: 100
      },

      tooltip: {
        trigger: "axis",

        axisPointer: {
          type: "shadow"
        }
      },

      xAxis: {
        type: "category",

        data:
          dados.map(
            d =>
              d.area.replace(
                /^\d+\s*[·-]\s*/,
                ""
              )
          ),

        axisLabel: {
          rotate: 30,
          fontSize: 10,
          interval: 0
        }
      },

      yAxis: {
        type: "value",
        minInterval: 1,
        name: "Professores"
      },

      series: [
        {
          type: "bar",

          data:
            dados.map(
              d => d.total
            ),

          barMaxWidth: 42,

          label: {
            show: true,
            position: "top"
          },

          itemStyle: {
            borderRadius:
              [5, 5, 0, 0]
          }
        }
      ]
    });
  }


  function renderGraficoFormacoesProfessorNQ() {
    const el =
      document.getElementById(
        "graficoNQFormacoesProfessor"
      );

    if (
      !el ||
      !window.echarts
    ) {
      return;
    }

    const mapa =
      new Map();

    formacoesFiltradasNQ()
      .filter(
        r => r.professor
      )
      .forEach(r => {
        const marca =
          String(
            r.marca_origem ||
            r.marca_area_contratante ||
            "Não informada"
          ).trim();

        if (
          !mapa.has(
            marca
          )
        ) {
          mapa.set(
            marca,
            new Set()
          );
        }

        mapa
          .get(marca)
          .add(
            r.professor
          );
      });

    const dados =
      [...mapa.entries()]
        .map(
          ([marca, s]) => ({
            marca,
            total:
              s.size
          })
        )
        .sort(
          (a, b) =>
            b.total -
            a.total
        );

    graficoFormacoesNQ?.dispose();

    graficoFormacoesNQ =
      echarts.init(el);

    graficoFormacoesNQ.setOption({
      grid: {
        left: 42,
        right: 18,
        top: 24,
        bottom: 80
      },

      tooltip: {
        trigger: "axis",

        axisPointer: {
          type: "shadow"
        }
      },

      xAxis: {
        type: "category",

        data:
          dados.map(
            d => d.marca
          ),

        axisLabel: {
          rotate: 25,
          interval: 0
        }
      },

      yAxis: {
        type: "value",
        minInterval: 1,
        name: "Professores"
      },

      series: [
        {
          type: "bar",

          data:
            dados.map(
              d => d.total
            ),

          barMaxWidth: 42,

          label: {
            show: true,
            position: "top"
          },

          itemStyle: {
            borderRadius:
              [5, 5, 0, 0]
          }
        }
      ]
    });
  }


  function renderGraficoContratacaoNQ() {
    const tbody =
      document.getElementById(
        "tbodyNQContratacao"
      );

    if (!tbody) {
      return;
    }

    // A visualização anterior era um gráfico ECharts.
    // A partir da V25.23, a informação é exibida em formato de tabela.
    graficoContratacaoNQ
      ?.dispose();
    graficoContratacaoNQ = null;

    const porProfessor =
      new Map();

    formacoesFiltradasNQ()
      .forEach(r => {
        if (!r.professor) {
          return;
        }

        const chave =
          normalizar(
            r.professor
          );

        if (!porProfessor.has(chave)) {
          porProfessor.set(chave, r);
        }
      });

    const registros =
      [...porProfessor.values()]
        .map(r => {
          const inicioRaw =
            r.data_inicio ||
            r.data_contratacao ||
            r.data_admissao ||
            r.contratacao ||
            r.data_inicio_contratacao;

          const saidaRaw =
            r.data_saida ||
            r.data_fim ||
            r.data_desligamento;

          const inicio =
            inicioRaw
              ? new Date(inicioRaw)
              : null;

          const saida =
            saidaRaw
              ? new Date(saidaRaw)
              : null;

          return {
            professor:
              String(
                r.professor || ""
              ).trim(),

            inicio:
              inicio &&
              !Number.isNaN(
                inicio.getTime()
              )
                ? inicio
                : null,

            saida:
              saida &&
              !Number.isNaN(
                saida.getTime()
              )
                ? saida
                : null
          };
        })
        .filter(
          r => r.professor
        )
        .sort(
          (a, b) =>
            a.professor.localeCompare(
              b.professor,
              "pt-BR"
            )
        );

    if (!registros.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="3">
            Nenhum professor encontrado para os filtros atuais.
          </td>
        </tr>
      `;
      return;
    }

    const formatarData = data =>
      data
        ? data.toLocaleDateString(
            "pt-BR"
          )
        : "—";

    tbody.innerHTML =
      registros
        .map(r => `
          <tr>
            <td>
              <strong>${escapeHtml(r.professor)}</strong>
            </td>
            <td>${escapeHtml(formatarData(r.inicio))}</td>
            <td>${escapeHtml(formatarData(r.saida))}</td>
          </tr>
        `)
        .join("");
  }

  function consolidarProfessoresNQ() {
    const mapa =
      new Map();

    const garantirProfessor =
      professor => {
        const nome =
          String(
            professor || ""
          ).trim();

        if (!nome) {
          return null;
        }

        const chave =
          normalizar(nome);

        if (
          !mapa.has(chave)
        ) {
          mapa.set(
            chave,
            {
              professor:
                nome,

              formacoes:
                new Map(),

              areasCine:
                new Map(),

              titulacoes:
                new Map(),

              marcas:
                new Map(),

              situacoes:
                new Map()
            }
          );
        }

        return mapa.get(
          chave
        );
      };


    const adicionar =
      (
        map,
        valor
      ) => {
        const texto =
          String(
            valor || ""
          ).trim();

        if (
          !temValor(texto)
        ) {
          return;
        }

        const chave =
          normalizar(
            texto
          );

        if (
          !map.has(chave)
        ) {
          map.set(
            chave,
            texto
          );
        }
      };


    /*
     * Base de Especialistas.
     *
     * Mantém:
     * - Área CINE
     * - Marca
     * - Situação
     * - Titulação disponível na base
     *
     * A coluna de formações será corrigida depois
     * pelo Perfil Acadêmico/Lattes.
     */
    formacoesFiltradasNQ()
      .forEach(r => {
        const item =
          garantirProfessor(
            r.professor
          );

        if (!item) {
          return;
        }

        adicionar(
          item.formacoes,
          r.formacao
        );

        adicionar(
          item.areasCine,
          r.area_cine
        );

        adicionar(
          item.titulacoes,
          r.titulacao_maxima
        );

        adicionar(
          item.marcas,
          r.marca_origem ||
          r.marca_area_contratante
        );

        adicionar(
          item.situacoes,
          r.situacao_contratacao
        );
      });


    /*
     * V25.10
     *
     * O Perfil Acadêmico/Lattes passa a ser
     * a fonte oficial das graduações.
     */
    perfilAcademicoNQ
      .forEach(r => {
        const item =
          garantirProfessor(
            r.professor
          );

        if (!item) {
          return;
        }

        /*
         * GRADUAÇÕES
         *
         * Se existir Perfil Acadêmico para o professor,
         * substituímos o conteúdo genérico de "formacao"
         * pelas graduações estruturadas do Lattes.
         */
        const graduacoesLattes =
          graduacoesProfessorNQ(
            r
          );

        if (
          graduacoesLattes.length
        ) {
          item.formacoes.clear();

          graduacoesLattes
            .forEach(
              graduacao =>
                adicionar(
                  item.formacoes,
                  graduacao
                )
            );
        }


        /*
         * TITULAÇÃO MÁXIMA CONCLUÍDA
         */
        const maxConcluida =
          r.titulacao_maxima_concluida ||
          r.titulacao_maxima;

        if (
          temValor(
            maxConcluida
          )
        ) {
          adicionar(
            item.titulacoes,
            `${classificarTitulacao(
              maxConcluida
            )} (concluída)`
          );
        }


        /*
         * TITULAÇÃO EM ANDAMENTO
         */
        if (
          temValor(
            r.titulacao_em_andamento
          )
        ) {
          adicionar(
            item.titulacoes,
            `${classificarTitulacao(
              r.titulacao_em_andamento
            )} (em andamento)`
          );
        }


        /*
         * FALLBACKS
         *
         * Servem para garantir que nenhuma titulação
         * desapareça quando titulacao_maxima_concluida
         * estiver vazia.
         */

        if (
          temValor(
            r.pos_doutorado
          )
        ) {
          adicionar(
            item.titulacoes,
            "Pós-doutorado"
          );
        }

        if (
          temValor(
            r.doutorado
          )
        ) {
          adicionar(
            item.titulacoes,
            "Doutorado"
          );
        }

        if (
          temValor(
            r.mestrado
          )
        ) {
          adicionar(
            item.titulacoes,
            "Mestrado"
          );
        }

        if (
          temValor(
            r.especializacao_1
          ) ||
          temValor(
            r.especializacao_2
          ) ||
          temValor(
            r.especializacao_3_mais
          )
        ) {
          adicionar(
            item.titulacoes,
            "Especialização"
          );
        }

        if (
          temValor(
            r.graduacao_1
          ) ||
          temValor(
            r.graduacao_2
          ) ||
          temValor(
            r.graduacao_3_mais
          )
        ) {
          adicionar(
            item.titulacoes,
            "Graduação"
          );
        }


        adicionar(
          item.marcas,
          r.marca_origem ||
          r.marca_area_contratante
        );

        adicionar(
          item.situacoes,
          r.situacao_contratacao
        );
      });


    return [
      ...mapa.values()
    ]
      .map(
        item => ({
          professor:
            item.professor,

          formacoes:
            [
              ...item.formacoes.values()
            ].sort(
              (a, b) =>
                a.localeCompare(
                  b,
                  "pt-BR"
                )
            ),

          areasCine:
            [
              ...item.areasCine.values()
            ].sort(
              (a, b) =>
                a.localeCompare(
                  b,
                  "pt-BR"
                )
            ),

          titulacoes:
            [
              ...item.titulacoes.values()
            ].sort(
              (a, b) =>
                a.localeCompare(
                  b,
                  "pt-BR"
                )
            ),

          marcas:
            [
              ...item.marcas.values()
            ].sort(
              (a, b) =>
                a.localeCompare(
                  b,
                  "pt-BR"
                )
            ),

          situacoes:
            [
              ...item.situacoes.values()
            ].sort(
              (a, b) =>
                a.localeCompare(
                  b,
                  "pt-BR"
                )
            )
        })
      )
      .sort(
        (a, b) =>
          a.professor.localeCompare(
            b.professor,
            "pt-BR"
          )
      );
  }


  function renderMatrizFormacaoNQ() {
    const tbody =
      document.getElementById(
        "tbodyNQFormacaoMatriz"
      );

    if (!tbody) {
      return;
    }

    const professores =
      consolidarProfessoresNQ();

    tbody.innerHTML =
      professores.length
        ? professores
            .map(
              p => `
                <tr>

                  <td>
                    <strong>
                      ${escapeHtml(
                        p.professor
                      )}
                    </strong>
                  </td>

                  <td class="nq-multivalue-cell">

                    ${
                      p.formacoes.length

                        ? p.formacoes
                            .map(
                              f =>
                                `<span class="nq-chip">${escapeHtml(
                                  f
                                )}</span>`
                            )
                            .join("")

                        : "--"
                    }

                  </td>

                  <td class="nq-center">

                    ${
                      p.formacoes.length
                    }

                  </td>

                  <td class="nq-multivalue-cell">

                    ${
                      p.areasCine.length

                        ? p.areasCine
                            .map(
                              a =>
                                `<span class="nq-chip nq-chip-cine">${escapeHtml(
                                  a
                                )}</span>`
                            )
                            .join("")

                        : '<span class="nq-chip nq-chip-empty">Não classificada</span>'
                    }

                  </td>

                  <td>

                    ${escapeHtml(
                      p.titulacoes.join(
                        " · "
                      ) || "--"
                    )}

                  </td>

                </tr>
              `
            )
            .join("")

        : `
            <tr>
              <td colspan="5">
                Nenhum professor encontrado.
              </td>
            </tr>
          `;
  }


  function renderListaFormacoesNQ() {
    const tbody =
      document.getElementById(
        "tbodyNQFormacoesDetalhe"
      );

    if (!tbody) {
      return;
    }

    const professores =
      consolidarProfessoresNQ();

    tbody.innerHTML =
      professores.length
        ? professores
            .map(
              p => `
                <tr>

                  <td>
                    <strong>
                      ${escapeHtml(
                        p.professor
                      )}
                    </strong>
                  </td>

                  <td class="nq-multivalue-cell">

                    ${
                      p.formacoes.length

                        ? p.formacoes
                            .map(
                              f =>
                                `<span class="nq-chip">${escapeHtml(
                                  f
                                )}</span>`
                            )
                            .join("")

                        : "--"
                    }

                  </td>

                  <td>

                    ${escapeHtml(
                      p.titulacoes.join(
                        " · "
                      ) || "--"
                    )}

                  </td>

                  <td class="nq-multivalue-cell">

                    ${
                      p.areasCine.length

                        ? p.areasCine
                            .map(
                              a =>
                                `<span class="nq-chip nq-chip-cine">${escapeHtml(
                                  a
                                )}</span>`
                            )
                            .join("")

                        : '<span class="nq-chip nq-chip-empty">Não classificada</span>'
                    }

                  </td>

                  <td>

                    ${escapeHtml(
                      p.marcas.join(
                        " · "
                      ) || "--"
                    )}

                  </td>

                  <td>

                    ${escapeHtml(
                      p.situacoes.join(
                        " · "
                      ) || "--"
                    )}

                  </td>

                </tr>
              `
            )
            .join("")

        : `
            <tr>
              <td colspan="6">
                Nenhum professor encontrado.
              </td>
            </tr>
          `;
  }


  function renderExperienciasNQ() {
    const el =
      document.getElementById(
        "nqExperienciaStatus"
      );

    if (!el) {
      return;
    }

    const baseFiltrada =
      formacoesFiltradasNQ();

    const nomesFiltrados =
      new Set(
        baseFiltrada
          .map(r => normalizar(r.professor))
          .filter(Boolean)
      );

    const perfis =
      perfilAcademicoNQ
        .filter(r =>
          r.professor &&
          (
            !nomesFiltrados.size ||
            nomesFiltrados.has(normalizar(r.professor))
          )
        )
        .sort((a, b) =>
          String(a.professor || "")
            .localeCompare(String(b.professor || ""), "pt-BR")
        );

    const experienciasPorEspecialista =
      new Map();

    experienciasNQ.forEach(r => {
      const id =
        String(r.especialista_id || "").trim();

      if (!id) return;

      if (!experienciasPorEspecialista.has(id)) {
        experienciasPorEspecialista.set(id, []);
      }

      separarValoresAcademicos(
        r.area_experiencia
      ).forEach(valor => {
        experienciasPorEspecialista
          .get(id)
          .push(valor);
      });
    });

    const experienciasGlobais =
      new Map();

    const adicionarGlobal = valor => {
      separarValoresAcademicos(valor)
        .forEach(item => {
          const chave = normalizar(item);
          if (
            chave &&
            !experienciasGlobais.has(chave)
          ) {
            experienciasGlobais.set(chave, item);
          }
        });
    };

    perfis.forEach(r => {
      adicionarGlobal(r.areas_atuacao);
      adicionarGlobal(r.experiencia_profissional);

      const complementares =
        experienciasPorEspecialista.get(
          String(r.especialista_id || "").trim()
        ) || [];

      complementares.forEach(adicionarGlobal);
    });

    setText(
      "nqExperienciasTotal",
      n(experienciasGlobais.size)
    );

    const chips = valores => {
      const lista = separarValoresAcademicos(...valores);

      return lista.length
        ? `<div class="nq-profile-chip-list">${lista
            .map(v => `<span class="nq-chip">${escapeHtml(v)}</span>`)
            .join("")}</div>`
        : '<span class="nq-profile-empty">--</span>';
    };

    const campoTexto = valor =>
      temValor(valor)
        ? `<div class="nq-professor-profile-text">${escapeHtml(valor)}</div>`
        : '<span class="nq-profile-empty">--</span>';

    if (!perfis.length) {
      el.innerHTML =
        '<div class="nq-profile-empty-card">Nenhum perfil acadêmico encontrado para o filtro atual.</div>';
      return;
    }

    el.innerHTML = perfis.map((r, index) => {
      const complementares =
        experienciasPorEspecialista.get(
          String(r.especialista_id || "").trim()
        ) || [];

      const graduacoes =
        graduacoesProfessorNQ(r);

      const especializacoes =
        separarValoresAcademicos(
          r.especializacao_1,
          r.especializacao_2,
          r.especializacao_3_mais
        );

      const areas =
        separarValoresAcademicos(
          r.areas_atuacao,
          ...complementares
        );

      const titulacao =
        r.titulacao_maxima_concluida ||
        r.titulacao_maxima ||
        "--";

      return `
        <details class="nq-professor-profile-card" ${index === 0 ? "open" : ""}>
          <summary>
            <div class="nq-professor-profile-name">
              <strong>${escapeHtml(r.professor)}</strong>
              <small>${escapeHtml(titulacao)}</small>
            </div>
            <div class="nq-professor-profile-summary">
              <span>${graduacoes.length} graduação(ões)</span>
              <span>${areas.length} área(s)</span>
              ${r.marca_origem || r.marca_area_contratante
                ? `<span>${escapeHtml(r.marca_origem || r.marca_area_contratante)}</span>`
                : ""}
            </div>
          </summary>

          <div class="nq-professor-profile-grid">
            <section>
              <h4>Graduação</h4>
              ${chips(graduacoes)}
            </section>

            <section>
              <h4>Especializações</h4>
              ${chips(especializacoes)}
            </section>

            <section>
              <h4>Mestrado</h4>
              ${campoTexto(r.mestrado)}
            </section>

            <section>
              <h4>Doutorado</h4>
              ${campoTexto(r.doutorado)}
            </section>

            <section>
              <h4>Pós-doutorado</h4>
              ${campoTexto(r.pos_doutorado)}
            </section>

            <section>
              <h4>Titulação em andamento</h4>
              ${campoTexto(r.titulacao_em_andamento)}
            </section>

            <section class="nq-professor-profile-wide">
              <h4>Áreas de atuação / experiência</h4>
              ${chips(areas)}
            </section>

            <section class="nq-professor-profile-wide">
              <h4>Experiência profissional</h4>
              ${campoTexto(r.experiencia_profissional)}
            </section>

            <section class="nq-professor-profile-wide">
              <h4>Experiência docente</h4>
              ${campoTexto(r.experiencia_docente)}
            </section>

            <section class="nq-professor-profile-wide">
              <h4>Gestão / coordenação</h4>
              ${campoTexto(r.gestao_coordenacao)}
            </section>

            <section class="nq-professor-profile-wide">
              <h4>Pesquisa / grupos / projetos</h4>
              ${campoTexto(r.pesquisa_grupos)}
            </section>

            <section>
              <h4>Marca</h4>
              ${campoTexto(r.marca_origem || r.marca_area_contratante)}
            </section>

            <section>
              <h4>Situação da contratação</h4>
              ${campoTexto(r.situacao_contratacao)}
            </section>

            <section>
              <h4>Status da verificação</h4>
              ${campoTexto(r.status_verificacao)}
            </section>

            <section>
              <h4>Currículo Lattes</h4>
              ${temValor(r.lattes)
                ? `<a class="nq-lattes-link" href="${escapeHtml(r.lattes)}" target="_blank" rel="noopener noreferrer">Abrir Lattes</a>`
                : '<span class="nq-profile-empty">--</span>'}
            </section>
          </div>
        </details>
      `;
    }).join("");
  }

  function temValor(v) {
    const t =
      normalizar(v);

    return (
      !!t &&
      ![
        "--",
        "nao informado",
        "não informado",
        "n/a",
        "na",
        "null",
        "undefined"
      ].includes(t)
    );
  }


  function classificarTitulacao(v) {
    const t =
      normalizar(v);

    if (
      t.includes(
        "pos-dout"
      ) ||
      t.includes(
        "pós-dout"
      )
    ) {
      return "Pós-doutorado";
    }

    if (
      t.includes(
        "dout"
      )
    ) {
      return "Doutorado";
    }

    if (
      t.includes(
        "mestr"
      )
    ) {
      return "Mestrado";
    }

    if (
      t.includes(
        "especial"
      )
    ) {
      return "Especialização";
    }

    if (
      t.includes(
        "gradu"
      ) ||
      t.includes(
        "bacharel"
      ) ||
      t.includes(
        "licencia"
      )
    ) {
      return "Graduação";
    }

    return v
      ? String(v)
      : "Não informado";
  }


  function juntarCampos(
    row,
    campos
  ) {
    return uniq(
      campos
        .map(
          c => row[c]
        )
        .filter(
          temValor
        )
    ).join(" · ");
  }


  function renderKPIsPerfilAcademicoNQ() {
    const total =
      perfilAcademicoNQ.length;

    const classes =
      perfilAcademicoNQ.map(
        r =>
          classificarTitulacao(
            r.titulacao_maxima_concluida ||
            r.titulacao_maxima
          )
      );

    const doutores =
      classes.filter(
        x =>
          x ===
            "Doutorado" ||
          x ===
            "Pós-doutorado"
      ).length;

    const mestres =
      classes.filter(
        x =>
          x ===
          "Mestrado"
      ).length;

    const especialistas =
      classes.filter(
        x =>
          x ===
          "Especialização"
      ).length;

    const comDocencia =
      perfilAcademicoNQ.filter(
        r =>
          temValor(
            r.experiencia_docente
          )
      ).length;

    const comPesquisa =
      perfilAcademicoNQ.filter(
        r =>
          temValor(
            r.pesquisa_grupos
          )
      ).length;

    setText(
      "nqDoutores",
      n(
        doutores
      )
    );

    setText(
      "nqMestres",
      n(
        mestres
      )
    );

    setText(
      "nqEspecialistas",
      n(
        especialistas
      )
    );

    setText(
      "nqPctStricto",
      total
        ? pct(
            (
              (
                doutores +
                mestres
              ) /
              total
            ) *
            100
          )
        : "0,0%"
    );

    setText(
      "nqComDocencia",
      n(
        comDocencia
      )
    );

    setText(
      "nqComPesquisa",
      n(
        comPesquisa
      )
    );
  }
    function renderGraficoTitulacaoNQ() {
    const el =
      document.getElementById(
        "graficoNQTitulacao"
      );

    if (
      !el ||
      !window.echarts
    ) {
      return;
    }

    const mapa =
      new Map();

    perfilAcademicoNQ.forEach(
      r => {
        const k =
          classificarTitulacao(
            r.titulacao_maxima_concluida ||
            r.titulacao_maxima
          );

        mapa.set(
          k,
          (
            mapa.get(k) ||
            0
          ) + 1
        );
      }
    );

    const dados =
      [...mapa.entries()]
        .map(
          ([name, value]) => ({
            name,
            value
          })
        )
        .sort(
          (a, b) =>
            b.value -
            a.value
        );

    graficoTitulacaoNQ?.dispose();

    graficoTitulacaoNQ =
      echarts.init(el);

    graficoTitulacaoNQ.setOption({
      tooltip: {
        trigger: "item"
      },

      legend: {
        bottom: 0,
        type: "scroll"
      },

      series: [
        {
          type: "pie",

          radius: [
            "42%",
            "70%"
          ],

          center: [
            "50%",
            "43%"
          ],

          data:
            dados,

          label: {
            formatter:
              "{b}: {c}"
          }
        }
      ]
    });
  }


  function renderGraficoExperienciasNQ() {
    const el =
      document.getElementById(
        "graficoNQExperiencias"
      );

    if (
      !el ||
      !window.echarts
    ) {
      return;
    }

    const dados = [
      [
        "Docência",
        "experiencia_docente"
      ],

      [
        "Profissional",
        "experiencia_profissional"
      ],

      [
        "Gestão",
        "gestao_coordenacao"
      ],

      [
        "Pesquisa",
        "pesquisa_grupos"
      ]
    ].map(
      ([nome, campo]) => ({
        nome,

        total:
          perfilAcademicoNQ.filter(
            r =>
              temValor(
                r[campo]
              )
          ).length
      })
    );

    graficoExperienciasNQ?.dispose();

    graficoExperienciasNQ =
      echarts.init(el);

    graficoExperienciasNQ.setOption({
      grid: {
        left: 92,
        right: 26,
        top: 18,
        bottom: 28
      },

      tooltip: {
        trigger: "axis",

        axisPointer: {
          type: "shadow"
        }
      },

      xAxis: {
        type: "value",
        minInterval: 1
      },

      yAxis: {
        type: "category",

        data:
          dados.map(
            d => d.nome
          )
      },

      series: [
        {
          type: "bar",

          data:
            dados.map(
              d => d.total
            ),

          barMaxWidth: 28,

          label: {
            show: true,
            position: "right"
          },

          itemStyle: {
            borderRadius: [
              0,
              6,
              6,
              0
            ]
          }
        }
      ]
    });
  }


  function renderTabelaPerfilAcademicoNQ(
    filtro = ""
  ) {
    const tbody =
      document.getElementById(
        "tbodyNQPerfilAcademico"
      );

    if (!tbody) {
      return;
    }

    const q =
      normalizar(
        filtro
      );

    const rows =
      perfilAcademicoNQ.filter(
        r =>
          !q ||
          normalizar(
            Object.values(r)
              .join(" ")
          ).includes(q)
      );

    if (
      !perfilAcademicoNQ.length
    ) {
      tbody.innerHTML =
        `
          <tr>
            <td colspan="13">
              Perfil acadêmico ainda não disponível.
              Execute o SQL V24.13 e publique novamente
              a função import-nq-especialistas.
            </td>
          </tr>
        `;

      return;
    }

    const cell =
      v =>
        temValor(v)
          ? `
              <div class="nq-profile-text">
                ${escapeHtml(v)}
              </div>
            `
          : `
              <span class="nq-profile-empty">
                --
              </span>
            `;

    tbody.innerHTML =
      rows.length
        ? rows
            .map(
              r => {
                const graduacoes =
                  juntarCampos(
                    r,
                    [
                      "graduacao_1",
                      "graduacao_2",
                      "graduacao_3_mais"
                    ]
                  );

                const especializacoes =
                  juntarCampos(
                    r,
                    [
                      "especializacao_1",
                      "especializacao_2",
                      "especializacao_3_mais"
                    ]
                  );

                return `
                  <tr>

                    <td>
                      <strong>
                        ${escapeHtml(
                          r.professor
                        )}
                      </strong>

                      ${
                        r.lattes
                          ? `
                              <div class="nq-academic-source">
                                Lattes cadastrado
                              </div>
                            `
                          : ""
                      }
                    </td>

                    <td>
                      ${cell(
                        r.titulacao_maxima_concluida ||
                        r.titulacao_maxima
                      )}
                    </td>

                    <td>
                      ${cell(
                        graduacoes
                      )}
                    </td>

                    <td>
                      ${cell(
                        especializacoes
                      )}
                    </td>

                    <td>
                      ${cell(
                        r.mestrado
                      )}
                    </td>

                    <td>
                      ${cell(
                        r.doutorado
                      )}
                    </td>

                    <td>
                      ${cell(
                        r.pos_doutorado
                      )}
                    </td>

                    <td>
                      ${cell(
                        r.experiencia_docente
                      )}
                    </td>

                    <td>
                      ${cell(
                        r.experiencia_profissional
                      )}
                    </td>

                    <td>
                      ${cell(
                        r.gestao_coordenacao
                      )}
                    </td>

                    <td>
                      ${cell(
                        r.pesquisa_grupos
                      )}
                    </td>

                    <td>
                      ${cell(
                        r.areas_atuacao
                      )}
                    </td>

                    <td>
                      ${cell(
                        r.status_verificacao
                      )}
                    </td>

                  </tr>
                `;
              }
            )
            .join("")

        : `
            <tr>
              <td colspan="13">
                Nenhum professor corresponde à busca.
              </td>
            </tr>
          `;
  }


  function configurarBuscaPerfilNQ() {
    const input =
      document.getElementById(
        "nqBuscaPerfil"
      );

    if (
      !input ||
      input.dataset.ready ===
        "1"
    ) {
      return;
    }

    input.dataset.ready =
      "1";

    input.addEventListener(
      "input",
      () =>
        renderTabelaPerfilAcademicoNQ(
          input.value
        )
    );
  }


  function renderPerfilAcademicoNQ() {
    renderKPIsPerfilAcademicoNQ();

    renderGraficoTitulacaoNQ();

    renderGraficoExperienciasNQ();

    renderTabelaPerfilAcademicoNQ(
      document.getElementById(
        "nqBuscaPerfil"
      )?.value || ""
    );

    configurarBuscaPerfilNQ();
  }



  // ============================================================
  // V25.29 · Evolução da abrangência acadêmica e das experiências
  // ============================================================
  function parseDataNQ(raw) {
    if (!raw) return null;
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
    const txt = String(raw).trim();
    let m = txt.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    m = txt.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(txt);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function mapaEntradaEspecialistasNQ() {
    const porId = new Map();
    const porProfessor = new Map();
    formacoesNQ.forEach(row => {
      const raw = row.data_inicio || row.data_contratacao || row.data_admissao || row.contratacao || row.data_inicio_contratacao;
      let data = parseDataNQ(raw);
      if (!data) {
        const sem = String(row.semestre_entrada_nq || "").trim();
        const m = sem.match(/(20\d{2})\D*([12])/);
        if (m) data = new Date(Number(m[1]), m[2] === "1" ? 0 : 6, 1);
      }
      if (!data) return;
      const id = String(row.especialista_id ?? "").trim();
      const professor = normalizar(row.professor);
      if (id && !porId.has(id)) porId.set(id, data);
      if (professor && !porProfessor.has(professor)) porProfessor.set(professor, data);
    });
    return { porId, porProfessor };
  }

  function dataEntradaEspecialistaNQ(especialistaId, professor) {
    const mapas = mapaEntradaEspecialistasNQ();
    const id = String(especialistaId ?? "").trim();
    const nome = normalizar(professor);
    return (id && mapas.porId.get(id)) || (nome && mapas.porProfessor.get(nome)) || null;
  }

  function periodoEntradaNQ(data) {
    if (!(data instanceof Date) || Number.isNaN(data.getTime())) return null;
    const ano = data.getFullYear();
    const semestre = data.getMonth() < 6 ? 1 : 2;
    return { chave: `${ano}.${semestre}`, ordem: ano * 2 + semestre };
  }

  function nivelDiplomaNQ(row) {
    const t = normalizar(`${row?.nivel || ""} ${row?.curso_titulo || ""}`);
    if (t.includes("dout")) return "doutorado";
    if (t.includes("mestr")) return "mestrado";
    if (t.includes("especial") || t.includes("mba") || t.includes("pos-gradu") || t.includes("pos gradu")) return "especializacao";
    if (t.includes("gradua") || t.includes("bacharel") || t.includes("licencia") || t.includes("tecnolog")) return "graduacao";
    return "";
  }

  function nomeAreaAcademicaNQ(row) {
    // CINE é a taxonomia preferencial; quando ausente, preservamos o curso/título.
    return String(row?.area_cine || row?.area_formacao || row?.curso_titulo || row?.formacao || "").trim();
  }

  function construirEvolucaoAcumuladaNQ(registros) {
    const porPeriodo = new Map();
    registros.forEach(r => {
      const periodo = periodoEntradaNQ(r.data);
      const area = String(r.area || "").trim();
      if (!periodo || !area) return;
      if (!porPeriodo.has(periodo.chave)) porPeriodo.set(periodo.chave, { ordem: periodo.ordem, areas: new Map() });
      const key = normalizar(area).replace(/[^a-z0-9]+/g, " ").trim();
      if (key && !porPeriodo.get(periodo.chave).areas.has(key)) porPeriodo.get(periodo.chave).areas.set(key, area);
    });
    const acumulado = new Map();
    return [...porPeriodo.entries()].sort((a,b) => a[1].ordem-b[1].ordem).map(([periodo, info]) => {
      const novas = [];
      info.areas.forEach((nome,key) => { if (!acumulado.has(key)) { acumulado.set(key,nome); novas.push(nome); } });
      return { periodo, total: acumulado.size, novas };
    });
  }

  function renderGraficoEvolucaoAbrangenciaNQ() {
    const el = document.getElementById("graficoNQEvolucaoAbrangencia");
    if (!el || !window.echarts) return;
    const filtro = document.getElementById("nqFiltroEvolucaoTitulacao")?.value || "";
    const registros = diplomasNQ
      .filter(r => !filtro || nivelDiplomaNQ(r) === filtro)
      .map(r => ({ data: dataEntradaEspecialistaNQ(r.especialista_id, r.professor), area: nomeAreaAcademicaNQ(r) }))
      .filter(r => r.data && r.area);
    const dados = construirEvolucaoAcumuladaNQ(registros);
    graficoEvolucaoAbrangenciaNQ?.dispose();
    graficoEvolucaoAbrangenciaNQ = echarts.init(el);
    graficoEvolucaoAbrangenciaNQ.setOption({
      grid:{left:52,right:28,top:30,bottom:48},
      tooltip:{trigger:"axis",formatter: params => { const i=params?.[0]?.dataIndex ?? 0; const d=dados[i]; if(!d) return ""; const novas=d.novas.length?d.novas.map(x=>`• ${escapeHtml(x)}`).join("<br>"):"Nenhuma nova área"; return `<strong>${d.periodo}</strong><br>Áreas acumuladas: <strong>${d.total}</strong><br>Novas no período: <strong>${d.novas.length}</strong><br>${novas}`; }},
      xAxis:{type:"category",boundaryGap:false,data:dados.map(d=>d.periodo),name:"Entrada no NQ",nameLocation:"middle",nameGap:30},
      yAxis:{type:"value",minInterval:1,name:"Áreas distintas"},
      series:[{type:"line",smooth:true,symbolSize:8,data:dados.map(d=>d.total),areaStyle:{opacity:.08},label:{show:true,position:"top"}}]
    });
    const nota=document.getElementById("nqEvolucaoAbrangenciaNota");
    if(nota) nota.textContent = dados.length ? `${dados.at(-1).total} áreas acadêmicas distintas acumuladas · ${registros.length} registros considerados.` : "Sem dados de formação com data de entrada para o filtro selecionado.";
  }

  function renderGraficoEvolucaoExperienciasNQ() {
    const el = document.getElementById("graficoNQEvolucaoExperiencias");
    if (!el || !window.echarts) return;
    const registros = experienciasNQ.flatMap(r => {
      const data = dataEntradaEspecialistaNQ(r.especialista_id, r.professor);
      return separarValoresAcademicos(r.area_experiencia).map(area => ({ data, area }));
    }).filter(r => r.data && r.area);
    const dados = construirEvolucaoAcumuladaNQ(registros);
    graficoEvolucaoExperienciasNQ?.dispose();
    graficoEvolucaoExperienciasNQ = echarts.init(el);
    graficoEvolucaoExperienciasNQ.setOption({
      grid:{left:52,right:28,top:30,bottom:48},
      tooltip:{trigger:"axis",formatter: params => { const i=params?.[0]?.dataIndex ?? 0; const d=dados[i]; if(!d) return ""; const novas=d.novas.length?d.novas.map(x=>`• ${escapeHtml(x)}`).join("<br>"):"Nenhuma nova experiência"; return `<strong>${d.periodo}</strong><br>Experiências acumuladas: <strong>${d.total}</strong><br>Novas no período: <strong>${d.novas.length}</strong><br>${novas}`; }},
      xAxis:{type:"category",boundaryGap:false,data:dados.map(d=>d.periodo),name:"Entrada no NQ",nameLocation:"middle",nameGap:30},
      yAxis:{type:"value",minInterval:1,name:"Experiências distintas"},
      series:[{type:"line",smooth:true,symbolSize:8,data:dados.map(d=>d.total),areaStyle:{opacity:.08},label:{show:true,position:"top"}}]
    });
    const nota=document.getElementById("nqEvolucaoExperienciasNota");
    if(nota) nota.textContent = dados.length ? `${dados.at(-1).total} áreas de experiência distintas acumuladas · ${registros.length} registros considerados.` : "Sem experiências com data de entrada disponíveis na base.";
  }

  function renderCoberturaNQ() {
    renderKPIsCoberturaNQ();

    renderGraficoEvolucaoAbrangenciaNQ();

    renderGraficoEvolucaoExperienciasNQ();

    renderKPIsFormacoesDiplomasNQ();

    renderGraficoCineNQ();

    renderGraficoFormacoesCineNQ();

    renderGraficoNivelFormacaoNQ();

    renderGraficoFormacoesProfessorNQ();

    renderGraficoContratacaoNQ();

    renderMatrizFormacaoNQ();

    renderListaFormacoesNQ();

    renderExperienciasNQ();

    renderPerfilAcademicoNQ();

    const fonte =
      document.getElementById(
        "nqCoberturaFonte"
      );

    if (fonte) {
      fonte.textContent =
        `Dados reais · ${
          uniq(
            formacoesNQ.map(
              r => r.professor
            )
          ).length
        } especialistas`;
    }
  }


  function configurarFiltroCoberturaNQ() {
    [
      "nqFiltroTitulacao",
      "nqFiltroSituacaoFormacao",
      "nqFiltroSituacaoEspecialista"
    ].forEach(
      id => {
        const el =
          document.getElementById(
            id
          );

        if (
          !el ||
          el.dataset.ready ===
            "1"
        ) {
          return;
        }

        el.dataset.ready =
          "1";

        el.addEventListener(
          "change",
          renderCoberturaNQ
        );
      }
    );

    const filtroEvolucao = document.getElementById("nqFiltroEvolucaoTitulacao");
    if (filtroEvolucao && filtroEvolucao.dataset.ready !== "1") {
      filtroEvolucao.dataset.ready = "1";
      filtroEvolucao.addEventListener("change", renderGraficoEvolucaoAbrangenciaNQ);
    }

    const filtroNivelGrafico =
      document.getElementById(
        "nqFiltroNivelGraficoFormacao"
      );

    if (
      filtroNivelGrafico &&
      filtroNivelGrafico.dataset.ready !==
        "1"
    ) {
      filtroNivelGrafico.dataset.ready =
        "1";

      filtroNivelGrafico.addEventListener(
        "change",
        renderGraficoNivelFormacaoNQ
      );
    }
  }


  function formatarDataHoraBR(
    valor
  ) {
    if (!valor) {
      return "--";
    }

    const d =
      new Date(valor);

    if (
      Number.isNaN(
        d.getTime()
      )
    ) {
      return String(
        valor
      );
    }

    return d.toLocaleString(
      "pt-BR",
      {
        timeZone:
          "America/Sao_Paulo",

        day:
          "2-digit",

        month:
          "2-digit",

        year:
          "numeric",

        hour:
          "2-digit",

        minute:
          "2-digit"
      }
    );
  }


  async function carregarHistoricoImportacoesNQ() {
    const tbody =
      document.getElementById(
        "tbodyNQImportacoes"
      );

    if (!tbody) {
      return;
    }

    const {
      data,
      error
    } =
      await window.biSupabase
        .from(
          "nq_importacoes"
        )
        .select(
          "id," +
          "arquivo_nome," +
          "status," +
          "total_linhas," +
          "especialistas_gravados," +
          "formacoes_gravadas," +
          "perfis_lattes_gravados," +
          "linhas_com_erro," +
          "mensagem," +
          "created_at," +
          "finished_at"
        )
        .order(
          "created_at",
          {
            ascending: false
          }
        )
        .limit(10);

    if (error) {
      console.warn(
        "Histórico de importação NQ:",
        error
      );

      tbody.innerHTML =
        `
          <tr>
            <td colspan="8">
              Não foi possível carregar o histórico:
              ${escapeHtml(
                error.message ||
                "erro"
              )}
            </td>
          </tr>
        `;

      return;
    }

    const linhas =
      data || [];

    if (!linhas.length) {
      tbody.innerHTML =
        `
          <tr>
            <td colspan="8">
              Nenhuma importação realizada.
            </td>
          </tr>
        `;

      return;
    }

    tbody.innerHTML =
      linhas
        .map(
          r => `
            <tr>

              <td>
                ${escapeHtml(
                  formatarDataHoraBR(
                    r.finished_at ||
                    r.created_at
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  r.arquivo_nome ||
                  "--"
                )}
              </td>

              <td>
                <span
                  class="nq-status-pill nq-status-${escapeHtml(
                    String(
                      r.status || ""
                    ).toLowerCase()
                  )}"
                >
                  ${escapeHtml(
                    r.status ||
                    "--"
                  )}
                </span>
              </td>

              <td>
                ${n(
                  r.total_linhas
                )}
              </td>

              <td>
                ${n(
                  r.especialistas_gravados
                )}
              </td>

              <td>
                ${n(
                  r.formacoes_gravadas
                )}
              </td>

              <td>
                ${n(
                  r.perfis_lattes_gravados ||
                  0
                )}
              </td>

              <td>
                ${n(
                  r.linhas_com_erro
                )}
              </td>

            </tr>
          `
        )
        .join("");
  }


  function configurarImportacaoNQ() {
    const input =
      document.getElementById(
        "nqArquivoEspecialistas"
      );

    const btn =
      document.getElementById(
        "nqBtnImportarEspecialistas"
      );

    const nome =
      document.getElementById(
        "nqArquivoNome"
      );

    const status =
      document.getElementById(
        "nqImportStatus"
      );

    const resultado =
      document.getElementById(
        "nqImportResultado"
      );

    if (
      !input ||
      !btn ||
      input.dataset.v23Ready ===
        "1"
    ) {
      return;
    }

    input.dataset.v23Ready =
      "1";

    input.addEventListener(
      "change",
      () => {
        const file =
          input.files?.[0];

        if (!file) {
          if (nome) {
            nome.textContent =
              "Nenhum arquivo selecionado";
          }

          btn.disabled =
            true;

          if (status) {
            status.textContent =
              "Aguardando planilha.";
          }

          return;
        }

        const ext =
          String(
            file.name
          ).toLowerCase();

        if (
          !ext.endsWith(
            ".xlsx"
          ) &&
          !ext.endsWith(
            ".xls"
          )
        ) {
          if (nome) {
            nome.textContent =
              file.name;
          }

          btn.disabled =
            true;

          if (status) {
            status.textContent =
              "Selecione um arquivo Excel (.xlsx ou .xls).";
          }

          return;
        }

        if (nome) {
          nome.textContent =
            `${file.name} · ${
              (
                file.size /
                1024 /
                1024
              ).toLocaleString(
                "pt-BR",
                {
                  maximumFractionDigits:
                    1
                }
              )
            } MB`;
        }

        btn.disabled =
          false;

        if (status) {
          status.textContent =
            "Planilha pronta para envio.";
        }

        if (resultado) {
          resultado.hidden =
            true;

          resultado.innerHTML =
            "";
        }
      }
    );


    btn.addEventListener(
      "click",
      async () => {
        const file =
          input.files?.[0];

        if (!file) {
          return;
        }

        btn.disabled =
          true;

        btn.textContent =
          "Processando...";

        if (status) {
          status.textContent =
            "Lendo as abas Export e Currículo Lattes Estruturado...";
        }

        if (resultado) {
          resultado.hidden =
            true;
        }

        try {
          if (!window.XLSX) {
            throw new Error(
              "Leitor de Excel não foi carregado. Atualize a página com Ctrl+F5."
            );
          }

          const {
            data:
              sessionData,

            error:
              sessionError
          } =
            await window.biSupabase
              .auth
              .getSession();

          const session =
            sessionData
              ?.session;

          if (
            sessionError ||
            !session
              ?.access_token
          ) {
            throw new Error(
              "Sessão expirada. Entre novamente no BI."
            );
          }

          const buffer =
            await file.arrayBuffer();

          const workbook =
            window.XLSX.read(
              buffer,
              {
                type:
                  "array",

                cellDates:
                  true,

                cellText:
                  false
              }
            );

          const sheetName =
            "Export";

          const lattesSheetName =
            "Currículo Lattes Estruturado";

          const diplomasSheetName =
            "Diplomas";

          const worksheet =
            workbook.Sheets[
              sheetName
            ];

          const lattesWorksheet =
            workbook.Sheets[
              lattesSheetName
            ];

          const diplomasWorksheet =
            workbook.Sheets[
              diplomasSheetName
            ];

          if (!worksheet) {
            throw new Error(
              `A aba "${sheetName}" não foi encontrada. ` +
              `Abas disponíveis: ${workbook.SheetNames.join(", ")}.`
            );
          }

          const rows =
            window.XLSX
              .utils
              .sheet_to_json(
                worksheet,
                {
                  defval:
                    null,

                  raw:
                    true
                }
              );

          const rowsLattes =
            lattesWorksheet
              ? window.XLSX
                  .utils
                  .sheet_to_json(
                    lattesWorksheet,
                    {
                      defval:
                        null,

                      raw:
                        true
                    }
                  )
              : [];

          const rowsDiplomas =
            diplomasWorksheet
              ? window.XLSX.utils.sheet_to_json(
                  diplomasWorksheet,
                  { defval: null, raw: true }
                )
              : [];

          if (!rows.length) {
            throw new Error(
              'A aba "Export" está vazia.'
            );
          }

          if (status) {
            status.textContent =
              `${rows.length} especialista(s), ` +
              `${rowsLattes.length} perfil(is) Lattes e ` +
              `${rowsDiplomas.length} formação(ões) em Diplomas localizadas. ` +
              `Enviando dados...`;
          }

          btn.textContent =
            "Enviando...";

          const response =
            await fetch(
              `${window.BI_CONFIG.SUPABASE_URL}/functions/v1/import-nq-especialistas`,
              {
                method:
                  "POST",

                headers: {
                  "Content-Type":
                    "application/json",

                  Authorization:
                    `Bearer ${session.access_token}`,

                  apikey:
                    window
                      .BI_CONFIG
                      .SUPABASE_PUBLISHABLE_KEY
                },

                body:
                  JSON.stringify({
                    arquivo_nome:
                      file.name,

                    arquivo_tamanho:
                      file.size,

                    aba:
                      sheetName,

                    rows,

                    aba_lattes:
                      rowsLattes.length
                        ? lattesSheetName
                        : null,

                    rows_lattes:
                      rowsLattes,

                    aba_diplomas:
                      rowsDiplomas.length ? diplomasSheetName : null,

                    rows_diplomas:
                      rowsDiplomas
                  })
              }
            );

          const payload =
            await response
              .json()
              .catch(
                () => ({})
              );

          if (
            !response.ok ||
            payload?.success ===
              false
          ) {
            throw new Error(
              payload?.error ||
              payload?.mensagem ||
              `Falha HTTP ${response.status}`
            );
          }

          const r =
            payload;

          if (resultado) {
            resultado.hidden =
              false;

            resultado.innerHTML =
              `
                <strong>
                  Importação concluída.
                </strong>

                <div class="nq-import-summary">

                  <span>
                    <b>
                      ${n(
                        r.total_linhas
                      )}
                    </b>
                    linhas
                  </span>

                  <span>
                    <b>
                      ${n(
                        r.especialistas_gravados
                      )}
                    </b>
                    especialistas
                  </span>

                  <span>
                    <b>
                      ${n(
                        r.formacoes_gravadas
                      )}
                    </b>
                    graduações/base
                  </span>

                  <span>
                    <b>
                      ${n(
                        r.diplomas_gravados ||
                        0
                      )}
                    </b>
                    formações em Diplomas
                  </span>

                  <span>
                    <b>
                      ${n(
                        r.perfis_lattes_gravados ||
                        0
                      )}
                    </b>
                    perfis Lattes
                  </span>

                  <span>
                    <b>
                      ${n(
                        r.linhas_com_erro
                      )}
                    </b>
                    erros
                  </span>

                </div>

                <small>
                  ${escapeHtml(
                    r.mensagem ||
                    "Base atualizada com sucesso."
                  )}
                </small>
              `;
          }

          if (status) {
            status.textContent =
              `Base NQ atualizada com sucesso · ${n(r.diplomas_gravados || 0)} formação(ões) da aba Diplomas gravada(s).`;
          }

          input.value =
            "";

          if (nome) {
            nome.textContent =
              "Nenhum arquivo selecionado";
          }

          await carregarHistoricoImportacoesNQ();

          /*
           * Limpa o cache da Reunião NQ
           * para que uma nova leitura seja
           * realizada após a importação.
           */
          resumo =
            null;

          naoConformidades =
            null;

          criteriosDetalhe =
            null;

          await carregarFormacaoCoberturaNQ();

          renderCoberturaNQ();

        } catch (e) {
          console.error(
            "Erro na importação NQ:",
            e
          );

          if (resultado) {
            resultado.hidden =
              false;

            resultado.innerHTML =
              `
                <strong>
                  Não foi possível importar.
                </strong>

                <small>
                  ${escapeHtml(
                    e?.message ||
                    "Erro desconhecido"
                  )}
                </small>
              `;
          }

          if (status) {
            status.textContent =
              "A importação não foi concluída.";
          }

        } finally {
          btn.textContent =
            "Enviar para o banco";

          btn.disabled =
            !input.files?.[0];
        }
      }
    );
  }


  window.addEventListener(
    "resize",
    () => {
      grafico
        ?.resize();

      graficoFormacoesCineNQ
        ?.resize();

      graficoNivelFormacaoNQ
        ?.resize();

      graficoCineNQ
        ?.resize();

      graficoFormacoesNQ
        ?.resize();

      graficoContratacaoNQ
        ?.resize();

      graficoTitulacaoNQ
        ?.resize();

      graficoExperienciasNQ
        ?.resize();
    }
  );


  /*
   * Disponibiliza a função
   * para dashboard.js.
   */
  window.atualizarReuniaoNQ =
    atualizarReuniaoNQ;

})();