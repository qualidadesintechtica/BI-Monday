(function () {
  "use strict";

  // ============================================================
  // CERTIFICADOS V25.46.22 — AUTOMÁTICO COM A MONDAY
  //
  // Regra:
  // 1. A Monday/Supabase define o universo da aba.
  // 2. Entram automaticamente UAs das matrizes-alvo com Status = Validado.
  // 3. O revisor vem da coluna revisor_validador da Monday.
  // 4. O nome do revisor é comparado com public.revisores_ua.
  // 5. A tabela revisores_ua complementa o e-mail; ela NÃO exclui a UA.
  // ============================================================

  let base = [];
  let filtrados = [];
  let revisoresOficiaisPorNome = new Map();
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

  function ehUA(item) {
    return (
      item?.eh_ua === true ||
      norm(item?.categoria_material) === "unidade de aprendizagem"
    );
  }

  function estaValidada(item) {
    return item?.eh_validada === true || norm(item?.status_validacao) === "validado";
  }

  function chaveMaterial(item, indice) {
    const mondayId = txt(item?.monday_item_validacao || item?.monday_item_id);
    if (mondayId) return `monday:${mondayId}`;
    if (txt(item?.chave_material)) return txt(item.chave_material);
    if (txt(item?.chave_ua)) return txt(item.chave_ua);

    return [
      txt(item?.id_titulo),
      txt(item?.id_ua),
      txt(item?.categoria_material),
      indice
    ].join("|");
  }

  function chavePessoa(v) {
    return norm(v)
      .replace(/[<>()[\]{}]/g, " ")
      .replace(/[._-]+/g, " ")
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

  function tituloDaUa(x) {
    return txt(
      x?.titulo_uc ||
      x?.nome_uc ||
      x?.unidade_curricular ||
      x?.uc ||
      x?.titulo ||
      x?.id_titulo
    );
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

  // ============================================================
  // BASE OFICIAL DE REVISORES — comparação por NOME
  // ============================================================

  async function carregarRevisoresOficiais() {
    revisoresOficiaisPorNome = new Map();

    const { data, error } = await window.biSupabase
      .from("revisores_ua")
      .select("nq_responsavel,docente_revisor,email,uc,ativo")
      .eq("ativo", true);

    if (error) {
      throw new Error(`Não foi possível carregar revisores_ua: ${error.message}`);
    }

    (data || []).forEach((r) => {
      const nome = txt(r.docente_revisor);
      const chave = chavePessoa(nome);
      if (!chave || !nome) return;

      const email = emailDoTexto(r.email);
      const existente = revisoresOficiaisPorNome.get(chave);

      if (!existente) {
        revisoresOficiaisPorNome.set(chave, {
          revisor: nome,
          email,
          nqResponsavel: txt(r.nq_responsavel),
          ucs: new Set(txt(r.uc) ? [txt(r.uc)] : [])
        });
        return;
      }

      if (!existente.email && email) existente.email = email;
      if (txt(r.uc)) existente.ucs.add(txt(r.uc));
    });

    console.info(
      `Certificados: ${revisoresOficiaisPorNome.size} revisores oficiais carregados para comparação com a Monday.`
    );
  }

  function localizarRevisorOficial(nomeMonday) {
    const original = txt(nomeMonday);
    const chave = chavePessoa(original);
    if (!chave) return null;

    const exato = revisoresOficiaisPorNome.get(chave);
    if (exato) return exato;

    // Aproximação conservadora: só aceita quando existe um único candidato.
    const candidatos = [];
    for (const [chaveBase, cadastro] of revisoresOficiaisPorNome.entries()) {
      if (chave.includes(chaveBase) || chaveBase.includes(chave)) {
        candidatos.push(cadastro);
      }
    }

    return candidatos.length === 1 ? candidatos[0] : null;
  }

  function nomesRevisorMonday(valor) {
    if (Array.isArray(valor)) {
      return [...new Set(valor.flatMap(nomesRevisorMonday).filter(Boolean))];
    }

    if (valor && typeof valor === "object") {
      if (Array.isArray(valor.personsAndTeams)) {
        return [...new Set(
          valor.personsAndTeams
            .map((p) => txt(p?.name || p?.text || p?.display_name))
            .filter(Boolean)
        )];
      }
      return nomesRevisorMonday(valor.name || valor.text || valor.label || "");
    }

    const bruto = txt(valor);
    if (!bruto) return [];

    // Se o valor inteiro já corresponde a um revisor, não divide o nome.
    if (localizarRevisorOficial(bruto)) return [bruto];

    let partes = bruto
      .split(/\s*(?:\||;|\n|\r|\/+)\s*/)
      .map((v) => txt(v))
      .filter(Boolean);

    // Alguns campos People chegam separados por vírgula. Só dividimos por
    // vírgula se TODOS os pedaços resultarem em revisores reconhecíveis.
    if (partes.length === 1 && bruto.includes(",")) {
      const porVirgula = bruto.split(",").map((v) => txt(v)).filter(Boolean);
      if (
        porVirgula.length > 1 &&
        porVirgula.every((nome) => localizarRevisorOficial(nome))
      ) {
        partes = porVirgula;
      }
    }

    return [...new Set(partes)];
  }

  function revisoresDaMonday(item) {
    const nomes = nomesRevisorMonday(
      item?.revisor_validador ||
      item?.revisor ||
      item?.revisor_validacao
    );

    return nomes.map((nomeMonday) => {
      const oficial = localizarRevisorOficial(nomeMonday);

      if (oficial) {
        return {
          revisor: oficial.revisor,
          revisorMonday: nomeMonday,
          email: oficial.email || "",
          localizado: true,
          nqResponsavel: oficial.nqResponsavel || ""
        };
      }

      return {
        revisor: nomeMonday,
        revisorMonday: nomeMonday,
        email: "",
        localizado: false,
        nqResponsavel: ""
      };
    });
  }

  // ============================================================
  // HISTÓRICO
  // ============================================================

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

  function chaveCertificado(ua, revisor) {
    return [
      ua.idEnvio || ua.chaveUa,
      norm(revisor.revisor),
      norm(ua.name),
      norm(ua.titulo),
      norm(ua.semestre)
    ].join("|");
  }

  function registroCertificado(ua, revisor) {
    return {
      revisor: revisor.revisor,
      email: revisor.email || "",
      name: ua.name,
      titulo: ua.titulo,
      semestre: ua.semestre,
      nqResponsavel: revisor.nqResponsavel || "",
      chave: chaveCertificado(ua, revisor)
    };
  }

  function certificadosDaUa(ua) {
    if (!ua.validado || !ua.revisores.length) return [];
    return ua.revisores
      .filter((r) => txt(r.revisor))
      .map((r) => registroCertificado(ua, r));
  }

  function estadoCertificado(ua) {
    if (!ua.revisores.length) return "Revisor não informado na Monday";
    if (ua.revisores.some((r) => !r.localizado)) return "Revisor não localizado na base";
    if (ua.revisores.some((r) => !emailValido(r.email))) return "Sem e-mail";

    const certs = certificadosDaUa(ua);
    const enviados = certs.filter((r) => historico.has(r.chave)).length;

    if (enviados === certs.length && certs.length) return "Enviado";
    if (enviados > 0) return "Parcial";
    return "Pendente";
  }

  function uaComEmail(ua) {
    return ua.revisores.length > 0 && ua.revisores.every((r) => emailValido(r.email));
  }

  // ============================================================
  // MONTA A ABA A PARTIR DOS DADOS SINCRONIZADOS DA MONDAY
  // ============================================================

  function montar(dados) {
    const mapa = new Map();

    (dados || []).forEach((item, indice) => {
      if (!matrizAlvo(item)) return;
      if (!ehUA(item)) return;
      if (!estaValidada(item)) return;

      const chaveUa = chaveMaterial(item, indice);
      if (mapa.has(chaveUa)) return;

      const revisores = revisoresDaMonday(item);

      mapa.set(chaveUa, {
        chaveUa,
        idEnvio: txt(item?.monday_item_validacao || item?.monday_item_id || chaveUa),
        name: nomeDaUa(item),
        titulo: tituloDaUa(item),
        matriz: txt(item?.matriz_oferta),
        semestre: txt(item?.semestre_oferta),
        statusValidacao: txt(item?.status_validacao) || "Validado",
        validado: true,
        revisores,
        revisorMondayBruto: txt(item?.revisor_validador),
        origem: item
      });
    });

    base = [...mapa.values()].sort((a, b) => {
      const sem = a.semestre.localeCompare(b.semestre, "pt-BR");
      if (sem !== 0) return sem;
      const revA = a.revisores[0]?.revisor || "";
      const revB = b.revisores[0]?.revisor || "";
      const rev = revA.localeCompare(revB, "pt-BR");
      if (rev !== 0) return rev;
      return a.name.localeCompare(b.name, "pt-BR");
    });

    const revisores = new Set(
      base.flatMap((ua) => ua.revisores.map((r) => norm(r.revisor))).filter(Boolean)
    );
    const comEmail = base.filter(uaComEmail).length;
    const semEmail = base.length - comEmail;

    window.__BI_CERT_DIAGNOSTICO = {
      uasValidadas: base.length,
      revisores: revisores.size,
      comEmail,
      semEmail,
      fonte: "Monday → Supabase → Certificados"
    };

    console.info("[Certificados] Sincronização automática da Monday:", window.__BI_CERT_DIAGNOSTICO);
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
      '<option value="__sem_revisor__">Sem revisor informado</option>' +
      revisores.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");

    if (semestres.includes(semestreAtual)) sem.value = semestreAtual;
    if (revisorAtual === "__sem_revisor__" || revisores.includes(revisorAtual)) {
      rev.value = revisorAtual;
    }
  }

  function atualizarKPIs(lista = base) {
    const universo = Array.isArray(lista) ? lista : [];
    const revisores = new Set(
      universo.flatMap((ua) => ua.revisores.map((r) => norm(r.revisor))).filter(Boolean)
    );
    const comEmail = universo.filter(uaComEmail).length;
    const semEmail = universo.length - comEmail;

    if ($("certTotalUAs")) $("certTotalUAs").textContent = universo.length;
    if ($("certRevisores")) $("certRevisores").textContent = revisores.size;
    if ($("certComEmail")) $("certComEmail").textContent = comEmail;
    if ($("certSemEmail")) $("certSemEmail").textContent = semEmail;
  }

  function render() {
    const sem = $("certSemestre")?.value || "";
    const rev = $("certRevisor")?.value || "";
    const filtroEmail = $("certEmail")?.value || "";
    const q = norm($("certBusca")?.value || "");

    filtrados = base.filter((ua) => {
      if (sem && ua.semestre !== sem) return false;

      if (rev === "__sem_revisor__" && ua.revisores.length) return false;
      if (
        rev &&
        rev !== "__sem_revisor__" &&
        !ua.revisores.some((r) => r.revisor === rev)
      ) return false;

      const temEmail = uaComEmail(ua);
      if (filtroEmail === "com" && !temEmail) return false;
      if (filtroEmail === "sem" && temEmail) return false;

      if (q) {
        const texto = norm([
          ua.name,
          ua.titulo,
          ua.matriz,
          ua.semestre,
          ua.statusValidacao,
          ua.revisorMondayBruto,
          ...ua.revisores.flatMap((r) => [r.revisor, r.revisorMonday, r.email])
        ].join(" "));
        if (!texto.includes(q)) return false;
      }

      return true;
    });

    atualizarKPIs(filtrados);

    const tb = $("certTbody");
    if (!tb) return;

    if (!filtrados.length) {
      tb.innerHTML = `
        <tr>
          <td colspan="9" class="empty-table">Nenhuma UA validada encontrada.</td>
        </tr>`;
      atualizarSel();
      return;
    }

    tb.innerHTML = filtrados.map((ua, i) => {
      const podeGerar = ua.revisores.some((r) => txt(r.revisor));

      const revisoresHtml = ua.revisores.length
        ? ua.revisores.map((r) => {
            const origem = r.localizado
              ? '<small class="cert-email-manual-tag">Base oficial</small>'
              : '<small class="cert-email-missing">Não localizado na base</small>';
            return `<div>${esc(r.revisor)}${origem}</div>`;
          }).join("")
        : '<div class="cert-email-missing">Não informado na Monday</div>';

      const emailsHtml = ua.revisores.length
        ? ua.revisores.map((r, ri) => {
            if (emailValido(r.email)) {
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
            <div>${esc(ua.statusValidacao || "Validado")}</div>
            <small class="cert-pill">${esc(estadoCertificado(ua))}</small>
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
      status.textContent = `${arr.length} UA(s) selecionada(s) · ${qtdCertificados} certificado(s).`;
    } else {
      status.textContent =
        `Exibindo ${filtrados.length} de ${base.length} UAs validadas sincronizadas da Monday.`;
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

      ["certSemestre", "certRevisor", "certEmail"].forEach((id) => {
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

        atualizarKPIs(filtrados);
        atualizarSel();
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
          alert("Selecione ao menos uma UA validada com revisor informado na Monday.");
          return;
        }

        const botao = $("certGerar");
        const status = $("certStatus");
        if (botao) botao.disabled = true;

        try {
          for (let i = 0; i < arr.length; i++) {
            if (status) {
              status.textContent = `Gerando ${i + 1} de ${arr.length}: ${arr[i].revisor}`;
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
          alert("Selecione ao menos uma UA validada com revisor informado na Monday.");
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
            status.textContent = `Enviando ${ok + erros + 1} de ${arr.length}: ${r.revisor}`;
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
          alert("Esta UA ainda não possui revisor informado na Monday.");
          return;
        }

        botao.disabled = true;

        try {
          for (const r of arr) await pdf(r, true);
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
