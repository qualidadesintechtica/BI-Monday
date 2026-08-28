(function () {
  "use strict";

  const EM_BRANCO = "__EM_BRANCO__";

  /* ======================================================
     NORMALIZA TEXTO
  ====================================================== */

  function normalizarTexto(valor) {
    return String(valor ?? "")
      .trim()
      .toLowerCase();
  }

  /* ======================================================
     VALORES ÚNICOS
  ====================================================== */

  function valoresUnicos(dados, campo) {
    const valores = dados
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

    return [...new Set(valores)].sort(
      function (a, b) {
        return String(a).localeCompare(
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
     VERIFICA SE EXISTEM VALORES EM BRANCO
  ====================================================== */

  function possuiEmBranco(dados, campo) {
    return dados.some(
      function (item) {
        const valor = item[campo];

        return (
          valor === null ||
          valor === undefined ||
          String(valor).trim() === ""
        );
      }
    );
  }

  /* ======================================================
     OBTÉM OPÇÕES SELECIONADAS
  ====================================================== */

  function obterSelecionados(id) {
    const container =
      document.getElementById(id);

    if (!container) {
      return [];
    }

    return Array.from(
      container.querySelectorAll(
        'input[type="checkbox"][data-filter-value]:checked'
      )
    ).map(
      function (checkbox) {
        return checkbox.dataset.filterValue;
      }
    );
  }

  /* ======================================================
     ATUALIZA TEXTO DO BOTÃO
  ====================================================== */

  function atualizarLabelFiltro(id) {
    const container =
      document.getElementById(id);

    if (!container) {
      return;
    }

    const botao =
      container.querySelector(
        ".multi-filter-button"
      );

    if (!botao) {
      return;
    }

    const labelPadrao =
      container.dataset.labelTodos ||
      "Todos";

    const checkboxes =
      Array.from(
        container.querySelectorAll(
          'input[type="checkbox"][data-filter-value]'
        )
      );

    const selecionados =
      checkboxes.filter(
        function (checkbox) {
          return checkbox.checked;
        }
      );

    /*
      Nenhum selecionado = sem filtro
    */

    if (selecionados.length === 0) {
      botao.textContent =
        labelPadrao;

      botao.classList.remove(
        "has-selection"
      );

      return;
    }

    /*
      Todos selecionados = todos
    */

    if (
      selecionados.length ===
      checkboxes.length
    ) {
      botao.textContent =
        labelPadrao;

      botao.classList.remove(
        "has-selection"
      );

      return;
    }

    /*
      Apenas um selecionado
    */

    if (selecionados.length === 1) {
      const label =
        selecionados[0]
          .closest("label");

      const texto =
        label
          ?.querySelector(
            ".filter-option-text"
          )
          ?.textContent;

      botao.textContent =
        texto ||
        "1 selecionado";

      botao.classList.add(
        "has-selection"
      );

      return;
    }

    /*
      Mais de um selecionado
    */

    botao.textContent =
      selecionados.length +
      " selecionados";

    botao.classList.add(
      "has-selection"
    );
  }

  /* ======================================================
     ATUALIZA CHECKBOX "SELECIONAR TODOS"
  ====================================================== */

  function atualizarSelecionarTodos(id) {
    const container =
      document.getElementById(id);

    if (!container) {
      return;
    }

    const checkboxTodos =
      container.querySelector(
        'input[data-select-all="true"]'
      );

    if (!checkboxTodos) {
      return;
    }

    const checkboxes =
      Array.from(
        container.querySelectorAll(
          'input[type="checkbox"][data-filter-value]'
        )
      );

    if (checkboxes.length === 0) {
      checkboxTodos.checked = false;
      checkboxTodos.indeterminate = false;
      return;
    }

    const quantidadeSelecionada =
      checkboxes.filter(
        function (checkbox) {
          return checkbox.checked;
        }
      ).length;

    checkboxTodos.checked =
      quantidadeSelecionada ===
      checkboxes.length;

    checkboxTodos.indeterminate =
      quantidadeSelecionada > 0 &&
      quantidadeSelecionada <
      checkboxes.length;
  }

  /* ======================================================
     DISPARA EVENTO DE ALTERAÇÃO
  ====================================================== */

  function dispararMudanca(container) {
    container.dispatchEvent(
      new CustomEvent(
        "multifilterchange",
        {
          bubbles: true
        }
      )
    );
  }

  /* ======================================================
     CRIA FILTRO MULTISELECT
  ====================================================== */

  function preencherSelect(
    id,
    valores,
    labelTodos,
    incluirEmBranco = false
  ) {

    let container =
      document.getElementById(id);

    if (!container) {
      return;
    }

    /*
      Guarda seleções anteriores.
    */

    const selecaoAnterior =
      obterSelecionados(id);

    /*
      Se ainda for SELECT tradicional,
      substitui por uma DIV.
    */

    if (
      container.tagName
        .toLowerCase() === "select"
    ) {

      const novoContainer =
        document.createElement("div");

      novoContainer.id = id;

      novoContainer.className =
        "multi-filter";

      container.replaceWith(
        novoContainer
      );

      container =
        novoContainer;
    }

    container.classList.add(
      "multi-filter"
    );

    container.dataset.labelTodos =
      labelTodos;

    container.innerHTML = "";

    /* ==================================================
       BOTÃO PRINCIPAL
    ================================================== */

    const botao =
      document.createElement(
        "button"
      );

    botao.type = "button";

    botao.className =
      "multi-filter-button";

    botao.textContent =
      labelTodos;

    container.appendChild(
      botao
    );

    /* ==================================================
       MENU
    ================================================== */

    const menu =
      document.createElement(
        "div"
      );

    menu.className =
      "multi-filter-menu";

    menu.hidden = true;

    container.appendChild(
      menu
    );

    /* ==================================================
       CABEÇALHO DO MENU
    ================================================== */

    const cabecalho =
      document.createElement(
        "div"
      );

    cabecalho.className =
      "multi-filter-header";

    menu.appendChild(
      cabecalho
    );

    /* ==================================================
       SELECIONAR TODOS
    ================================================== */

    const labelTodosOption =
      document.createElement(
        "label"
      );

    labelTodosOption.className =
      "multi-filter-option multi-filter-select-all";

    const checkboxTodos =
      document.createElement(
        "input"
      );

    checkboxTodos.type =
      "checkbox";

    checkboxTodos.dataset.selectAll =
      "true";

    const textoTodos =
      document.createElement(
        "span"
      );

    textoTodos.className =
      "filter-option-text";

    textoTodos.textContent =
      "Selecionar todos";

    labelTodosOption.appendChild(
      checkboxTodos
    );

    labelTodosOption.appendChild(
      textoTodos
    );

    cabecalho.appendChild(
      labelTodosOption
    );

    /* ==================================================
       BOTÃO LIMPAR
    ================================================== */

    const limparButton =
      document.createElement(
        "button"
      );

    limparButton.type = "button";

    limparButton.className =
      "multi-filter-clear";

    limparButton.textContent =
      "Limpar";

    cabecalho.appendChild(
      limparButton
    );

    /* ==================================================
       LISTA
    ================================================== */

    const lista =
      document.createElement(
        "div"
      );

    lista.className =
      "multi-filter-list";

    menu.appendChild(
      lista
    );

    /* ==================================================
       VALORES REAIS
    ================================================== */

    valores.forEach(
      function (valor) {

        const label =
          document.createElement(
            "label"
          );

        label.className =
          "multi-filter-option";

        const checkbox =
          document.createElement(
            "input"
          );

        checkbox.type =
          "checkbox";

        checkbox.dataset.filterValue =
          String(valor);

        checkbox.checked =
          selecaoAnterior.some(
            function (selecionado) {

              return (
                normalizarTexto(
                  selecionado
                ) ===
                normalizarTexto(
                  valor
                )
              );

            }
          );

        const texto =
          document.createElement(
            "span"
          );

        texto.className =
          "filter-option-text";

        texto.textContent =
          String(valor);

        label.appendChild(
          checkbox
        );

        label.appendChild(
          texto
        );

        lista.appendChild(
          label
        );
      }
    );

    /* ==================================================
       EM BRANCO
    ================================================== */

    if (incluirEmBranco) {

      const labelBranco =
        document.createElement(
          "label"
        );

      labelBranco.className =
        "multi-filter-option";

      const checkboxBranco =
        document.createElement(
          "input"
        );

      checkboxBranco.type =
        "checkbox";

      checkboxBranco.dataset
        .filterValue =
        EM_BRANCO;

      checkboxBranco.checked =
        selecaoAnterior.includes(
          EM_BRANCO
        );

      const textoBranco =
        document.createElement(
          "span"
        );

      textoBranco.className =
        "filter-option-text";

      textoBranco.textContent =
        "Em branco";

      labelBranco.appendChild(
        checkboxBranco
      );

      labelBranco.appendChild(
        textoBranco
      );

      lista.appendChild(
        labelBranco
      );
    }

    /* ==================================================
       ABRIR / FECHAR
    ================================================== */

    botao.addEventListener(
      "click",
      function (event) {

        event.stopPropagation();

        document
          .querySelectorAll(
            ".multi-filter-menu"
          )
          .forEach(
            function (outroMenu) {

              if (
                outroMenu !== menu
              ) {
                outroMenu.hidden =
                  true;
              }

            }
          );

        menu.hidden =
          !menu.hidden;
      }
    );

    menu.addEventListener(
      "click",
      function (event) {

        event.stopPropagation();

      }
    );

    /* ==================================================
       SELECIONAR TODOS
    ================================================== */

    checkboxTodos.addEventListener(
      "change",
      function () {

        const marcar =
          checkboxTodos.checked;

        lista
          .querySelectorAll(
            'input[type="checkbox"][data-filter-value]'
          )
          .forEach(
            function (checkbox) {

              checkbox.checked =
                marcar;

            }
          );

        atualizarSelecionarTodos(
          id
        );

        atualizarLabelFiltro(
          id
        );

        dispararMudanca(
          container
        );
      }
    );

    /* ==================================================
       LIMPAR FILTRO
    ================================================== */

    limparButton.addEventListener(
      "click",
      function () {

        lista
          .querySelectorAll(
            'input[type="checkbox"][data-filter-value]'
          )
          .forEach(
            function (checkbox) {

              checkbox.checked =
                false;

            }
          );

        checkboxTodos.checked =
          false;

        checkboxTodos.indeterminate =
          false;

        atualizarLabelFiltro(
          id
        );

        dispararMudanca(
          container
        );
      }
    );

    /* ==================================================
       ITENS INDIVIDUAIS
    ================================================== */

    lista
      .querySelectorAll(
        'input[type="checkbox"][data-filter-value]'
      )
      .forEach(
        function (checkbox) {

          checkbox.addEventListener(
            "change",
            function () {

              atualizarSelecionarTodos(
                id
              );

              atualizarLabelFiltro(
                id
              );

              dispararMudanca(
                container
              );

            }
          );

        }
      );

    atualizarSelecionarTodos(
      id
    );

    atualizarLabelFiltro(
      id
    );
  }

  /* ======================================================
     VERIFICA SE ITEM PASSA PELO FILTRO
  ====================================================== */

  function itemPassaFiltro(
    item,
    campo,
    valoresFiltro
  ) {

    /*
      Nenhuma opção marcada =
      sem restrição.
    */

    if (
      !valoresFiltro ||
      valoresFiltro.length === 0
    ) {
      return true;
    }

    const valorItem =
      item[campo];

    /*
      OR dentro do mesmo filtro.
    */

    return valoresFiltro.some(
      function (valorFiltro) {

        /*
          Filtro "Em branco".
        */

        if (
          valorFiltro ===
          EM_BRANCO
        ) {

          return (
            valorItem === null ||
            valorItem === undefined ||
            String(valorItem)
              .trim() === ""
          );

        }

        /*
          Valor normal.
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
    );
  }

  /* ======================================================
     APLICA TODOS OS FILTROS
  ====================================================== */

  function aplicarFiltros(dados) {

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

        /*
          AND entre filtros diferentes.
        */

        return filtros.every(
          function (filtro) {

            const selecionados =
              obterSelecionados(
                filtro.select
              );

            return itemPassaFiltro(
              item,
              filtro.campo,
              selecionados
            );

          }
        );

      }
    );
  }

  /* ======================================================
     FECHA MENUS AO CLICAR FORA
  ====================================================== */

  document.addEventListener(
    "click",
    function () {

      document
        .querySelectorAll(
          ".multi-filter-menu"
        )
        .forEach(
          function (menu) {

            menu.hidden =
              true;

          }
        );

    }
  );

  /* ======================================================
     EXPORTAÇÃO GLOBAL
  ====================================================== */

  window.valoresUnicos =
    valoresUnicos;

  window.possuiEmBranco =
    possuiEmBranco;

  window.preencherSelect =
    preencherSelect;

  window.aplicarFiltros =
    aplicarFiltros;

  window.obterSelecionados =
    obterSelecionados;

})();