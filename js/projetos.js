(function () {
  "use strict";

  const estado = {
    usuario: null,
    projetos: [],
    tarefas: [],
    edicoes: [],
    linhasOriginais: [],
    projetoId: null,
    origemPreview: null,
    edicaoVisualizada: null,
    importacaoAtual: null,
    responsaveis: [],
    aliasesResponsaveis: new Map(),
    salvando: false,
    indicadoresNQAtual: null,
    carregandoIndicadoresNQ: false,
    tratamentoTarefas: new Map(),
    evidenceUrlCache: new Map(),
  };

  const campos = {
    contexto_objetivo: "contextField",
    resultados_esperados: "expectedField",
    acoes_complementares: "actionsField",
    resultados_alcancados: "achievedField",
    impacto: "impactField",
    observacoes: "notesField",
  };

  const EVIDENCE_BUCKET = "pq-evidencias";
  let editorTabelaConfirmada = false;
  const TAMANHO_MAXIMO_EVIDENCIA = 20 * 1024 * 1024;
  const EXTENSOES_EVIDENCIA = new Set(["pdf", "doc", "docx", "jpg", "jpeg", "xlsx", "xls", "csv", "ods"]);
  const MIME_EVIDENCIA = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    csv: "text/csv",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
  };

  const $ = (id) => document.getElementById(id);

  function texto(valor) {
    return String(valor ?? "").trim();
  }

  function escapar(valor) {
    return String(valor ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizar(valor) {
    return texto(valor)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function limparNome(valor) {
    return String(valor ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function separarResponsaveis(valor) {
    const celula = limparNome(valor);
    if (!celula) return [];

    return celula
      .split(/\s*(?:,|;|\||\/|&|\be\b)\s*/i)
      .map(limparNome)
      .filter(Boolean);
  }

  function listarResponsaveis() {
    const nomes = new Map();
    const valores = [
      ...estado.projetos.map((projeto) => projeto.sponsor),
      ...estado.tarefas.map((tarefa) => tarefa.sponsor),
      ...estado.projetos.flatMap((projeto) => Array.isArray(projeto.sponsor_lista) ? projeto.sponsor_lista : []),
      ...estado.tarefas.flatMap((tarefa) => Array.isArray(tarefa.sponsor_lista) ? tarefa.sponsor_lista : []),
      ...estado.linhasOriginais.map((linha) => linha.dados_originais?.sponsor),
    ];

    valores.flatMap(separarResponsaveis).forEach((nome) => {
      const chave = normalizar(nome);
      const atual = nomes.get(chave);
      const possuiAcento = nome !== nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const atualPossuiAcento = atual
        ? atual !== atual.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        : false;

      if (!atual || (possuiAcento && !atualPossuiAcento)) nomes.set(chave, nome);
    });

    const entradas = [...nomes.entries()].map(([chave, nome]) => ({ chave, nome }));
    const nomesCompletos = entradas.filter((item) => item.chave.includes(" "));
    const nomesAbreviados = entradas.filter((item) => !item.chave.includes(" "));
    const abreviadosIncorporados = new Set();
    estado.aliasesResponsaveis = new Map();

    nomesAbreviados.forEach((abreviado) => {
      const correspondencias = nomesCompletos.filter(
        (completo) => completo.chave.split(" ")[0] === abreviado.chave,
      );
      if (correspondencias.length !== 1) return;

      const principal = correspondencias[0].chave;
      const aliases = estado.aliasesResponsaveis.get(principal) || [];
      aliases.push(abreviado.chave);
      estado.aliasesResponsaveis.set(principal, aliases);
      abreviadosIncorporados.add(abreviado.chave);
    });

    return entradas
      .filter((item) => !abreviadosIncorporados.has(item.chave))
      .map((item) => item.nome)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  function normalizarDataVisual(valor) {
    if (valor === null || valor === undefined || valor === "") return "";

    const numero = Number(valor);
    if (Number.isFinite(numero) && numero > 20000 && numero < 80000) {
      const baseUtc = Date.UTC(1899, 11, 30);
      return new Date(baseUtc + Math.floor(numero) * 86400000)
        .toISOString()
        .slice(0, 10);
    }

    const s = String(valor).trim();
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;

    return s;
  }

  function dataProjeto(projeto, tipo) {
    const dados = projeto?.dados_origem || {};

    if (tipo === "inicio") {
      return projeto?.data_inicio
        || dados["Data de inicio"]
        || dados["Data de início"]
        || dados["Start Date"]
        || "";
    }

    return projeto?.data_fim
      || dados["Data de fim"]
      || dados["Data fim"]
      || dados["Target Date"]
      || "";
  }

  function dataTarefa(tarefa, tipo) {
    const dados = tarefa?.dados_origem || {};

    if (tipo === "inicio") {
      return tarefa?.data_inicio
        || dados["Data de inicio"]
        || dados["Data de início"]
        || dados["Start Date"]
        || "";
    }

    return tarefa?.data_fim
      || dados["Data de fim"]
      || dados["Data fim"]
      || dados["Target Date"]
      || "";
  }


  function formatarData(valor) {
    const normalizada = normalizarDataVisual(valor);
    if (!normalizada) return "—";

    const partes = normalizada.slice(0, 10).split("-");
    if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;

    return normalizada;
  }

  function formatarDataHora(valor) {
    if (!valor) return "—";
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(valor));
  }

  function statusEdicaoNormalizado(valor) {
    const n = normalizar(valor).replace(/[\s-]+/g, "_");
    if (n === "em_revisao" || n === "revisao") return "em_revisao";
    if (n === "finalizada" || n === "finalizado") return "finalizada";
    return "rascunho";
  }

  function rotuloStatusEdicao(valor) {
    const status = statusEdicaoNormalizado(valor);
    if (status === "em_revisao") return "Em revisão";
    if (status === "finalizada") return "Finalizado";
    return "Rascunho";
  }

  function edicaoEmRevisao(edicao) {
    return statusEdicaoNormalizado(edicao?.status_edicao) === "em_revisao";
  }

  function edicaoFinalizada(edicao) {
    return statusEdicaoNormalizado(edicao?.status_edicao) === "finalizada";
  }

  function linhasOriginaisDoProjeto(projeto) {
    const nome = normalizar(projeto?.nome);
    const azureId = texto(projeto?.azure_id);

    return estado.linhasOriginais.filter((linha) => {
      const dados = linha.dados_originais || {};
      return texto(dados.id) === azureId || normalizar(dados.projeto) === nome;
    });
  }

  function sponsorOriginalPorId(azureId) {
    const id = texto(azureId);
    const linha = estado.linhasOriginais.find(
      (item) => texto(item.dados_originais?.id) === id,
    );
    return limparNome(linha?.dados_originais?.sponsor);
  }

  function urlSegura(valor) {
    const url = texto(valor);
    if (!/^https?:\/\//i.test(url)) return "";
    return url;
  }

  function extensaoArquivo(nome) {
    const partes = texto(nome).toLowerCase().split(".");
    return partes.length > 1 ? partes.pop() : "";
  }

  function nomeArquivoSeguro(nome) {
    const original = texto(nome) || "arquivo";
    const ext = extensaoArquivo(original);
    const base = original
      .replace(/\.[^.]+$/, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "arquivo";
    return `${base}.${ext}`;
  }

  function validarArquivoEvidencia(file) {
    if (!file) return "Selecione um arquivo.";
    const ext = extensaoArquivo(file.name);
    if (!EXTENSOES_EVIDENCIA.has(ext)) {
      return "Formato não permitido. Use PDF, DOC, DOCX, JPG, JPEG ou planilhas XLSX, XLS, CSV e ODS.";
    }
    if (file.size <= 0) return "O arquivo está vazio.";
    if (file.size > TAMANHO_MAXIMO_EVIDENCIA) {
      return "O arquivo excede o limite de 20 MB.";
    }
    return "";
  }

  function tipoPorArquivo(nome, mime = "") {
    const ext = extensaoArquivo(nome);
    const m = texto(mime).toLowerCase();
    if (ext === "pdf" || m === "application/pdf") return "PDF";
    if (ext === "jpg" || ext === "jpeg" || m === "image/jpeg") return "Imagem";
    if (ext === "doc" || ext === "docx" || m.includes("word")) return "Documento";
    if (["xlsx", "xls", "csv", "ods"].includes(ext) || m.includes("spreadsheet") || m === "application/vnd.ms-excel" || m === "text/csv") return "Planilha";
    return "Outro";
  }

  function atualizarStatusArquivo(linha, mensagem, classe = "") {
    const status = linha.querySelector(".evidence-file-status");
    if (!status) return;
    status.textContent = mensagem;
    status.className = `evidence-file-status${classe ? ` ${classe}` : ""}`;
  }

  function limparMetadadosArquivo(linha) {
    delete linha.dataset.storagePath;
    delete linha.dataset.fileName;
    delete linha.dataset.mimeType;
    delete linha.dataset.fileSize;
  }

  function arquivoPendente(linha) {
    return linha.querySelector("[data-evidence-file]")?.files?.[0] || null;
  }

  function evidenciaIncluida(item) {
    return !(item?.incluir_relatorio === false || item?.incluir_relatorio === "false" || item?.incluir_relatorio === 0);
  }

  function atualizarNumeracaoEvidencias() {
    const linhas = [...$("evidenceList").querySelectorAll(".evidence-row")];
    linhas.forEach((linha, indice) => {
      linha.dataset.ordem = String(indice + 1);
      const numero = linha.querySelector("[data-evidence-number]");
      if (numero) numero.textContent = `Evidência ${String(indice + 1).padStart(2, "0")}`;
      const subir = linha.querySelector("[data-evidence-up]");
      const descer = linha.querySelector("[data-evidence-down]");
      if (subir) subir.disabled = indice === 0;
      if (descer) descer.disabled = indice === linhas.length - 1;
      linha.classList.toggle("evidence-excluded", !linha.querySelector("[data-evidence-include]")?.checked);
    });
  }

  function moverEvidencia(linha, direcao) {
    const lista = $("evidenceList");
    if (!linha || !lista) return;
    if (direcao < 0 && linha.previousElementSibling) {
      lista.insertBefore(linha, linha.previousElementSibling);
    } else if (direcao > 0 && linha.nextElementSibling) {
      lista.insertBefore(linha.nextElementSibling, linha);
    }
    atualizarNumeracaoEvidencias();
    atualizarPreview();
  }

  function liberarObjectUrlLinha(linha) {
    const atual = linha?.dataset?.objectUrl;
    if (atual) URL.revokeObjectURL(atual);
    if (linha?.dataset) delete linha.dataset.objectUrl;
  }

  async function urlAssinadaEvidencia(caminho) {
    const path = texto(caminho);
    if (!path) return "";
    const cache = estado.evidenceUrlCache.get(path);
    if (cache?.url && cache.expira_em > Date.now()) return cache.url;
    const { data, error } = await window.biSupabase.storage
      .from(EVIDENCE_BUCKET)
      .createSignedUrl(path, 300);
    if (error) throw error;
    const url = data?.signedUrl || "";
    if (url) estado.evidenceUrlCache.set(path, { url, expira_em: Date.now() + 240000 });
    return url;
  }

  async function carregarMiniaturaLinha(linha) {
    const box = linha?.querySelector(".evidence-editor-preview");
    const img = box?.querySelector("img");
    if (!box || !img) return;
    liberarObjectUrlLinha(linha);
    box.hidden = true;
    img.removeAttribute("src");

    const pendente = arquivoPendente(linha);
    const tipo = pendente
      ? tipoPorArquivo(pendente.name, pendente.type)
      : tipoPorArquivo(linha.dataset.fileName, linha.dataset.mimeType);
    if (tipo !== "Imagem") return;

    try {
      let url = "";
      if (pendente) {
        url = URL.createObjectURL(pendente);
        linha.dataset.objectUrl = url;
      } else if (linha.dataset.storagePath) {
        url = await urlAssinadaEvidencia(linha.dataset.storagePath);
      }
      if (!url) return;
      img.src = url;
      box.hidden = false;
    } catch (error) {
      console.warn("Miniatura da evidência indisponível:", error);
    }
  }

  function esperarImagem(img) {
    if (!img?.src || img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      const concluir = () => resolve();
      img.addEventListener("load", concluir, { once: true });
      img.addEventListener("error", concluir, { once: true });
      window.setTimeout(concluir, 5000);
    });
  }

  async function hidratarMiniaturasRelatorio(raiz = $("reportDocument")) {
    if (!raiz) return;
    const imagens = [...raiz.querySelectorAll("img.report-evidence-image[data-storage-path]")];
    await Promise.all(imagens.map(async (img) => {
      try {
        const caminho = img.dataset.storagePath;
        if (!caminho) return;
        if (!img.src || img.dataset.loadedPath !== caminho) {
          img.src = await urlAssinadaEvidencia(caminho);
          img.dataset.loadedPath = caminho;
        }
        await esperarImagem(img);
        img.closest(".report-evidence-image-wrap")?.classList.add("loaded");
      } catch (error) {
        img.closest(".report-evidence-image-wrap")?.classList.add("failed");
        console.warn("Miniatura no relatório indisponível:", error);
      }
    }));
  }

  const NQ_TELAS_AUDITADO_RELATORIO = Object.freeze({
    graduacoes_unicas: 28,
    total_graduacoes: 35,
    cine_professores: Object.freeze([
      ["Agricultura, silvicultura, pesca e veterinária", 2],
      ["Artes e humanidades", 1],
      ["Ciências naturais, matemática e estatística", 3],
      ["Ciências sociais, comunicação e informação", 4],
      ["Computação e Tecnologias da Informação e Comunicação (TIC)", 3],
      ["Educação", 10],
      ["Engenharia, produção e construção", 5],
      ["Negócios, administração e direito", 9],
      ["Saúde e bem-estar", 7],
      ["Serviços", 1],
    ]),
  });

  function nqTemValor(valor) {
    return valor !== null && valor !== undefined && String(valor).trim() !== "";
  }

  function nqSituacaoEspecialista(row) {
    const t = normalizar(row?.situacao_contratacao || "");
    if (t.includes("inativ") || t.includes("deslig") || t.includes("encerr")) return "inativo";
    if (t.includes("ativ")) return "ativo";
    return row?.ativo === false ? "inativo" : "ativo";
  }

  function nqSepararValoresAcademicos(...valores) {
    const saida = new Map();
    valores.forEach((valor) => {
      if (!nqTemValor(valor)) return;
      String(valor)
        .split(/\s*\|\s*|\s*;\s*|\r?\n+/)
        .map((v) => v.trim())
        .filter(nqTemValor)
        .forEach((v) => {
          const chave = normalizar(v);
          if (chave && !saida.has(chave)) saida.set(chave, v);
        });
    });
    return [...saida.values()];
  }

  function nqNormalizarAreaCine(valor) {
    const original = texto(valor);
    const t = normalizar(original);
    if (!t) return "";
    if (t.includes("agricultura") || t.includes("silvicultura") || t.includes("veterin")) return "Agricultura, silvicultura, pesca e veterinária";
    if (t.includes("artes") || t.includes("humanidades")) return "Artes e humanidades";
    if (t.includes("ciencias naturais") || t.includes("matematica") || t.includes("estatistica")) return "Ciências naturais, matemática e estatística";
    if (t.includes("ciencias sociais") || t.includes("comunicacao") || t.includes("informacao")) return "Ciências sociais, comunicação e informação";
    if (t.includes("computacao") || t.includes("tecnologias da informacao") || /\btic\b/.test(t)) return "Computação e Tecnologias da Informação e Comunicação (TIC)";
    if (t.includes("educacao")) return "Educação";
    if (t.includes("engenharia") || t.includes("producao") || t.includes("construcao")) return "Engenharia, produção e construção";
    if (t.includes("negocios") || t.includes("administracao") || t.includes("direito")) return "Negócios, administração e direito";
    if (t.includes("saude") || t.includes("bem estar") || t.includes("bem-estar")) return "Saúde e bem-estar";
    if (t.includes("servicos")) return "Serviços";
    return original.replace(/^\d+\s*[·-]\s*/, "");
  }

  function nqSnapshotValido(valor) {
    return valor && typeof valor === "object" && !Array.isArray(valor) && Object.keys(valor).length > 0;
  }

  function nqSituacaoRotulo(valor) {
    if (valor === "ativo") return "Ativos";
    if (valor === "inativo") return "Inativos";
    return "Todos";
  }

  function renderizarSnapshotNQ() {
    const alvo = $("nqSnapshotPreview");
    const status = $("nqSnapshotStatus");
    if (!alvo || !status) return;

    const snap = estado.indicadoresNQAtual;
    if (!nqSnapshotValido(snap)) {
      alvo.hidden = true;
      alvo.innerHTML = "";
      status.className = "nq-snapshot-status";
      status.textContent = "Nenhuma fotografia do NQ incluída nesta versão.";
      return;
    }

    const areas = Array.isArray(snap.cine_professores) ? snap.cine_professores : [];
    const capturado = snap.capturado_em ? formatarDataHora(snap.capturado_em) : "—";
    status.className = "nq-snapshot-status ready";
    status.textContent = `Fotografia do NQ · ${nqSituacaoRotulo(snap.filtro_situacao)} · capturada em ${capturado}.`;
    alvo.hidden = false;
    alvo.innerHTML = `
      <div class="nq-snapshot-cards">
        <article><span>Professores</span><strong>${escapar(snap.professores ?? 0)}</strong></article>
        <article><span>Graduações únicas</span><strong>${escapar(snap.graduacoes_unicas ?? 0)}</strong></article>
        <article><span>Total de graduações</span><strong>${escapar(snap.total_graduacoes ?? 0)}</strong></article>
        <article><span>Áreas CINE</span><strong>${escapar(snap.areas_cine ?? areas.length)}</strong></article>
      </div>
      <table class="nq-snapshot-mini-table">
        <thead><tr><th>Área CINE</th><th>Professores</th></tr></thead>
        <tbody>${areas.map((item) => `<tr><td>${escapar(item.area)}</td><td>${escapar(item.total)}</td></tr>`).join("")}</tbody>
      </table>`;
  }

  async function carregarSnapshotNQ() {
    if (estado.carregandoIndicadoresNQ) return;
    estado.carregandoIndicadoresNQ = true;
    const botao = $("loadNqIndicatorsButton");
    const status = $("nqSnapshotStatus");
    if (botao) {
      botao.disabled = true;
      botao.textContent = "Atualizando…";
    }
    if (status) {
      status.className = "nq-snapshot-status";
      status.textContent = "Carregando indicadores atuais do NQ…";
    }

    try {
      const situacao = $("nqSnapshotSituacao")?.value || "";
      const [formacoesResp, perfilResp] = await Promise.all([
        window.biSupabase.from("vw_nq_especialistas_formacoes").select("*"),
        window.biSupabase.from("vw_nq_perfil_academico").select("*"),
      ]);
      if (formacoesResp.error) throw formacoesResp.error;
      if (perfilResp.error) throw perfilResp.error;

      const todasFormacoes = (formacoesResp.data || []).filter((r) => r.professor);
      const base = todasFormacoes.filter((r) => !situacao || nqSituacaoEspecialista(r) === situacao);
      const nomes = new Set(base.map((r) => normalizar(r.professor)).filter(Boolean));
      const professores = new Set(base.map((r) => texto(r.professor)).filter(Boolean));
      const perfis = (perfilResp.data || []).filter((r) => r.professor && nomes.has(normalizar(r.professor)));

      let totalGraduacoes = 0;
      const graduacoesUnicas = new Set();
      perfis.forEach((perfil) => {
        const porProfessor = new Set();
        nqSepararValoresAcademicos(perfil.graduacao_1, perfil.graduacao_2, perfil.graduacao_3_mais)
          .forEach((graduacao) => {
            const chave = normalizar(graduacao);
            if (!chave) return;
            porProfessor.add(chave);
            graduacoesUnicas.add(chave);
          });
        totalGraduacoes += porProfessor.size;
      });

      let cineProfessores;
      let graduacoesUnicasValor;
      let totalGraduacoesValor;
      if (!situacao) {
        graduacoesUnicasValor = NQ_TELAS_AUDITADO_RELATORIO.graduacoes_unicas;
        totalGraduacoesValor = NQ_TELAS_AUDITADO_RELATORIO.total_graduacoes;
        cineProfessores = NQ_TELAS_AUDITADO_RELATORIO.cine_professores.map(([area, total]) => ({ area, total }));
      } else {
        graduacoesUnicasValor = graduacoesUnicas.size;
        totalGraduacoesValor = totalGraduacoes;
        const mapaCine = new Map();
        base.filter((r) => r.area_cine && r.professor).forEach((r) => {
          const area = nqNormalizarAreaCine(r.area_cine);
          const professor = normalizar(r.professor);
          if (!area || !professor) return;
          if (!mapaCine.has(area)) mapaCine.set(area, new Set());
          mapaCine.get(area).add(professor);
        });
        cineProfessores = [...mapaCine.entries()]
          .map(([area, conjunto]) => ({ area, total: conjunto.size }))
          .sort((a, b) => b.total - a.total || a.area.localeCompare(b.area, "pt-BR"));
      }

      estado.indicadoresNQAtual = {
        versao_snapshot: 1,
        fonte: "Reunião NQ · Professores e Especialistas · Supabase",
        capturado_em: new Date().toISOString(),
        filtro_situacao: situacao,
        filtro_situacao_rotulo: nqSituacaoRotulo(situacao),
        professores: professores.size,
        graduacoes_unicas: graduacoesUnicasValor,
        total_graduacoes: totalGraduacoesValor,
        areas_cine: cineProfessores.length,
        cine_professores: cineProfessores,
      };
      renderizarSnapshotNQ();
      atualizarPreview();
    } catch (error) {
      console.error("Indicadores NQ no relatório:", error);
      if (status) {
        status.className = "nq-snapshot-status error";
        status.textContent = `Não foi possível carregar os indicadores do NQ: ${mensagemErro(error)}`;
      }
    } finally {
      estado.carregandoIndicadoresNQ = false;
      if (botao) {
        botao.disabled = false;
        botao.textContent = "Atualizar indicadores do NQ";
      }
    }
  }

  function blocoIndicadoresNQ(snapshot) {
    if (!nqSnapshotValido(snapshot)) return "";
    const areas = Array.isArray(snapshot.cine_professores) ? snapshot.cine_professores : [];
    const capturado = snapshot.capturado_em ? formatarDataHora(snapshot.capturado_em) : "—";
    return `
      <section class="report-section report-nq-section">
        <h2>Indicadores do NQ</h2>
        <p class="report-nq-source">Fotografia imutável · ${escapar(snapshot.filtro_situacao_rotulo || nqSituacaoRotulo(snapshot.filtro_situacao))} · ${escapar(capturado)} · Fonte: ${escapar(snapshot.fonte || "Reunião NQ")}</p>
        <div class="report-nq-cards">
          <div class="report-nq-card"><span>Professores</span><strong>${escapar(snapshot.professores ?? 0)}</strong></div>
          <div class="report-nq-card"><span>Graduações únicas</span><strong>${escapar(snapshot.graduacoes_unicas ?? 0)}</strong></div>
          <div class="report-nq-card"><span>Total de graduações</span><strong>${escapar(snapshot.total_graduacoes ?? 0)}</strong></div>
          <div class="report-nq-card"><span>Áreas CINE</span><strong>${escapar(snapshot.areas_cine ?? areas.length)}</strong></div>
        </div>
        <table class="report-nq-table">
          <thead><tr><th>Área CINE</th><th>Professores</th></tr></thead>
          <tbody>${areas.map((item) => `<tr><td>${escapar(item.area)}</td><td>${escapar(item.total)}</td></tr>`).join("")}</tbody>
        </table>
      </section>`;
  }

  function evidenciaComArquivo(item) {
    return Boolean(item.storage_path || item.arquivo_pendente);
  }

  function mesmoId(a, b) {
    return String(a ?? "") === String(b ?? "");
  }

  function projetoAtual() {
    return estado.projetos.find((item) => mesmoId(item.id, estado.projetoId)) || null;
  }

  function tarefasAtuais() {
    return estado.tarefas.filter((item) => mesmoId(item.projeto_id, estado.projetoId));
  }

  function edicoesAtuais() {
    return estado.edicoes.filter((item) => mesmoId(item.projeto_id, estado.projetoId));
  }

  function origemAtual() {
    if (estado.origemPreview) return estado.origemPreview;
    return { projeto: projetoAtual(), tarefas: tarefasAtuais() };
  }

  function tarefasDaOrigemAtual() {
    const origem = origemAtual();
    const tarefasOrigem = Array.isArray(origem?.tarefas) ? origem.tarefas : [];
    return tarefasOrigem.length ? tarefasOrigem : tarefasAtuais();
  }

  function chaveTarefaRelease(tarefa) {
    const id = texto(tarefa?.id);
    if (id) return `id:${id}`;
    const sourceKey = texto(tarefa?.source_key);
    if (sourceKey) return `source:${sourceKey}`;
    const azure = texto(tarefa?.azure_id);
    if (azure) return `azure:${azure}`;
    return `fallback:${normalizar(tarefa?.descricao || tarefa?.nome)}|${normalizar(tarefa?.sponsor)}`;
  }

  function statusEhFinalizado(valor) {
    const n = normalizar(valor).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    return /^(finaliz|conclu|done\b|completed\b)/.test(n);
  }

  function statusEhPendenteRelease(valor) {
    const n = normalizar(valor).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!n || statusEhFinalizado(n)) return false;
    return [
      "a fazer",
      "afazer",
      "em andamento",
      "em progresso",
      "to do",
      "todo",
      "doing",
      "active",
      "new",
      "novo",
    ].includes(n);
  }

  function statusFinalizadoPadrao() {
    const frequencias = new Map();
    estado.tarefas.forEach((tarefa) => {
      const status = texto(tarefa?.status);
      if (!statusEhFinalizado(status)) return;
      frequencias.set(status, (frequencias.get(status) || 0) + 1);
    });
    return [...frequencias.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))[0]?.[0]
      || "Finalizado";
  }

  function decisaoReleaseDaTarefa(tarefa) {
    return estado.tratamentoTarefas.get(chaveTarefaRelease(tarefa)) || "manter";
  }

  function tarefasPendentesDoRelease() {
    return tarefasDaOrigemAtual().filter((tarefa) => statusEhPendenteRelease(tarefa?.status));
  }

  function obterTratamentoTarefas() {
    const finalizado = statusFinalizadoPadrao();
    return tarefasPendentesDoRelease().map((tarefa) => {
      const acao = decisaoReleaseDaTarefa(tarefa);
      const finaliza = acao === "finalizar_release" || acao === "finalizar_base";
      return {
        tarefa_id: tarefa?.id ?? null,
        source_key: texto(tarefa?.source_key) || null,
        azure_id: texto(tarefa?.azure_id) || null,
        descricao: texto(tarefa?.descricao || tarefa?.nome) || null,
        sponsor: limparNome(tarefa?.sponsor) || null,
        status_original: texto(tarefa?.status) || null,
        acao,
        status_release: finaliza ? finalizado : (texto(tarefa?.status) || null),
        atualizar_base: acao === "finalizar_base",
      };
    });
  }

  function resumoTratamentoTarefas(decisoes = obterTratamentoTarefas()) {
    const tarefas = tarefasDaOrigemAtual();
    const jaFinalizadas = tarefas.filter((t) => statusEhFinalizado(t?.status)).length;
    const pendentes = decisoes.length;
    const finalizarRelease = decisoes.filter((d) => d.acao === "finalizar_release" || d.acao === "finalizar_base").length;
    const atualizarBase = decisoes.filter((d) => d.acao === "finalizar_base").length;
    return {
      total: tarefas.length,
      jaFinalizadas,
      pendentes,
      finalizarRelease,
      atualizarBase,
      manter: Math.max(0, pendentes - finalizarRelease),
    };
  }

  function renderizarTratamentoTarefas() {
    const lista = $("releaseTaskList");
    const resumo = $("releaseTaskSummary");
    if (!lista || !resumo) return;

    const tarefas = tarefasPendentesDoRelease();
    const decisoes = obterTratamentoTarefas();
    const totais = resumoTratamentoTarefas(decisoes);

    resumo.innerHTML = `
      <article><span>Tarefas do projeto</span><strong>${totais.total}</strong></article>
      <article><span>Já finalizadas</span><strong>${totais.jaFinalizadas}</strong></article>
      <article><span>A fazer / em andamento</span><strong>${totais.pendentes}</strong></article>
      <article class="release-summary-highlight"><span>Marcadas para finalizar</span><strong>${totais.finalizarRelease}</strong></article>
    `;

    const nota = $("releaseTaskUpdateNote");
    if (nota) {
      nota.textContent = totais.atualizarBase
        ? `${totais.atualizarBase} tarefa(s) também terão o status atual do Projeto Qualidade atualizado ao finalizar esta versão.`
        : "Nenhuma tarefa será alterada na base atual. O release pode registrar uma conclusão sem modificar o Projeto Qualidade.";
    }

    if (!tarefas.length) {
      lista.innerHTML = '<p class="release-task-empty">Não há tarefas com status A fazer ou Em andamento neste projeto.</p>';
      return;
    }

    lista.innerHTML = tarefas.map((tarefa) => {
      const chave = chaveTarefaRelease(tarefa);
      const decisao = estado.tratamentoTarefas.get(chave) || "manter";
      return `
        <article class="release-task-row" data-release-task="${escapar(chave)}">
          <div class="release-task-info">
            <strong>${escapar(tarefa.descricao || tarefa.nome || "Ação sem descrição")}</strong>
            <span>ID ${escapar(tarefa.azure_id || tarefa.id || "—")} · ${escapar(limparNome(tarefa.sponsor) || "Sem responsável")}</span>
            <small>Status atual: <b>${escapar(tarefa.status || "—")}</b></small>
          </div>
          <label>
            <span>No release</span>
            <select data-release-action>
              <option value="manter" ${decisao === "manter" ? "selected" : ""}>Manter como está</option>
              <option value="finalizar_release" ${decisao === "finalizar_release" ? "selected" : ""}>Marcar como finalizada nesta versão</option>
              <option value="finalizar_base" ${decisao === "finalizar_base" ? "selected" : ""}>Finalizar e atualizar também o Projeto Qualidade</option>
            </select>
          </label>
        </article>`;
    }).join("");

    lista.querySelectorAll("[data-release-action]").forEach((select) => {
      select.addEventListener("change", () => {
        const linha = select.closest("[data-release-task]");
        if (!linha) return;
        estado.tratamentoTarefas.set(linha.dataset.releaseTask, select.value || "manter");
        renderizarTratamentoTarefas();
        atualizarPreview();
      });
    });
  }

  function carregarTratamentoTarefas(edicao) {
    estado.tratamentoTarefas = new Map();
    const salvas = Array.isArray(edicao?.tarefas_release) ? edicao.tarefas_release : [];
    const tarefas = tarefasDaOrigemAtual();

    tarefas.forEach((tarefa) => {
      const encontrada = salvas.find((item) => {
        if (item?.tarefa_id != null && tarefa?.id != null && mesmoId(item.tarefa_id, tarefa.id)) return true;
        if (texto(item?.source_key) && texto(tarefa?.source_key) === texto(item.source_key)) return true;
        if (texto(item?.azure_id) && texto(tarefa?.azure_id) === texto(item.azure_id)) return true;
        return false;
      });
      if (encontrada?.acao) estado.tratamentoTarefas.set(chaveTarefaRelease(tarefa), encontrada.acao);
    });

    renderizarTratamentoTarefas();
  }

  async function validarInstalacaoReleaseTarefas() {
    const { data, error } = await window.biSupabase.rpc("pq_release_tarefas_disponivel");
    if (error || !data?.ok) {
      throw new Error("O tratamento de tarefas do release ainda não foi instalado. Execute docs/06_TAREFAS_RELEASE_V25_46_40.sql no Supabase antes de salvar ou finalizar esta versão.");
    }
    return true;
  }

  async function validarInstalacaoWorkflowRelease() {
    const { data, error } = await window.biSupabase.rpc("pq_release_workflow_disponivel");
    if (error || !data?.ok) {
      throw new Error("O fluxo de aprovação do release ainda não foi instalado. Execute docs/08_FLUXO_APROVACAO_RELEASE_V25_46_43.sql no Supabase antes de continuar.");
    }
    return true;
  }

  async function aplicarAtualizacoesTarefasNaBase(edicaoId, decisoes) {
    const atualizar = decisoes.filter((item) => item.acao === "finalizar_base" && item.tarefa_id != null);
    if (!atualizar.length) return { atualizadas: 0, avisos: [] };

    const avisos = [];
    let atualizadas = 0;
    for (const item of atualizar) {
      const { data, error } = await window.biSupabase.rpc("pq_aplicar_status_tarefa", {
        p_tarefa_id: item.tarefa_id,
        p_edicao_id: edicaoId,
        p_status_novo: item.status_release || statusFinalizadoPadrao(),
      });
      if (error) {
        avisos.push(`${item.descricao || item.azure_id || item.tarefa_id}: ${error.message || error}`);
        continue;
      }
      atualizadas += data?.alterada === false ? 0 : 1;
      const tarefaAtual = estado.tarefas.find((t) => mesmoId(t.id, item.tarefa_id));
      if (tarefaAtual) tarefaAtual.status = item.status_release || statusFinalizadoPadrao();
    }
    return { atualizadas, avisos };
  }

  function mostrarFeedback(mensagem, tipo = "") {
    const alvo = $("feedbackMessage");
    alvo.textContent = mensagem;
    alvo.className = `feedback-message no-print${tipo ? ` ${tipo}` : ""}`;
    alvo.hidden = !mensagem;
  }

  function mensagemErro(error) {
    const bruto = texto(error?.message || error);
    if (/pq_transicionar_edicao_confirmada|invalid input syntax for type bigint/i.test(bruto)) {
      return "A função de confirmação da aprovação não está disponível ou é incompatível com o identificador desta versão. Execute docs/22_CONFIRMAR_FINALIZACAO_RELATORIO.sql no Supabase e atualize projetos.html e js/projetos.js da V25.46.64. Depois recarregue a página e tente novamente.";
    }
    if (/pq_projetos_edicoes_status_edicao_check/i.test(bruto)) {
      return "A regra de status das versões está desatualizada no banco. Execute docs/22_CONFIRMAR_FINALIZACAO_RELATORIO.sql no Supabase, recarregue a página e tente novamente. As versões existentes serão preservadas.";
    }
    if (/bucket.*not found|pq-evidencias.*not found/i.test(bruto)) {
      return "O armazenamento de evidências ainda não foi instalado. Execute docs/V25_39_ARMAZENAMENTO_EVIDENCIAS.sql no Supabase.";
    }
    if (/mime type/i.test(bruto)) {
      return "O formato não está habilitado no armazenamento. Para anexar planilhas, execute docs/23_PERMITIR_PLANILHAS_EVIDENCIAS.sql no Supabase e tente novamente.";
    }
    if (/maximum allowed size|payload too large|entity too large/i.test(bruto)) {
      return "O arquivo excede o limite permitido pelo armazenamento. Use um arquivo de até 20 MB.";
    }
    if (/evidência.*(?:row-level|policy|permission|unauthorized|jwt)/i.test(bruto)) {
      return "O armazenamento de evidências não autorizou a operação. Execute docs/V25_39_ARMAZENAMENTO_EVIDENCIAS.sql e entre novamente no sistema.";
    }
    // Só declarar o editor ausente quando a própria tabela não existir.
    // Se a tabela já foi lida com sucesso, erros de RPC/schema cache devem ser
    // apresentados como erro de função, sem induzir uma reinstalação do editor.
    if (!editorTabelaConfirmada && /(pq_projetos_edicoes.*does not exist|relation .*pq_projetos_edicoes.*does not exist|PGRST205)/i.test(bruto)) {
      return "A tabela do editor não foi localizada no Supabase. Confirme se public.pq_projetos_edicoes existe neste projeto.";
    }
    if (/pq_release_tarefas_disponivel|pq_salvar_tarefas_release|pq_aplicar_status_tarefa/i.test(bruto)) {
      return "O tratamento de tarefas do release ainda não está disponível no Supabase. Execute docs/06_TAREFAS_RELEASE_V25_46_40.sql e recarregue a página.";
    }
    if (/pq_release_workflow_disponivel|pq_salvar_edicao_workflow|pq_enviar_edicao_revisao|pq_finalizar_edicao/i.test(bruto)) {
      return "O fluxo Rascunho → Em revisão → Finalizado ainda não está disponível no Supabase. Execute docs/08_FLUXO_APROVACAO_RELEASE_V25_46_43.sql e recarregue a página.";
    }
    if (/pq_salvar_edicao|PGRST202|schema cache/i.test(bruto)) {
      return `O editor está instalado, mas a função de salvamento não foi reconhecida pela API do Supabase. Detalhe: ${bruto}`;
    }
    if (/permission|policy|row-level|unauthorized|jwt/i.test(bruto)) {
      return "Sua sessão não tem permissão para esta operação. Entre novamente e confirme se o SQL do editor foi executado no projeto correto.";
    }
    return bruto || "Ocorreu um erro inesperado.";
  }

  async function carregarDados() {
    $("loadingState").hidden = false;
    $("errorState").hidden = true;
    $("projectsApp").hidden = true;

    try {
      estado.usuario = await window.protegerDashboard();
      if (!estado.usuario) return;

      const [projetosResp, tarefasResp, edicoesResp, importacaoResp] = await Promise.all([
        window.biSupabase
          .from("vw_pq_projetos_v245")
          .select("*")
          .order("nome", { ascending: true }),
        window.biSupabase
          .from("vw_pq_tarefas_v245")
          .select("*")
          .order("data_inicio", { ascending: true, nullsFirst: false }),
        window.biSupabase
          .from("pq_projetos_edicoes")
          .select("*")
          .order("criado_em", { ascending: false }),
        window.biSupabase
          .from("vw_pq_importacoes_v245")
          .select("id, total_linhas, linhas_com_erro, finalizado_em")
          .eq("status", "concluida")
          .order("finalizado_em", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const erro = projetosResp.error || tarefasResp.error || edicoesResp.error || importacaoResp.error;
      if (erro) throw erro;

      estado.projetos = projetosResp.data || [];
      estado.tarefas = tarefasResp.data || [];
      window.biPlanejamento?.definirProjetos(estado.projetos, estado.tarefas);
      estado.edicoes = edicoesResp.data || [];
      // Se chegamos aqui, pq_projetos_edicoes respondeu pela API: o editor existe.
      editorTabelaConfirmada = true;
      estado.importacaoAtual = importacaoResp.data || null;

      // A base atual já preserva os responsáveis diretamente nos projetos/tarefas.
      // A consulta às linhas brutas da estrutura antiga não é necessária na V24.5.
      estado.linhasOriginais = [];

      renderizarResumo();
      preencherFiltros();
      filtrarProjetos();

      $("loadingState").hidden = true;
      $("projectsApp").hidden = false;
      const projetoLink = new URLSearchParams(location.search).get("projeto");
      if (projetoLink && estado.projetos.some(p => String(p.id) === projetoLink)) selecionarProjeto(projetoLink);
    } catch (error) {
      $("loadingState").hidden = true;
      $("errorText").textContent = mensagemErro(error);
      $("errorState").hidden = false;
    }
  }

  function renderizarResumo() {
    // "Tarefas" representa o total importado da planilha. As tarefas sem vínculo
    // continuam destacadas no card próprio, mas não deixam de fazer parte do total.
    $("projectCount").textContent = estado.projetos.length;
    $("taskCount").textContent = estado.tarefas.length;
    $("unlinkedCount").textContent = estado.tarefas.filter((t) => !t.projeto_id).length;
    $("issueCount").textContent = estado.importacaoAtual?.linhas_com_erro || 0;
  }

  function preencherFiltros() {
    const atual = $("statusFilter").value;
    const status = [...new Set([
      ...estado.projetos.map((p) => texto(p.status)),
      ...estado.tarefas.map((t) => texto(t.status)),
    ].filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    $("statusFilter").innerHTML = '<option value="">Todos</option>';
    status.forEach((valor) => {
      const option = document.createElement("option");
      option.value = valor;
      option.textContent = valor;
      $("statusFilter").appendChild(option);
    });
    $("statusFilter").value = atual;

    estado.responsaveis = listarResponsaveis();
    $("responsibleCount").textContent = `${estado.responsaveis.length} responsável(is) identificado(s).`;
    renderizarMenuResponsaveis();

    $("projectOptions").innerHTML = estado.projetos
      .map((projeto) => `<option value="${escapar(projeto.nome)}">ID ${escapar(projeto.azure_id)}</option>`)
      .join("");
  }

  function renderizarMenuResponsaveis() {
    const busca = normalizar($("responsibleFilter").value);
    const filtrados = estado.responsaveis.filter((nome) => !busca || normalizar(nome).includes(busca));

    const todos = busca
      ? ""
      : '<button type="button" class="responsible-option all" role="option" data-responsible="">Todos os responsáveis</button>';
    const opcoes = filtrados
      .map((nome) => `<button type="button" class="responsible-option" role="option" data-responsible="${escapar(nome)}">${escapar(nome)}</button>`)
      .join("");

    $("responsibleMenu").innerHTML = todos || opcoes
      ? `${todos}${opcoes}`
      : '<p class="responsible-empty">Nenhum responsável encontrado.</p>';
  }

  function abrirMenuResponsaveis() {
    renderizarMenuResponsaveis();
    $("responsibleMenu").hidden = false;
    $("responsibleFilter").setAttribute("aria-expanded", "true");
    $("responsibleMenuButton").setAttribute("aria-expanded", "true");
  }

  function fecharMenuResponsaveis() {
    $("responsibleMenu").hidden = true;
    $("responsibleFilter").setAttribute("aria-expanded", "false");
    $("responsibleMenuButton").setAttribute("aria-expanded", "false");
  }

  function filtrarProjetos() {
    const responsavel = normalizar($("responsibleFilter").value);
    const status = $("statusFilter").value;
    const projetoBuscado = normalizar($("projectFilter").value);
    const termosResponsavel = [responsavel];

    estado.aliasesResponsaveis.forEach((aliases, nomeCompleto) => {
      if (nomeCompleto.includes(responsavel)) termosResponsavel.push(...aliases);
    });

    const filtrados = estado.projetos.filter((projeto) => {
      const tarefas = estado.tarefas.filter((tarefa) => tarefa.projeto_id === projeto.id);
      const sponsorsOriginais = linhasOriginaisDoProjeto(projeto)
        .map((linha) => linha.dados_originais?.sponsor);
      const celulasResponsaveis = [
        projeto.sponsor,
        ...tarefas.map((tarefa) => tarefa.sponsor),
        ...sponsorsOriginais,
      ];
      const responsaveis = celulasResponsaveis
        .flatMap(separarResponsaveis)
        .map(normalizar)
        .filter(Boolean);
      const combinacoesOriginais = celulasResponsaveis
        .map((valor) => normalizar(limparNome(valor)))
        .filter(Boolean);
      const statusDoGrupo = [projeto.status, ...tarefas.map((tarefa) => tarefa.status)];
      const identificacao = normalizar(`${projeto.nome} ${projeto.azure_id}`);

      return (
        (!responsavel
          || termosResponsavel.some((termo) => responsaveis.some((nome) => nome.includes(termo)))
          || termosResponsavel.some((termo) => combinacoesOriginais.some((nomes) => nomes.includes(termo))))
        && (!status || statusDoGrupo.includes(status))
        && (!projetoBuscado || identificacao.includes(projetoBuscado))
      );
    });

    renderizarTabelaProjetos(filtrados);
  }

  function renderizarTabelaProjetos(projetos) {
    let totalTarefas = 0;
    const linhas = [];

    projetos.forEach((projeto) => {
      const tarefas = estado.tarefas.filter((tarefa) => tarefa.projeto_id === projeto.id);
      const sponsorProjeto = limparNome(
        projeto.sponsor || sponsorOriginalPorId(projeto.azure_id),
      );
      totalTarefas += tarefas.length;
      const selecionado = projeto.id === estado.projetoId ? " selected" : "";

      linhas.push(`
        <tr class="project-main-row${selecionado}" data-project-id="${escapar(projeto.id)}" tabindex="0">
          <td><strong>${escapar(projeto.azure_id || "—")}</strong></td>
          <td><span class="row-type project">Projeto principal</span></td>
          <td><strong>${escapar(projeto.nome || "—")}</strong><small>${tarefas.length} tarefa(s)</small></td>
          <td>—</td>
          <td>${escapar(sponsorProjeto || "—")}</td>
          <td><span class="row-status">${escapar(projeto.status || "—")}</span></td>
          <td>${escapar(formatarData(dataProjeto(projeto, "inicio")))}</td>
          <td>${escapar(formatarData(dataProjeto(projeto, "fim")))}</td>
        </tr>`);

      tarefas.forEach((tarefa) => {
        linhas.push(`
          <tr class="project-task-row${selecionado}" data-project-id="${escapar(projeto.id)}" tabindex="0">
            <td>${escapar(tarefa.azure_id || "—")}</td>
            <td><span class="row-type task">${escapar(tarefa.tipo || "Tarefa")}</span></td>
            <td><span class="parent-project-name">↳ ${escapar(projeto.nome || "—")}</span></td>
            <td>${escapar(tarefa.descricao || tarefa.nome || "—")}</td>
            <td>${escapar(limparNome(tarefa.sponsor || sponsorOriginalPorId(tarefa.azure_id) || sponsorProjeto) || "—")}</td>
            <td><span class="row-status">${escapar(tarefa.status || "—")}</span></td>
            <td>${escapar(formatarData(dataTarefa(tarefa, "inicio")))}</td>
            <td>${escapar(formatarData(dataTarefa(tarefa, "fim")))}</td>
          </tr>`);
      });
    });

    $("projectResultsBody").innerHTML = linhas.join("");
    $("emptyProjectResults").hidden = projetos.length > 0;
    $("projectMatchCount").textContent = `${projetos.length} projeto(s) e ${totalTarefas} tarefa(s) encontrados.`;

    $("projectResultsBody").querySelectorAll("[data-project-id]").forEach((linha) => {
      const abrir = () => selecionarProjeto(linha.dataset.projectId);
      linha.addEventListener("click", abrir);
      linha.addEventListener("keydown", (evento) => {
        if (evento.key === "Enter" || evento.key === " ") {
          evento.preventDefault();
          abrir();
        }
      });
    });
  }

  function selecionarProjeto(id) {
    if (estado.salvando) return;
    estado.projetoId = id || null;
    estado.edicaoVisualizada = null;
    estado.origemPreview = null;
    $("editorWorkspace").hidden = !estado.projetoId;
    mostrarFeedback("");
    if (!estado.projetoId) return;

    const projeto = projetoAtual();
    if (!projeto) {
      mostrarFeedback("Não foi possível localizar os dados deste projeto na base atual. Recarregue a página.", "error");
      $("editorWorkspace").hidden = true;
      return;
    }
    window.BI_PLANEJAMENTO_PROJETO = projeto;
    window.biPlanejamento?.atualizarSinais();
    $("selectedProjectTitle").textContent = projeto.nome || "Projeto da Qualidade";
    $("selectedProjectMeta").textContent = `ID ${projeto.azure_id || "—"} · ${projeto.status || "Sem status"}`;
    renderizarOrigem();
    renderizarHistorico();

    const ultima = edicoesAtuais()[0];
    if (ultima) {
      const statusUltima = statusEdicaoNormalizado(ultima.status_edicao);
      if (statusUltima === "em_revisao" || statusUltima === "finalizada") {
        estado.edicaoVisualizada = ultima;
        estado.origemPreview = ultima.dados_origem || null;
        carregarCampos(ultima);
        $("editionBadge").textContent = `Versão ${ultima.versao} · ${rotuloStatusEdicao(ultima.status_edicao)}`;
      } else {
        carregarCampos(ultima);
        $("editionBadge").textContent = `Baseada na versão ${ultima.versao}`;
      }
    } else {
      limparCampos();
      $("contextField").value = projeto.contexto_objetivo_original || "";
      $("expectedField").value = projeto.resultados_esperados_original || "";
      $("achievedField").value = projeto.resultados_alcancados_original || "";
      $("impactField").value = projeto.impacto_original || "";
      $("editionBadge").textContent = "Primeira versão";
    }
    renderizarOrigem();
    renderizarHistorico();
    atualizarPreview();
    atualizarControlesWorkflow();
    filtrarProjetos();
    $("editorWorkspace").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function metadado(rotulo, valor) {
    return `<div><dt>${escapar(rotulo)}</dt><dd>${escapar(valor || "—")}</dd></div>`;
  }


  function valorVisual(valor) {
    if (valor === null || valor === undefined || valor === "") return "";
    if (Array.isArray(valor)) return valor.join(", ");
    if (typeof valor === "object") {
      try { return JSON.stringify(valor); } catch { return String(valor); }
    }
    return String(valor);
  }

  function tabelaDadosDisponiveis(dados) {
    if (!dados || typeof dados !== "object") return "";

    const ignorar = new Set([
      "__aba_origem",
      "__dados_originais",
    ]);

    const linhas = Object.entries(dados)
      .filter(([chave, valor]) => !ignorar.has(chave) && valorVisual(valor))
      .map(([chave, valor]) => `
        <tr>
          <th>${escapar(chave)}</th>
          <td>${escapar(valorVisual(valor))}</td>
        </tr>
      `)
      .join("");

    if (!linhas) return "";

    return `
      <section class="all-source-data">
        <h4>Todas as informações disponíveis na planilha</h4>
        <div class="all-source-table-wrap">
          <table class="all-source-table">
            <tbody>${linhas}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderizarOrigem() {
    const origem = origemAtual();
    const statusAtual=$('currentProjectStatus');
    if(statusAtual) statusAtual.textContent=`Status atual do projeto: ${projetoAtual()?.status || '—'}`;
    const projeto = {
      ...(projetoAtual() || {}),
      ...(origem.projeto || {})
    };
    const tarefasOrigem = Array.isArray(origem.tarefas) ? origem.tarefas : [];
    const tarefas = tarefasOrigem.length ? tarefasOrigem : tarefasAtuais();

    $("sourceMetadata").innerHTML = [
      metadado("ID", projeto.azure_id),
      metadado("Tipo", projeto.work_item_type),
      metadado(estado.edicaoVisualizada ? "Status nesta versão" : "Status atual", projeto.status),
      metadado("Data inicial", formatarData(dataProjeto(projeto, "inicio"))),
      metadado("Data final", formatarData(dataProjeto(projeto, "fim"))),
      metadado("Sponsor original", limparNome(projeto.sponsor)),
      metadado("Sponsors identificados", Array.isArray(projeto.sponsor_lista) ? projeto.sponsor_lista.join(", ") : ""),
      metadado("Esforço", projeto.esforco),
      metadado("Prioridade", projeto.prioridade),
      metadado("Impacto", projeto.impacto_original),
      metadado("Tarefas", tarefas.length),
    ].join("");

    if (!tarefas.length) {
      $("sourceTaskList").innerHTML = '<p class="empty-copy">Nenhuma tarefa vinculada a este projeto.</p>';
      return;
    }

    const tarefasHtml = tarefas.map((tarefa) => `
      <article class="source-task">
        <strong>${escapar(tarefa.descricao || tarefa.nome || "Ação sem descrição")}</strong>
        <span>ID ${escapar(tarefa.azure_id || "—")} · ${escapar(formatarData(dataTarefa(tarefa, "inicio")))} a ${escapar(formatarData(dataTarefa(tarefa, "fim")))}</span>
        <span>Sponsor: ${escapar(limparNome(tarefa.sponsor) || "—")}</span>
        <span class="task-status">${escapar(tarefa.status || "—")}</span>
      </article>
    `).join("");

    $("sourceTaskList").innerHTML =
      tarefasHtml +
      tabelaDadosDisponiveis(projeto.dados_origem);
  }

  function limparCampos() {
    Object.values(campos).forEach((id) => { $(id).value = ""; });
    estado.indicadoresNQAtual = null;
    renderizarSnapshotNQ();
    carregarTratamentoTarefas(null);
    $("evidenceList").innerHTML = "";
    adicionarEvidencia();
  }

  function carregarCampos(edicao) {
    Object.entries(campos).forEach(([chave, id]) => {
      $(id).value = edicao?.[chave] || "";
    });
    estado.indicadoresNQAtual = nqSnapshotValido(edicao?.indicadores_nq)
      ? JSON.parse(JSON.stringify(edicao.indicadores_nq))
      : null;
    if ($("nqSnapshotSituacao")) $("nqSnapshotSituacao").value = estado.indicadoresNQAtual?.filtro_situacao || "";
    renderizarSnapshotNQ();
    carregarTratamentoTarefas(edicao);
    $("evidenceList").innerHTML = "";
    const evidencias = Array.isArray(edicao?.evidencias) ? [...edicao.evidencias] : [];
    evidencias.sort((a, b) => (Number(a?.ordem) || 9999) - (Number(b?.ordem) || 9999));
    if (!evidencias.length) adicionarEvidencia();
    evidencias.forEach(adicionarEvidencia);
  }

  function adicionarEvidencia(dados = {}) {
    const fragmento = $("evidenceTemplate").content.cloneNode(true);
    const linha = fragmento.querySelector(".evidence-row");
    linha.dataset.storagePath = texto(dados.storage_path);
    linha.dataset.fileName = texto(dados.arquivo_nome);
    linha.dataset.mimeType = texto(dados.mime_type);
    linha.dataset.fileSize = texto(dados.tamanho_bytes);

    linha.querySelectorAll("[data-evidence]").forEach((entrada) => {
      entrada.value = dados[entrada.dataset.evidence] || "";
      entrada.addEventListener("input", atualizarPreview);
      entrada.addEventListener("change", atualizarPreview);
    });

    const incluir = linha.querySelector("[data-evidence-include]");
    if (incluir) {
      incluir.checked = evidenciaIncluida(dados);
      incluir.addEventListener("change", () => {
        atualizarNumeracaoEvidencias();
        atualizarPreview();
      });
    }

    const tipoSalvo = linha.querySelector('[data-evidence="tipo"]');
    if (tipoSalvo && (linha.dataset.fileName || linha.dataset.mimeType)) {
      tipoSalvo.value = tipoPorArquivo(linha.dataset.fileName, linha.dataset.mimeType);
    }

    const inputArquivo = linha.querySelector("[data-evidence-file]");
    if (linha.dataset.storagePath) {
      atualizarStatusArquivo(
        linha,
        `Anexado: ${linha.dataset.fileName || "arquivo protegido"}`,
        "ready",
      );
    }

    inputArquivo.addEventListener("change", () => {
      const file = inputArquivo.files?.[0];
      if (!file) {
        if (linha.dataset.storagePath) {
          atualizarStatusArquivo(linha, `Anexado: ${linha.dataset.fileName}`, "ready");
        } else {
          atualizarStatusArquivo(linha, "Nenhum arquivo selecionado.");
        }
        void carregarMiniaturaLinha(linha);
        atualizarPreview();
        return;
      }

      const erro = validarArquivoEvidencia(file);
      if (erro) {
        inputArquivo.value = "";
        atualizarStatusArquivo(linha, erro, "error");
        void carregarMiniaturaLinha(linha);
        atualizarPreview();
        return;
      }

      limparMetadadosArquivo(linha);
      const titulo = linha.querySelector('[data-evidence="titulo"]');
      const tipo = linha.querySelector('[data-evidence="tipo"]');
      if (titulo && !texto(titulo.value)) titulo.value = file.name.replace(/\.[^.]+$/, "");
      if (tipo) tipo.value = tipoPorArquivo(file.name, file.type);
      atualizarStatusArquivo(
        linha,
        `Pronto para enviar: ${file.name} · ${(file.size / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`,
        "ready",
      );
      void carregarMiniaturaLinha(linha);
      atualizarPreview();
    });

    linha.querySelector("[data-evidence-up]")?.addEventListener("click", () => moverEvidencia(linha, -1));
    linha.querySelector("[data-evidence-down]")?.addEventListener("click", () => moverEvidencia(linha, 1));
    linha.querySelector(".remove-evidence").addEventListener("click", () => {
      liberarObjectUrlLinha(linha);
      linha.remove();
      if (!$("evidenceList").children.length) adicionarEvidencia();
      atualizarNumeracaoEvidencias();
      atualizarPreview();
    });

    $("evidenceList").appendChild(fragmento);
    atualizarNumeracaoEvidencias();
    void carregarMiniaturaLinha(linha);
  }

  function obterEvidencias() {
    return [...$("evidenceList").querySelectorAll(".evidence-row")]
      .map((linha, indice) => {
        const evidencia = {};
        linha.querySelectorAll("[data-evidence]").forEach((entrada) => {
          evidencia[entrada.dataset.evidence] = texto(entrada.value);
        });
        evidencia.incluir_relatorio = linha.querySelector("[data-evidence-include]")?.checked !== false;
        evidencia.ordem = indice + 1;
        evidencia.storage_path = texto(linha.dataset.storagePath);
        evidencia.arquivo_nome = texto(linha.dataset.fileName);
        evidencia.mime_type = texto(linha.dataset.mimeType);
        evidencia.tamanho_bytes = Number(linha.dataset.fileSize || 0) || 0;
        evidencia.arquivo_pendente = Boolean(arquivoPendente(linha));
        return evidencia;
      })
      .filter((item) => item.titulo || item.url || item.descricao || evidenciaComArquivo(item));
  }

  async function enviarArquivosPendentes() {
    const linhas = [...$("evidenceList").querySelectorAll(".evidence-row")];

    for (const linha of linhas) {
      const input = linha.querySelector("[data-evidence-file]");
      const file = input?.files?.[0];
      if (!file) continue;

      const erroValidacao = validarArquivoEvidencia(file);
      if (erroValidacao) throw new Error(`${file.name}: ${erroValidacao}`);

      const ext = extensaoArquivo(file.name);
      const identificador = globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const usuarioId = texto(estado.usuario?.id).replace(/[^a-zA-Z0-9-]/g, "") || "usuario";
      const projetoId = texto(estado.projetoId).replace(/[^a-zA-Z0-9-]/g, "-") || "projeto";
      const caminho = `${usuarioId}/${projetoId}/${Date.now()}-${identificador}-${nomeArquivoSeguro(file.name)}`;

      atualizarStatusArquivo(linha, `Enviando ${file.name}…`, "uploading");
      const { data, error } = await window.biSupabase.storage
        .from(EVIDENCE_BUCKET)
        .upload(caminho, file, {
          cacheControl: "3600",
          contentType: MIME_EVIDENCIA[ext],
          upsert: false,
        });

      if (error) {
        atualizarStatusArquivo(linha, `Falha no envio de ${file.name}.`, "error");
        throw new Error(`Upload de evidência: ${error.message || error}`);
      }

      linha.dataset.storagePath = data.path;
      linha.dataset.fileName = file.name;
      linha.dataset.mimeType = MIME_EVIDENCIA[ext];
      linha.dataset.fileSize = String(file.size);
      input.value = "";
      atualizarStatusArquivo(linha, `Anexado: ${file.name}`, "ready");
      await carregarMiniaturaLinha(linha);
    }
    atualizarNumeracaoEvidencias();
    atualizarPreview();
  }

  function obterFormulario() {
    const dados = {};
    Object.entries(campos).forEach(([chave, id]) => { dados[chave] = texto($(id).value); });
    dados.evidencias = obterEvidencias();
    dados.tarefas_release = obterTratamentoTarefas();
    return dados;
  }

  function validarFinalizacao(dados) {
    const faltantes = [];
    if (!dados.contexto_objetivo) faltantes.push("Contexto e objetivo");
    if (!dados.resultados_esperados) faltantes.push("Resultados esperados");
    if (!dados.resultados_alcancados) faltantes.push("Resultados alcançados");
    if (!dados.impacto) faltantes.push("Impacto gerado");
    if (!dados.evidencias.some((item) => evidenciaIncluida(item) && item.titulo && (urlSegura(item.url) || evidenciaComArquivo(item)))) {
      faltantes.push("Ao menos uma evidência incluída no relatório, com título e arquivo ou link http(s)");
    }
    return faltantes;
  }

  function atualizarChecklist(dados) {
    const itens = [
      ["Contexto e objetivo", Boolean(dados.contexto_objetivo)],
      ["Resultados esperados", Boolean(dados.resultados_esperados)],
      ["Resultados alcançados", Boolean(dados.resultados_alcancados)],
      ["Impacto gerado", Boolean(dados.impacto)],
      ["Evidência incluída com título e arquivo ou link", dados.evidencias.some((e) => evidenciaIncluida(e) && e.titulo && (urlSegura(e.url) || evidenciaComArquivo(e)))],
    ];
    $("completionChecklist").innerHTML = itens
      .map(([rotulo, pronto]) => `<li class="${pronto ? "done" : ""}">${escapar(rotulo)}</li>`)
      .join("");
  }

  function decisaoSalvaParaTarefa(tarefa, decisoes = []) {
    return decisoes.find((item) => {
      if (item?.tarefa_id != null && tarefa?.id != null && mesmoId(item.tarefa_id, tarefa.id)) return true;
      if (texto(item?.source_key) && texto(tarefa?.source_key) === texto(item.source_key)) return true;
      if (texto(item?.azure_id) && texto(tarefa?.azure_id) === texto(item.azure_id)) return true;
      return false;
    }) || null;
  }

  function iconeRelease(nome) {
    const desenhos = {
      pessoa: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
      calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 11h18M7 15h2M13 15h2M7 18h2"/>',
      alvo: '<circle cx="11" cy="13" r="8"/><circle cx="11" cy="13" r="4"/><path d="m11 13 9-9M16 3h5v5"/>',
      etapas: '<path d="M4 5h4v4H4zM4 15h4v4H4zM13 7h8M13 17h8M6 9v6"/>',
      documento: '<path d="M6 2h9l5 5v15H6zM15 2v6h5M10 12h6M10 16h6"/>',
      resultado: '<path d="M4 21V11h4v10M10 21V7h4v14M16 21V3h4v18M2 21h20"/>',
      conversa: '<path d="M3 3h18v13H11l-6 5v-5H3zM7 7h10M7 11h6"/>',
      seta: '<path d="M3 12h18m-6-6 6 6-6 6"/>',
      folha: '<path d="M12 23V11M12 16C4 16 3 11 3 8c5 0 9 2 9 8ZM12 11c0-6 4-9 9-9 0 5-3 9-9 9Z"/>',
    };
    return `<svg class="release-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${desenhos[nome] || desenhos.documento}</svg>`;
  }

  function textoRelease(conteudo) {
    const valor = texto(conteudo);
    if (!valor) return '<p class="report-empty">Não informado nesta versão.</p>';
    const linhas = valor.split(/\r?\n/).map((linha) => linha.trim()).filter(Boolean);
    if (linhas.length && linhas.every((linha) => /^[-•*]\s+/.test(linha))) {
      return `<ul class="release-points">${linhas.map((linha) => `<li>${escapar(linha.replace(/^[-•*]\s+/, ""))}</li>`).join("")}</ul>`;
    }
    return `<p>${escapar(valor)}</p>`;
  }

  function contextoRelease(conteudo) {
    const valor = texto(conteudo);
    const marcador = /(?:^|\n)\s*Objetivo\s*:\s*/i.exec(valor);
    const contexto = marcador ? valor.slice(0, marcador.index).replace(/^\s*Contexto\s*:\s*/i, "").trim() : valor;
    const objetivo = marcador ? valor.slice(marcador.index + marcador[0].length).trim() : "";
    const card = (titulo, conteudo, icone) => `<div class="release-context-card">${iconeRelease(icone)}<div><h3>${escapar(titulo)}</h3>${textoRelease(conteudo)}</div></div>`;
    return `${contexto || !objetivo ? card(marcador ? "Origem e contexto" : "Contexto e objetivo", contexto, "conversa") : ""}${objetivo ? card("Objetivo", objetivo, "alvo") : ""}`;
  }

  function identificacaoRelease(rotulo, valor, icone) {
    return `<div class="report-meta">${iconeRelease(icone)}<div><span>${escapar(rotulo)}</span><strong>${escapar(valor == null || valor === "" ? "—" : valor)}</strong></div></div>`;
  }

  function linhaDoTempoTarefas(tarefas, decisoes = []) {
    if (!tarefas.length) return '<p class="report-empty">Nenhuma tarefa original vinculada.</p>';
    return `
      <ol class="release-timeline">${tarefas.map((t) => {
          const decisao = decisaoSalvaParaTarefa(t, decisoes);
          const statusRelease = decisao?.status_release || t.status || "—";
          const alterada = decisao && decisao.acao && decisao.acao !== "manter";
          return `
          <li class="release-step" data-task-source-id="${escapar(t.azure_id || t.id || "")}">
            <div class="release-step-icon">${iconeRelease(alterada ? "alvo" : "documento")}</div>
            <div class="release-step-body">
              <span class="release-step-period">${escapar(formatarData(dataTarefa(t, "inicio")))} a ${escapar(formatarData(dataTarefa(t, "fim")))}</span>
              <h3>${escapar(t.descricao || t.nome || "Ação sem descrição")}</h3>
              <p class="release-step-meta">ID ${escapar(t.azure_id || "—")} · Status original: ${escapar(t.status || "—")} · <span class="${alterada ? "report-task-status-changed" : ""}">Status no release: ${escapar(statusRelease)}</span></p>
            </div>
          </li>`;
        }).join("")}</ol>`;
  }

  function blocoResumoTarefasRelease(decisoes = []) {
    const selecionadas = decisoes.filter((d) => d.acao === "finalizar_release" || d.acao === "finalizar_base");
    if (!selecionadas.length) return "";
    const naBase = selecionadas.filter((d) => d.acao === "finalizar_base").length;
    return `
      <div class="report-release-summary">
        <strong>${selecionadas.length} tarefa(s) marcada(s) como finalizada(s) neste release.</strong>
        <span>${naBase ? `${naBase} também selecionada(s) para atualização do status atual no Projeto Qualidade.` : "Nenhuma alteração do status atual do Projeto Qualidade foi solicitada."}</span>
      </div>`;
  }

  function evidenciasRelatorio(evidencias) {
    const validas = evidencias
      .filter((item) => evidenciaIncluida(item) && (item.titulo || item.url || item.descricao || evidenciaComArquivo(item)))
      .sort((a, b) => (Number(a?.ordem) || 9999) - (Number(b?.ordem) || 9999));
    if (!validas.length) return '<p class="report-empty">Nenhuma evidência selecionada para este relatório.</p>';

    const cards = validas.map((item, indice) => {
      const numero = String(indice + 1).padStart(2, "0");
      const tipo = item.tipo || tipoPorArquivo(item.arquivo_nome, item.mime_type) || "Outro";
      const url = urlSegura(item.url);
      const nomeArquivo = item.arquivo_nome || "";
      const ehImagem = tipo === "Imagem" || tipoPorArquivo(nomeArquivo, item.mime_type) === "Imagem";
      const miniatura = ehImagem && item.storage_path
        ? `<div class="report-evidence-image-wrap">
             <img class="report-evidence-image" data-storage-path="${escapar(item.storage_path)}" alt="${escapar(item.titulo || `Evidência ${numero}`)}">
             <span>Carregando miniatura…</span>
           </div>`
        : "";
      const arquivo = item.storage_path
        ? `<div class="report-evidence-file">
             <span class="report-evidence-file-icon" aria-hidden="true">${ehImagem ? "▣" : (tipo === "PDF" ? "PDF" : "DOC")}</span>
             <div><strong>${escapar(nomeArquivo || item.titulo || "Arquivo anexado")}</strong><small>Arquivo protegido · disponível no histórico desta versão no DataHub</small></div>
             <button type="button" class="evidence-open-file" data-storage-path="${escapar(item.storage_path)}" data-file-name="${escapar(nomeArquivo || item.titulo || "arquivo")}">Abrir arquivo</button>
           </div>`
        : "";
      const link = url
        ? `<div class="report-evidence-link"><span>Link externo:</span> <a class="report-evidence-external-link" href="${escapar(url)}" target="_blank" rel="noopener noreferrer">${escapar(url)}</a></div>`
        : "";
      const pendente = item.arquivo_pendente && !item.storage_path
        ? '<div class="report-evidence-file pending"><span>Arquivo será enviado ao salvar esta versão.</span></div>'
        : "";
      return `
        <article class="report-evidence-card">
          <header class="report-evidence-head">
            <span>Evidência ${numero}</span>
            <strong>${escapar(item.titulo || "Sem título")}</strong>
            <em>${escapar(tipo)}</em>
          </header>
          <p>${escapar(item.descricao || "Sem descrição informada.")}</p>
          ${miniatura}${arquivo}${pendente}${link}
        </article>`;
    }).join("");

    return `<div class="report-evidence-cards">${cards}</div>`;
  }

  function atualizarPreview() {
    if (!estado.projetoId) return;
    const dados = obterFormulario();
    const origem = origemAtual();
    const projetoBase = projetoAtual() || {};
    const projeto = {
      ...projetoBase,
      ...(origem.projeto || {})
    };
    const tarefasOrigem = Array.isArray(origem.tarefas) ? origem.tarefas : [];
    const tarefas = tarefasOrigem.length ? tarefasOrigem : tarefasAtuais();
    const faltantes = validarFinalizacao(dados);
    const edicoes = edicoesAtuais();
    const proximaVersao = edicoes.length ? Math.max(...edicoes.map((e) => e.versao)) + 1 : 1;
    const edicao = estado.edicaoVisualizada;
    const versao = edicao
      ? `Versão ${edicao.versao} · ${rotuloStatusEdicao(edicao.status_edicao)}`
      : `Prévia da próxima versão ${proximaVersao}`;
    const autor = edicao?.criado_por_email || estado.usuario?.email || "—";
    const emitidoEm = edicao?.criado_em ? formatarDataHora(edicao.criado_em) : formatarDataHora(new Date());
    const sponsorOriginal = limparNome(projeto.sponsor);
    const sponsors = Array.isArray(projeto.sponsor_lista) ? projeto.sponsor_lista.filter((nome) => !normalizar(sponsorOriginal).includes(normalizar(nome))) : [];
    const sponsor = [sponsorOriginal, ...sponsors].filter(Boolean).join(", ");
    const periodo = `${formatarData(dataProjeto(projeto, "inicio"))} a ${formatarData(dataProjeto(projeto, "fim"))}`;
    const marca = '<span class="release-wordmark"><span>sintechtica</span> <b>ânima</b></span>';

    $("reportDocument").classList.add("report-release");
    $("reportDocument").innerHTML = `
      <header class="report-cover">
        <div class="release-heading">
          <div class="release-title">
            <span class="report-brand">Release de projeto</span>
            <span class="release-project-id">ID ${escapar(projeto.azure_id || "—")} · ${escapar(projeto.work_item_type || "Projeto")}</span>
            <h1>${escapar(projeto.nome || "Projeto da Qualidade")}</h1>
          </div>
          <div class="release-brand-block">${marca}<span class="release-brand-tagline">Conhecimento<br>que transforma<br>realidades</span></div>
        </div>
        <p class="report-subtitle">Resultados, entregas e evolução do projeto.</p>
        <span class="report-version">${escapar(versao)}</span>
      </header>
      ${faltantes.length ? `<div class="report-draft-warning">${escapar(edicao ? rotuloStatusEdicao(edicao.status_edicao) : "Rascunho")} · faltam: ${escapar(faltantes.join(", "))}.</div>` : ""}
      <div class="report-meta-grid">
        ${identificacaoRelease("Sponsor(s)", sponsor, "pessoa")}
        ${identificacaoRelease("Período", periodo, "calendario")}
        ${identificacaoRelease("Status", projeto.status, "alvo")}
        ${identificacaoRelease("Esforço", projeto.esforco, "resultado")}
        ${identificacaoRelease("Prioridade", projeto.prioridade, "alvo")}
        ${identificacaoRelease("Ações originais", tarefas.length, "etapas")}
      </div>
      <section class="report-section release-context"><h2>1. Origem, contexto e objetivo</h2>${contextoRelease(dados.contexto_objetivo)}<div class="release-expected"><h3>Resultados esperados</h3>${textoRelease(dados.resultados_esperados)}</div></section>
      <section class="report-section release-process"><h2>2. Como construímos</h2><p class="release-section-intro">Ações e tarefas originais do projeto</p>${blocoResumoTarefasRelease(dados.tarefas_release)}${linhaDoTempoTarefas(tarefas, dados.tarefas_release)}</section>
      <section class="report-section release-results"><h2>3. Resultados alcançados</h2>${textoRelease(dados.resultados_alcancados)}</section>
      ${blocoIndicadoresNQ(estado.indicadoresNQAtual)}
      <section class="report-section release-delivery"><h2>4. Produto entregue e evidências</h2>${evidenciasRelatorio(dados.evidencias)}</section>
      <section class="report-section release-value"><h2>5. Valor gerado</h2><div class="release-context-card">${iconeRelease("resultado")}<div><h3>Impacto gerado</h3>${textoRelease(dados.impacto)}</div></div></section>
      ${dados.acoes_complementares || dados.observacoes ? `<section class="report-section release-next"><h2>6. Ações complementares e observações</h2>${dados.acoes_complementares ? `<div class="release-callout"><h3>Novas ações e complementos</h3>${textoRelease(dados.acoes_complementares)}</div>` : ""}${dados.observacoes ? `<div class="release-callout"><h3>Observações</h3>${textoRelease(dados.observacoes)}</div>` : ""}</section>` : ""}
      <footer class="report-footer">
        <div class="release-footer-brand">${iconeRelease("folha")}<span>Conhecimento que transforma <strong>realidades.</strong></span>${marca}</div>
        <div class="release-footer-audit"><span>Versão registrada por ${escapar(autor)}</span><span>Gerado em ${escapar(emitidoEm)}</span></div>
      </footer>`;

    // O link precisa existir antes da cópia para PDF, sem depender do observer.
    window.biProjetosEvidencias?.prepararRelatorio($("reportDocument"));
    void hidratarMiniaturasRelatorio();
    atualizarChecklist(dados);
  }

  function renderizarHistorico() {
    const edicoes = edicoesAtuais();
    if (!edicoes.length) {
      $("historyList").innerHTML = '<p class="empty-copy">Ainda não existem versões salvas.</p>';
      return;
    }

    $("historyList").innerHTML = edicoes.map((edicao) => {
      const status = statusEdicaoNormalizado(edicao.status_edicao);
      const rotulo = rotuloStatusEdicao(status);
      const workflow = status === "rascunho"
        ? '<button type="button" data-action="review">Enviar para revisão</button>'
        : (status === "em_revisao"
          ? '<button type="button" class="history-primary" data-action="finalize">Aprovar</button>'
          : '');
      const detalheWorkflow = status === "em_revisao" && edicao.enviado_revisao_em
        ? `<small class="history-workflow-meta">Enviado por ${escapar(edicao.enviado_revisao_por_email || "—")} · ${escapar(formatarDataHora(edicao.enviado_revisao_em))}</small>`
        : (status === "finalizada" && edicao.finalizado_em
          ? `<small class="history-workflow-meta">Finalizado por ${escapar(edicao.finalizado_por_email || "—")} · ${escapar(formatarDataHora(edicao.finalizado_em))}</small>`
          : '');

      return `
      <article class="history-item ${estado.edicaoVisualizada && mesmoId(estado.edicaoVisualizada.id, edicao.id) ? "active" : ""}" data-edition-id="${escapar(edicao.id)}">
        <div class="history-item-head">
          <strong>Versão ${escapar(edicao.versao)}</strong>
          <span class="history-status ${escapar(status)}">${escapar(rotulo)}</span>
        </div>
        ${nqSnapshotValido(edicao.indicadores_nq) ? '<small class="history-nq-badge">Snapshot NQ incluído</small>' : ''}
        ${Array.isArray(edicao.tarefas_release) && edicao.tarefas_release.some((t) => t.acao && t.acao !== "manter") ? `<small class="history-release-badge">${edicao.tarefas_release.filter((t) => t.acao && t.acao !== "manter").length} tarefa(s) tratada(s) no release</small>` : ''}
        ${detalheWorkflow}
        <p>${escapar(formatarDataHora(edicao.criado_em))}<br>${escapar(edicao.criado_por_email)}</p>
        <div class="history-actions">
          <button type="button" data-action="view">Ver versão</button>
          <button type="button" data-action="base">Usar como base</button>
          <button type="button" data-action="reprint">Reimprimir relatório</button>
          ${workflow}
        </div>
      </article>`;
    }).join("");

    $("historyList").querySelectorAll(".history-item").forEach((item) => {
      const edicao = estado.edicoes.find((e) => mesmoId(e.id, item.dataset.editionId));
      if (!edicao) return;
      item.querySelector('[data-action="view"]')?.addEventListener("click", () => visualizarEdicao(edicao));
      item.querySelector('[data-action="base"]')?.addEventListener("click", () => usarComoBase(edicao));
      item.querySelector('[data-action="reprint"]')?.addEventListener("click", () => void reimprimirEdicao(edicao));
      item.querySelector('[data-action="review"]')?.addEventListener("click", () => void enviarEdicaoParaRevisao(edicao));
      item.querySelector('[data-action="finalize"]')?.addEventListener("click", () => void finalizarEdicaoEmRevisao(edicao));
    });
  }

  function visualizarEdicao(edicao) {
    estado.edicaoVisualizada = edicao;
    estado.origemPreview = edicao.dados_origem || null;
    carregarCampos(edicao);
    $("editionBadge").textContent = `Versão ${edicao.versao} · ${rotuloStatusEdicao(edicao.status_edicao)}`;
    renderizarOrigem();
    renderizarHistorico();
    atualizarPreview();
    atualizarControlesWorkflow();
    mostrarFeedback(`Versão ${edicao.versao} aberta em modo protegido. O registro original não é sobrescrito.`, "success");
  }

  function usarComoBase(edicao) {
    estado.edicaoVisualizada = null;
    estado.origemPreview = null;
    carregarCampos(edicao);
    $("editionBadge").textContent = `Nova versão baseada na ${edicao.versao}`;
    renderizarOrigem();
    renderizarHistorico();
    atualizarPreview();
    atualizarControlesWorkflow();
    mostrarFeedback(`Conteúdo da versão ${edicao.versao} carregado como base. Ao salvar, uma nova versão será criada.`, "success");
  }

  function definirEditorBloqueado(bloqueado) {
    const seletores = [
      "#reportForm input",
      "#reportForm textarea",
      "#reportForm select",
      "#evidenceList button",
      "#addEvidenceButton",
      "#attachEvidenceButton",
      "#attachSpreadsheetButton",
      "#loadNqIndicatorsButton",
    ];
    document.querySelectorAll(seletores.join(",")).forEach((el) => {
      el.disabled = Boolean(bloqueado);
    });
    document.querySelector(".edit-panel")?.classList.toggle("workflow-locked", Boolean(bloqueado));
  }

  function atualizarControlesWorkflow() {
    const edicao = estado.edicaoVisualizada;
    const status = edicao ? statusEdicaoNormalizado(edicao.status_edicao) : "edicao";
    const visualizandoSnapshot = Boolean(edicao);
    const bloquearEditor = visualizandoSnapshot || estado.salvando;

    definirEditorBloqueado(bloquearEditor);

    const salvar = $("saveDraftButton");
    const revisar = $("reviewButton");
    const finalizar = $("finalizeButton");
    const visualizarPdf = $("printDraftButton");

    salvar.disabled = estado.salvando || visualizandoSnapshot;
    revisar.disabled = estado.salvando || (visualizandoSnapshot && status !== "rascunho");
    finalizar.disabled = estado.salvando || !visualizandoSnapshot || !["em_revisao", "finalizada"].includes(status);
    if (visualizarPdf) visualizarPdf.disabled = estado.salvando;

    salvar.textContent = estado.salvando ? "Processando…" : "Salvar rascunho";
    revisar.textContent = estado.salvando
      ? "Processando…"
      : (visualizandoSnapshot && status === "rascunho" ? "Enviar rascunho para revisão" : "Enviar para revisão");
    finalizar.textContent = estado.salvando ? "Processando…" : (status === "finalizada" ? "Reimprimir relatório" : "Aprovar e gerar PDF");
    document.querySelectorAll(".history-actions button").forEach((botao) => { botao.disabled = estado.salvando; });

    const badge = $("editionBadge");
    badge.classList.remove("workflow-rascunho", "workflow-em-revisao", "workflow-finalizada");
    if (visualizandoSnapshot) badge.classList.add(`workflow-${status.replace("_", "-")}`);

    const checklistTitle = $("checklistTitle");
    const checklistHelp = $("checklistHelp");
    if (status === "em_revisao") {
      checklistTitle.textContent = "Pronto para aprovar?";
      checklistHelp.textContent = "Esta versão está em revisão e o conteúdo está bloqueado. Aprove para finalizar ou use-a como base para criar uma nova versão com ajustes.";
    } else if (status === "finalizada") {
      checklistTitle.textContent = "Versão finalizada";
      checklistHelp.textContent = "Esta versão está protegida contra alterações. Para evoluir o relatório, use “Usar como base” no histórico.";
    } else {
      checklistTitle.textContent = "Pronto para revisão?";
      checklistHelp.textContent = visualizandoSnapshot
        ? "Este rascunho salvo está protegido. Envie-o para revisão ou use-o como base para continuar editando."
        : "O rascunho pode ser salvo incompleto. Para enviar à revisão, complete os itens essenciais.";
    }
  }

  function definirSalvando(ativo) {
    estado.salvando = ativo;
    atualizarControlesWorkflow();
  }

  async function abrirArquivoArmazenado(caminho, nome) {
    const janela = window.open("", "_blank");
    if (janela) {
      janela.opener = null;
      janela.document.title = "Abrindo arquivo…";
      janela.document.body.textContent = "Gerando acesso seguro ao arquivo…";
    }

    try {
      const { data, error } = await window.biSupabase.storage
        .from(EVIDENCE_BUCKET)
        .createSignedUrl(caminho, 120, { download: nome || undefined });
      if (error) throw new Error(`Abertura da evidência: ${error.message || error}`);
      if (janela) janela.location.replace(data.signedUrl);
      else window.location.href = data.signedUrl;
    } catch (error) {
      if (janela) janela.close();
      mostrarFeedback(mensagemErro(error), "error");
    }
  }

  function substituirEdicaoNoEstado(edicao) {
    const indice = estado.edicoes.findIndex((item) => mesmoId(item.id, edicao?.id));
    if (indice >= 0) estado.edicoes[indice] = edicao;
    else estado.edicoes.unshift(edicao);
  }

  async function persistirComplementosEdicao(edicaoId, dados) {
    let avisoIndicadoresNQ = "";
    if (nqSnapshotValido(estado.indicadoresNQAtual)) {
      const { error: indicadoresError } = await window.biSupabase.rpc("pq_salvar_indicadores_nq", {
        p_edicao_id: edicaoId,
        p_indicadores: estado.indicadoresNQAtual,
      });
      if (indicadoresError) {
        console.error("Snapshot NQ não persistido:", indicadoresError);
        avisoIndicadoresNQ = " A versão foi salva, mas o snapshot do NQ não foi gravado. Execute docs/05_INDICADORES_NQ_RELATORIO_V25_46_39.sql no Supabase.";
      }
    }

    let avisoTarefasRelease = "";
    if (dados.tarefas_release.length) {
      const tarefasPersistir = dados.tarefas_release.map((item) => ({
        ...item,
        decidido_em: new Date().toISOString(),
        decidido_por: estado.usuario?.email || null,
      }));
      const { error: tarefasError } = await window.biSupabase.rpc("pq_salvar_tarefas_release", {
        p_edicao_id: edicaoId,
        p_tarefas: tarefasPersistir,
      });
      if (tarefasError) {
        console.error("Tratamento das tarefas não persistido:", tarefasError);
        avisoTarefasRelease = " O tratamento das tarefas não foi gravado; nenhuma tarefa da base será alterada.";
      }
    }

    return { avisoIndicadoresNQ, avisoTarefasRelease };
  }

  async function salvarNovaVersao(statusDestino = "rascunho") {
    if (!estado.projetoId || estado.salvando) return;
    const status = statusEdicaoNormalizado(statusDestino);
    const enviarRevisao = status === "em_revisao";
    let dados = obterFormulario();
    let faltantes = validarFinalizacao(dados);

    if (enviarRevisao && faltantes.length) {
      mostrarFeedback(`Complete antes de enviar para revisão: ${faltantes.join("; ")}.`, "warning");
      $("completionChecklist").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    try {
      await validarInstalacaoWorkflowRelease();
      if (dados.tarefas_release.length) await validarInstalacaoReleaseTarefas();
    } catch (error) {
      mostrarFeedback(mensagemErro(error), "error");
      return;
    }

    if (enviarRevisao) {
      const resumoRelease = resumoTratamentoTarefas(dados.tarefas_release);
      const partes = [
        "Enviar esta versão para revisão?",
        "O conteúdo ficará protegido enquanto estiver em revisão.",
        `${resumoRelease.finalizarRelease} tarefa(s) serão consideradas finalizadas neste release se a revisão for aprovada.`,
        "Se forem necessários ajustes, use esta versão como base para criar uma nova.",
      ];
      if (!window.confirm(partes.join("\n\n"))) return;
    }

    definirSalvando(true);
    mostrarFeedback(enviarRevisao ? "Preparando versão para revisão…" : "Salvando rascunho…");

    try {
      await enviarArquivosPendentes();
      dados = obterFormulario();
      faltantes = validarFinalizacao(dados);
      if (enviarRevisao && faltantes.length) {
        throw new Error(`Complete antes de enviar para revisão: ${faltantes.join("; ")}.`);
      }

      const { data, error } = await window.biSupabase.rpc("pq_salvar_edicao_workflow", {
        p_projeto_id: estado.projetoId,
        p_contexto_objetivo: dados.contexto_objetivo || null,
        p_resultados_esperados: dados.resultados_esperados || null,
        p_acoes_complementares: dados.acoes_complementares || null,
        p_resultados_alcancados: dados.resultados_alcancados || null,
        p_impacto: dados.impacto || null,
        p_observacoes: dados.observacoes || null,
        p_evidencias: dados.evidencias.map(({ arquivo_pendente, ...evidencia }) => evidencia),
        p_status_edicao: enviarRevisao ? "em_revisao" : "rascunho",
      });
      if (error) throw error;

      const avisos = await persistirComplementosEdicao(data.id, dados);

      const { data: edicao, error: edicaoError } = await window.biSupabase
        .from("pq_projetos_edicoes")
        .select("*")
        .eq("id", data.id)
        .single();
      if (edicaoError) throw edicaoError;
      if (edicao?.status_edicao !== (enviarRevisao ? "em_revisao" : "rascunho")) {
        throw new Error("O banco não confirmou o status da nova versão. Atualize o histórico para conferir o registro salvo.");
      }

      substituirEdicaoNoEstado(edicao);
      estado.edicaoVisualizada = edicao;
      estado.origemPreview = edicao.dados_origem || null;
      carregarCampos(edicao);
      $("editionBadge").textContent = `Versão ${edicao.versao} · ${rotuloStatusEdicao(edicao.status_edicao)}`;
      renderizarOrigem();
      renderizarHistorico();
      atualizarPreview();
      atualizarControlesWorkflow();
      filtrarProjetos();

      const alertas = `${avisos.avisoIndicadoresNQ}${avisos.avisoTarefasRelease}`;
      if (enviarRevisao) {
        mostrarFeedback(
          `Versão ${edicao.versao} enviada para revisão. O conteúdo está protegido até a aprovação ou criação de uma nova versão para ajustes.${alertas}`,
          alertas ? "warning" : "success",
        );
      } else {
        mostrarFeedback(
          `Versão ${edicao.versao} salva como rascunho.${alertas}`,
          alertas ? "warning" : "success",
        );
      }
    } catch (error) {
      mostrarFeedback(mensagemErro(error), "error");
    } finally {
      definirSalvando(false);
    }
  }

  async function confirmarEdicaoSalva(edicaoId,resposta,status) {
    const registro=Array.isArray(resposta)?resposta[0]:resposta;
    if(!mesmoId(registro?.id,edicaoId) || registro.status_edicao!==status)
      throw new Error('O banco não confirmou a transição do relatório. Execute docs/22_CONFIRMAR_FINALIZACAO_RELATORIO.sql e atualize o histórico.');
    const {data,error}=await window.biSupabase.from('pq_projetos_edicoes').select('*').eq('id',edicaoId).maybeSingle();
    if(error || !data) throw new Error('A transição foi enviada, mas não foi possível confirmar a versão salva. Atualize o histórico antes de tentar novamente.');
    if(data.status_edicao!==status) {
      substituirEdicaoNoEstado(data);
      estado.edicaoVisualizada=data;estado.origemPreview=data.dados_origem || null;
      carregarCampos(data);renderizarOrigem();renderizarHistorico();atualizarPreview();atualizarControlesWorkflow();
      $('editionBadge').textContent=`Versão ${data.versao} · ${rotuloStatusEdicao(data.status_edicao)}`;
      throw new Error('O status do relatório no banco difere do solicitado. Atualize o histórico para conferir a alteração.');
    }
    if(status==='finalizada' && !data.finalizado_em) throw new Error('O banco não confirmou a data de finalização. Confira a instalação do SQL 22.');
    return data;
  }

  async function enviarEdicaoParaRevisao(edicao) {
    if (!edicao || estado.salvando) return;
    if (statusEdicaoNormalizado(edicao.status_edicao) !== "rascunho") {
      mostrarFeedback("Somente versões em rascunho podem ser enviadas para revisão.", "warning");
      return;
    }

    if (!estado.edicaoVisualizada || !mesmoId(estado.edicaoVisualizada.id, edicao.id)) {
      visualizarEdicao(edicao);
    }

    const dados = obterFormulario();
    const faltantes = validarFinalizacao(dados);
    if (faltantes.length) {
      mostrarFeedback(`Complete antes de enviar para revisão: ${faltantes.join("; ")}. Use “Usar como base” para ajustar esta versão.`, "warning");
      $("completionChecklist").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    try {
      await validarInstalacaoWorkflowRelease();
    } catch (error) {
      mostrarFeedback(mensagemErro(error), "error");
      return;
    }

    if (!window.confirm(`Enviar a versão ${edicao.versao} para revisão?\n\nO conteúdo desta fotografia continuará protegido.`)) return;

    definirSalvando(true);
    mostrarFeedback(`Enviando a versão ${edicao.versao} para revisão…`);
    try {
      const { data, error } = await window.biSupabase.rpc("pq_transicionar_edicao_confirmada", {
        p_edicao_id: texto(edicao.id),
        p_status_edicao: "em_revisao",
      });
      if (error) throw error;

      const atualizada = await confirmarEdicaoSalva(edicao.id,data,"em_revisao");
      substituirEdicaoNoEstado(atualizada);
      estado.edicaoVisualizada = atualizada;
      estado.origemPreview = atualizada.dados_origem || null;
      carregarCampos(atualizada);
      $("editionBadge").textContent = `Versão ${atualizada.versao} · ${rotuloStatusEdicao(atualizada.status_edicao)}`;
      renderizarOrigem();
      renderizarHistorico();
      atualizarPreview();
      atualizarControlesWorkflow();
      mostrarFeedback(`Versão ${atualizada.versao} enviada para revisão com sucesso.`, "success");
    } catch (error) {
      mostrarFeedback(mensagemErro(error), "error");
    } finally {
      definirSalvando(false);
    }
  }

  async function finalizarEdicaoEmRevisao(edicao) {
    if (!edicao || estado.salvando) return;
    if (!edicaoEmRevisao(edicao)) {
      mostrarFeedback("Somente versões em revisão podem ser finalizadas.", "warning");
      return;
    }

    if (!estado.edicaoVisualizada || !mesmoId(estado.edicaoVisualizada.id, edicao.id)) {
      visualizarEdicao(edicao);
    }

    const dados = obterFormulario();
    const faltantes = validarFinalizacao(dados);
    if (faltantes.length) {
      mostrarFeedback(`Esta versão não pode ser finalizada: ${faltantes.join("; ")}. Crie uma nova versão para corrigir o conteúdo.`, "warning");
      return;
    }

    const resumoRelease = resumoTratamentoTarefas(
      Array.isArray(edicao.tarefas_release) ? edicao.tarefas_release : dados.tarefas_release,
    );

    try {
      await validarInstalacaoWorkflowRelease();
      if (Array.isArray(edicao.tarefas_release) && edicao.tarefas_release.length) {
        await validarInstalacaoReleaseTarefas();
      }
    } catch (error) {
      mostrarFeedback(mensagemErro(error), "error");
      return;
    }

    const partes = [
      `Aprovar e finalizar a versão ${edicao.versao}?`,
      "Depois de finalizada, esta versão permanecerá bloqueada e preservada no histórico.",
      `${resumoRelease.finalizarRelease} tarefa(s) serão consideradas finalizadas neste release.`,
    ];
    if (resumoRelease.atualizarBase) {
      partes.push(`${resumoRelease.atualizarBase} tarefa(s) também terão o status atual atualizado no Projeto Qualidade.`);
    } else {
      partes.push("O status atual das tarefas no Projeto Qualidade não será alterado.");
    }
    partes.push("O status geral do projeto não será alterado.");
    if (!window.confirm(partes.join("\n\n"))) return;

    definirSalvando(true);
    mostrarFeedback(`Finalizando a versão ${edicao.versao}…`);

    try {
      const { data, error } = await window.biSupabase.rpc("pq_transicionar_edicao_confirmada", {
        p_edicao_id: texto(edicao.id),
        p_status_edicao: "finalizada",
      });
      if (error) throw error;

      const atualizada = await confirmarEdicaoSalva(edicao.id,data,"finalizada");
      substituirEdicaoNoEstado(atualizada);
      estado.edicaoVisualizada = atualizada;
      estado.origemPreview = atualizada.dados_origem || null;
      carregarCampos(atualizada);

      const decisoes = Array.isArray(atualizada.tarefas_release) ? atualizada.tarefas_release : [];
      const resultadoAtualizacao = await aplicarAtualizacoesTarefasNaBase(atualizada.id, decisoes);
      const avisoTarefas = resultadoAtualizacao.avisos.length
        ? ` ${resultadoAtualizacao.avisos.length} tarefa(s) não puderam ser atualizadas na base; o release finalizado foi preservado.`
        : "";

      $("editionBadge").textContent = `Versão ${atualizada.versao} · ${rotuloStatusEdicao(atualizada.status_edicao)}`;
      renderizarOrigem();
      renderizarHistorico();
      atualizarPreview();
      atualizarControlesWorkflow();
      filtrarProjetos();

      try {
        await gerarPdfRelatorio("download");
        const resumoBase = resultadoAtualizacao.atualizadas
          ? ` ${resultadoAtualizacao.atualizadas} tarefa(s) também atualizada(s) no Projeto Qualidade.`
          : "";
        mostrarFeedback(
          `Versão ${atualizada.versao} aprovada, finalizada e PDF gerado.${resumoBase}${avisoTarefas}`,
          avisoTarefas ? "warning" : "success",
        );
      } catch (pdfError) {
        console.error("PDF do Projeto Qualidade:", pdfError);
        mostrarFeedback(
          `Versão ${atualizada.versao} finalizada, mas o PDF não pôde ser gerado: ${mensagemErro(pdfError)}${avisoTarefas}`,
          "warning",
        );
      }
    } catch (error) {
      mostrarFeedback(mensagemErro(error), "error");
    } finally {
      definirSalvando(false);
    }
  }

  function acaoEnviarRevisao() {
    const edicao = estado.edicaoVisualizada;
    if (edicao && statusEdicaoNormalizado(edicao.status_edicao) === "rascunho") {
      void enviarEdicaoParaRevisao(edicao);
      return;
    }
    if (!edicao) {
      void salvarNovaVersao("em_revisao");
      return;
    }
    mostrarFeedback("Esta versão não está disponível para envio à revisão.", "warning");
  }

  function acaoFinalizarRevisao() {
    const edicao = estado.edicaoVisualizada;
    if (edicao && statusEdicaoNormalizado(edicao.status_edicao) === "finalizada") {
      void reimprimirEdicao(edicao);
      return;
    }
    if (!edicao || !edicaoEmRevisao(edicao)) {
      mostrarFeedback("Abra uma versão com status Em revisão para aprová-la e finalizar.", "warning");
      return;
    }
    void finalizarEdicaoEmRevisao(edicao);
  }

  async function reimprimirEdicao(edicao) {
    if (!edicao || estado.salvando) return;
    visualizarEdicao(edicao);
    definirSalvando(true);
    mostrarFeedback(`Gerando novamente o PDF da versão ${edicao.versao}…`);
    try {
      await gerarPdfRelatorio("download");
      mostrarFeedback(`PDF da versão ${edicao.versao} gerado novamente. Abra o arquivo baixado para imprimir.`, "success");
    } catch (error) {
      mostrarFeedback(mensagemErro(error), "error");
    } finally {
      definirSalvando(false);
    }
  }

  function nomeArquivoPdf() {
    const projeto = origemAtual().projeto || projetoAtual();
    const nome = texto(projeto?.nome || "Projeto da Qualidade")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "Projeto-da-Qualidade";
    const versao = estado.edicaoVisualizada?.versao
      ? `-V${estado.edicaoVisualizada.versao}`
      : "-PREVIA";
    return `Relatorio-${nome}${versao}.pdf`;
  }

  function imprimirRelatorioFallback() {
    atualizarPreview();
    const projeto = origemAtual().projeto || projetoAtual();
    const tituloAnterior = document.title;
    document.title = `Relatorio - ${texto(projeto?.nome || "Projeto da Qualidade")}`;
    const restaurar = () => {
      document.title = tituloAnterior;
      window.removeEventListener("afterprint", restaurar);
    };
    window.addEventListener("afterprint", restaurar);
    window.print();
  }

  async function gerarPdfRelatorio(modo = "preview") {
    atualizarPreview();
    const nome = nomeArquivoPdf();

    const html2canvas = window.html2canvas;
    const JsPDF = window.jspdf?.jsPDF;
    if (!html2canvas || !JsPDF || !window.biProjetosPdf) {
      imprimirRelatorioFallback();
      throw new Error("Gerador direto de PDF não carregado. Foi aberta a impressão do navegador como alternativa.");
    }

    const janelaPreview = modo === "preview" ? window.open("", "_blank") : null;
    if (janelaPreview) {
      janelaPreview.opener = null;
      janelaPreview.document.title = "Gerando PDF…";
      janelaPreview.document.body.style.fontFamily = "Arial, sans-serif";
      janelaPreview.document.body.style.padding = "24px";
      janelaPreview.document.body.textContent = "Gerando a prévia do PDF…";
    }

    const origem = $("reportDocument");
    if (!origem) throw new Error("Documento do relatório não localizado.");
    await hidratarMiniaturasRelatorio(origem);

    const suporte = document.createElement("div");
    suporte.className = "pdf-export-stage";
    suporte.setAttribute("aria-hidden", "true");

    const clone = origem.cloneNode(true);
    clone.removeAttribute("id");
    clone.classList.add("pdf-export-document");
    clone.querySelectorAll("button.evidence-open-file").forEach((botao) => {
      const span = document.createElement("span");
      span.textContent = botao.dataset.fileName
        ? `Arquivo: ${botao.dataset.fileName}`
        : "Arquivo anexado";
      botao.replaceWith(span);
    });

    suporte.appendChild(clone);
    document.body.appendChild(suporte);

    try {
      if (document.fonts?.ready) await document.fonts.ready;
      await hidratarMiniaturasRelatorio(clone);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const canvas = await html2canvas(clone, {
        scale: 1.6,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
        allowTaint: false,
        // Medição e captura precisam usar o mesmo viewport; alterar aqui a
        // largura mudava as regras responsivas e deslocava as linhas no PDF.
        windowWidth: window.innerWidth,
      });

      if (!canvas.width || !canvas.height) throw new Error("O relatório ficou vazio durante a geração do PDF.");

      const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const margemX = 10;
      const margemY = 10;
      const larguraUtil = 210 - (margemX * 2);
      const alturaUtil = 297 - (margemY * 2) - 6;
      const alturaPaginaPx = Math.max(1, Math.floor(canvas.width * (alturaUtil / larguraUtil)));
      const reservaContinuacao = clone.classList.contains("report-release") ? Math.floor(canvas.width * (16 / larguraUtil)) : 0;
      const tituloRelease = texto(clone.querySelector(".report-cover h1")?.textContent || "Projeto da Qualidade");
      let imagemContinuacao = null;
      if (reservaContinuacao) {
        const cabecalho = document.createElement("header");
        cabecalho.className = "release-continuation-header";
        cabecalho.innerHTML = `<div><span>Release de projeto</span><strong>${escapar(tituloRelease)}</strong></div><span class="release-wordmark"><span>sintechtica</span> <b>ânima</b></span>`;
        suporte.appendChild(cabecalho);
        const captura = await html2canvas(cabecalho, { scale: 1.6, backgroundColor: "#ffffff", logging: false, windowWidth: window.innerWidth });
        imagemContinuacao = captura.toDataURL("image/png");
        cabecalho.remove();
      }
      const paginas = window.biProjetosPdf.paginar(clone, canvas, alturaPaginaPx, 1.6, reservaContinuacao);

      paginas.forEach((pagina, indice) => {
        const alturaConteudo = pagina.fim - pagina.inicio;
        const alturaFatia = alturaConteudo + pagina.alturaCabecalho;
        const fatia = document.createElement("canvas");
        fatia.width = canvas.width;
        fatia.height = alturaFatia;
        const ctx = fatia.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, fatia.width, fatia.height);
        if (pagina.cabecalho) {
          ctx.drawImage(canvas, 0, pagina.cabecalho.inicio, canvas.width, pagina.alturaCabecalho, 0, 0, canvas.width, pagina.alturaCabecalho);
        }
        ctx.drawImage(canvas, 0, pagina.inicio, canvas.width, alturaConteudo, 0, pagina.alturaCabecalho, canvas.width, alturaConteudo);

        if (indice > 0) doc.addPage("a4", "portrait");
        if (pagina.alturaContinuacao && imagemContinuacao) {
          doc.addImage(imagemContinuacao, "PNG", margemX, margemY, larguraUtil, (pagina.alturaContinuacao / canvas.width) * larguraUtil);
        }
        const alturaMm = (alturaFatia / canvas.width) * larguraUtil;
        const topoMm = margemY + ((pagina.alturaContinuacao || 0) / canvas.width) * larguraUtil;
        doc.addImage(fatia.toDataURL("image/jpeg", 0.94), "JPEG", margemX, topoMm, larguraUtil, alturaMm, undefined, "FAST");

      });

      window.biProjetosPdf.links(clone, paginas).forEach((link) => {
        doc.setPage(link.pagina);
        doc.link(
          margemX + (link.x / canvas.width) * larguraUtil,
          margemY + (link.y / canvas.width) * larguraUtil,
          Math.max(1, (link.largura / canvas.width) * larguraUtil),
          Math.max(1, (link.altura / canvas.width) * larguraUtil),
          { url: link.url },
        );
      });

      const totalPaginas = doc.getNumberOfPages();
      for (let i = 1; i <= totalPaginas; i += 1) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(110, 98, 120);
        doc.text(`Página ${i} de ${totalPaginas}`, 200, 292, { align: "right" });
      }

      if (modo === "download") {
        doc.save(nome);
      } else {
        const blob = doc.output("blob");
        const url = URL.createObjectURL(blob);
        if (janelaPreview) janelaPreview.location.replace(url);
        else window.open(url, "_blank");
        window.setTimeout(() => URL.revokeObjectURL(url), 120000);
      }
    } catch (error) {
      if (janelaPreview) janelaPreview.close();
      throw error;
    } finally {
      suporte.remove();
    }
  }

  function ligarEventos() {
    $("logoutButton").addEventListener("click", window.sairBI);
    $("retryButton").addEventListener("click", carregarDados);
    $("responsibleFilter").addEventListener("input", () => {
      filtrarProjetos();
      abrirMenuResponsaveis();
    });
    $("responsibleFilter").addEventListener("focus", abrirMenuResponsaveis);
    $("responsibleFilter").addEventListener("keydown", (evento) => {
      if (evento.key === "Escape") fecharMenuResponsaveis();
      if (evento.key === "ArrowDown") {
        evento.preventDefault();
        abrirMenuResponsaveis();
        $("responsibleMenu").querySelector("button")?.focus();
      }
    });
    $("responsibleMenuButton").addEventListener("click", () => {
      if ($("responsibleMenu").hidden) abrirMenuResponsaveis();
      else fecharMenuResponsaveis();
    });
    $("responsibleMenu").addEventListener("click", (evento) => {
      const opcao = evento.target.closest("[data-responsible]");
      if (!opcao) return;
      $("responsibleFilter").value = opcao.dataset.responsible;
      fecharMenuResponsaveis();
      filtrarProjetos();
    });
    $("statusFilter").addEventListener("change", filtrarProjetos);
    $("projectFilter").addEventListener("input", filtrarProjetos);
    $("clearFiltersButton").addEventListener("click", () => {
      $("responsibleFilter").value = "";
      $("statusFilter").value = "";
      $("projectFilter").value = "";
      filtrarProjetos();
      fecharMenuResponsaveis();
    });
    $("loadNqIndicatorsButton")?.addEventListener("click", carregarSnapshotNQ);
    $("nqSnapshotSituacao")?.addEventListener("change", () => {
      const status = $("nqSnapshotStatus");
      if (status && nqSnapshotValido(estado.indicadoresNQAtual)) {
        status.className = "nq-snapshot-status";
        status.textContent = "Filtro alterado. Clique em “Atualizar indicadores do NQ” para capturar uma nova fotografia.";
      }
    });
    $("addEvidenceButton").addEventListener("click", () => {
      adicionarEvidencia();
      atualizarPreview();
    });
    $("attachEvidenceButton")?.addEventListener("click", () => {
      if (!$("evidenceList").children.length) adicionarEvidencia();
      const ultimaLinha = $("evidenceList").lastElementChild;
      const inputArquivo = ultimaLinha?.querySelector("[data-evidence-file]");
      document.querySelector(".evidence-fieldset")?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => inputArquivo?.click(), 350);
    });
    $("attachSpreadsheetButton")?.addEventListener("click", () => {
      if (estado.salvando || estado.edicaoVisualizada) return;
      adicionarEvidencia({tipo: "Planilha"});
      const linha = $("evidenceList").lastElementChild;
      const input = linha?.querySelector("[data-evidence-file]");
      if (input) {
        input.accept = ".xlsx,.xls,.csv,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/vnd.oasis.opendocument.spreadsheet";
        input.click();
      }
      document.querySelector(".evidence-fieldset")?.scrollIntoView({behavior: "smooth", block: "center"});
      atualizarPreview();
    });
    Object.values(campos).forEach((id) => $(id).addEventListener("input", atualizarPreview));
    $("saveDraftButton").addEventListener("click", () => salvarNovaVersao("rascunho"));
    $("reviewButton").addEventListener("click", acaoEnviarRevisao);
    $("finalizeButton").addEventListener("click", acaoFinalizarRevisao);
    $("printDraftButton").addEventListener("click", () => gerarPdfRelatorio("preview").catch((e) => mostrarFeedback(mensagemErro(e), "warning")));
    $("reportDocument").addEventListener("click", (evento) => {
      const botao = evento.target.closest(".evidence-open-file");
      if (!botao) return;
      abrirArquivoArmazenado(botao.dataset.storagePath, botao.dataset.fileName);
    });
    document.addEventListener("click", (evento) => {
      if (!evento.target.closest(".responsible-combobox")) fecharMenuResponsaveis();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    ligarEventos();
    carregarDados();
  });
})();
