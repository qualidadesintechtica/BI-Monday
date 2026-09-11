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
    "Revalidar - NQ",
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

  /*
    As abas do Monday são VISÕES do mesmo board.
    Aqui a classificação usa primeiro os campos estruturados da base
    (categoria_material / escopo) e só depois aplica fallbacks de texto.

    Categorias confirmadas no próprio BI:
      - Plano de Produção
      - Unidade de Aprendizagem
      - Avaliação Lato / Avaliação A1 ... A5

    Isso evita o erro da V24.15, que tentava descobrir o nível apenas
    procurando palavras soltas no título do material.
  */
  function classificarNivelOperacao(item) {
    const categoria = normalizar(item?.categoria_material);
    const escopo = normalizar(item?.escopo);
    const nome = normalizar(item?.item_name || item?.unidade_material);
    const titulo = normalizar(item?.titulo);
    const tituloUa = normalizar(item?.titulo_ua);

    // O DataHub do Monday pode ganhar/renomear colunas. Para a Operação,
    // também varremos os valores textuais reais da linha em vez de depender
    // de uma única coluna da view consolidada.
    const todosValores = normalizar(
      Object.values(item || {})
        .filter(v => typeof v === "string" || typeof v === "number")
        .join(" | ")
    );
    const base = [categoria, escopo, nome, titulo, tituloUa, todosValores].join(" ");

    // NÍVEL 2 - AVALIAÇÕES: A1-A5, BDQ e avaliações.
    if (
      /^a[1-5](?:\s|[-–—_]|$)/.test(nome) ||
      /\bavaliacao(?:es)?\b|\bbdq\b|\ba[1-5]\b/.test(base)
    ) return "nivel2-avaliacoes";

    // NÍVEL 2 - UA: identificadores ou nomenclatura de Unidade de Aprendizagem.
    if (
      item?.eh_ua === true ||
      String(item?.id_ua || "").trim() ||
      String(item?.chave_ua || "").trim() ||
      tituloUa ||
      /\bunidade de aprendizagem\b|(^|\W)ua(?:\W|$)/.test(base)
    ) return "nivel2-ua";

    // NÍVEL 1 - PLANOS: Plano de Produção / PP / Nível 1.
    if (
      /\bplano de producao\b|\bnivel 1\b|\bn1\b|(^|\W)pp(?:\W|$)/.test(base)
    ) return "nivel1-planos";

    return "nao-classificado";
  }

  function agregarMateriaisOperacao(dados, modo) {
    const mapa = new Map();

    (dados || []).forEach((item, indice) => {
      const chave = String(
        item?.id_titulo ||
        item?.titulo ||
        item?.titulo_ua ||
        item?.chave_material ||
        item?.monday_item_validacao ||
        `material:${indice}`
      ).trim();

      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(item);
    });

    function statusGlobal(itens) {
      const status = itens.map(x => normalizar(x?.status_validacao));
      if (status.length && status.every(x => x.includes("validado"))) return "Validado";
      if (status.some(x => x.includes("ajust"))) return "Ajustes - CONTEUDISTA E DA";
      if (status.some(x => x.includes("revalidar"))) return "Revalidar - NQ";
      if (status.some(x => x.includes("liberado"))) return "Liberado para validação - NQ";
      if (status.length && status.every(x => x.includes("paus"))) return "Pausado";
      if (status.some(x => x === "n/a" || x === "na")) return "N/A";
      return "A liberar";
    }

    return [...mapa.entries()].map(([chave, itens]) => {
      const base = itens[0] || {};
      const status = statusGlobal(itens);
      const grupos = itens.map(x => String(x?.monday_group_title || "").trim()).filter(Boolean);
      const grupoMaisComum = grupos.length
        ? [...new Set(grupos)].sort((a,b) => grupos.filter(x => x===b).length - grupos.filter(x => x===a).length)[0]
        : null;

      return {
        ...base,
        chave_material: chave,
        item_name: modo === "nivel1-planos" ? (base?.titulo || base?.item_name || chave) : (base?.item_name || base?.titulo || chave),
        unidade_material: modo === "nivel1-planos" ? `${itens.length} subelementos` : (base?.unidade_material || base?.titulo_ua || base?.item_name || ""),
        categoria_material: modo === "nivel1-planos" ? "Plano de Produção" : "Global",
        status_validacao: status,
        monday_group_title: grupoMaisComum || nomeGrupoOperacao({ status_validacao: status }),
        __subitems_count: itens.length,
        __visao_sintetica: modo
      };
    });
  }

  function filtrarPorNivelOperacao(dados) {
    if (nivelOperacaoAtual === "quadro-principal") return dados;

    const classificados = (dados || []).filter(item => classificarNivelOperacao(item) === nivelOperacaoAtual);
    if (classificados.length) return classificados;

    // A visão NÍVEL 1 do Monday pode ser agregada a partir do mesmo board.
    // Quando a tabela sincronizada contém apenas subelementos, construímos a visão
    // de materiais a partir dos registros já carregados em vez de devolver tela vazia.
    if (nivelOperacaoAtual === "nivel1-planos") {
      return agregarMateriaisOperacao(dados, nivelOperacaoAtual);
    }

    return classificados;
  }

  function nomeGrupoOperacao(item) {
    const status = normalizar(item?.status_validacao);
    const grupo = String(item?.monday_group_title || "").trim();
    const grupoNormalizado = normalizar(grupo);

    // V25.12 · O status de validação define as etapas principais do quadro.
    // Isso mantém "Liberado para Validação" separado de "Revalidar - NQ",
    // mesmo quando ambos vierem do mesmo grupo físico do Monday.
    if (!status || status === "em branco" || status.includes("a liberar")) return "A liberar";
    if (status.includes("revalidar")) return "Revalidar - NQ";
    if (status.includes("validado")) return "Validado";
    if (status.includes("liberado")) return "Liberado para Validação";

    // Os ajustes continuam podendo aparecer detalhados pelo grupo de origem,
    // mas todos usam a mesma etapa/cor azul do Monday.
    if (status.includes("ajust") || grupoNormalizado.includes("ajust")) {
      if (grupoNormalizado.includes("modelagem") || status.includes("modelagem")) return "Em ajustes - Modelagem";
      if (grupoNormalizado.includes("tecnologia") || status.includes("tecnologia")) return "Em ajustes - Gerência de Tecnologia";
      return "Em Ajustes - Conteudista e DA";
    }

    if (status.includes("paus") || grupoNormalizado.includes("paus")) return "Pausado";
    if (status === "n/a" || status === "na" || grupoNormalizado === "n/a" || grupoNormalizado === "na") return "N/A";

    // Para estados auxiliares que não pertencem às cinco etapas principais,
    // preserva o grupo original do Monday.
    return grupo || "Outros";
  }

  function classeGrupoOperacao(nome) {
    const n = normalizar(nome);

    // Sequência visual oficial do fluxo:
    // Cinza → Amarelo → Laranja → Azul → Verde
    // A liberar → Liberado → Revalidar → Em ajuste → Validado
    if (!n || n.includes("a liberar")) return "gray";
    if (n.includes("revalid")) return "orange";
    if (n.includes("ajust")) return "blue";
    if (n.includes("validado")) return "green";
    if (n.includes("liberado")) return "yellow";
    if (n.includes("paus")) return "gray";
    if (n === "n/a" || n === "na") return "lightblue";
    return "purple";
  }

  function classeStatusOperacao(status) {
    const n = normalizar(status);
    if (n.includes("validado")) return "validado";
    if (n.includes("revalidar")) return "revalidar";
    if (n.includes("liberado")) return "liberado";
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

    const descricao = document.getElementById("operacaoNivelDescricao");
    if (descricao) {
      const nomes = {
        "nivel1-planos": "NÍVEL 1 - PLANOS · Plano de Produção",
        "nivel2-ua": "NÍVEL 2 - UA · Unidade de Aprendizagem",
        "nivel2-avaliacoes": "NÍVEL 2 - AVALIAÇÕES · Avaliações",
        "quadro-principal": "Quadro principal · todos os materiais"
      };
      descricao.textContent = nomes[nivelOperacaoAtual] || "Quadro principal";
    }

    if (!gruposOrdenados.length) {
      const totalFonte = dadosOperacaoAtuais.length;
      board.innerHTML = `<div class="monday-board-empty"><b>Nenhum registro classificado nesta visão.</b><br>Fonte operacional carregada: ${totalFonte} registro(s). Build: V25.12.</div>`;
      return;
    }

    board.innerHTML = gruposOrdenados.map(([nome, itens]) => {
      const chaveGrupo = normalizar(nome).replace(/[^a-z0-9]+/g, "-");
      // Monday abre a visão com os grupos recolhidos. O usuário expande quando quiser.
      if (!gruposFechadosOperacao.has(`__visto__:${chaveGrupo}`)) {
        gruposFechadosOperacao.add(chaveGrupo);
        gruposFechadosOperacao.add(`__visto__:${chaveGrupo}`);
      }
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

  function atualizarPaginas(dadosFiltrados, dadosOperacao) {
    atualizarOperacao(Array.isArray(dadosOperacao) ? dadosOperacao : dadosFiltrados);
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

    if (event.target?.id === "exportarOperacao") {
      const linhas = filtrarPorNivelOperacao(dadosOperacaoAtuais || []);
      if (!linhas.length) {
        alert("Não há registros para exportar nesta visão com os filtros atuais.");
        return;
      }
      const nomes = {
        "nivel1-planos": "Nivel_1_Planos",
        "nivel2-ua": "Nivel_2_UA",
        "nivel2-avaliacoes": "Nivel_2_Avaliacoes",
        "quadro-principal": "Quadro_Principal"
      };
      const hoje = new Date().toISOString().slice(0, 10);
      const visao = nomes[nivelOperacaoAtual] || "Quadro_Principal";
      baixarCSV(`Validacao_Materiais_${visao}_${hoje}.csv`, COLUNAS_OPERACAO, linhas);
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
