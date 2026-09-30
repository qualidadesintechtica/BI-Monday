(function () {
  "use strict";

  // ============================================================
  // CERTIFICADOS V25.46.20
  // Universo oficial da aba: UAs das quatro matrizes abaixo.
  // A UA NÃO desaparece quando não encontra revisor.
  // ============================================================

  let base = [];
  let filtrados = [];
  let revisoresOficiaisPorUc = new Map();
  let historico = new Set();
  let inicializado = false;

  const MATRIZES_ALVO = new Set([
    "e2a lato sensu",
    "e2a mandala express",
    "e2a mandala realize",
    "e2a radial"
  ]);

  const $ = (id) => document.getElementById(id);
  const txt = (v) => String(v ?? "").trim();

  const norm = (v) =>
    txt(v)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  function normMatriz(v) {
    return norm(v)
      .replace(/[()]/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function matrizAlvo(item) {
    return MATRIZES_ALVO.has(normMatriz(item?.matriz_oferta));
  }

  // Mesma regra usada no Resumo Executivo para identificar UAs.
  function ehUA(item) {
    return (
      item?.eh_ua === true ||
      norm(item?.categoria_material) === "unidade de aprendizagem"
    );
  }

  // Mesma lógica de consolidação do Resumo Executivo.
  function chaveMaterial(item, indice) {
    if (txt(item?.chave_material)) return txt(item.chave_material);
    if (txt(item?.chave_ua)) return txt(item.chave_ua);

    const idTitulo = txt(item?.id_titulo);
    const idUa = txt(item?.id_ua);
    const categoria = txt(item?.categoria_material);

    if (idTitulo || idUa || categoria) {
      return [
        idTitulo,
        idUa,
        categoria,
        txt(item?.monday_item_esteira || item?.monday_item_validacao || indice)
      ].join("|");
    }

    return `linha:${indice}`;
  }

  function chaveUC(valor) {
    return norm(valor)
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const esc = (s) =>
    txt(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[m]);

  function emailDoTexto(v) {
    const m = txt(v).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return m ? m[0].toLowerCase() : "";
  }

  function emailValido(v) {
    return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(txt(v));
  }

  function estaValidada(item) {
    return item?.eh_validada === true || norm(item?.status_validacao) === "validado";
  }

  function candidatosUc(x) {
    return [
      x?.titulo_uc,
      x?.nome_uc,
      x?.unidade_curricular,
      x?.uc,
      x?.titulo,
      x?.id_titulo
    ]
      .map(txt)
      .filter(Boolean);
  }

  function revisoresDaUC(valor) {
    const ucNormalizada = chaveUC(valor);
    if (!ucNormalizada) return [];

    const exatos = revisoresOficiaisPorUc.get(ucNormalizada);
    if (exatos?.length) return exatos;

    const candidatos = [];

    for (const [ucBase, lista] of revisoresOficiaisPorUc.entries()) {
      if (ucNormalizada.includes(ucBase) || ucBase.includes(ucNormalizada)) {
        candidatos.push([ucBase, lista]);
      }
    }

    // Só usa aproximação quando existe UMA única UC possível.
    if (candidatos.length === 1) return candidatos[0][1];
    return [];
  }

  function revisoresDaUa(x) {
    for (const candidato of candidatosUc(x)) {
      const encontrados = revisoresDaUC(candidato);
      if (encontrados?.length) return encontrados;
    }
    return [];
  }

  async function carregarRevisoresOficiais() {
    revisoresOficiaisPorUc = new Map();

    const { data, error } = await window.biSupabase
      .from("revisores_ua")
      .select("nq_responsavel,docente_revisor,email,uc,ativo")
      .eq("ativo", true);

    if (error) {
      throw new Error(`Não foi possível carregar revisores_ua: ${error.message}`);
    }

    (data || []).forEach((r) => {
      const uc = chaveUC(r.uc);
      const revisor = txt(r.docente_revisor);
      if (!uc || !revisor) return;

      if (!revisoresOficiaisPorUc.has(uc)) {
        revisoresOficiaisPorUc.set(uc, []);
      }

      revisoresOficiaisPorUc.get(uc).push({
        revisor,
        email: emailDoTexto(r.email),
        nqResponsavel: txt(r.nq_responsavel),
        uc: txt(r.uc)
      });
    });

    console.info(
      `Certificados: base oficial carregada (${data?.length || 0} vínculos / ${revisoresOficiaisPorUc.size} UCs).`
    );
  }

  async function carregarHistorico() {
    try {
      const { data, error } = await window.biSupabase
        .from("certificados_envios")
        .select("chave_certificado,status")
        .eq("status", "enviado");

      if (error) throw error;

      historico = new Set((data || []).map((x) => x.chave_certificado));
    } catch (e) {
      console.warn("Histórico de certificados ainda não instalado.", e);
    }
  }

  function tituloDaUa(x) {
    const candidatos = candidatosUc(x);
    return txt(candidatos[0] || x?.titulo || x?.id_titulo);
  }

  function nomeDaUa(x) {
    return txt(
      x?.titulo_ua ||
      x?.item_name ||
      x?.nome_ua ||
      x?.unidade_material ||
      x?.id_ua
    );
  }

  function chaveCertificado(ua, oficial) {
    return [
      ua.idEnvio || ua.chaveUa,
      norm(oficial.revisor),
      norm(ua.name),
      norm(ua.titulo),
      norm(ua.semestre)
    ].join("|");
  }

  function registroCertificado(ua, oficial) {
    return {
      revisor: oficial.revisor,
      email: oficial.email || "",
      name: ua.name,
      titulo: oficial.uc || ua.titulo,
      semestre: ua.semestre,
      nqResponsavel: oficial.nqResponsavel || "",
      chave: chaveCertificado(ua, oficial)
    };
  }

  function certificadosDaUa(ua) {
    if (!ua.validado || !ua.revisores.length) return [];
    return ua.revisores.map((oficial) => registroCertificado(ua, oficial));
  }

  function estadoCertificado(ua) {
    if (!ua.validado) return "Aguardando validação";
    if (!ua.revisores.length) return "Sem revisor";

    const certs = certificadosDaUa(ua);
    const enviados = certs.filter((r) => historico.has(r.chave)).length;

    if (enviados === certs.length && certs.length) return "Enviado";
    if (enviados > 0) return "Parcial";
    return "Pendente";
  }

  // ============================================================
  // MONTA O UNIVERSO DAS UAs
  // ============================================================

  function montar(dados) {
    const mapa = new Map();

    (dados || []).forEach((item, indice) => {
      if (!matrizAlvo(item)) return;
      if (!ehUA(item)) return;

      const chaveUa = chaveMaterial(item, indice);
      if (mapa.has(chaveUa)) return;

      const titulo = tituloDaUa(item);
      const name = nomeDaUa(item);
      const revisores = revisoresDaUa(item).map((r) => ({ ...r }));

      mapa.set(chaveUa, {
        chaveUa,
        idEnvio: txt(item?.monday_item_validacao || item?.monday_item_id || chaveUa),
        name,
        titulo,
        matriz: txt(item?.matriz_oferta),
        semestre: txt(item?.semestre_oferta),
        statusValidacao: txt(item?.status_validacao),
        validado: estaValidada(item),
        revisores,
        origem: item
      });
    });

    base = [...mapa.values()].sort((a, b) => {
      const matriz = a.matriz.localeCompare(b.matriz, "pt-BR");
      if (matriz !== 0) return matriz;
      const titulo = a.titulo.localeCompare(b.titulo, "pt-BR");
      if (titulo !== 0) return titulo;
      return a.name.localeCompare(b.name, "pt-BR");
    });

    const comRevisor = base.filter((x) => x.revisores.length > 0).length;
    const semRevisor = base.length - comRevisor;
    const certificadosGeraveis = base.reduce(
      (total, ua) => total + certificadosDaUa(ua).length,
      0
    );
    const validadas = base.filter((x) => x.validado).length;

    window.__BI_CERT_DIAGNOSTICO = {
      totalUAs: base.length,
      validadas,
      comRevisor,
      semRevisor,
      certificadosGeraveis,
      matrizes: [...MATRIZES_ALVO]
    };

    console.info("[Certificados] Universo das quatro matrizes:", {
      totalUAs: base.length,
      validadas,
      comRevisor,
      semRevisor,
      certificadosGeraveis
    });

    const semCorrespondencia = base
      .filter((x) => !x.revisores.length)
      .map((x) => ({ matriz: x.matriz, titulo: x.titulo, ua: x.name }));

    if (semCorrespondencia.length) {
      console.warn(
        `[Certificados] ${semCorrespondencia.length} UA(s) sem revisor na Base Oficial:`,
        semCorrespondencia
      );
    }
  }

  // ============================================================
  // FILTROS E KPIs
  // ============================================================

  function popular() {
    const sem = $("certSemestre");
    const rev = $("certRevisor");
    if (!sem || !rev) return;

    const semestreAtual = sem.value;
    const revisorAtual = rev.value;

    const semestres = [...new Set(base.map((x) => x.semestre).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pt-BR"));

    sem.innerHTML =
      '<option value="">Todos os semestres</option>' +
      semestres.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");

    const revisores = [...new Set(
      base.flatMap((ua) => ua.revisores.map((r) => r.revisor)).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, "pt-BR"));

    rev.innerHTML =
      '<option value="">Todos os revisores</option>' +
      '<option value="__sem_revisor__">Sem revisor na Base Oficial</option>' +
      revisores.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");

    if (semestres.includes(semestreAtual)) sem.value = semestreAtual;
    if (revisorAtual === "__sem_revisor__" || revisores.includes(revisorAtual)) {
      rev.value = revisorAtual;
    }
  }

  function atualizarKPIs() {
    const comRevisor = base.filter((x) => x.revisores.length > 0).length;
    const semRevisor = base.length - comRevisor;
    const geraveis = base.reduce((n, ua) => n + certificadosDaUa(ua).length, 0);

    if ($("certTotalUAs")) $("certTotalUAs").textContent = base.length;
    if ($("certComRevisor")) $("certComRevisor").textContent = comRevisor;
    if ($("certSemRevisor")) $("certSemRevisor").textContent = semRevisor;
    if ($("certGeraveis")) $("certGeraveis").textContent = geraveis;
  }

  function render() {
    const sem = $("certSemestre")?.value || "";
    const rev = $("certRevisor")?.value || "";
    const q = norm($("certBusca")?.value || "");

    filtrados = base.filter((ua) => {
      if (sem && ua.semestre !== sem) return false;

      if (rev === "__sem_revisor__" && ua.revisores.length) return false;
      if (
        rev &&
        rev !== "__sem_revisor__" &&
        !ua.revisores.some((r) => r.revisor === rev)
      ) return false;

      if (q) {
        const texto = norm([
          ua.name,
          ua.titulo,
          ua.matriz,
          ua.semestre,
          ua.statusValidacao,
          ...ua.revisores.flatMap((r) => [r.revisor, r.email])
        ].join(" "));
        if (!texto.includes(q)) return false;
      }

      return true;
    });

    atualizarKPIs();

    const tb = $("certTbody");
    if (!tb) return;

    if (!filtrados.length) {
      tb.innerHTML = `
        <tr>
          <td colspan="9" class="empty-table">Nenhuma UA encontrada.</td>
        </tr>`;
      atualizarSel();
      return;
    }

    tb.innerHTML = filtrados.map((ua, i) => {
      const podeGerar = ua.validado && ua.revisores.length > 0;

      const revisoresHtml = ua.revisores.length
        ? ua.revisores.map((r) => `<div>${esc(r.revisor)}</div>`).join("")
        : '<div class="cert-email-missing">Não localizado na Base Oficial</div>';

      const emailsHtml = ua.revisores.length
        ? ua.revisores.map((r, ri) => {
            if (r.email) {
              return `<div>${esc(r.email)}${r.emailManual ? '<div class="cert-email-manual-tag">Informado manualmente</div>' : ''}</div>`;
            }

            return `
              <div class="cert-email-missing">Não localizado</div>
              <input
                type="email"
                class="cert-email-manual"
                data-i="${i}"
                data-ri="${ri}"
                placeholder="Digite o e-mail de ${esc(r.revisor)}"
                autocomplete="off"
                aria-label="E-mail manual de ${esc(r.revisor)}"
              >
              <div class="cert-email-manual-msg" data-email-msg="${i}-${ri}"></div>`;
          }).join("")
        : '<span class="cert-email-missing">—</span>';

      const estado = estadoCertificado(ua);
      const statusReal = ua.statusValidacao || "Sem status";

      return `
        <tr>
          <td>
            <input
              type="checkbox"
              class="cert-check"
              data-i="${i}"
              ${podeGerar ? "" : "disabled"}
            >
          </td>
          <td>${revisoresHtml}</td>
          <td>${emailsHtml}</td>
          <td>${esc(ua.name || "--")}</td>
          <td>${esc(ua.titulo || "--")}</td>
          <td>${esc(ua.matriz || "--")}</td>
          <td>${esc(ua.semestre || "--")}</td>
          <td>
            <div>${esc(statusReal)}</div>
            <small class="cert-pill">${esc(estado)}</small>
          </td>
          <td>
            <button
              class="cert-btn cert-one"
              data-i="${i}"
              type="button"
              ${podeGerar ? "" : "disabled"}
            >PDF</button>
          </td>
        </tr>`;
    }).join("");

    atualizarSel();
  }

  function selecionados() {
    return [...document.querySelectorAll(".cert-check:checked")]
      .map((c) => filtrados[Number(c.dataset.i)])
      .filter(Boolean);
  }

  function atualizarSel() {
    const arr = selecionados();
    const qtdCertificados = arr.reduce((n, ua) => n + certificadosDaUa(ua).length, 0);
    const status = $("certStatus");

    if (!status) return;

    if (arr.length) {
      status.textContent =
        `${arr.length} UA(s) selecionada(s) · ${qtdCertificados} certificado(s).`;
    } else {
      status.textContent =
        `Exibindo ${filtrados.length} de ${base.length} UAs das 4 matrizes.`;
    }
  }

  // ============================================================
  // PDF
  // ============================================================

  function carregarImagem() {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Não foi possível carregar assets_certificado.png."));
      img.src = "assets_certificado.png";
    });
  }

  function quebrar(ctx, texto, max) {
    const words = txt(texto).split(/\s+/);
    const lines = [];
    let line = "";

    for (const word of words) {
      const teste = line ? line + " " + word : word;
      if (ctx.measureText(teste).width > max && line) {
        lines.push(line);
        line = word;
      } else {
        line = teste;
      }
    }

    if (line) lines.push(line);
    return lines;
  }

  async function pdf(r, baixar = true) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error("Biblioteca jsPDF não carregada.");
    }

    const imagem = await carregarImagem();
    const canvas = document.createElement("canvas");
    canvas.width = 2000;
    canvas.height = 1414;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#171717";
    ctx.font = "30px Arial";
    ctx.textAlign = "left";

    const texto =
      `Certificamos que ${r.revisor} participou da criação e validação do material didático digital denominado Unidade de Aprendizagem ${r.name}, vinculada ao ${r.titulo}, concluída no período de ${r.semestre}, em conformidade com os parâmetros de qualidade e as diretrizes pedagógicas, técnicas e editoriais estabelecidas pela Ânima Educação.`;

    const linhas = quebrar(ctx, texto, 1560);
    const alturaLinha = 43;
    const inicioY = 535;

    linhas.forEach((linha, i) => {
      ctx.fillText(linha, 220, inicioY + i * alturaLinha);
    });

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    doc.addImage(
      canvas.toDataURL("image/jpeg", 0.95),
      "JPEG",
      0,
      0,
      297,
      210
    );

    const nome =
      (`Certificado_${r.revisor}_${r.name}`)
        .replace(/[^\p{L}\p{N}_-]+/gu, "_") +
      ".pdf";

    if (baixar) doc.save(nome);

    return {
      base64: doc.output("datauristring").split(",")[1],
      nome
    };
  }

  // ============================================================
  // ENVIO
  // ============================================================

  async function enviar(r) {
    if (!emailValido(r.email)) {
      throw new Error(`E-mail do revisor ${r.revisor} não localizado.`);
    }

    const certificado = await pdf(r, false);
    const { data: { session } } = await window.biSupabase.auth.getSession();

    if (!session) {
      throw new Error("Sessão expirada. Entre novamente no BI.");
    }

    const url = `${window.BI_CONFIG.SUPABASE_URL}/functions/v1/enviar-certificado`;

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": window.BI_CONFIG.SUPABASE_PUBLISHABLE_KEY
      },
      body: JSON.stringify({
        destinatario: r.email,
        nome_revisor: r.revisor,
        name: r.name,
        titulo: r.titulo,
        semestre_oferta: r.semestre,
        pdf_base64: certificado.base64,
        nome_arquivo: certificado.nome
      })
    });

    const out = await resp.json().catch(() => ({}));

    if (!resp.ok || !out.success) {
      throw new Error(
        out?.detalhe?.message || out?.error || `Erro HTTP ${resp.status}`
      );
    }

    historico.add(r.chave);

    try {
      const { error } = await window.biSupabase
        .from("certificados_envios")
        .insert({
          chave_certificado: r.chave,
          revisor: r.revisor,
          email: r.email,
          name_ua: r.name,
          titulo: r.titulo,
          semestre_oferta: r.semestre,
          status: "enviado",
          // Mantemos o nome da coluna antiga para compatibilidade.
          resend_id: out.smtp2go_id || out.resend_id || null
        });

      if (error) {
        console.warn(
          "Certificado enviado, mas não foi possível registrar o histórico.",
          error
        );
      }
    } catch (e) {
      console.warn(
        "Certificado enviado, mas ocorreu erro ao registrar o histórico.",
        e
      );
    }

    return out;
  }

  // ============================================================
  // EVENTOS / INICIALIZAÇÃO
  // ============================================================

  async function init(dados) {
    if (!window.biSupabase) {
      console.error("biSupabase não foi inicializado.");
      return;
    }

    if (!inicializado) {
      inicializado = true;

      await Promise.all([
        carregarRevisoresOficiais(),
        carregarHistorico()
      ]);

      ["certSemestre", "certRevisor"].forEach((id) => {
        $(id)?.addEventListener("change", render);
      });

      $("certBusca")?.addEventListener("input", render);

      document.addEventListener("input", (e) => {
        const input = e.target?.closest?.(".cert-email-manual");
        if (!input) return;

        const indice = Number(input.dataset.i);
        const revisorIndice = Number(input.dataset.ri);
        const ua = filtrados[indice];
        const revisor = ua?.revisores?.[revisorIndice];
        if (!ua || !revisor) return;

        const valor = txt(input.value).toLowerCase();
        const msg = input.parentElement?.querySelector(
          `[data-email-msg="${indice}-${revisorIndice}"]`
        );

        if (emailValido(valor)) {
          revisor.email = valor;
          revisor.emailManual = true;
          if (msg) msg.textContent = "E-mail válido — envio liberado";
        } else {
          revisor.email = "";
          revisor.emailManual = false;
          if (msg) msg.textContent = valor ? "Informe um e-mail válido" : "";
        }
      });

      document.addEventListener("change", (e) => {
        if (e.target?.classList?.contains("cert-check")) atualizarSel();
      });

      $("certSelecionarTodos")?.addEventListener("click", () => {
        document
          .querySelectorAll(".cert-check:not(:disabled)")
          .forEach((x) => { x.checked = true; });
        atualizarSel();
      });

      $("certGerar")?.addEventListener("click", async () => {
        const uas = selecionados();
        const arr = uas.flatMap(certificadosDaUa);

        if (!arr.length) {
          alert("Selecione ao menos uma UA validada com revisor localizado.");
          return;
        }

        const botao = $("certGerar");
        const status = $("certStatus");
        if (botao) botao.disabled = true;

        try {
          for (let i = 0; i < arr.length; i++) {
            if (status) {
              status.textContent =
                `Gerando ${i + 1} de ${arr.length}: ${arr[i].revisor}`;
            }
            await pdf(arr[i], true);
          }

          if (status) status.textContent = `${arr.length} certificado(s) gerado(s).`;
        } catch (e) {
          console.error(e);
          if (status) status.textContent = `Erro ao gerar PDF: ${e.message}`;
          alert(`Erro ao gerar certificado: ${e.message}`);
        } finally {
          if (botao) botao.disabled = false;
        }
      });

      $("certEnviar")?.addEventListener("click", async () => {
        const uas = selecionados();
        const arr = uas.flatMap(certificadosDaUa);

        if (!arr.length) {
          alert("Selecione ao menos uma UA validada com revisor localizado.");
          return;
        }

        const semEmail = arr.filter((r) => !emailValido(r.email));
        if (semEmail.length) {
          const nomes = semEmail
            .slice(0, 8)
            .map((r) => `${r.revisor} — ${r.name}`)
            .join("\n");

          alert(
            `${semEmail.length} certificado(s) ainda estão sem e-mail válido.\n\n` +
            `${nomes}${semEmail.length > 8 ? "\n..." : ""}`
          );
          return;
        }

        if (!confirm(`Enviar ${arr.length} certificado(s)?`)) return;

        const botao = $("certEnviar");
        const status = $("certStatus");
        if (botao) botao.disabled = true;

        let ok = 0;
        let erros = 0;

        for (const r of arr) {
          if (status) {
            status.textContent =
              `Enviando ${ok + erros + 1} de ${arr.length}: ${r.revisor}`;
          }

          try {
            await enviar(r);
            ok++;
          } catch (e) {
            erros++;
            console.error("Erro ao enviar certificado:", r, e);
          }
        }

        if (botao) botao.disabled = false;
        if (status) status.textContent = `Concluído: ${ok} enviado(s), ${erros} erro(s).`;
        render();
      });

      document.addEventListener("click", async (e) => {
        const botao = e.target?.closest?.(".cert-one");
        if (!botao) return;

        const indice = Number(botao.dataset.i);
        const ua = filtrados[indice];
        if (!ua) return;

        const arr = certificadosDaUa(ua);
        if (!arr.length) {
          alert("Esta UA ainda não possui certificado elegível.");
          return;
        }

        botao.disabled = true;

        try {
          for (const r of arr) {
            await pdf(r, true);
          }
        } catch (erro) {
          console.error(erro);
          alert(`Erro ao gerar certificado: ${erro.message}`);
        } finally {
          botao.disabled = false;
        }
      });
    }

    montar(dados);
    popular();
    render();
  }

  window.atualizarCertificados = init;
})();
