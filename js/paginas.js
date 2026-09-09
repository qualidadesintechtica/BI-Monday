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
    { label: "Unidade/Material", get: x => texto(x.unidade_material || x.item_name || x.titulo_ua) },
    { label: "Categoria", get: x => texto(x.categoria_material) },
    { label: "Bloco", get: x => texto(x.bloco) },
    { label: "Matriz", get: x => texto(x.matriz_oferta) },
    { label: "Status Validação", get: x => texto(x.status_validacao) },
    { label: "Gestor", get: x => texto(x.gestor_validacao_nq) },
    { label: "Revisor", get: x => texto(x.revisor_validador) }
  ];

  const ORDEM_GRUPOS_OPERACAO = [
    "A liberar",
    "Liberado para Validação",
    "Em Ajustes - Conteudista e DA",
    "Em ajustes - Modelagem",
    "Em ajustes - Gerência de Tecnologia",
    "Validados",
    "Validado",
    "N/A",
    "Aguardando geração PDF do PP",
    "Pausado",
    "Emailed Elementos"
  ];

  let dadosOperacaoAtuais = [];
  let dadosAjustesAtuais = [];
  let nivelOperacaoAtual = "quadro-principal";
  const gruposFechadosOperacao = new Set();

  function campoTextoOperacao(item) {
    return normalizar([
      item?.categoria_material,
      item?.escopo,
      item?.item_name,
      item?.titulo,
      item?.titulo_ua,
      item?.formato
    ].filter(Boolean).join(" "));
  }

  function filtrarPorNivelOperacao(dados) {
    if (nivelOperacaoAtual === "quadro-principal") return dados;

    return dados.filter(item => {
      const base = campoTextoOperacao(item);
      const categoria = normalizar(item?.categoria_material);
      const nome = normalizar(item?.item_name || item?.unidade_material);

      if (nivelOperacaoAtual === "nivel1-planos") {
        return /plano/.test(base) || /producao/.test(categoria) && /plano/.test(base);
      }
      if (nivelOperacaoAtual === "nivel2-ua") {
        return categoria === normalizar("Unidade de Aprendizagem") || /unidade de aprendizagem/.test(base) || /^ua\b/.test(nome);
      }
      if (nivelOperacaoAtual === "nivel2-avaliacoes") {
        return /avaliacao/.test(base) || /^a[1-5]\b/.test(nome) || /\ba[1-5]\b/.test(categoria);
      }
      if (nivelOperacaoAtual === "nivel3-global") {
        return /\bglobal\b/.test(base) || /nivel 3/.test(base);
      }
      return true;
    });
  }

  function nomeGrupoOperacao(item) {
    const grupo = String(item?.monday_group_title || "").trim();
    if (grupo) return grupo;
    const status = normalizar(item?.status_validacao);
    if (!status || status === "em branco") return "A liberar";
    if (status.includes("paus")) return "Pausado";
    if (status === "n/a" || status === "na") return "N/A";
    if (status.includes("validado")) return "Validado";
    if (status.includes("liberado")) return "Liberado para Validação";
    if (status.includes("modelagem")) return "Em ajustes - Modelagem";
    if (status.includes("tecnologia")) return "Em ajustes - Gerência de Tecnologia";
    if (status.includes("conteudista")) return "Em Ajustes - Conteudista e DA";
    return "Outros";
  }

  function classeGrupoOperacao(nome) {
    const n = normalizar(nome);
    if (n.includes("valid")) return "green";
    if (n.includes("paus")) return "gray";
    if (n.includes("ajust")) return "orange";
    if (n.includes("liber")) return "blue";
    if (n === "n/a" || n === "na") return "lightblue";
    return "purple";
  }

  function classeStatusOperacao(status) {
    const n = normalizar(status);
    if (n.includes("validado")) return "validado";
    if (n.includes("liberado") || n.includes("revalidar")) return "liberado";
    if (n.includes("ajust")) return "ajuste";
    if (n.includes("paus")) return "pausado";
    if (!n || n === "em branco" || n.includes("a liberar")) return "aliberar";
    return "neutro";
  }

  function chaveMaterialOperacao(item) {
    return String(item?.monday_item_validacao || item?.id_titulo || item?.titulo || item?.chave_material || item?.item_name || "").trim();
  }

  function ordemGrupo(nome) {
    const idx = ORDEM_GRUPOS_OPERACAO.findIndex(x => normalizar(x) === normalizar(nome));
    return idx === -1 ? 999 : idx;
  }

  function renderBoardOperacao(dados) {
    dadosOperacaoAtuais = dados || [];
    const filtrados = filtrarPorNivelOperacao(dadosOperacaoAtuais);
    const board = document.getElementById("operacaoBoard");
    const contador = document.getElementById("contadorOperacao");
    if (!board) return;

    const grupos = new Map();
    filtrados.forEach(item => {
      const grupo = nomeGrupoOperacao(item);
      if (!grupos.has(grupo)) grupos.set(grupo, []);
      grupos.get(grupo).push(item);
    });

    const gruposOrdenados = [...grupos.entries()].sort((a, b) => {
      const oa = ordemGrupo(a[0]);
      const ob = ordemGrupo(b[0]);
      return oa !== ob ? oa - ob : a[0].localeCompare(b[0], "pt-BR");
    });

    if (contador) {
      const materiais = new Set(filtrados.map(chaveMaterialOperacao).filter(Boolean)).size;
      contador.textContent = `${materiais} materiais · ${filtrados.length} registros`;
    }

    if (!gruposOrdenados.length) {
      board.innerHTML = '<div class="monday-board-empty">Nenhum registro encontrado nesta visão com os filtros atuais.</div>';
      return;
    }

    board.innerHTML = gruposOrdenados.map(([nome, itens]) => {
      const chaveGrupo = normalizar(nome).replace(/[^a-z0-9]+/g, "-");
      const fechado = gruposFechadosOperacao.has(chaveGrupo);
      const materiais = new Set(itens.map(chaveMaterialOperacao).filter(Boolean)).size;
      const amostra = itens.slice(0, 300);
      return `
        <section class="monday-board-group monday-group-${classeGrupoOperacao(nome)}" data-group-key="${escapeHtml(chaveGrupo)}">
          <button type="button" class="monday-group-header" data-operacao-group-toggle="${escapeHtml(chaveGrupo)}" aria-expanded="${fechado ? "false" : "true"}">
            <span class="monday-group-chevron">${fechado ? "›" : "⌄"}</span>
            <span class="monday-group-name">${escapeHtml(nome)}</span>
            <span class="monday-group-count">${materiais} Materiais / ${itens.length} Registros</span>
          </button>
          <div class="monday-group-content" ${fechado ? "hidden" : ""}>
            <div class="monday-group-column-preview">
              <span></span>
              <span>Matriz de oferta</span>
              <span>Bloco</span>
              <span>Status Validação</span>
            </div>
            <div class="monday-group-summary-row">
              <span class="monday-summary-title">${escapeHtml(nome)}</span>
              <span class="monday-summary-bar monday-summary-matrix"></span>
              <span class="monday-summary-bar monday-summary-block"></span>
              <span class="monday-summary-bar monday-summary-status"></span>
            </div>
            <div class="monday-items-table-wrap">
              <table class="monday-items-table">
                <thead><tr>${COLUNAS_OPERACAO.map(c => `<th>${escapeHtml(c.label)}</th>`).join("")}</tr></thead>
                <tbody>
                  ${amostra.map(item => `<tr>${COLUNAS_OPERACAO.map(c => {
                    const valor = c.get(item);
                    return c.label === "Status Validação"
                      ? `<td><span class="board-status board-status-${classeStatusOperacao(valor)}">${escapeHtml(valor)}</span></td>`
                      : `<td title="${escapeHtml(valor)}">${escapeHtml(valor)}</td>`;
                  }).join("")}</tr>`).join("")}
                </tbody>
              </table>
              ${itens.length > amostra.length ? `<div class="monday-more-row">Mostrando 300 de ${itens.length} registros neste grupo.</div>` : ""}
            </div>
          </div>
        </section>`;
    }).join("");
  }

  function atualizarOperacao(dados) {
    renderBoardOperacao(dados || []);
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

  document.addEventListener("click", function (event) {
    const nivelTab = event.target?.closest?.("[data-operacao-nivel]");
    if (nivelTab) {
      nivelOperacaoAtual = nivelTab.dataset.operacaoNivel || "quadro-principal";
      document.querySelectorAll("[data-operacao-nivel]").forEach(btn => btn.classList.toggle("active", btn === nivelTab));
      const desc = document.getElementById("operacaoNivelDescricao");
      if (desc) desc.textContent = nivelTab.textContent.replace(/^⌖\s*/, "").trim();
      renderBoardOperacao(dadosOperacaoAtuais);
      return;
    }

    const groupToggle = event.target?.closest?.("[data-operacao-group-toggle]");
    if (groupToggle) {
      const key = groupToggle.dataset.operacaoGroupToggle;
      if (gruposFechadosOperacao.has(key)) gruposFechadosOperacao.delete(key);
      else gruposFechadosOperacao.add(key);
      renderBoardOperacao(dadosOperacaoAtuais);
      return;
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
