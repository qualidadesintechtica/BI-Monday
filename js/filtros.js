function normalizarTexto(valor) {
  return String(
    valor ?? ""
  )
    .trim()
    .toLowerCase();
}


/* ======================================================
   VALORES ÚNICOS
====================================================== */

function valoresUnicos(
  dados,
  campo
) {

  const valores =
    dados
      .map(function (item) {
        return item[campo];
      })
      .filter(function (valor) {

        return (
          valor !== null &&
          valor !== undefined &&
          String(valor).trim() !== ""
        );

      });


  return [
    ...new Set(valores)
  ].sort(
    function (a, b) {

      return String(a)
        .localeCompare(
          String(b),
          "pt-BR",
          {
            numeric: true,
            sensitivity: "base"
          }
        );

    }
  );
}


/* ======================================================
   IDENTIFICA SE EXISTEM BRANCOS
====================================================== */

function possuiEmBranco(
  dados,
  campo
) {

  return dados.some(
    function (item) {

      const valor =
        item[campo];

      return (
        valor === null ||
        valor === undefined ||
        String(valor).trim() === ""
      );

    }
  );
}


/* ======================================================
   CRIA SELECT
====================================================== */

function preencherSelect(
  id,
  valores,
  labelTodos,
  incluirEmBranco = false
) {

  const select =
    document.getElementById(id);

  if (!select) {
    return;
  }

  /*
    Guarda seleção atual
  */

  const valorAtual =
    select.value;


  select.innerHTML = "";


  /*
    Opção Todos
  */

  const opcaoTodos =
    document.createElement(
      "option"
    );

  opcaoTodos.value = "";

  opcaoTodos.textContent =
    labelTodos;

  select.appendChild(
    opcaoTodos
  );


  /*
    Valores reais
  */

  valores.forEach(
    function (valor) {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        valor;

      option.textContent =
        valor;

      select.appendChild(
        option
      );

    }
  );


  /*
    Em branco
  */

  if (incluirEmBranco) {

    const branco =
      document.createElement(
        "option"
      );

    branco.value =
      "__EM_BRANCO__";

    branco.textContent =
      "Em branco";

    select.appendChild(
      branco
    );

  }


  /*
    Tenta manter a seleção
  */

  const existe =
    Array.from(
      select.options
    ).some(
      function (option) {

        return (
          option.value ===
          valorAtual
        );

      }
    );

  if (existe) {

    select.value =
      valorAtual;

  }
}


/* ======================================================
   COMPARAÇÃO DE FILTRO
====================================================== */

function itemPassaFiltro(
  item,
  campo,
  valorFiltro
) {

  /*
    Sem filtro
  */

  if (!valorFiltro) {
    return true;
  }


  const valorItem =
    item[campo];


  /*
    Em branco
  */

  if (
    valorFiltro ===
    "__EM_BRANCO__"
  ) {

    return (
      valorItem === null ||
      valorItem === undefined ||
      String(valorItem).trim() === ""
    );

  }


  /*
    Comparação normalizada
  */

  return (
    normalizarTexto(
      valorItem
    ) ===
    normalizarTexto(
      valorFiltro
    )
  );
}


/* ======================================================
   APLICA TODOS OS FILTROS
====================================================== */

function aplicarFiltros(
  dados
) {

  const filtros = [

    {
      select:
        "filtroEsteira",
      campo:
        "esteira_producao"
    },

    {
      select:
        "filtroMatriz",
      campo:
        "matriz_oferta"
    },

    {
      select:
        "filtroBloco",
      campo:
        "bloco"
    },

    {
      select:
        "filtroStatus",
      campo:
        "status_validacao"
    },

    {
      select:
        "filtroCategoria",
      campo:
        "categoria_material"
    },

    {
      select:
        "filtroGestor",
      campo:
        "gestor_validacao_nq"
    },

    {
      select:
        "filtroRevisor",
      campo:
        "revisor_validador"
    }

  ];


  return dados.filter(
    function (item) {

      return filtros.every(
        function (filtro) {

          const elemento =
            document.getElementById(
              filtro.select
            );

          if (!elemento) {
            return true;
          }


          return itemPassaFiltro(
            item,
            filtro.campo,
            elemento.value
          );

        }
      );

    }
  );
}


/* ======================================================
   EXPORTAÇÃO
====================================================== */

window.valoresUnicos =
  valoresUnicos;

window.possuiEmBranco =
  possuiEmBranco;

window.preencherSelect =
  preencherSelect;

window.aplicarFiltros =
  aplicarFiltros;