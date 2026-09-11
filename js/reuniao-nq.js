(function () {
  "use strict";

  let resumo = null;
  let naoConformidades = null;
  let criteriosDetalhe = null;
  let criteriosFiltrados = [];
  let carregando = null;
  let grafico = null;
  let revisoresDistintos = null;
  let formacoesNQ = [];
  let experienciasNQ = [];
  let perfilAcademicoNQ = [];
  let graficoTitulacaoNQ = null;
  let graficoExperienciasNQ = null;
  let graficoCineNQ = null;
  let graficoFormacoesNQ = null;
  let graficoContratacaoNQ = null;
  let dadosBIAtuais = [];
  let ppsValidadosAtual = 0;

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
    const [a, m, d] = String(v).slice(0, 10).split("-");
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

  async function carregar() {
    if (resumo && naoConformidades && criteriosDetalhe) return;
    if (carregando) return carregando;

    carregando = (async () => {
      const resumoView =
        window.BI_CONFIG?.REUNIAO_RESUMO_VIEW_NAME ||
        "vw_nq_reuniao_resumo";

      const ncView =
        window.BI_CONFIG?.REUNIAO_NC_VIEW_NAME ||
        "vw_nq_reuniao_criterios_resumo";

      const detalheView =
        window.BI_CONFIG?.REUNIAO_DETALHE_VIEW_NAME ||
        "vw_nq_reuniao_criterios_detalhe";

      const [r1, r2] = await Promise.all([
        window.biSupabase
          .from(resumoView)
          .select("*")
          .limit(1),

        window.biSupabase
          .from(ncView)
          .select("*")
          .order("percentual_nao_conformidade", {
            ascending: false
          })
      ]);

      if (r1.error) throw r1.error;
      if (r2.error) throw r2.error;

      resumo = r1.data?.[0] || {};
      naoConformidades = r2.data || [];

      const camposDetalhe =
        "parent_item_id,matriz_oferta,id_ua,titulo_ua,criterio," +
        "classificacao_especialista,esteira_producao,bloco," +
        "status_validacao,categoria_material,gestor_validacao_nq," +
        "revisor_validador";

      const statusCarga = document.getElementById("nqStatus");

      if (statusCarga) {
        statusCarga.textContent =
          "Carregando critérios da reunião...";
      }

      const contagem = await window.biSupabase
        .from(detalheView)
        .select("parent_item_id", {
          count: "exact",
          head: true
        });

      if (contagem.error) throw contagem.error;

      const totalDetalhe = Number(contagem.count || 0);
      const loteDetalhe = 1000;
      const paginas = Math.ceil(totalDetalhe / loteDetalhe);

      criteriosDetalhe = [];

      for (
        let basePagina = 0;
        basePagina < paginas;
        basePagina += 6
      ) {
        const grupo = [];

        for (
          let pagina = basePagina;
          pagina < Math.min(basePagina + 6, paginas);
          pagina++
        ) {
          const inicio = pagina * loteDetalhe;

          grupo.push(
            window.biSupabase
              .from(detalheView)
              .select(camposDetalhe)
              .range(
                inicio,
                Math.min(
                  inicio + loteDetalhe - 1,
                  totalDetalhe - 1
                )
              )
          );
        }

        const respostas = await Promise.all(grupo);

        respostas.forEach(resp => {
          if (resp.error) throw resp.error;

          criteriosDetalhe.push(...(resp.data || []));
        });

        if (statusCarga) {
          const carregados = Math.min(
            (basePagina + grupo.length) * loteDetalhe,
            totalDetalhe
          );

          statusCarga.textContent =
            `Carregando critérios da reunião... ` +
            `${fmt.format(carregados)} de ` +
            `${fmt.format(totalDetalhe)}`;
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

  function resumoDosFiltros(dados) {
    if (!Array.isArray(dados)) return null;

    const noPeriodo = dados.filter(x =>
      statusNQ(x.status_validacao).includes("validado")
    );

    const nome = x =>
      normalizar(
        `${x.item_name || ""} ` +
        `${x.titulo || ""} ` +
        `${x.categoria_material || ""} ` +
        `${x.formato || ""}`
      );

    const contar = rx =>
      noPeriodo.filter(x => rx.test(nome(x))).length;

    const revisores = new Set();

    noPeriodo.forEach(x => {
      String(x.revisor_validador || "")
        .split(",")
        .map(v => v.trim())
        .filter(Boolean)
        .forEach(v => revisores.add(v));
    });

    const st = dados.map(x =>
      statusNQ(x.status_validacao)
    );

    return {
      uas_validadas: contar(
        /unidade de aprendizagem|(^|\s)ua(\s|$)/
      ),

      pp_validados: ppsValidadosAtual,

      a1_validadas: contar(/(^|\s)a1(\s|$)/),
      a2_validadas: contar(/(^|\s)a2(\s|$)/),
      a3_validadas: contar(/(^|\s)a3(\s|$)/),

      lato_validadas: noPeriodo.filter(x =>
        normalizar(x.matriz_oferta).includes("lato")
      ).length,

      revisores: revisores.size,

      total_materiais:
        new Set(
          dados
            .map(
              x =>
                x.chave_material ||
                x.monday_item_validacao
            )
            .filter(Boolean)
        ).size || dados.length,

      validados: st.filter(x =>
        x.includes("validado")
      ).length,

      liberados_validacao: st.filter(
        x =>
          x.includes("liberado") &&
          !x.includes("revalidar")
      ).length,

      revalidacao: st.filter(x =>
        x.includes("revalidar")
      ).length,

      ajustes_conteudista_da: st.filter(x =>
        x.includes("ajust")
      ).length,

      a_liberar: st.filter(
        x => !x || x === "a liberar"
      ).length
    };
  }

  function selecionadosFiltro(id) {
    return typeof window.obterSelecionados === "function"
      ? window.obterSelecionados(id)
      : [];
  }

  function correspondeFiltro(
    valor,
    selecionados,
    multiplo = false
  ) {
    if (!selecionados.length) return true;

    const vazio =
      valor === null ||
      valor === undefined ||
      String(valor).trim() === "";

    if (vazio) {
      return selecionados.includes("__EM_BRANCO__");
    }

    const valores = multiplo
      ? String(valor)
          .split(",")
          .map(v => normalizar(v))
      : [normalizar(valor)];

    return selecionados.some(
      sel =>
        sel !== "__EM_BRANCO__" &&
        valores.some(
          v => v === normalizar(sel)
        )
    );
  }

  async function carregarPPsValidadosDosFiltros() {
    const filtros = {
      esteira: selecionadosFiltro("filtroEsteira"),
      matriz: selecionadosFiltro("filtroMatriz"),
      status: selecionadosFiltro("filtroStatus"),
      categoria: selecionadosFiltro("filtroCategoria")
    };

    /*
     * PP = Projeto Pedagógico.
     *
     * O card usa a fonte oficial:
     * public.monday_pp_validacao
     *
     * Somente registros com status "Validado"
     * entram no indicador.
     */

    if (
      filtros.status.length &&
      !filtros.status.some(
        v => normalizar(v) === "validado"
      )
    ) {
      return 0;
    }

    const { data, error } =
      await window.biSupabase
        .from("monday_pp_validacao")
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

    return (data || []).filter(x =>
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
    ).length;
  }

  function filtrarCriteriosGlobais() {
    const filtros = {
      esteira: selecionadosFiltro("filtroEsteira"),
      matriz: selecionadosFiltro("filtroMatriz"),
      bloco: selecionadosFiltro("filtroBloco"),
      status: selecionadosFiltro("filtroStatus"),
      categoria: selecionadosFiltro("filtroCategoria"),
      gestor: selecionadosFiltro("filtroGestor"),
      revisor: selecionadosFiltro("filtroRevisor")
    };

    return (criteriosDetalhe || []).filter(x =>
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

    rows
      .filter(x =>
        ["sim", "nao"].includes(
          normalizar(
            x.classificacao_especialista
          )
        )
      )
      .forEach(x => {
        const matriz =
          x.matriz_oferta ||
          "Matriz não identificada";

        const criterio =
          x.criterio ||
          "Critério não informado";

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

        if (
          normalizar(
            x.classificacao_especialista
          ) === "nao"
        ) {
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
          ? (
              r.nao_conformidades *
              100 /
              r.criterios_avaliados
            )
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

    if (!botoes.length || !secoes.length) {
      return;
    }

    const aplicar = tab => {
      botoes.forEach(b =>
        b.classList.toggle(
          "active",
          b.dataset.nqTab === tab
        )
      );

      secoes.forEach(sec =>
        sec.classList.toggle(
          "nq-tab-hidden",
          sec.dataset.nqSection !== tab
        )
      );

      /*
       * V25.9
       * Os gráficos da aba Professores são carregados enquanto a aba
       * ainda pode estar oculta. Nesse cenário o ECharts calcula uma
       * largura mínima e fica espremido no canto do card. Após revelar
       * a aba, força um novo cálculo do tamanho de todos os gráficos.
       */
      if (tab === "professores") {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            graficoCineNQ?.resize();
            graficoFormacoesNQ?.resize();
            graficoContratacaoNQ?.resize();
            graficoTitulacaoNQ?.resize();
            graficoExperienciasNQ?.resize();
          });
        });
      }
    };

    botoes.forEach(b => {
      if (b.dataset.ready !== "1") {
        b.dataset.ready = "1";

        b.addEventListener(
          "click",
          () => aplicar(b.dataset.nqTab)
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
      resumoDosFiltros(dadosBIAtuais) ||
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

    /*
     * CORREÇÃO V25.7
     * Não chamamos mais
     * contarPPsValidadosFiltrados().
     *
     * O valor já foi obtido de
     * monday_pp_validacao.
     */
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
      n(rf.liberados_validacao)
    );

    setText(
      "nqRevalidacao",
      n(rf.revalidacao)
    );

    setText(
      "nqAjustes",
      n(rf.ajustes_conteudista_da)
    );

    setText(
      "nqALiberar",
      n(rf.a_liberar)
    );

    const validos =
      criteriosFiltrados.filter(x =>
        ["sim", "nao"].includes(
          normalizar(
            x.classificacao_especialista
          )
        )
      );

    const conformes =
      validos.filter(
        x =>
          normalizar(
            x.classificacao_especialista
          ) === "sim"
      ).length;

    const nao =
      validos.length - conformes;

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
              (avaliados - nao)
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

            <td>${n(nao)}</td>
            <td>${n(conf)}</td>

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
    if (!window.echarts) return;

    const el =
      document.getElementById(
        "graficoNQConformidades"
      );

    if (!el) return;

    grafico ||= echarts.init(el);

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

        data: dados.map(
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

          data: dados.map(
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
      Array.isArray(dadosFiltrados)
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
       * V25.7
       * Consulta os Projetos Pedagógicos
       * validados antes de renderizar
       * os cards.
       */
      ppsValidadosAtual =
        await carregarPPsValidadosDosFiltros();

      renderResumo();
      renderTabela();
      renderGrafico();

      configurarImportacaoNQ();

      await carregarHistoricoImportacoesNQ();

      configurarFiltroCoberturaNQ();

      await carregarFormacaoCoberturaNQ();

      renderCoberturaNQ();

      if (status) {
        status.textContent =
          "Dados carregados da nova view NQ e atualizados conforme os filtros globais do BI.";
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
  // V23 · Importação da base de especialistas NQ
  // ============================================================

  async function carregarFormacaoCoberturaNQ() {
    const [f, e, p] = await Promise.all([
      window.biSupabase
        .from("vw_nq_especialistas_formacoes")
        .select("*")
        .order("professor", { ascending: true }),

      window.biSupabase
        .from("nq_especialistas_experiencias")
        .select("especialista_id,area_experiencia"),

      window.biSupabase
        .from("vw_nq_perfil_academico")
        .select("*")
        .order("professor", { ascending: true })
    ]);

    if (f.error) throw f.error;

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

    formacoesNQ =
      (f.data || []).filter(
        r => r.professor
      );

    experienciasNQ =
      e.data || [];

    perfilAcademicoNQ =
      p.error
        ? []
        : (p.data || []).filter(
            r => r.professor
          );
  }

  function uniq(arr) {
    return [
      ...new Set(
        arr.filter(
          v =>
            v !== null &&
            v !== undefined &&
            String(v).trim() !== ""
        )
      )
    ];
  }

  function classeTitulacaoFiltro(row) {
    const t = normalizar(
      `${row.titulacao_maxima || ""} ` +
      `${row.formacao || ""}`
    );

    if (t.includes("dout")) {
      return "doutor";
    }

    if (
      t.includes("mestr") ||
      /\bmsc\b|\bme\b|\bma\b/.test(t)
    ) {
      return "mestre";
    }

    if (
      t.includes("especial") ||
      t.includes("mba")
    ) {
      return "especialista";
    }

    if (
      t.includes("bacharel") ||
      t.includes("licencia") ||
      t.includes("tecnolog") ||
      t.includes("gradu")
    ) {
      return "graduado";
    }

    return "";
  }

  function situacaoFormacaoFiltro(row) {
    const t = normalizar(
      `${row.situacao_formacao || ""} ` +
      `${row.status_formacao || ""} ` +
      `${row.formacao || ""}`
    );

    return /andamento|cursando|em curso|incomplet/.test(t)
      ? "andamento"
      : "concluido";
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

    return formacoesNQ.filter(
      r =>
        (
          !tit ||
          classeTitulacaoFiltro(r) === tit
        ) &&
        (
          !sit ||
          situacaoFormacaoFiltro(r) === sit
        )
    );
  }

  // V25.10 · Graduações devem vir do Perfil Acadêmico/Lattes.
  // A antiga métrica usava `formacao` da Base de Especialistas, que representa
  // a cobertura/área informada na base e não é uma fonte confiável para contar
  // títulos de graduação.
  function separarValoresAcademicos(...valores) {
    const saida = new Map();

    valores.forEach(valor => {
      if (!temValor(valor)) return;

      String(valor)
        .split(/\s*\|\s*|\s*;\s*|\r?\n+/)
        .map(v => v.trim())
        .filter(temValor)
        .forEach(v => {
          const chave = normalizar(v);
          if (chave && !saida.has(chave)) saida.set(chave, v);
        });
    });

    return [...saida.values()];
  }

  function graduacoesProfessorNQ(perfil) {
    if (!perfil) return [];
    return separarValoresAcademicos(
      perfil.graduacao_1,
      perfil.graduacao_2,
      perfil.graduacao_3_mais
    );
  }

  function renderKPIsCoberturaNQ() {
    const baseFiltrada = formacoesFiltradasNQ();
    const nomesFiltrados = new Set(
      baseFiltrada.map(r => normalizar(r.professor)).filter(Boolean)
    );

    const perfisConsiderados = perfilAcademicoNQ.filter(r =>
      r.professor && (!nomesFiltrados.size || nomesFiltrados.has(normalizar(r.professor)))
    );

    // Mantém todos os professores da base no total, mesmo quando algum perfil
    // Lattes ainda não estiver preenchido.
    const professores = uniq(baseFiltrada.map(r => r.professor));
    const graduacoesPorProfessor = new Map();
    const graduacoesTotal = [];

    perfisConsiderados.forEach(r => {
      const grads = graduacoesProfessorNQ(r);
      graduacoesPorProfessor.set(normalizar(r.professor), grads);
      graduacoesTotal.push(...grads);
    });

    const graduacoesUnicas = uniq(graduacoesTotal.map(normalizar));
    const areasCine = uniq(baseFiltrada.map(r => r.area_cine));

    setText("nqProfessoresTotal", n(professores.length));
    setText("nqFormacoesUnicas", n(graduacoesUnicas.length));
    setText("nqFormacoesTotal", n(graduacoesTotal.length));
    setText(
      "nqMediaFormacoes",
      professores.length
        ? (graduacoesTotal.length / professores.length).toLocaleString("pt-BR", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
          })
        : "0,0"
    );
    setText("nqMaisAreas", n(professores.length));
    setText("nqAreasCineTotal", n(areasCine.length));
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
          .get(r.area_cine)
          .add(
            r.professor
          );
      });

    const dados =
      [...mapa.entries()]
        .map(
          ([area, profs]) => ({
            area,
            total: profs.size
          })
        )
        .sort(
          (a, b) =>
            b.total - a.total
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

        data: dados.map(
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

          data: dados.map(
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
          !mapa.has(marca)
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
            total: s.size
          })
        )
        .sort(
          (a, b) =>
            b.total - a.total
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

        data: dados.map(
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

          data: dados.map(
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
    const el =
      document.getElementById(
        "graficoNQContratacao"
      );

    if (
      !el ||
      !window.echarts
    ) {
      return;
    }

    const porProfessor =
      new Map();

    formacoesFiltradasNQ()
      .forEach(r => {
        if (!r.professor) {
          return;
        }

        const atual =
          porProfessor.get(
            r.professor
          ) || r;

        const d =
          r.data_contratacao ||
          r.data_admissao ||
          r.contratacao ||
          r.data_inicio_contratacao;

        if (d) {
          porProfessor.set(
            r.professor,
            {
              ...r,
              __data: d
            }
          );
        } else if (
          !porProfessor.has(
            r.professor
          )
        ) {
          porProfessor.set(
            r.professor,
            atual
          );
        }
      });

    const dados =
      [...porProfessor.values()]
        .map(r => {
          const raw =
            r.__data ||
            r.data_contratacao ||
            r.data_admissao ||
            r.contratacao ||
            r.data_inicio_contratacao;

          const d =
            raw
              ? new Date(raw)
              : null;

          if (
            !d ||
            Number.isNaN(
              d.getTime()
            )
          ) {
            return null;
          }

          const sem =
            r.semestre ||
            r.semestre_contratacao ||
            `${d.getFullYear()}.${
              d.getMonth() < 6
                ? 1
                : 2
            }`;

          return {
            professor:
              r.professor,

            data:
              d.getTime(),

            semestre:
              String(sem)
          };
        })
        .filter(Boolean)
        .sort(
          (a, b) =>
            a.data - b.data
        );

    graficoContratacaoNQ?.dispose();

    graficoContratacaoNQ =
      echarts.init(el);

    if (!dados.length) {
      el.innerHTML =
        '<div class="nq-profile-empty" style="padding:30px">' +
        "A base atual não possui data de contratação disponível." +
        "</div>";

      return;
    }

    graficoContratacaoNQ.setOption({
      tooltip: {
        trigger: "item",

        formatter: p =>
          `${escapeHtml(
            p.data[2]
          )}<br>` +
          `${escapeHtml(
            p.data[1]
          )}<br>` +
          `${new Date(
            p.data[0]
          ).toLocaleDateString(
            "pt-BR"
          )}`
      },

      grid: {
        left: 70,
        right: 25,
        top: 25,
        bottom: 80
      },

      xAxis: {
        type: "time",
        name: "Data de contratação"
      },

      yAxis: {
        type: "category",

        data: uniq(
          dados.map(
            d => d.semestre
          )
        ),

        name: "Semestre"
      },

      series: [
        {
          type: "scatter",
          symbolSize: 12,

          data: dados.map(
            d => [
              d.data,
              d.semestre,
              d.professor
            ]
          )
        }
      ]
    });
  }

  function consolidarProfessoresNQ() {
    const mapa = new Map();

    const garantirProfessor = professor => {
      const nome = String(professor || "").trim();

      if (!nome) {
        return null;
      }

      const chave = normalizar(nome);

      if (!mapa.has(chave)) {
        mapa.set(chave, {
          professor: nome,
          formacoes: new Map(),
          areasCine: new Map(),
          titulacoes: new Map(),
          marcas: new Map(),
          situacoes: new Map()
        });
      }

      return mapa.get(chave);
    };

    const adicionar = (map, valor) => {
      const texto = String(valor || "").trim();

      if (!temValor(texto)) {
        return;
      }

      const chave = normalizar(texto);

      if (!map.has(chave)) {
        map.set(chave, texto);
      }
    };

    /* Base principal de formações / especialistas. */
    formacoesFiltradasNQ().forEach(r => {
      const item = garantirProfessor(r.professor);

      if (!item) {
        return;
      }

      adicionar(item.formacoes, r.formacao);
      adicionar(item.areasCine, r.area_cine);
      adicionar(item.titulacoes, r.titulacao_maxima);
      adicionar(
        item.marcas,
        r.marca_origem || r.marca_area_contratante
      );
      adicionar(item.situacoes, r.situacao_contratacao);
    });

    /*
     * V25.9 · Complementa a mesma linha do professor com o Perfil
     * Acadêmico/Lattes. Antes a matriz enxergava somente titulacao_maxima
     * da view de formações, por isso vários professores apareciam com "--"
     * ou perdiam titulações em andamento.
     */
    perfilAcademicoNQ.forEach(r => {
      const item = garantirProfessor(r.professor);

      if (!item) {
        return;
      }

      // O Perfil Acadêmico/Lattes é a fonte oficial das graduações.
      // Quando existe perfil, substitui as formações da base pelas graduações
      // estruturadas para impedir contagens infladas ou áreas tratadas como curso.
      const graduacoesLattes = graduacoesProfessorNQ(r);
      if (graduacoesLattes.length) {
        item.formacoes.clear();
        graduacoesLattes.forEach(g => adicionar(item.formacoes, g));
      }

      const maxConcluida =
        r.titulacao_maxima_concluida ||
        r.titulacao_maxima;

      if (temValor(maxConcluida)) {
        adicionar(
          item.titulacoes,
          `${classificarTitulacao(maxConcluida)} (concluída)`
        );
      }

      if (temValor(r.titulacao_em_andamento)) {
        adicionar(
          item.titulacoes,
          `${classificarTitulacao(r.titulacao_em_andamento)} (em andamento)`
        );
      }

      /* Fallbacks estruturados quando a titulação máxima não veio preenchida. */
      if (temValor(r.pos_doutorado)) {
        adicionar(item.titulacoes, "Pós-doutorado");
      }

      if (temValor(r.doutorado)) {
        adicionar(item.titulacoes, "Doutorado");
      }

      if (temValor(r.mestrado)) {
        adicionar(item.titulacoes, "Mestrado");
      }

      if (
        temValor(r.especializacao_1) ||
        temValor(r.especializacao_2) ||
        temValor(r.especializacao_3_mais)
      ) {
        adicionar(item.titulacoes, "Especialização");
      }

      if (
        temValor(r.graduacao_1) ||
        temValor(r.graduacao_2) ||
        temValor(r.graduacao_3_mais)
      ) {
        adicionar(item.titulacoes, "Graduação");
      }

      adicionar(
        item.marcas,
        r.marca_origem || r.marca_area_contratante
      );
      adicionar(item.situacoes, r.situacao_contratacao);
    });

    return [...mapa.values()]
      .map(item => ({
        professor: item.professor,
        formacoes: [...item.formacoes.values()].sort(
          (a, b) => a.localeCompare(b, "pt-BR")
        ),
        areasCine: [...item.areasCine.values()].sort(
          (a, b) => a.localeCompare(b, "pt-BR")
        ),
        titulacoes: [...item.titulacoes.values()].sort(
          (a, b) => a.localeCompare(b, "pt-BR")
        ),
        marcas: [...item.marcas.values()].sort(
          (a, b) => a.localeCompare(b, "pt-BR")
        ),
        situacoes: [...item.situacoes.values()].sort(
          (a, b) => a.localeCompare(b, "pt-BR")
        )
      }))
      .sort(
        (a, b) => a.professor.localeCompare(b.professor, "pt-BR")
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
        ? professores.map(
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
          ).join("")
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
        ? professores.map(
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
          ).join("")
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

    const areas =
      uniq(
        experienciasNQ.map(
          r => r.area_experiencia
        )
      );

    el.textContent =
      areas.length
        ? `${areas.length} área(s) de experiência cadastrada(s): ${areas.join(", ")}.`
        : "Nenhuma área de experiência foi cadastrada na fonte atual. A estrutura já está pronta para receber essa informação.";
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
      t.includes("pos-dout") ||
      t.includes("pós-dout")
    ) {
      return "Pós-doutorado";
    }

    if (
      t.includes("dout")
    ) {
      return "Doutorado";
    }

    if (
      t.includes("mestr")
    ) {
      return "Mestrado";
    }

    if (
      t.includes("especial")
    ) {
      return "Especialização";
    }

    if (
      t.includes("gradu") ||
      t.includes("bacharel") ||
      t.includes("licencia")
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
          x === "Doutorado" ||
          x === "Pós-doutorado"
      ).length;

    const mestres =
      classes.filter(
        x =>
          x === "Mestrado"
      ).length;

    const especialistas =
      classes.filter(
        x =>
          x === "Especialização"
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
      n(doutores)
    );

    setText(
      "nqMestres",
      n(mestres)
    );

    setText(
      "nqEspecialistas",
      n(especialistas)
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
      n(comDocencia)
    );

    setText(
      "nqComPesquisa",
      n(comPesquisa)
    );
  }
    function temValor(v) {
    const t = normalizar(v);

    return !!t &&
      ![
        "--",
        "nao informado",
        "não informado",
        "n/a",
        "na",
        "null",
        "undefined"
      ].includes(t);
  }

  function classificarTitulacao(v) {
    const t = normalizar(v);

    if (
      t.includes("pos-dout") ||
      t.includes("pós-dout")
    ) {
      return "Pós-doutorado";
    }

    if (t.includes("dout")) {
      return "Doutorado";
    }

    if (t.includes("mestr")) {
      return "Mestrado";
    }

    if (t.includes("especial")) {
      return "Especialização";
    }

    if (
      t.includes("gradu") ||
      t.includes("bacharel") ||
      t.includes("licencia")
    ) {
      return "Graduação";
    }

    return v
      ? String(v)
      : "Não informado";
  }

  function juntarCampos(row, campos) {
    return uniq(
      campos
        .map(c => row[c])
        .filter(temValor)
    ).join(" · ");
  }

  function renderKPIsPerfilAcademicoNQ() {
    const total =
      perfilAcademicoNQ.length;

    const classes =
      perfilAcademicoNQ.map(r =>
        classificarTitulacao(
          r.titulacao_maxima_concluida ||
          r.titulacao_maxima
        )
      );

    const doutores =
      classes.filter(
        x =>
          x === "Doutorado" ||
          x === "Pós-doutorado"
      ).length;

    const mestres =
      classes.filter(
        x => x === "Mestrado"
      ).length;

    const especialistas =
      classes.filter(
        x => x === "Especialização"
      ).length;

    const comDocencia =
      perfilAcademicoNQ.filter(
        r => temValor(
          r.experiencia_docente
        )
      ).length;

    const comPesquisa =
      perfilAcademicoNQ.filter(
        r => temValor(
          r.pesquisa_grupos
        )
      ).length;

    setText(
      "nqDoutores",
      n(doutores)
    );

    setText(
      "nqMestres",
      n(mestres)
    );

    setText(
      "nqEspecialistas",
      n(especialistas)
    );

    setText(
      "nqPctStricto",
      total
        ? pct(
            (
              (doutores + mestres) /
              total
            ) * 100
          )
        : "0,0%"
    );

    setText(
      "nqComDocencia",
      n(comDocencia)
    );

    setText(
      "nqComPesquisa",
      n(comPesquisa)
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

    const mapa = new Map();

    perfilAcademicoNQ.forEach(r => {
      const k =
        classificarTitulacao(
          r.titulacao_maxima_concluida ||
          r.titulacao_maxima
        );

      mapa.set(
        k,
        (mapa.get(k) || 0) + 1
      );
    });

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
            b.value - a.value
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

          data: dados,

          label: {
            formatter: "{b}: {c}"
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
            r => temValor(r[campo])
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

    if (!tbody) return;

    const q =
      normalizar(filtro);

    const rows =
      perfilAcademicoNQ.filter(
        r =>
          !q ||
          normalizar(
            Object.values(r).join(" ")
          ).includes(q)
      );

    if (!perfilAcademicoNQ.length) {
      tbody.innerHTML =
        '<tr>' +
        '<td colspan="13">' +
        'Perfil acadêmico ainda não disponível. ' +
        'Execute o SQL V24.13 e publique novamente ' +
        'a função import-nq-especialistas.' +
        '</td>' +
        '</tr>';

      return;
    }

    const cell = v =>
      temValor(v)
        ? `<div class="nq-profile-text">${escapeHtml(v)}</div>`
        : '<span class="nq-profile-empty">--</span>';

    tbody.innerHTML =
      rows.length
        ? rows.map(r => {
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
                  ${cell(graduacoes)}
                </td>

                <td>
                  ${cell(especializacoes)}
                </td>

                <td>
                  ${cell(r.mestrado)}
                </td>

                <td>
                  ${cell(r.doutorado)}
                </td>

                <td>
                  ${cell(r.pos_doutorado)}
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
          }).join("")
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
      input.dataset.ready === "1"
    ) {
      return;
    }

    input.dataset.ready = "1";

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

  function renderCoberturaNQ() {
    renderKPIsCoberturaNQ();

    renderGraficoCineNQ();

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
      "nqFiltroSituacaoFormacao"
    ].forEach(id => {
      const el =
        document.getElementById(id);

      if (
        !el ||
        el.dataset.ready === "1"
      ) {
        return;
      }

      el.dataset.ready = "1";

      el.addEventListener(
        "change",
        renderCoberturaNQ
      );
    });
  }

  function formatarDataHoraBR(valor) {
    if (!valor) return "--";

    const d =
      new Date(valor);

    if (
      Number.isNaN(
        d.getTime()
      )
    ) {
      return String(valor);
    }

    return d.toLocaleString(
      "pt-BR",
      {
        timeZone:
          "America/Sao_Paulo",

        day: "2-digit",
        month: "2-digit",
        year: "numeric",

        hour: "2-digit",
        minute: "2-digit"
      }
    );
  }

  async function carregarHistoricoImportacoesNQ() {
    const tbody =
      document.getElementById(
        "tbodyNQImportacoes"
      );

    if (!tbody) return;

    const {
      data,
      error
    } =
      await window.biSupabase
        .from("nq_importacoes")
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

      tbody.innerHTML = `
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
      linhas.map(r => `
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
      `).join("");
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
      input.dataset.v23Ready === "1"
    ) {
      return;
    }

    input.dataset.v23Ready = "1";

    input.addEventListener(
      "change",
      () => {
        const file =
          input.files?.[0];

        if (!file) {
          nome.textContent =
            "Nenhum arquivo selecionado";

          btn.disabled = true;

          status.textContent =
            "Aguardando planilha.";

          return;
        }

        const ext =
          String(
            file.name
          ).toLowerCase();

        if (
          !ext.endsWith(".xlsx") &&
          !ext.endsWith(".xls")
        ) {
          nome.textContent =
            file.name;

          btn.disabled = true;

          status.textContent =
            "Selecione um arquivo Excel (.xlsx ou .xls).";

          return;
        }

        nome.textContent =
          `${file.name} · ${
            (
              file.size /
              1024 /
              1024
            ).toLocaleString(
              "pt-BR",
              {
                maximumFractionDigits: 1
              }
            )
          } MB`;

        btn.disabled = false;

        status.textContent =
          "Planilha pronta para envio.";

        resultado.hidden = true;

        resultado.innerHTML = "";
      }
    );

    btn.addEventListener(
      "click",
      async () => {
        const file =
          input.files?.[0];

        if (!file) return;

        btn.disabled = true;

        btn.textContent =
          "Processando...";

        status.textContent =
          "Lendo as abas Export e Currículo Lattes Estruturado...";

        resultado.hidden = true;

        try {
          if (!window.XLSX) {
            throw new Error(
              "Leitor de Excel não foi carregado. Atualize a página com Ctrl+F5."
            );
          }

          const {
            data: sessionData,
            error: sessionError
          } =
            await window.biSupabase
              .auth
              .getSession();

          const session =
            sessionData?.session;

          if (
            sessionError ||
            !session?.access_token
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
                type: "array",
                cellDates: true,
                cellText: false
              }
            );

          const sheetName =
            "Export";

          const lattesSheetName =
            "Currículo Lattes Estruturado";

          const worksheet =
            workbook.Sheets[
              sheetName
            ];

          const lattesWorksheet =
            workbook.Sheets[
              lattesSheetName
            ];

          if (!worksheet) {
            throw new Error(
              `A aba "${sheetName}" não foi encontrada. ` +
              `Abas disponíveis: ${workbook.SheetNames.join(", ")}.`
            );
          }

          const rows =
            window.XLSX.utils
              .sheet_to_json(
                worksheet,
                {
                  defval: null,
                  raw: true
                }
              );

          const rowsLattes =
            lattesWorksheet
              ? window.XLSX.utils
                  .sheet_to_json(
                    lattesWorksheet,
                    {
                      defval: null,
                      raw: true
                    }
                  )
              : [];

          if (!rows.length) {
            throw new Error(
              'A aba "Export" está vazia.'
            );
          }

          status.textContent =
            `${rows.length} especialista(s) e ` +
            `${rowsLattes.length} perfil(is) Lattes localizados. ` +
            `Enviando dados...`;

          btn.textContent =
            "Enviando...";

          const response =
            await fetch(
              `${window.BI_CONFIG.SUPABASE_URL}/functions/v1/import-nq-especialistas`,
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json",

                  Authorization:
                    `Bearer ${session.access_token}`,

                  apikey:
                    window.BI_CONFIG
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
                      rowsLattes
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
            payload?.success === false
          ) {
            throw new Error(
              payload?.error ||
              payload?.mensagem ||
              `Falha HTTP ${response.status}`
            );
          }

          const r =
            payload;

          resultado.hidden =
            false;

          resultado.innerHTML = `
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
                formações
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

          status.textContent =
            "Base NQ atualizada com sucesso.";

          input.value = "";

          nome.textContent =
            "Nenhum arquivo selecionado";

          await carregarHistoricoImportacoesNQ();

          /*
           * Limpa o cache da Reunião NQ
           * para que uma nova leitura seja
           * realizada após a importação.
           */
          resumo = null;

          naoConformidades = null;

          criteriosDetalhe = null;

          await carregarFormacaoCoberturaNQ();

          renderCoberturaNQ();

        } catch (e) {
          console.error(
            "Erro na importação NQ:",
            e
          );

          resultado.hidden =
            false;

          resultado.innerHTML = `
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

          status.textContent =
            "A importação não foi concluída.";

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
      grafico?.resize();

      graficoCineNQ?.resize();

      graficoFormacoesNQ?.resize();

      graficoContratacaoNQ?.resize();

      graficoTitulacaoNQ?.resize();

      graficoExperienciasNQ?.resize();
    }
  );

  /*
   * Disponibiliza a função para dashboard.js.
   */
  window.atualizarReuniaoNQ =
    atualizarReuniaoNQ;

})();