(function () {
  "use strict";

  async function carregarDadosBI() {
    const VIEW_NAME = "vw_validacao_bi_consolidada";
    const tamanhoLote = 1000;
    let inicio = 0;
    let todosOsDados = [];

    const campos = `
      chave_ua,
      id_titulo,
      id_ua,
      titulo,
      titulo_ua,
      esteira_producao,
      matriz_oferta,
      bloco,
      categoria_material,
      gestor_planejado,
      docente_conteudista,
      previsao_liberacao_validacao,
      monday_item_validacao,
      monday_group_title,
      status_validacao,
      revisor_validador,
      gestor_validacao_nq,
      data_liberacao_validacao,
      data_validacao,
      foi_liberada,
      nao_liberada,
      eh_validada,
      eh_nq,
      eh_ajuste,
      sincronizado_esteira,
      sincronizado_validacao
    `;

    while (true) {
      const fim = inicio + tamanhoLote - 1;
      const { data, error } = await window.biSupabase
        .from(VIEW_NAME)
        .select(campos)
        .range(inicio, fim);

      if (error) {
        console.error("Erro ao carregar a view consolidada:", error);
        throw error;
      }

      const registros = data || [];
      todosOsDados = todosOsDados.concat(registros);
      if (registros.length < tamanhoLote) break;
      inicio += tamanhoLote;
    }

    /* Compatibilidade com componentes antigos do layout. */
    todosOsDados = todosOsDados.map(function (item) {
      return {
        ...item,
        unidade_material: item.titulo_ua || item.id_ua || null,
        sincronizado_em: item.sincronizado_validacao || item.sincronizado_esteira || null,
        professor_1: item.docente_conteudista || null,
        professor_2: null,
        professores: item.docente_conteudista || null,
        qtd_ajustes_conteudista_da: item.status_validacao === "Ajustes - CONTEUDISTA E DA" ? 1 : 0,
        qtd_ajustes_modelagem: item.status_validacao === "Ajustes - MODELAGEM" ? 1 : 0,
        qtd_ajustes_tecnologia: item.status_validacao === "Ajustes - GERÊNCIA DE TECNOLOGIA" ? 1 : 0,
        qtd_ajustes_total: item.eh_ajuste ? 1 : 0
      };
    });

    console.log("View consolidada carregada:", VIEW_NAME);
    console.log("UAs carregadas:", todosOsDados.length);
    return todosOsDados;
  }

  window.carregarDadosBI = carregarDadosBI;
})();
