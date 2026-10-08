/* Paginação do relatório: linhas de tabelas e texto, cabeçalhos e links. */
(() => {
  "use strict";

  function paginar(raiz, canvas, alturaPagina, escala = 1.6) {
    const base = raiz.getBoundingClientRect();
    const protegidos = [];
    const tabelas = [];
    const faixa = (rect, linha = false) => ({
      inicio: Math.max(0, linha ? Math.floor((rect.top - base.top) * escala) : Math.ceil((rect.top - base.top) * escala)),
      fim: Math.min(canvas.height, linha ? Math.ceil((rect.bottom - base.top) * escala) : Math.floor((rect.bottom - base.top) * escala)),
    });
    const proteger = (rect, linha = false) => {
      if (rect.height > 0 && rect.width > 0) protegidos.push(faixa(rect, linha));
    };

    // Elementos que cabem em uma página permanecem inteiros. Elementos maiores
    // são paginados pelas suas linhas de texto, sem reduzir a fonte.
    raiz.querySelectorAll(".report-cover, .report-meta-grid, .report-meta, .report-section, .report-evidence-card, .report-evidence-image-wrap, .report-evidence-file, .report-footer, .report-nq-cards, tr, img").forEach((el) => proteger(el.getBoundingClientRect()));

    raiz.querySelectorAll("h2, h3, h4").forEach((titulo) => {
      const rect = titulo.getBoundingClientRect();
      const proximo = titulo.nextElementSibling?.getBoundingClientRect();
      proteger({ ...rect.toJSON(), bottom: proximo ? Math.min(proximo.bottom, proximo.top + 35) : rect.bottom, height: proximo ? Math.min(proximo.bottom, proximo.top + 35) - rect.top : rect.height });
    });

    raiz.querySelectorAll("table").forEach((table) => {
      const rect = table.getBoundingClientRect();
      const head = table.tHead?.getBoundingClientRect();
      if (!head?.height) return;
      const intervalo = faixa(rect);
      const cabecalho = faixa(head);
      tabelas.push({ ...intervalo, cabecalho });
      const primeira = table.tBodies[0]?.rows[0]?.getBoundingClientRect();
      if (primeira) proteger({ ...head.toJSON(), bottom: primeira.bottom, height: primeira.bottom - head.top });
    });

    const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const rodape = raiz.querySelector(".report-footer")?.getBoundingClientRect();
    let ultimaLinhaConteudo;
    while (walker.nextNode()) {
      if (!/\S/.test(walker.currentNode.textContent)) continue;
      range.selectNodeContents(walker.currentNode);
      [...range.getClientRects()].forEach((rect) => {
        proteger(rect, true);
        if (rodape && rect.width > 0 && rect.height > 0 && rect.bottom <= rodape.top && (!ultimaLinhaConteudo || rect.bottom > ultimaLinhaConteudo.bottom)) ultimaLinhaConteudo = rect;
      });
    }
    range.detach();

    // O rodapé acompanha ao menos a última linha do conteúdo, evitando uma
    // página que contenha somente os dados de emissão.
    if (rodape && ultimaLinhaConteudo) proteger({ ...ultimaLinhaConteudo.toJSON(), bottom: rodape.bottom, height: rodape.bottom - ultimaLinhaConteudo.top }, true);

    const paginas = [];
    let inicio = 0;
    while (inicio < canvas.height) {
      const tabela = tabelas.find((t) => t.inicio < inicio && t.fim > inicio && t.cabecalho.fim <= inicio);
      const candidato = tabela?.cabecalho;
      const cabecalho = candidato && candidato.fim - candidato.inicio < alturaPagina / 4 ? candidato : null;
      const alturaCabecalho = cabecalho ? cabecalho.fim - cabecalho.inicio : 0;
      const disponivel = alturaPagina - alturaCabecalho;
      let fim = Math.min(canvas.height, inicio + disponivel);
      let anterior;
      do {
        anterior = fim;
        for (const trecho of protegidos) {
          if (trecho.inicio >= inicio && trecho.inicio < fim && trecho.fim > fim && trecho.fim - trecho.inicio <= disponivel) {
            fim = trecho.inicio;
          }
        }
      } while (fim !== anterior && fim > inicio);

      // Um intervalo muito grande ou sobreposto não pode impedir o avanço.
      // As linhas de texto continuam protegidas ao escolher a divisão.
      if (fim <= inicio) {
        fim = Math.min(canvas.height, inicio + disponivel);
        const linhas = protegidos.filter((t) => t.fim - t.inicio < 80 * escala);
        let anteriorLinha;
        do {
          anteriorLinha = fim;
          for (const linha of linhas) {
            if (linha.inicio > inicio && linha.inicio < fim && linha.fim > fim) fim = linha.inicio;
          }
        } while (fim !== anteriorLinha);
      }
      paginas.push({ inicio, fim, cabecalho, alturaCabecalho });
      inicio = fim;
    }
    return paginas;
  }

  function links(raiz, paginas, escala = 1.6) {
    const base = raiz.getBoundingClientRect();
    const resultado = [];
    raiz.querySelectorAll("a.report-evidence-external-link[href]").forEach((link) => {
      [...link.getClientRects()].forEach((rect) => {
        const topo = (rect.top - base.top) * escala;
        const fim = (rect.bottom - base.top) * escala;
        paginas.forEach((pagina, indice) => {
          const inicioVisivel = Math.max(topo, pagina.inicio);
          const fimVisivel = Math.min(fim, pagina.fim);
          if (fimVisivel <= inicioVisivel) return;
          resultado.push({
            pagina: indice + 1,
            url: link.href,
            x: (rect.left - base.left) * escala,
            y: inicioVisivel - pagina.inicio + pagina.alturaCabecalho,
            largura: rect.width * escala,
            altura: fimVisivel - inicioVisivel,
          });
        });
      });
    });
    return resultado;
  }

  window.biProjetosPdf = { paginar, links };
})();
