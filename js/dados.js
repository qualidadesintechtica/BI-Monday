(function () {
  "use strict";

  async function carregarDadosBI() {
    const VIEW_NAME = window.BI_CONFIG?.VIEW_NAME || "vw_materiais_bi_consolidada";
    const tamanhoLote = 1000;
    let inicio = 0;
    let todosOsDados = [];

    const campos = `
      chave_material,
      chave_ua,
      id_titulo,
      id_ua,
      item_name,
      titulo,
      titulo_ua,
      esteira_producao,
      matriz_oferta,
      bloco,
      categoria_material,
      escopo,
      formato,
      area_cine,
      semestre_oferta,
      produtora,
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
      eh_ua,
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
        console.error("Erro ao carregar a view de materiais:", error);
        throw error;
      }

      const registros = data || [];
      todosOsDados = todosOsDados.concat(registros);
      if (registros.length < tamanhoLote) break;
      inicio += tamanhoLote;
    }

    todosOsDados = todosOsDados.map(function (item, indice) {
      return {
        ...item,
        chave_material: item.chave_material || item.chave_ua || `linha:${indice}`,
        unidade_material: item.titulo_ua || item.item_name || item.id_ua || null,
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

    console.log("View de materiais carregada:", VIEW_NAME);
    console.log("Materiais carregados:", todosOsDados.length);
    console.log("Categorias:", [...new Set(todosOsDados.map(x => x.categoria_material || "Em branco"))]);
    return todosOsDados;
  }


  async function carregarDadosOperacaoMonday() {
    const TABLE_NAME = "monday_validacao_materiais";
    const tamanhoLote = 1000;
    let inicio = 0;
    let todos = [];

    while (true) {
      const fim = inicio + tamanhoLote - 1;
      const { data, error } = await window.biSupabase
        .from(TABLE_NAME)
        .select("*")
        .range(inicio, fim);

      if (error) {
        console.error("Erro ao carregar o board Validação de Materiais:", error);
        throw error;
      }

      const lote = data || [];
      todos = todos.concat(lote);
      if (lote.length < tamanhoLote) break;
      inicio += tamanhoLote;
    }

    const normalizados = todos.map(function (item, indice) {
      return {
        ...item,
        monday_item_validacao: item.monday_item_validacao || item.monday_item_id || item.id || null,
        monday_group_title: item.monday_group_title || item.group_title || item.grupo || null,
        item_name: item.item_name || item.name || item.nome_item || item.material || null,
        titulo: item.titulo || item.titulo_validacao || item.nome_material || item.item_name || item.name || null,
        titulo_ua: item.titulo_ua || item.unidade_material || item.nome_ua || null,
        unidade_material: item.unidade_material || item.titulo_ua || item.item_name || item.name || null,
        esteira_producao: item.esteira_producao || item.esteira || null,
        matriz_oferta: item.matriz_oferta || item.matriz || item.matriz_de_oferta || null,
        bloco: item.bloco || null,
        categoria_material: item.categoria_material || item.categoria || item.tipo_material || null,
        escopo: item.escopo || item.nivel || item.nível || null,
        formato: item.formato || null,
        status_validacao: item.status_validacao || item.status || null,
        revisor_validador: item.revisor_validador || item.revisor || null,
        gestor_validacao_nq: item.gestor_validacao_nq || item.gestor || null,
        chave_material: item.chave_material || item.monday_item_id || item.id_titulo || item.id || `monday:${indice}`,
        __fonte_operacao: "monday_validacao_materiais"
      };
    });

    console.log("Board Validação de Materiais carregado diretamente:", normalizados.length);
    console.log("Grupos do board:", [...new Set(normalizados.map(x => x.monday_group_title || "Em branco"))]);
    console.log("Categorias do board:", [...new Set(normalizados.map(x => x.categoria_material || "Em branco"))]);
    return normalizados;
  }

  window.carregarDadosBI = carregarDadosBI;
  window.carregarDadosOperacaoMonday = carregarDadosOperacaoMonday;
})();
