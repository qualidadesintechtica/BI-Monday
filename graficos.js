(function () {
  "use strict";

  let graficoStatus = null;
  let graficoBloco = null;

  function dadosUnicos(dados) {
    if (typeof window.consolidarUAs === "function") {
      return window.consolidarUAs(dados);
    }
    return dados || [];
  }

  function criarGraficoStatus(dados) {
    const elemento = document.getElementById("graficoStatus");
    if (!elemento) return;

    if (graficoStatus) {
      graficoStatus.dispose();
    }

    graficoStatus = echarts.init(elemento);

    const contagem = {};

    dadosUnicos(dados).forEach(function (item) {
      const status = item.status_validacao || "Sem status";
      contagem[status] = (contagem[status] || 0) + 1;
    });

    const serie = Object.entries(contagem)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    graficoStatus.setOption({
      tooltip: {
        trigger: "item",
        formatter: "{b}: {c} ({d}%)"
      },
      legend: {
        bottom: 0,
        type: "scroll"
      },
      series: [
        {
          type: "pie",
          radius: ["48%", "72%"],
          center: ["50%", "44%"],
          data: serie,
          label: {
            formatter: "{b}\n{c}"
          }
        }
      ]
    });
  }

  function criarGraficoBloco(dados) {
    const elemento = document.getElementById("graficoBloco");
    if (!elemento) return;

    if (graficoBloco) {
      graficoBloco.dispose();
    }

    graficoBloco = echarts.init(elemento);

    const contagem = {};

    dadosUnicos(dados).forEach(function (item) {
      const bloco = item.bloco || "Sem bloco";
      contagem[bloco] = (contagem[bloco] || 0) + 1;
    });

    const entradas = Object.entries(contagem)
      .sort(function (a, b) {
        return String(a[0]).localeCompare(
          String(b[0]),
          "pt-BR",
          { numeric: true }
        );
      });

    graficoBloco.setOption({
      tooltip: {
        trigger: "axis"
      },
      grid: {
        left: 42,
        right: 20,
        top: 20,
        bottom: 55
      },
      xAxis: {
        type: "category",
        data: entradas.map(item => item[0]),
        axisLabel: {
          rotate: 30
        }
      },
      yAxis: {
        type: "value",
        minInterval: 1
      },
      series: [
        {
          type: "bar",
          data: entradas.map(item => item[1]),
          barMaxWidth: 42
        }
      ]
    });
  }

  function atualizarGraficos(dados) {
    criarGraficoStatus(dados);
    criarGraficoBloco(dados);
  }

  window.addEventListener("resize", function () {
    graficoStatus?.resize();
    graficoBloco?.resize();
  });

  window.atualizarGraficos = atualizarGraficos;
})();
