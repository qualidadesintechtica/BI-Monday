async function carregarDadosBI() {
  "use strict";

  const tamanhoLote = 1000;

  let inicio = 0;
  let todosOsDados = [];

  const campos = `
    monday_item_id,
    titulo,
    unidade_material,
    categoria_material,
    bloco,
    esteira_producao,
    matriz_oferta,
    status_validacao,
    gestor_validacao_nq,
    revisor_validador,
    professor_1,
    professor_2,
    professores,
    data_liberacao_validacao,
    data_validacao,
    data_revalidacao,
    qtd_ajustes_conteudista_da,
    qtd_ajustes_modelagem,
    qtd_ajustes_tecnologia,
    qtd_ajustes_total,
    sincronizado_em
  `;

  while (true) {

    const fim =
      inicio + tamanhoLote - 1;

    const {
      data,
      error
    } =
      await window.biSupabase
        .from(
          window.BI_CONFIG.VIEW_NAME
        )
        .select(campos)
        .range(
          inicio,
          fim
        );

    if (error) {

      console.error(
        "Erro ao carregar dados:",
        error
      );

      throw error;

    }

    const registros =
      data || [];

    todosOsDados =
      todosOsDados.concat(
        registros
      );

    if (
      registros.length <
      tamanhoLote
    ) {
      break;
    }

    inicio += tamanhoLote;
  }

  console.log(
    "Registros carregados:",
    todosOsDados.length
  );

  return todosOsDados;
}

window.carregarDadosBI =
  carregarDadosBI;