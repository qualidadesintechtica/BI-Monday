(function () {
  "use strict";

  /* ======================================================
     REGRAS DE NEGÓCIO

     A view não possui id_ua/id_titulo. Para não contar a
     mesma UA mais de uma vez, usamos a chave de negócio:

       titulo + unidade_material

     Se algum dos dois estiver vazio, usamos monday_item_id
     como fallback para não fundir registros indevidamente.
  ====================================================== */

  const STATUS = {
    A_LIBERAR: "A liberar",
    NQ: "Liberado para validação - NQ",
    REVALIDAR_NQ: "Revalidar - NQ",
    VALIDADO: "Validado",
    PAUSADO: "Pausado",
    N_A: "N/A",
    AJUSTE_CONTEUDISTA: "Ajustes - CONTEUDISTA E DA",
    AJUSTE_MODELAGEM: "Ajustes - MODELAGEM",
    AJUSTE_TECNOLOGIA: "Ajustes - GERÊNCIA DE TECNOLOGIA"
  };

  const STATUS_AJUSTE = new Set([
    STATUS.AJUSTE_CONTEUDISTA,
    STATUS.AJUSTE_MODELAGEM,
    STATUS.AJUSTE_TECNOLOGIA
  ]);

  /*
    Quando a mesma chave de UA aparece mais de uma vez,
    mantemos o estágio mais avançado encontrado. Isso evita
    duplicidade entre linhas repetidas do Hub.
  */
  const PRIORIDADE_STATUS = new Map([
    [STATUS.VALIDADO, 70],
    [STATUS.REVALIDAR_NQ, 60],
    [STATUS.AJUSTE_CONTEUDISTA, 50],
    [STATUS.AJUSTE_MODELAGEM, 50],
    [STATUS.AJUSTE_TECNOLOGIA, 50],
    [STATUS.NQ, 40],
    [STATUS.A_LIBERAR, 20],
    [STATUS.PAUSADO, 10],
    [STATUS.N_A, 0]
  ]);

  function normalizar(valor) {
    return String(valor ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function chaveUA(item) {
    const titulo = normalizar(item?.titulo);
    const unidade = normalizar(item?.unidade_material);

    if (titulo || unidade) {
      return `${titulo}||${unidade}`;
    }

    return `monday:${String(item?.monday_item_id ?? "sem-id")}`;
  }

  function prioridade(item) {
    return PRIORIDADE_STATUS.get(item?.status_validacao) ?? 1;
  }

  function escolherRegistroAtual(atual, candidato) {
    if (!atual) {
      return candidato;
    }

    const prioridadeAtual = prioridade(atual);
    const prioridadeCandidato = prioridade(candidato);

    if (prioridadeCandidato > prioridadeAtual) {
      return candidato;
    }

    if (prioridadeCandidato < prioridadeAtual) {
      return atual;
    }

    /*
      Em empate, prefere o registro sincronizado mais recente.
    */
    const dataAtual = Date.parse(atual?.sincronizado_em || "") || 0;
    const dataCandidato = Date.parse(candidato?.sincronizado_em || "") || 0;

    return dataCandidato >= dataAtual
      ? candidato
      : atual;
  }

  function consolidarUAs(dados) {
    const mapa = new Map();

    (dados || []).forEach(function (item) {
      const chave = chaveUA(item);
      mapa.set(
        chave,
        escolherRegistroAtual(
          mapa.get(chave),
          item
        )
      );
    });

    return Array.from(mapa.values());
  }

  function ehAjuste(status) {
    return STATUS_AJUSTE.has(status);
  }

  function calcularKPIs(dados) {
    const uas = consolidarUAs(dados);

    const contar = function (teste) {
      return uas.filter(teste).length;
    };

    const total = uas.length;

    const naoLiberadas = contar(
      item => item.status_validacao === STATUS.A_LIBERAR
    );

    const statusLiberadas = contar(
      item => item.status_validacao === STATUS.NQ
    );

    const revalidar = contar(
      item => item.status_validacao === STATUS.REVALIDAR_NQ
    );

    const nq = statusLiberadas + revalidar;

    const ajuste = contar(
      item => ehAjuste(item.status_validacao)
    );

    const validadas = contar(
      item => item.status_validacao === STATUS.VALIDADO
    );

    /*
      Mesma lógica conceitual usada no BI operacional:
      liberadas = total planejado - não liberadas.
    */
    const liberadas = Math.max(
      0,
      total - naoLiberadas
    );

    const analisadas =
      nq +
      ajuste +
      validadas;

    const percentualAnalisado = total
      ? (analisadas / total) * 100
      : 0;

    const percentualAChegar = total
      ? (naoLiberadas / total) * 100
      : 0;

    return {
      total,
      liberadas,
      naoLiberadas,
      nq,
      ajuste,
      validadas,
      revalidar,
      statusLiberadas,
      percentualAnalisado,
      percentualAChegar,
      linhasOriginais: (dados || []).length,
      uasConsolidadas: uas.length
    };
  }

  function preencherKPIs(k) {
    const mapa = {
      totalUAs: k.total,
      liberadas: k.liberadas,
      naoLiberadas: k.naoLiberadas,
      emNQ: k.nq,
      emAjuste: k.ajuste,
      validadas: k.validadas,
      revalidarNQ: k.revalidar,
      percentualAnalisado: `${k.percentualAnalisado.toFixed(1)}%`,
      percentualAChegar: `${k.percentualAChegar.toFixed(1)}%`
    };

    Object.entries(mapa).forEach(
      function ([id, valor]) {
        const elemento = document.getElementById(id);
        if (elemento) {
          elemento.textContent = valor;
        }
      }
    );
  }

  window.BI_STATUS = STATUS;
  window.chaveUA = chaveUA;
  window.consolidarUAs = consolidarUAs;
  window.calcularKPIs = calcularKPIs;
  window.preencherKPIs = preencherKPIs;
})();
