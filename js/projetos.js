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
  const EXTENSOES_EVIDENCIA = new Set(["pdf", "doc", "docx", "jpg", "jpeg"]);
  const MIME_EVIDENCIA = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
      return "Formato não permitido. Use PDF, DOC, DOCX, JPG ou JPEG.";
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

  function mostrarFeedback(mensagem, tipo = "") {
    const alvo = $("feedbackMessage");
    alvo.textContent = mensagem;
    alvo.className = `feedback-message no-print${tipo ? ` ${tipo}` : ""}`;
    alvo.hidden = !mensagem;
  }

  function mensagemErro(error) {
    const bruto = texto(error?.message || error);
    if (/bucket.*not found|pq-evidencias.*not found/i.test(bruto)) {
      return "O armazenamento de evidências ainda não foi instalado. Execute docs/V25_39_ARMAZENAMENTO_EVIDENCIAS.sql no Supabase.";
    }
    if (/mime type|maximum allowed size|payload too large|entity too large/i.test(bruto)) {
      return "O arquivo foi recusado. Confirme o formato permitido e o limite de 20 MB.";
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
    $("selectedProjectTitle").textContent = projeto.nome || "Projeto da Qualidade";
    $("selectedProjectMeta").textContent = `ID ${projeto.azure_id || "—"} · ${projeto.status || "Sem status"}`;
    renderizarOrigem();
    renderizarHistorico();

    const ultima = edicoesAtuais()[0];
    if (ultima) {
      carregarCampos(ultima);
      $("editionBadge").textContent = `Baseada na versão ${ultima.versao}`;
    } else {
      limparCampos();
      $("contextField").value = projeto.contexto_objetivo_original || "";
      $("expectedField").value = projeto.resultados_esperados_original || "";
      $("achievedField").value = projeto.resultados_alcancados_original || "";
      $("impactField").value = projeto.impacto_original || "";
      $("editionBadge").textContent = "Primeira versão";
    }
    atualizarPreview();
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
    const projeto = {
      ...(projetoAtual() || {}),
      ...(origem.projeto || {})
    };
    const tarefasOrigem = Array.isArray(origem.tarefas) ? origem.tarefas : [];
    const tarefas = tarefasOrigem.length ? tarefasOrigem : tarefasAtuais();

    $("sourceMetadata").innerHTML = [
      metadado("ID", projeto.azure_id),
      metadado("Tipo", projeto.work_item_type),
      metadado("Status", projeto.status),
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
    $("evidenceList").innerHTML = "";
    const evidencias = Array.isArray(edicao?.evidencias) ? edicao.evidencias : [];
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

    // O tipo da evidência segue o arquivo real. Isso corrige versões antigas em
    // que, por exemplo, um PDF podia ter ficado salvo como "Imagem".
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
        atualizarPreview();
        return;
      }

      const erro = validarArquivoEvidencia(file);
      if (erro) {
        inputArquivo.value = "";
        atualizarStatusArquivo(linha, erro, "error");
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
      atualizarPreview();
    });
    linha.querySelector(".remove-evidence").addEventListener("click", () => {
      linha.remove();
      if (!$("evidenceList").children.length) adicionarEvidencia();
      atualizarPreview();
    });
    $("evidenceList").appendChild(fragmento);
  }

  function obterEvidencias() {
    return [...$("evidenceList").querySelectorAll(".evidence-row")]
      .map((linha) => {
        const evidencia = {};
        linha.querySelectorAll("[data-evidence]").forEach((entrada) => {
          evidencia[entrada.dataset.evidence] = texto(entrada.value);
        });
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
    }
  }

  function obterFormulario() {
    const dados = {};
    Object.entries(campos).forEach(([chave, id]) => { dados[chave] = texto($(id).value); });
    dados.evidencias = obterEvidencias();
    return dados;
  }

  function validarFinalizacao(dados) {
    const faltantes = [];
    if (!dados.contexto_objetivo) faltantes.push("Contexto e objetivo");
    if (!dados.resultados_esperados) faltantes.push("Resultados esperados");
    if (!dados.resultados_alcancados) faltantes.push("Resultados alcançados");
    if (!dados.impacto) faltantes.push("Impacto gerado");
    if (!dados.evidencias.some((item) => item.titulo && (urlSegura(item.url) || evidenciaComArquivo(item)))) {
      faltantes.push("Ao menos uma evidência com título e arquivo ou link http(s)");
    }
    return faltantes;
  }

  function atualizarChecklist(dados) {
    const itens = [
      ["Contexto e objetivo", Boolean(dados.contexto_objetivo)],
      ["Resultados esperados", Boolean(dados.resultados_esperados)],
      ["Resultados alcançados", Boolean(dados.resultados_alcancados)],
      ["Impacto gerado", Boolean(dados.impacto)],
      ["Evidência com título e arquivo ou link", dados.evidencias.some((e) => e.titulo && (urlSegura(e.url) || evidenciaComArquivo(e)))],
    ];
    $("completionChecklist").innerHTML = itens
      .map(([rotulo, pronto]) => `<li class="${pronto ? "done" : ""}">${escapar(rotulo)}</li>`)
      .join("");
  }

  function blocoTexto(titulo, conteudo) {
    const valor = texto(conteudo);
    return `
      <section class="report-section">
        <h2>${escapar(titulo)}</h2>
        <p class="${valor ? "" : "report-empty"}">${escapar(valor || "Não informado nesta versão.")}</p>
      </section>`;
  }

  function tabelaTarefas(tarefas) {
    if (!tarefas.length) return '<p class="report-empty">Nenhuma tarefa original vinculada.</p>';
    return `
      <table class="report-task-table">
        <thead><tr><th>ID</th><th>Ação original</th><th>Status</th><th>Período</th></tr></thead>
        <tbody>${tarefas.map((t) => `
          <tr>
            <td>${escapar(t.azure_id || "—")}</td>
            <td>${escapar(t.descricao || "—")}</td>
            <td>${escapar(t.status || "—")}</td>
            <td>${escapar(formatarData(t.data_inicio))} a ${escapar(formatarData(t.data_fim))}</td>
          </tr>`).join("")}</tbody>
      </table>`;
  }

  function tabelaEvidencias(evidencias) {
    const validas = evidencias.filter((item) => item.titulo || item.url || item.descricao || evidenciaComArquivo(item));
    if (!validas.length) return '<p class="report-empty">Nenhuma evidência registrada.</p>';
    return `
      <table class="report-evidence-table">
        <thead><tr><th>Evidência</th><th>Tipo</th><th>O que comprova</th><th>Link</th></tr></thead>
        <tbody>${validas.map((item) => {
          const url = urlSegura(item.url);
          const acesso = item.storage_path
            ? `<button type="button" class="evidence-open-file" data-storage-path="${escapar(item.storage_path)}" data-file-name="${escapar(item.arquivo_nome || item.titulo || "arquivo")}">Abrir arquivo</button>`
            : (url
              ? `<a href="${escapar(url)}" target="_blank" rel="noopener noreferrer">Abrir evidência</a>`
              : (item.arquivo_pendente ? "Será enviado ao salvar" : "—"));
          return `<tr>
            <td>${escapar(item.titulo || "—")}</td>
            <td>${escapar(item.tipo || "—")}</td>
            <td>${escapar(item.descricao || "—")}</td>
            <td>${acesso}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>`;
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
      ? `Versão ${edicao.versao} · ${edicao.status_edicao}`
      : `Prévia da próxima versão ${proximaVersao}`;
    const autor = edicao?.criado_por_email || estado.usuario?.email || "—";
    const emitidoEm = edicao?.criado_em ? formatarDataHora(edicao.criado_em) : formatarDataHora(new Date());

    $("reportDocument").innerHTML = `
      <header class="report-cover">
        <span class="report-brand">DataHub · Projetos da Qualidade</span>
        <h1>${escapar(projeto.nome || "Projeto da Qualidade")}</h1>
        <p class="report-subtitle">Relatório executivo de projeto</p>
        <span class="report-version">${escapar(versao)}</span>
      </header>
      ${faltantes.length ? `<div class="report-draft-warning">Rascunho · faltam: ${escapar(faltantes.join(", "))}.</div>` : ""}
      <div class="report-meta-grid">
        ${metadadoRelatorio("ID Ajure", projeto.azure_id)}
        ${metadadoRelatorio("Tipo", projeto.work_item_type)}
        ${metadadoRelatorio("Status", projeto.status)}
        ${metadadoRelatorio("Data inicial", formatarData(dataProjeto(projeto, "inicio")))}
        ${metadadoRelatorio("Data final", formatarData(dataProjeto(projeto, "fim")))}
        ${metadadoRelatorio("Sponsor original", limparNome(projeto.sponsor))}
        ${metadadoRelatorio("Sponsors identificados", Array.isArray(projeto.sponsor_lista) ? projeto.sponsor_lista.join(", ") : "")}
        ${metadadoRelatorio("Esforço", projeto.esforco)}
        ${metadadoRelatorio("Prioridade", projeto.prioridade)}
        ${metadadoRelatorio("Ações originais", tarefas.length)}
      </div>
      ${tabelaDadosDisponiveis(projeto.dados_origem)}
      ${blocoTexto("Contexto e objetivo", dados.contexto_objetivo)}
      ${blocoTexto("Resultados esperados", dados.resultados_esperados)}
      <section class="report-section"><h2>Ações e tarefas originais</h2>${tabelaTarefas(tarefas)}</section>
      ${blocoTexto("Novas ações e complementos", dados.acoes_complementares)}
      ${blocoTexto("Resultados alcançados", dados.resultados_alcancados)}
      ${blocoIndicadoresNQ(estado.indicadoresNQAtual)}
      ${blocoTexto("Impacto gerado", dados.impacto)}
      <section class="report-section"><h2>Evidências</h2>${tabelaEvidencias(dados.evidencias)}</section>
      ${dados.observacoes ? blocoTexto("Observações", dados.observacoes) : ""}
      <footer class="report-footer">
        <span>Versão registrada por ${escapar(autor)}</span>
        <span>Gerado em ${escapar(emitidoEm)}</span>
      </footer>`;

    atualizarChecklist(dados);
  }

  function metadadoRelatorio(rotulo, valor) {
    return `<div class="report-meta"><span>${escapar(rotulo)}</span><strong>${escapar(valor || "—")}</strong></div>`;
  }

  function renderizarHistorico() {
    const edicoes = edicoesAtuais();
    if (!edicoes.length) {
      $("historyList").innerHTML = '<p class="empty-copy">Ainda não existem versões salvas.</p>';
      return;
    }
    $("historyList").innerHTML = edicoes.map((edicao) => `
      <article class="history-item ${estado.edicaoVisualizada?.id === edicao.id ? "active" : ""}" data-edition-id="${escapar(edicao.id)}">
        <div class="history-item-head">
          <strong>Versão ${escapar(edicao.versao)}</strong>
          <span class="history-status ${escapar(edicao.status_edicao)}">${escapar(edicao.status_edicao)}</span>
        </div>
        ${nqSnapshotValido(edicao.indicadores_nq) ? '<small class="history-nq-badge">Snapshot NQ incluído</small>' : ''}
        <p>${escapar(formatarDataHora(edicao.criado_em))}<br>${escapar(edicao.criado_por_email)}</p>
        <div class="history-actions">
          <button type="button" data-action="view">Ver versão</button>
          <button type="button" data-action="base">Usar como base</button>
        </div>
      </article>`).join("");

    $("historyList").querySelectorAll(".history-item").forEach((item) => {
      const edicao = estado.edicoes.find((e) => e.id === item.dataset.editionId);
      item.querySelector('[data-action="view"]').addEventListener("click", () => visualizarEdicao(edicao));
      item.querySelector('[data-action="base"]').addEventListener("click", () => usarComoBase(edicao));
    });
  }

  function visualizarEdicao(edicao) {
    estado.edicaoVisualizada = edicao;
    estado.origemPreview = edicao.dados_origem || null;
    carregarCampos(edicao);
    $("editionBadge").textContent = `Visualizando versão ${edicao.versao} · salvar criará outra`;
    renderizarOrigem();
    renderizarHistorico();
    atualizarPreview();
    mostrarFeedback(`Versão ${edicao.versao} aberta. O registro original continua protegido.`, "success");
  }

  function usarComoBase(edicao) {
    estado.edicaoVisualizada = null;
    estado.origemPreview = null;
    carregarCampos(edicao);
    $("editionBadge").textContent = `Nova versão baseada na ${edicao.versao}`;
    renderizarOrigem();
    renderizarHistorico();
    atualizarPreview();
    mostrarFeedback(`Conteúdo da versão ${edicao.versao} carregado como base. Ao salvar, uma nova versão será criada.`, "success");
  }

  function definirSalvando(ativo) {
    estado.salvando = ativo;
    ["saveDraftButton", "finalizeButton"].forEach((id) => { $(id).disabled = ativo; });
    $("saveDraftButton").textContent = ativo ? "Salvando…" : "Salvar nova versão";
    $("finalizeButton").textContent = ativo ? "Salvando…" : "Finalizar versão e gerar PDF";
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

  async function salvar(finalizar) {
    if (!estado.projetoId || estado.salvando) return;
    let dados = obterFormulario();
    let faltantes = validarFinalizacao(dados);

    if (finalizar && faltantes.length) {
      mostrarFeedback(`Complete antes de finalizar: ${faltantes.join("; ")}.`, "warning");
      $("completionChecklist").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (finalizar && !window.confirm("Finalizar esta versão? Ela ficará registrada no histórico e não poderá ser sobrescrita. O status do projeto não será alterado.")) return;

    definirSalvando(true);
    mostrarFeedback(finalizar ? "Finalizando a versão…" : "Salvando uma nova versão…");
    try {
      await enviarArquivosPendentes();
      dados = obterFormulario();
      faltantes = validarFinalizacao(dados);
      if (finalizar && faltantes.length) {
        throw new Error(`Complete antes de finalizar: ${faltantes.join("; ")}.`);
      }

      const { data, error } = await window.biSupabase.rpc("pq_salvar_edicao", {
        p_projeto_id: estado.projetoId,
        p_contexto_objetivo: dados.contexto_objetivo || null,
        p_resultados_esperados: dados.resultados_esperados || null,
        p_acoes_complementares: dados.acoes_complementares || null,
        p_resultados_alcancados: dados.resultados_alcancados || null,
        p_impacto: dados.impacto || null,
        p_observacoes: dados.observacoes || null,
        p_evidencias: dados.evidencias.map(({ arquivo_pendente, ...evidencia }) => evidencia),
        p_finalizar: finalizar,
      });
      if (error) throw error;

      let avisoIndicadoresNQ = "";
      if (nqSnapshotValido(estado.indicadoresNQAtual)) {
        const { error: indicadoresError } = await window.biSupabase.rpc("pq_salvar_indicadores_nq", {
          p_edicao_id: data.id,
          p_indicadores: estado.indicadoresNQAtual,
        });
        if (indicadoresError) {
          console.error("Snapshot NQ não persistido:", indicadoresError);
          avisoIndicadoresNQ = " A versão foi salva, mas o snapshot do NQ não foi gravado. Execute docs/05_INDICADORES_NQ_RELATORIO_V25_46_39.sql no Supabase.";
        }
      }

      const { data: edicao, error: edicaoError } = await window.biSupabase
        .from("pq_projetos_edicoes")
        .select("*")
        .eq("id", data.id)
        .single();
      if (edicaoError) throw edicaoError;

      estado.edicoes.unshift(edicao);
      estado.edicaoVisualizada = edicao;
      estado.origemPreview = edicao.dados_origem;
      $("editionBadge").textContent = `Versão ${edicao.versao} · ${edicao.status_edicao}`;
      renderizarOrigem();
      renderizarHistorico();
      atualizarPreview();
      if (finalizar) {
        try {
          await gerarPdfRelatorio("download");
          mostrarFeedback(
            `Versão ${edicao.versao} finalizada e PDF gerado. O status do projeto permanece “${texto(projetoAtual()?.status || "não informado")}”.${avisoIndicadoresNQ}`,
            "success",
          );
        } catch (pdfError) {
          console.error("PDF do Projeto Qualidade:", pdfError);
          mostrarFeedback(
            `Versão ${edicao.versao} finalizada com sucesso, mas o PDF não pôde ser gerado: ${mensagemErro(pdfError)}`,
            "warning",
          );
        }
      } else {
        mostrarFeedback(`Versão ${edicao.versao} salva como rascunho com sucesso.${avisoIndicadoresNQ}`, avisoIndicadoresNQ ? "warning" : "success");
      }
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

    const html2canvas = window.html2canvas;
    const JsPDF = window.jspdf?.jsPDF;
    if (!html2canvas || !JsPDF) {
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

    const suporte = document.createElement("div");
    suporte.className = "pdf-export-stage";
    suporte.setAttribute("aria-hidden", "true");

    const clone = origem.cloneNode(true);
    clone.removeAttribute("id");
    clone.classList.add("pdf-export-document");
    clone.querySelectorAll(".evidence-open-file").forEach((botao) => {
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
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const canvas = await html2canvas(clone, {
        scale: 1.6,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
        allowTaint: false,
        windowWidth: 840,
      });

      if (!canvas.width || !canvas.height) throw new Error("O relatório ficou vazio durante a geração do PDF.");

      const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const margemX = 10;
      const margemY = 10;
      const larguraUtil = 210 - (margemX * 2);
      const alturaUtil = 297 - (margemY * 2) - 6;
      const alturaPaginaPx = Math.max(1, Math.floor(canvas.width * (alturaUtil / larguraUtil)));

      let y = 0;
      let pagina = 0;
      while (y < canvas.height) {
        const alturaFatia = Math.min(alturaPaginaPx, canvas.height - y);
        const fatia = document.createElement("canvas");
        fatia.width = canvas.width;
        fatia.height = alturaFatia;
        const ctx = fatia.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, fatia.width, fatia.height);
        ctx.drawImage(canvas, 0, y, canvas.width, alturaFatia, 0, 0, canvas.width, alturaFatia);

        if (pagina > 0) doc.addPage("a4", "portrait");
        const alturaMm = (alturaFatia / canvas.width) * larguraUtil;
        doc.addImage(fatia.toDataURL("image/jpeg", 0.94), "JPEG", margemX, margemY, larguraUtil, alturaMm, undefined, "FAST");

        pagina += 1;
        y += alturaFatia;
      }

      const totalPaginas = doc.getNumberOfPages();
      for (let i = 1; i <= totalPaginas; i += 1) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(110, 98, 120);
        doc.text(`Página ${i} de ${totalPaginas}`, 200, 292, { align: "right" });
      }

      const nome = nomeArquivoPdf();
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
    Object.values(campos).forEach((id) => $(id).addEventListener("input", atualizarPreview));
    $("saveDraftButton").addEventListener("click", () => salvar(false));
    $("finalizeButton").addEventListener("click", () => salvar(true));
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
