(function () {
  "use strict";

  /* ======================================================
     STATUS
  ====================================================== */

  const STATUS = {

    NQ:
      "Liberado para validação - NQ",

    REVALIDAR_NQ:
      "Revalidar - NQ",

    VALIDADO:
      "Validado",

    AJUSTE_CONTEUDISTA:
      "Ajustes - CONTEUDISTA E DA",

    AJUSTE_MODELAGEM:
      "Ajustes - MODELAGEM",

    AJUSTE_TECNOLOGIA:
      "Ajustes - GERÊNCIA DE TECNOLOGIA"

  };


  /* ======================================================
     CHAVE DO MATERIAL
  ====================================================== */

  function chaveMaterial(
    item,
    indice
  ) {

    /*
      A nova View já traz chave_material.

      Para registros sem ID UA, a chave_material
      continua existindo, normalmente baseada no
      monday_item_id.

      Portanto eles NÃO podem desaparecer do BI.
    */

    if (
      item?.chave_material &&
      String(
        item.chave_material
      ).trim() !== ""
    ) {

      return String(
        item.chave_material
      );

    }


    if (
      item?.chave_ua &&
      String(
        item.chave_ua
      ).trim() !== ""
    ) {

      return String(
        item.chave_ua
      );

    }


    const idTitulo =
      String(
        item?.id_titulo || ""
      ).trim();


    const idUa =
      String(
        item?.id_ua || ""
      ).trim();


    const categoria =
      String(
        item?.categoria_material || ""
      ).trim();


    /*
      Se houver algum identificador,
      montamos uma chave de contingência.
    */

    if (
      idTitulo ||
      idUa ||
      categoria
    ) {

      return (
        idTitulo +
        "|" +
        idUa +
        "|" +
        categoria +
        "|" +
        String(
          item?.monday_item_esteira ||
          indice
        )
      );

    }


    /*
      Último fallback:
      nunca deixa duas linhas sem identificação
      virarem uma só.
    */

    return (
      "linha:" +
      indice
    );

  }


  /* ======================================================
     CONSOLIDA MATERIAIS
  ====================================================== */

  function consolidarMateriais(
    dados
  ) {

    const mapa =
      new Map();


    (
      dados || []
    ).forEach(
      function (
        item,
        indice
      ) {

        const chave =
          chaveMaterial(
            item,
            indice
          );


        if (
          !mapa.has(
            chave
          )
        ) {

          mapa.set(
            chave,
            item
          );

        }

      }
    );


    return Array.from(
      mapa.values()
    );

  }


  /* ======================================================
     IDENTIFICA UNIDADE DE APRENDIZAGEM
  ====================================================== */

  function ehUA(
    item
  ) {

    /*
      REGRA NOVA:

      Para contar como UA, NÃO exigimos mais ID UA.

      Se a Monday classificou o registro como
      "Unidade de Aprendizagem", ele entra no
      planejamento mesmo que tenha acabado de
      ser criado e ainda esteja incompleto.
    */

    return (
      item?.eh_ua === true ||

      String(
        item?.categoria_material || ""
      ).trim() ===
        "Unidade de Aprendizagem"
    );

  }


  /* ======================================================
     IDENTIFICA UA SEM ID
  ====================================================== */

  function ehUASemId(
    item
  ) {

    if (
      !ehUA(
        item
      )
    ) {

      return false;

    }


    const idUa =
      String(
        item?.id_ua || ""
      ).trim();


    return (
      idUa === ""
    );

  }


  /* ======================================================
     DEFINE BASE DOS KPIs
  ====================================================== */

  function baseParaKPIs(
    dados
  ) {

    const materiais =
      consolidarMateriais(
        dados
      );


    const uas =
      materiais.filter(
        ehUA
      );


    /*
      COMPORTAMENTO:

      1. Se o contexto possui UAs:
         os KPIs principais são KPIs de UA.

      2. Se o usuário filtrar somente A1, A2,
         A3, Audiovisual etc.:
         os KPIs passam a resumir materiais.

      Isso preserva o comportamento que já
      estava funcionando na V10.
    */

    if (
      uas.length > 0
    ) {

      return {

        registros:
          uas,

        modo:
          "ua",

        materiais:
          materiais

      };

    }


    return {

      registros:
        materiais,

      modo:
        "material",

      materiais:
        materiais

    };

  }


  /* ======================================================
     CALCULA KPIs
  ====================================================== */

  function calcularKPIs(
    dados
  ) {

    const contexto =
      baseParaKPIs(
        dados
      );


    const registros =
      contexto.registros;


    /* --------------------------------------------------
       TOTAL
    -------------------------------------------------- */

    const total =
      registros.length;


    /* --------------------------------------------------
       LIBERADAS
    -------------------------------------------------- */

    const liberadas =
      registros.filter(
        function (item) {

          return (
            item.foi_liberada ===
            true
          );

        }
      ).length;


    /* --------------------------------------------------
       NÃO LIBERADAS

       REGRA OFICIAL:

       Total - Liberadas

       Assim registros sem ID UA permanecem
       corretamente no planejamento.
    -------------------------------------------------- */

    const naoLiberadas =
      Math.max(
        0,
        total -
        liberadas
      );


    /* --------------------------------------------------
       VALIDADAS
    -------------------------------------------------- */

    const validadas =
      registros.filter(
        function (item) {

          return (
            item.eh_validada ===
            true
          );

        }
      ).length;


    /* --------------------------------------------------
       EM NQ

       Inclui:
       - Liberado para validação - NQ
       - Revalidar - NQ

       A própria View já traz eh_nq com esta regra.
    -------------------------------------------------- */

    const nq =
      registros.filter(
        function (item) {

          return (
            item.eh_nq ===
            true
          );

        }
      ).length;


    /* --------------------------------------------------
       AJUSTES
    -------------------------------------------------- */

    const ajuste =
      registros.filter(
        function (item) {

          return (
            item.eh_ajuste ===
            true
          );

        }
      ).length;


    /* --------------------------------------------------
       REVALIDAR NQ
    -------------------------------------------------- */

    const revalidar =
      registros.filter(
        function (item) {

          return (
            item.status_validacao ===
            STATUS.REVALIDAR_NQ
          );

        }
      ).length;


    /* --------------------------------------------------
       LIBERADO PARA NQ
    -------------------------------------------------- */

    const statusLiberadas =
      registros.filter(
        function (item) {

          return (
            item.status_validacao ===
            STATUS.NQ
          );

        }
      ).length;


    /* --------------------------------------------------
       SEM ID UA

       Indicador de qualidade de dados.
       Não retira o registro do Total UAs.
    -------------------------------------------------- */

    const semIdUa =
      registros.filter(
        ehUASemId
      ).length;


    /* --------------------------------------------------
       ANALISADAS

       Aqui mantemos também a informação detalhada.
    -------------------------------------------------- */

    const analisadas =
      validadas +
      nq +
      ajuste;


    /* --------------------------------------------------
       % ANALISADO

       Para o dashboard executivo:
       Liberadas / Total

       Assim ele é complementar ao % a chegar.
    -------------------------------------------------- */

    const percentualAnalisado =
      total > 0
        ? (
            liberadas /
            total
          ) * 100
        : 0;


    /* --------------------------------------------------
       % A CHEGAR
    -------------------------------------------------- */

    const percentualAChegar =
      total > 0
        ? (
            naoLiberadas /
            total
          ) * 100
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

      analisadas,

      semIdUa,

      modo:
        contexto.modo,

      percentualAnalisado,

      percentualAChegar,

      linhasOriginais:
        (
          dados || []
        ).length,

      materiaisConsolidados:
        contexto.materiais.length

    };

  }


  /* ======================================================
     PREENCHE CARDS
  ====================================================== */

  function preencherKPIs(
    k
  ) {

    /* --------------------------------------------------
       TÍTULO DO PRIMEIRO CARD
    -------------------------------------------------- */

    const labelTotal =
      document.getElementById(
        "totalKpiLabel"
      );


    if (
      labelTotal
    ) {

      labelTotal.textContent =
        k.modo ===
        "ua"

          ? "Total de UAs"

          : "Total de materiais";

    }


    /* --------------------------------------------------
       VALORES
    -------------------------------------------------- */

    const mapa = {

      totalUAs:
        k.total,

      liberadas:
        k.liberadas,

      naoLiberadas:
        k.naoLiberadas,

      emNQ:
        k.nq,

      emAjuste:
        k.ajuste,

      validadas:
        k.validadas,

      revalidarNQ:
        k.revalidar,

      percentualAnalisado:
        `${k.percentualAnalisado.toFixed(1)}%`,

      percentualAChegar:
        `${k.percentualAChegar.toFixed(1)}%`

    };


    Object.entries(
      mapa
    ).forEach(
      function (
        [id, valor]
      ) {

        const elemento =
          document.getElementById(
            id
          );


        if (
          elemento
        ) {

          elemento.textContent =
            valor;

        }

      }
    );

  }


  /* ======================================================
     EXPORTAÇÕES
  ====================================================== */

  window.BI_STATUS =
    STATUS;


  window.chaveMaterial =
    chaveMaterial;


  window.chaveUA =
    function (item) {

      return (
        item?.chave_ua ||
        item?.chave_material ||
        (
          String(
            item?.id_titulo || ""
          ) +
          "|" +
          String(
            item?.id_ua || ""
          )
        )
      );

    };


  window.consolidarMateriais =
    consolidarMateriais;


  /*
    Mantemos para compatibilidade
    com páginas antigas.
  */

  window.consolidarUAs =
    consolidarMateriais;


  window.calcularKPIs =
    calcularKPIs;


  window.preencherKPIs =
    preencherKPIs;

})();