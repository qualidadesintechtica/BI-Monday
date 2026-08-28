(function () {
  "use strict";

  const STATUS_AJUSTE = new Set([
    "Ajustes - CONTEUDISTA E DA",
    "Ajustes - MODELAGEM",
    "Ajustes - GERÊNCIA DE TECNOLOGIA"
  ]);

  function texto(valor) {
    if (valor === null || valor === undefined || String(valor).trim() === "") {
      return "Em branco";
    }
    return String(valor).trim();
  }

  function numero(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
  }

  function escapeHtml(valor) {
    return String(valor ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizar(valor) {
    return String(valor ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function formatarData(valor) {
    if (!valor) return "Em branco";
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return texto(valor);
    return data.toLocaleDateString("pt-BR");
  }

  function csvEscape(valor) {
    const s = String(valor ?? "");
    if (/[";,\n\r]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function baixarCSV(nome, colunas, linhas) {
    const cabecalho = colunas.map(c => csvEscape(c.label)).join(";");
    const corpo = linhas.map(item =>
      colunas.map(c => csvEscape(c.get(item))).join(";")
    );
    const csv = "\uFEFF" + [cabecalho, ...corpo].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const COLUNAS_OPERACAO = [
    { label: "Título", get: x => texto(x.titulo) },
    { label: "Unidade/Material", get: x => texto(x.unidade_material) },
    { label: "Categoria", get: x => texto(x.categoria_material) },
    { label: "Bloco", get: x => texto(x.bloco) },
    { label: "Esteira", get: x => texto(x.esteira_producao) },
    { label: "Matriz", get: x => texto(x.matriz_oferta) },
    { label: "Status", get: x => texto(x.status_validacao) },
    { label: "Gestor", get: x => texto(x.gestor_validacao_nq) },
    { label: "Revisor", get: x => texto(x.revisor_validador) },
    { label: "Professor(es)", get: x => texto(x.professores || [x.professor_1, x.professor_2].filter(Boolean).join(", ")) },
    { label: "Liberação", get: x => formatarData(x.data_liberacao_validacao) },
    { label: "Validação", get: x => formatarData(x.data_validacao) }
  ];

  let dadosOperacaoAtuais = [];
  let dadosAjustesAtuais = [];

  function aplicarBuscaOperacao(dados) {
    const busca = normalizar(document.getElementById("buscaOperacao")?.value);
    if (!busca) return dados;
    return dados.filter(item => {
      return COLUNAS_OPERACAO.some(c => normalizar(c.get(item)).includes(busca));
    });
  }

  function renderTabelaOperacao(dados) {
    dadosOperacaoAtuais = dados || [];
    const filtrados = aplicarBuscaOperacao(dadosOperacaoAtuais);
    const tbody = document.getElementById("tbodyOperacao");
    const contador = document.getElementById("contadorOperacao");
    if (!tbody) return;

    if (contador) {
      contador.textContent = `${filtrados.length} linha${filtrados.length === 1 ? "" : "s"} exibida${filtrados.length === 1 ? "" : "s"}`;
    }

    if (filtrados.length === 0) {
      tbody.innerHTML = '<tr><td colspan="12" class="empty-table">Nenhum registro corresponde aos filtros atuais.</td></tr>';
      return;
    }

    tbody.innerHTML = filtrados.slice(0, 500).map(item => `
      <tr>
        ${COLUNAS_OPERACAO.map(c => `<td>${escapeHtml(c.get(item))}</td>`).join("")}
      </tr>
    `).join("");

    if (filtrados.length > 500 && contador) {
      contador.textContent += " · mostrando as primeiras 500 na tela; o CSV exporta todas";
    }
  }

  function atualizarOperacao(dados) {
    renderTabelaOperacao(dados || []);
  }

  function ehAjuste(item) {
    return STATUS_AJUSTE.has(item?.status_validacao);
  }

  function renderAjustes(dados) {
    dadosAjustesAtuais = (dados || []).filter(ehAjuste);

    const conteudista = dadosAjustesAtuais.filter(x => x.status_validacao === "Ajustes - CONTEUDISTA E DA").length;
    const modelagem = dadosAjustesAtuais.filter(x => x.status_validacao === "Ajustes - MODELAGEM").length;
    const tecnologia = dadosAjustesAtuais.filter(x => x.status_validacao === "Ajustes - GERÊNCIA DE TECNOLOGIA").length;
    const totalOcorrencias = dadosAjustesAtuais.reduce((acc, x) => acc + numero(x.qtd_ajustes_total), 0);

    const mapa = {
      ajustesTotalLinhas: dadosAjustesAtuais.length,
      ajustesConteudista: conteudista,
      ajustesModelagem: modelagem,
      ajustesTecnologia: tecnologia,
      ajustesOcorrencias: totalOcorrencias
    };
    Object.entries(mapa).forEach(([id, valor]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = valor;
    });

    const tbody = document.getElementById("tbodyAjustes");
    const contador = document.getElementById("contadorAjustes");
    if (!tbody) return;

    if (contador) contador.textContent = `${dadosAjustesAtuais.length} material(is) atualmente em ajuste`;

    if (dadosAjustesAtuais.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty-table">Nenhum material em ajuste com os filtros atuais.</td></tr>';
      return;
    }

    tbody.innerHTML = dadosAjustesAtuais.slice(0, 500).map(item => `
      <tr>
        <td>${escapeHtml(texto(item.titulo))}</td>
        <td>${escapeHtml(texto(item.unidade_material))}</td>
        <td>${escapeHtml(texto(item.status_validacao))}</td>
        <td>${escapeHtml(texto(item.bloco))}</td>
        <td>${escapeHtml(texto(item.gestor_validacao_nq))}</td>
        <td>${escapeHtml(texto(item.revisor_validador))}</td>
        <td>${numero(item.qtd_ajustes_conteudista_da)}</td>
        <td>${numero(item.qtd_ajustes_modelagem)}</td>
        <td>${numero(item.qtd_ajustes_tecnologia)}</td>
        <td>${numero(item.qtd_ajustes_total)}</td>
      </tr>
    `).join("");
  }

  function separarPessoas(valor) {
    if (!valor) return [];
    if (Array.isArray(valor)) return valor.map(texto).filter(x => x !== "Em branco");
    return String(valor)
      .split(/[,;|]/)
      .map(v => v.trim())
      .filter(Boolean);
  }

  function criarAgregadoEquipe(dados) {
    const mapa = new Map();

    function acumular(tipo, pessoa, item) {
      if (!pessoa || texto(pessoa) === "Em branco") return;
      const chave = `${tipo}||${normalizar(pessoa)}`;
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          tipo,
          pessoa: texto(pessoa),
          total: 0,
          validadas: 0,
          nq: 0,
          ajustes: 0,
          aLiberar: 0
        });
      }
      const r = mapa.get(chave);
      r.total += 1;
      if (item.status_validacao === "Validado") r.validadas += 1;
      if (["Liberado para validação - NQ", "Revalidar - NQ"].includes(item.status_validacao)) r.nq += 1;
      if (ehAjuste(item)) r.ajustes += 1;
      if (item.nao_liberada === true) r.aLiberar += 1;
    }

    (dados || []).forEach(item => {
      acumular("Gestor", item.gestor_validacao_nq, item);
      acumular("Revisor", item.revisor_validador, item);

      const professores = new Set([
        ...separarPessoas(item.professores),
        ...separarPessoas(item.professor_1),
        ...separarPessoas(item.professor_2)
      ]);
      professores.forEach(p => acumular("Professor", p, item));
    });

    return Array.from(mapa.values()).sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo.localeCompare(b.tipo, "pt-BR");
      return b.total - a.total || a.pessoa.localeCompare(b.pessoa, "pt-BR");
    });
  }

  function renderEquipe(dados) {
    const agregado = criarAgregadoEquipe(dados || []);
    const tbody = document.getElementById("tbodyEquipe");
    const contador = document.getElementById("contadorEquipe");
    if (!tbody) return;

    const gestores = agregado.filter(x => x.tipo === "Gestor").length;
    const revisores = agregado.filter(x => x.tipo === "Revisor").length;
    const professores = agregado.filter(x => x.tipo === "Professor").length;

    const mapa = {
      equipePessoas: agregado.length,
      equipeGestores: gestores,
      equipeRevisores: revisores,
      equipeProfessores: professores
    };
    Object.entries(mapa).forEach(([id, valor]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = valor;
    });

    if (contador) contador.textContent = `${agregado.length} responsável(is) encontrado(s) nos filtros atuais`;

    if (agregado.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-table">Nenhuma pessoa encontrada com os filtros atuais.</td></tr>';
      return;
    }

    tbody.innerHTML = agregado.map(r => `
      <tr>
        <td><span class="type-badge">${escapeHtml(r.tipo)}</span></td>
        <td>${escapeHtml(r.pessoa)}</td>
        <td>${r.total}</td>
        <td>${r.validadas}</td>
        <td>${r.nq}</td>
        <td>${r.ajustes}</td>
        <td>${r.aLiberar}</td>
      </tr>
    `).join("");
  }

  function atualizarPaginas(dadosFiltrados) {
    atualizarOperacao(dadosFiltrados);
    renderAjustes(dadosFiltrados);
    renderEquipe(dadosFiltrados);
  }

  document.addEventListener("input", function (event) {
    if (event.target?.id === "buscaOperacao") {
      renderTabelaOperacao(dadosOperacaoAtuais);
    }
  });

  document.addEventListener("click", function (event) {
    if (event.target?.id === "exportarOperacao") {
      const filtrados = aplicarBuscaOperacao(dadosOperacaoAtuais);
      baixarCSV("operacao_validacao_materiais.csv", COLUNAS_OPERACAO, filtrados);
    }

    if (event.target?.id === "exportarAjustes") {
      const colunas = [
        { label: "Título", get: x => texto(x.titulo) },
        { label: "Unidade/Material", get: x => texto(x.unidade_material) },
        { label: "Status", get: x => texto(x.status_validacao) },
        { label: "Bloco", get: x => texto(x.bloco) },
        { label: "Gestor", get: x => texto(x.gestor_validacao_nq) },
        { label: "Revisor", get: x => texto(x.revisor_validador) },
        { label: "Ajustes Conteudista/DA", get: x => numero(x.qtd_ajustes_conteudista_da) },
        { label: "Ajustes Modelagem", get: x => numero(x.qtd_ajustes_modelagem) },
        { label: "Ajustes Tecnologia", get: x => numero(x.qtd_ajustes_tecnologia) },
        { label: "Ajustes Total", get: x => numero(x.qtd_ajustes_total) }
      ];
      baixarCSV("ajustes_validacao_materiais.csv", colunas, dadosAjustesAtuais);
    }
  });

  window.atualizarPaginasBI = atualizarPaginas;
})();
