(function () {
  "use strict";

  const STATUS = {
    NQ: "Liberado para validação - NQ",
    REVALIDAR_NQ: "Revalidar - NQ",
    VALIDADO: "Validado",
    AJUSTE_CONTEUDISTA: "Ajustes - CONTEUDISTA E DA",
    AJUSTE_MODELAGEM: "Ajustes - MODELAGEM",
    AJUSTE_TECNOLOGIA: "Ajustes - GERÊNCIA DE TECNOLOGIA"
  };

  function consolidarUAs(dados) {
    /* A nova view já possui exatamente uma linha por UA lógica. */
    const mapa = new Map();
    (dados || []).forEach(function (item, indice) {
      const chave = item.chave_ua || `${item.id_titulo || ""}|${item.id_ua || ""}` || `linha:${indice}`;
      if (!mapa.has(chave)) mapa.set(chave, item);
    });
    return Array.from(mapa.values());
  }

  function calcularKPIs(dados) {
    const uas = consolidarUAs(dados);
    const total = uas.length;
    const liberadas = uas.filter(x => x.foi_liberada === true).length;
    const naoLiberadas = uas.filter(x => x.nao_liberada === true).length;
    const validadas = uas.filter(x => x.eh_validada === true).length;
    const nq = uas.filter(x => x.eh_nq === true).length;
    const ajuste = uas.filter(x => x.eh_ajuste === true).length;
    const revalidar = uas.filter(x => x.status_validacao === STATUS.REVALIDAR_NQ).length;
    const statusLiberadas = uas.filter(x => x.status_validacao === STATUS.NQ).length;
    const analisadas = validadas + nq + ajuste;

    return {
      total,
      liberadas,
      naoLiberadas,
      nq,
      ajuste,
      validadas,
      revalidar,
      statusLiberadas,
      percentualAnalisado: total ? (analisadas / total) * 100 : 0,
      percentualAChegar: total ? (naoLiberadas / total) * 100 : 0,
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
    Object.entries(mapa).forEach(([id, valor]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = valor;
    });
  }

  window.BI_STATUS = STATUS;
  window.chaveUA = item => item?.chave_ua || `${item?.id_titulo || ""}|${item?.id_ua || ""}`;
  window.consolidarUAs = consolidarUAs;
  window.calcularKPIs = calcularKPIs;
  window.preencherKPIs = preencherKPIs;
})();
