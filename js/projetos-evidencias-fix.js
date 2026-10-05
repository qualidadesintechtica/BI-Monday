(function () {
  "use strict";

  const BUCKET = "pq-evidencias";
  const MODAL_ID = "pqEvidenceViewerModal";
  const BODY_ID = "pqEvidenceViewerBody";
  const TITLE_ID = "pqEvidenceViewerTitle";
  const DEEP_PATH = "pq_evidence_path";
  const DEEP_NAME = "pq_evidence_name";
  const DEEP_TYPE = "pq_evidence_type";

  const texto = (valor) => String(valor ?? "").trim();

  function escapar(valor) {
    return String(valor ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function extensao(nome) {
    const valor = texto(nome).toLowerCase();
    const partes = valor.split(".");
    return partes.length > 1 ? partes.pop() : "";
  }

  function tipoArquivo(nome, tipoInformado = "") {
    const ext = extensao(nome);
    const t = texto(tipoInformado).toLowerCase();
    if (ext === "pdf" || t === "pdf" || t.includes("application/pdf")) return "PDF";
    if (["jpg", "jpeg", "png", "webp"].includes(ext) || t === "imagem" || t.startsWith("image/")) return "Imagem";
    if (["doc", "docx"].includes(ext) || t === "documento" || t.includes("word")) return "Documento";
    return texto(tipoInformado) || "Arquivo";
  }

  function normalizarEvidencias(valor) {
    if (Array.isArray(valor)) return valor;
    if (valor && typeof valor === "object") {
      if (Array.isArray(valor.evidencias)) return valor.evidencias;
      return [];
    }
    if (typeof valor === "string" && valor.trim()) {
      try {
        const parsed = JSON.parse(valor);
        return normalizarEvidencias(parsed);
      } catch {
        return [];
      }
    }
    return [];
  }

  function garantirModal() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.className = "pq-evidence-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="pq-evidence-modal-backdrop" data-pq-evidence-close></div>
      <section class="pq-evidence-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="${TITLE_ID}">
        <header class="pq-evidence-modal-header">
          <div>
            <span class="pq-evidence-modal-eyebrow">Projeto Qualidade</span>
            <h2 id="${TITLE_ID}">Evidências</h2>
          </div>
          <button class="pq-evidence-modal-close" type="button" data-pq-evidence-close aria-label="Fechar">×</button>
        </header>
        <div id="${BODY_ID}" class="pq-evidence-modal-body"></div>
      </section>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (evento) => {
      if (evento.target.closest("[data-pq-evidence-close]")) fecharModal();
    });
    document.addEventListener("keydown", (evento) => {
      if (evento.key === "Escape" && !modal.hidden) fecharModal();
    });
    return modal;
  }

  function abrirModal(titulo = "Evidências") {
    const modal = garantirModal();
    const title = document.getElementById(TITLE_ID);
    if (title) title.textContent = titulo;
    modal.hidden = false;
    document.body.classList.add("pq-evidence-modal-open");
    return document.getElementById(BODY_ID);
  }

  function fecharModal() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) modal.hidden = true;
    document.body.classList.remove("pq-evidence-modal-open");
  }

  async function esperarSupabase(limiteMs = 12000) {
    const inicio = Date.now();
    while (!window.biSupabase) {
      if (Date.now() - inicio > limiteMs) {
        throw new Error("A conexão com o Supabase ainda não está disponível.");
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    return window.biSupabase;
  }

  async function criarUrlAssinada(caminho, segundos = 900) {
    const path = texto(caminho);
    if (!path) throw new Error("O caminho do arquivo não foi registrado nesta evidência.");
    const supabase = await esperarSupabase();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, segundos);
    if (error) throw new Error(error.message || String(error));
    if (!data?.signedUrl) throw new Error("O Supabase não retornou o acesso temporário ao arquivo.");
    return data.signedUrl;
  }

  function mensagemErro(error) {
    return texto(error?.message || error) || "Não foi possível abrir a evidência.";
  }

  async function mostrarArquivo(caminho, nome = "", tipo = "") {
    const body = abrirModal(nome || "Visualizar evidência");
    body.innerHTML = `<div class="pq-evidence-loading">Gerando acesso seguro à evidência…</div>`;

    try {
      const url = await criarUrlAssinada(caminho);
      const arquivoTipo = tipoArquivo(nome, tipo);
      const cabecalho = `
        <div class="pq-evidence-file-toolbar">
          <div>
            <strong>${escapar(nome || "Arquivo anexado")}</strong>
            <small>${escapar(arquivoTipo)} · acesso temporário autenticado</small>
          </div>
          <a class="pq-evidence-open-new" href="${escapar(url)}" target="_blank" rel="noopener noreferrer">
            Abrir em nova guia
          </a>
        </div>
      `;

      if (arquivoTipo === "PDF") {
        body.innerHTML = `${cabecalho}
          <iframe class="pq-evidence-pdf-frame" src="${escapar(url)}" title="${escapar(nome || "Evidência PDF")}"></iframe>`;
        return;
      }

      if (arquivoTipo === "Imagem") {
        body.innerHTML = `${cabecalho}
          <div class="pq-evidence-image-stage">
            <img src="${escapar(url)}" alt="${escapar(nome || "Evidência")}">
          </div>`;
        return;
      }

      body.innerHTML = `${cabecalho}
        <div class="pq-evidence-generic-file">
          <strong>O navegador não possui pré-visualização interna para este tipo de arquivo.</strong>
          <p>Use “Abrir em nova guia” para visualizar ou baixar a evidência.</p>
        </div>`;
    } catch (error) {
      body.innerHTML = `
        <div class="pq-evidence-error">
          <strong>Não foi possível abrir esta evidência.</strong>
          <p>${escapar(mensagemErro(error))}</p>
        </div>`;
    }
  }

  function urlEstavelEvidencia(caminho, nome = "", tipo = "") {
    const url = new URL(window.location.href);
    url.hash = "";
    url.search = "";
    url.searchParams.set(DEEP_PATH, texto(caminho));
    if (nome) url.searchParams.set(DEEP_NAME, texto(nome));
    if (tipo) url.searchParams.set(DEEP_TYPE, texto(tipo));
    return url.toString();
  }

  function reforcarLinksRelatorio() {
    const relatorio = document.getElementById("reportDocument");
    if (!relatorio) return;

    relatorio.querySelectorAll(".report-evidence-file").forEach((bloco) => {
      const botao = bloco.querySelector(".evidence-open-file[data-storage-path]");
      if (!botao) return;

      botao.disabled = false;
      botao.removeAttribute("aria-disabled");
      botao.style.pointerEvents = "auto";

      let link = bloco.querySelector(".pq-evidence-stable-link");
      const caminho = texto(botao.dataset.storagePath);
      const nome = texto(botao.dataset.fileName);
      if (!caminho) return;

      if (!link) {
        link = document.createElement("a");
        link.className = "report-evidence-external-link pq-evidence-stable-link";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        bloco.appendChild(link);
      }

      const tipo = tipoArquivo(nome);
      const hrefDesejado = urlEstavelEvidencia(caminho, nome, tipo);
      const textoDesejado = tipo === "PDF" ? "Abrir PDF" : "Abrir evidência";
      const tituloDesejado = "Abre a evidência no DataHub com acesso autenticado.";

      // IMPORTANTE: só altera o DOM quando o valor realmente mudou.
      // A versão anterior reatribuía textContent em toda execução e o
      // MutationObserver entrava em loop, congelando projetos.html.
      if (link.getAttribute("href") !== hrefDesejado) {
        link.setAttribute("href", hrefDesejado);
      }
      if (link.textContent !== textoDesejado) {
        link.textContent = textoDesejado;
      }
      if (link.getAttribute("title") !== tituloDesejado) {
        link.setAttribute("title", tituloDesejado);
      }
    });
  }

  async function buscarEvidenciasEdicao(edicaoId) {
    const supabase = await esperarSupabase();
    const { data, error } = await supabase
      .from("pq_projetos_edicoes")
      .select("id,versao,evidencias")
      .eq("id", edicaoId)
      .single();
    if (error) throw new Error(error.message || String(error));
    return {
      versao: data?.versao,
      evidencias: normalizarEvidencias(data?.evidencias),
    };
  }

  function cartaoEvidencia(item, indice) {
    const nome = texto(item?.arquivo_nome);
    const caminho = texto(item?.storage_path);
    const tipo = tipoArquivo(nome, item?.tipo || item?.mime_type);
    const urlExterna = /^https?:\/\//i.test(texto(item?.url)) ? texto(item.url) : "";
    const titulo = texto(item?.titulo) || `Evidência ${String(indice + 1).padStart(2, "0")}`;
    const descricao = texto(item?.descricao) || "Sem descrição.";

    return `
      <article class="pq-evidence-view-card">
        <header>
          <span>Evidência ${String(indice + 1).padStart(2, "0")}</span>
          <strong>${escapar(titulo)}</strong>
          <em>${escapar(tipo)}</em>
        </header>
        <p>${escapar(descricao)}</p>
        <div class="pq-evidence-view-actions">
          ${caminho ? `<button type="button"
            class="pq-evidence-view-file"
            data-storage-path="${escapar(caminho)}"
            data-file-name="${escapar(nome)}"
            data-file-type="${escapar(tipo)}">${tipo === "PDF" ? "Abrir PDF" : "Abrir arquivo"}</button>` : ""}
          ${urlExterna ? `<a href="${escapar(urlExterna)}" target="_blank" rel="noopener noreferrer">Abrir link externo</a>` : ""}
        </div>
        ${!caminho && !urlExterna ? '<small class="pq-evidence-no-file">Esta evidência não possui arquivo nem link registrado.</small>' : ""}
      </article>
    `;
  }

  async function abrirEvidenciasDaVersao(itemHistorico) {
    const edicaoId = texto(itemHistorico?.dataset?.editionId);
    if (!edicaoId) return;

    const body = abrirModal("Evidências da versão");
    body.innerHTML = `<div class="pq-evidence-loading">Carregando evidências da versão…</div>`;

    try {
      const dados = await buscarEvidenciasEdicao(edicaoId);
      const evidencias = dados.evidencias;
      document.getElementById(TITLE_ID).textContent = dados.versao
        ? `Evidências · Versão ${dados.versao}`
        : "Evidências da versão";

      if (!evidencias.length) {
        body.innerHTML = `
          <div class="pq-evidence-empty">
            <strong>Nenhuma evidência registrada nesta versão.</strong>
            <p>Se a versão for antiga, os anexos podem ter sido criados antes da estrutura atual de evidências.</p>
          </div>`;
        return;
      }

      body.innerHTML = `
        <div class="pq-evidence-view-list">
          ${evidencias.map(cartaoEvidencia).join("")}
        </div>`;
    } catch (error) {
      body.innerHTML = `
        <div class="pq-evidence-error">
          <strong>Não foi possível carregar as evidências.</strong>
          <p>${escapar(mensagemErro(error))}</p>
        </div>`;
    }
  }

  function reforcarHistorico() {
    const history = document.getElementById("historyList");
    if (!history) return;

    history.querySelectorAll(".history-item").forEach((item) => {
      const actions = item.querySelector(".history-actions");
      if (!actions || actions.querySelector(".pq-history-evidence-button")) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pq-history-evidence-button";
      btn.textContent = "Ver evidências";
      btn.addEventListener("click", (evento) => {
        evento.preventDefault();
        evento.stopPropagation();
        void abrirEvidenciasDaVersao(item);
      });
      actions.appendChild(btn);
    });
  }

  function ligarAberturaArquivo() {
    document.addEventListener("click", (evento) => {
      const botao = evento.target.closest(".evidence-open-file[data-storage-path]");
      if (!botao) return;

      evento.preventDefault();
      evento.stopImmediatePropagation();
      void mostrarArquivo(
        botao.dataset.storagePath,
        botao.dataset.fileName,
        tipoArquivo(botao.dataset.fileName),
      );
    }, true);

    document.addEventListener("click", (evento) => {
      const botao = evento.target.closest(".pq-evidence-view-file[data-storage-path]");
      if (!botao) return;
      evento.preventDefault();
      void mostrarArquivo(
        botao.dataset.storagePath,
        botao.dataset.fileName,
        botao.dataset.fileType,
      );
    });
  }

  function observarAtualizacoes() {
    let relatorioAgendado = false;
    let historicoAgendado = false;

    const relatorio = document.getElementById("reportDocument");
    if (relatorio) {
      const observerRelatorio = new MutationObserver(() => {
        if (relatorioAgendado) return;
        relatorioAgendado = true;
        window.requestAnimationFrame(() => {
          relatorioAgendado = false;
          reforcarLinksRelatorio();
        });
      });
      observerRelatorio.observe(relatorio, { childList: true, subtree: true });
    }

    const history = document.getElementById("historyList");
    if (history) {
      const observerHistory = new MutationObserver(() => {
        if (historicoAgendado) return;
        historicoAgendado = true;
        window.requestAnimationFrame(() => {
          historicoAgendado = false;
          reforcarHistorico();
        });
      });
      observerHistory.observe(history, { childList: true, subtree: true });
    }

    reforcarLinksRelatorio();
    reforcarHistorico();
  }

  async function abrirDeepLinkSeExistir() {
    const params = new URLSearchParams(window.location.search);
    const caminho = texto(params.get(DEEP_PATH));
    if (!caminho) return;
    const nome = texto(params.get(DEEP_NAME));
    const tipo = texto(params.get(DEEP_TYPE));
    await mostrarArquivo(caminho, nome, tipo);
  }

  function iniciar() {
    garantirModal();
    ligarAberturaArquivo();
    observarAtualizacoes();

    // Alguns blocos são renderizados somente após as consultas do Supabase.
    // Reforços curtos evitam depender da ordem interna de carregamento.
    [300, 900, 1800, 3500].forEach((ms) => {
      window.setTimeout(() => {
        reforcarLinksRelatorio();
        reforcarHistorico();
      }, ms);
    });

    void abrirDeepLinkSeExistir();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar, { once: true });
  } else {
    iniciar();
  }
})();
