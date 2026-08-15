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

  function chaveMaterial(item, indice) {
    return item?.chave_material || item?.chave_ua ||
      `${item?.id_titulo || ""}|${item?.id_ua || ""}|${item?.categoria_material || ""}` ||
      `linha:${indice}`;
  }

  function consolidarMateriais(dados) {
    const mapa = new Map();
    (dados || []).forEach(function (item, indice) {
      const chave = chaveMaterial(item, indice);
      if (!mapa.has(chave)) mapa.set(chave, item);
    });
    return Array.from(mapa.values());
  }

  function ehUaValida(item) {
    return item?.categoria_material === "Unidade de Aprendizagem" &&
      String(item?.id_titulo || "").trim() !== "" &&
      String(item?.id_ua || "").trim() !== "";
  }

  function baseParaKPIs(dados) {
    const materiais = consolidarMateriais(dados);
    const uas = materiais.filter(ehUaValida);

    /*
      Se o contexto atual ainda contém UAs, mantemos os KPIs originais
      do dashboard calculados exclusivamente em UAs. Se o usuário filtrar
      somente A1/A2/A3/Audiovisual/etc., os cards passam a resumir os
      materiais daquele filtro, evitando mostrar tudo zerado.
    */
    return {
      registros: uas.length ? uas : materiais,
      modo: uas.length ? "ua" : "material"
    };
  }

  function calcularKPIs(dados) {
    const contexto = baseParaKPIs(dados);
    const registros = contexto.registros;
    const total = registros.length;
    const liberadas = registros.filter(x => x.foi_liberada === true).length;
    const naoLiberadas = registros.filter(x => x.nao_liberada === true).length;
    const validadas = registros.filter(x => x.eh_validada === true).length;
    const nq = registros.filter(x => x.eh_nq === true).length;
    const ajuste = registros.filter(x => x.eh_ajuste === true).length;
    const revalidar = registros.filter(x => x.status_validacao === STATUS.REVALIDAR_NQ).length;
    const statusLiberadas = registros.filter(x => x.status_validacao === STATUS.NQ).length;
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
      modo: contexto.modo,
      percentualAnalisado: total ? (analisadas / total) * 100 : 0,
      percentualAChegar: total ? (naoLiberadas / total) * 100 : 0,
      linhasOriginais: (dados || []).length,
      materiaisConsolidados: consolidarMateriais(dados).length
    };
  }

  function preencherKPIs(k) {
    const labelTotal = document.getElementById("totalKpiLabel");
    if (labelTotal) {
      labelTotal.textContent = k.modo === "ua" ? "Total de UAs" : "Total de materiais";
    }

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
  window.chaveMaterial = chaveMaterial;
  window.chaveUA = item => item?.chave_ua || `${item?.id_titulo || ""}|${item?.id_ua || ""}`;
  window.consolidarMateriais = consolidarMateriais;
  window.consolidarUAs = consolidarMateriais; // compatibilidade com os módulos existentes
  window.calcularKPIs = calcularKPIs;
  window.preencherKPIs = preencherKPIs;
})();
