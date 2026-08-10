async function carregarDadosBI() {
  "use strict";

  const tamanhoLote = 1000;

  let inicio = 0;
  let todosOsDados = [];

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
        .select("*")
        .range(
          inicio,
          fim
        );

    if (error) {
      console.error(
        "Erro ao carregar dados do Supabase:",
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

    /*
      Se vier menos de 1000,
      chegamos ao final da View.
    */

    if (
      registros.length <
      tamanhoLote
    ) {
      break;
    }

    inicio += tamanhoLote;
  }

  console.log(
    "Total carregado:",
    todosOsDados.length
  );

  return todosOsDados;
}

window.carregarDadosBI =
  carregarDadosBI;