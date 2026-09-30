(function () {
  "use strict";

  let base = [];
  let filtrados = [];
  let revisoresPorUC = new Map();
  let historico = new Set();
  let inicializado = false;

  const $ = (id) => document.getElementById(id);

  const txt = (v) => String(v ?? "").trim();

  const norm = (v) =>
    txt(v)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ");

  // V25.46.17 — reconhece exclusivamente UAs 01 a 08, tolerando variações
  // como "UA 1", "UA01", "Unidade 1" e "Unidade de Aprendizagem 01".
  function ehUnidadeAprendizagem(valor) {
    const n = norm(valor)
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return /^(?:ua|unidade|unidade de aprendizagem)\s*0?([1-8])(?:\b|\s|$)/i.test(n);
  }

  function chaveUC(valor) {
    return norm(valor)
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function revisoresDaUC(valor) {
    const chave = chaveUC(valor);
    if (!chave) return [];

    // Primeiro: correspondência exata normalizada.
    const exatos = revisoresPorUC.get(chave);
    if (exatos?.length) return exatos;

    // Segundo: tolera prefixos/sufixos do Monday somente quando a
    // correspondência aponta para UMA ÚNICA UC da Base Oficial.
    const candidatos = [];
    for (const [ucBase, lista] of revisoresPorUC.entries()) {
      if (chave.includes(ucBase) || ucBase.includes(chave)) {
        candidatos.push([ucBase, lista]);
      }
    }
    if (candidatos.length === 1) return candidatos[0][1];
    return [];
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
    const m = txt(v).match(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    );

    return m ? m[0].toLowerCase() : "";
  }

  function emailValido(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(txt(v));
  }

  function chave(r) {
    // Cada item do Monday representa um registro/certificado independente.
    // Assim, UAs iguais não são consolidadas em uma única linha.
    return [
      txt(r.mondayItemId),
      txt(r.mondayUserId) || norm(r.revisor),
      norm(r.name),
      norm(r.titulo),
      norm(r.semestre)
    ].join("|");
  }


  // ============================================================
  // BASE OFICIAL DE REVISORES — SUPABASE
  // ============================================================

  async function carregarBaseRevisores() {
    revisoresPorUC = new Map();

    const { data, error } = await window.biSupabase
      .from("revisores_ua")
      .select("id,nq_responsavel,docente_revisor,email,uc,ativo")
      .eq("ativo", true);

    if (error) {
      throw new Error(
        "Não foi possível carregar a Base Oficial de Revisores: " + error.message
      );
    }

    (data || []).forEach((r) => {
      const ucChave = chaveUC(r.uc);
      const revisor = txt(r.docente_revisor);
      if (!ucChave || !revisor) return;

      const lista = revisoresPorUC.get(ucChave) || [];
      lista.push({
        id: r.id,
        nqResponsavel: txt(r.nq_responsavel),
        revisor,
        email: emailDoTexto(r.email),
        uc: txt(r.uc)
      });
      revisoresPorUC.set(ucChave, lista);
    });
  }

  async function importarBaseRevisores(arquivo) {
    if (!arquivo) return;
    if (!window.XLSX) throw new Error("Biblioteca XLSX não carregada.");

    const buffer = await arquivo.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: "array", cellDates: false });
    const nomeAba = workbook.SheetNames[0];
    const linhas = window.XLSX.utils.sheet_to_json(workbook.Sheets[nomeAba], {
      defval: "",
      raw: false
    });

    const registros = linhas.map((r) => ({
      nq_responsavel: txt(r["NQ RESPONSÁVEL"]),
      docente_revisor: txt(r["DOCENTE REVISOR"]),
      email: emailDoTexto(r["E-MAIL"]),
      uc: txt(r["UC A VALIDAR"]),
      ativo: true
    })).filter((r) => r.docente_revisor && r.uc);

    if (!registros.length) {
      throw new Error("Nenhum revisor encontrado. Confira os cabeçalhos da planilha.");
    }

    const { error: erroDelete } = await window.biSupabase
      .from("revisores_ua")
      .delete()
      .neq("id", 0);
    if (erroDelete) throw erroDelete;

    for (let i = 0; i < registros.length; i += 200) {
      const { error } = await window.biSupabase
        .from("revisores_ua")
        .insert(registros.slice(i, i + 200));
      if (error) throw error;
    }

    await carregarBaseRevisores();
    return registros.length;
  }

  // ============================================================
  // HISTÓRICO DE CERTIFICADOS
  // ============================================================

  async function carregarHistorico() {
    try {
      const { data, error } =
        await window.biSupabase
          .from("certificados_envios")
          .select(
            "chave_certificado,status"
          )
          .eq("status", "enviado");

      if (error) throw error;

      historico = new Set(
        (data || []).map(
          (x) => x.chave_certificado
        )
      );

    } catch (e) {
      console.warn(
        "Histórico de certificados ainda não instalado.",
        e
      );
    }
  }

  // ============================================================
  // PREPARAÇÃO DA BASE
  // ============================================================

  function montar(dados) {
    const map = new Map();
    const diagnostico = {
      recebidos: (dados || []).length,
      validados: 0,
      uas: 0,
      uas20262: 0,
      semUCBase: 0,
      certificados: 0,
      ucsSemCorrespondencia: new Map()
    };

    (dados || [])
      .filter((x) => norm(x.status_validacao) === "validado")
      .forEach((x) => {
        diagnostico.validados += 1;

        const name = txt(
          x.item_name || x.titulo_ua || x.unidade_material || x.id_ua
        );
        if (!ehUnidadeAprendizagem(name)) return;
        diagnostico.uas += 1;

        const titulo = txt(x.titulo || x.id_titulo);
        const semestre = txt(x.semestre_oferta);
        if (norm(semestre).includes("2026.2")) diagnostico.uas20262 += 1;

        const mondayItemId = txt(x.monday_item_validacao || x.monday_item_id);
        const revisores = revisoresDaUC(titulo);

        if (!revisores.length) {
          diagnostico.semUCBase += 1;
          const k = titulo || "(UC não informada)";
          diagnostico.ucsSemCorrespondencia.set(
            k,
            (diagnostico.ucsSemCorrespondencia.get(k) || 0) + 1
          );
          return;
        }

        revisores.forEach((cadastro) => {
          const r = {
            mondayItemId,
            mondayUserId: "",
            revisorBaseId: cadastro.id,
            revisor: cadastro.revisor,
            email: cadastro.email || "",
            nqResponsavel: cadastro.nqResponsavel,
            ucBase: cadastro.uc,
            name,
            titulo,
            semestre
          };
          r.chave = [
            mondayItemId || norm(name),
            txt(cadastro.id) || norm(cadastro.revisor),
            norm(name),
            norm(titulo),
            norm(semestre)
          ].join("|");
          if (!map.has(r.chave)) map.set(r.chave, r);
        });
      });

    base = [...map.values()].sort((a, b) =>
      a.revisor.localeCompare(b.revisor, "pt-BR")
    );
    diagnostico.certificados = base.length;
    window.__BI_CERT_DIAGNOSTICO = diagnostico;

    const status = $("certStatus");
    if (status) {
      status.textContent =
        `Certificados: ${diagnostico.certificados} | ` +
        `UAs validadas identificadas: ${diagnostico.uas} | ` +
        `2026.2: ${diagnostico.uas20262} | ` +
        `sem correspondência na Base Oficial: ${diagnostico.semUCBase}.`;
    }

    if (diagnostico.semUCBase) {
      console.warn(
        "[Certificados] UCs sem correspondência na Base Oficial:",
        [...diagnostico.ucsSemCorrespondencia.entries()]
          .sort((a, b) => b[1] - a[1])
      );
    }
  }

  // ============================================================
  // FILTROS
  // ============================================================

  function popular() {
    const sem =
      $("certSemestre");

    const rev =
      $("certRevisor");

    if (!sem || !rev) return;

    const semestreAtual =
      sem.value;

    const revisorAtual =
      rev.value;

    const semestres = [
      ...new Set(
        base
          .map((x) => x.semestre)
          .filter(Boolean)
      )
    ].sort();

    sem.innerHTML =
      '<option value="">Todos os semestres</option>' +
      semestres
        .map(
          (v) =>
            `<option value="${esc(v)}">${esc(v)}</option>`
        )
        .join("");

    const revisores = [
      ...new Set(
        base
          .map((x) => x.revisor)
          .filter(Boolean)
      )
    ].sort(
      (a, b) =>
        a.localeCompare(
          b,
          "pt-BR"
        )
    );

    rev.innerHTML =
      '<option value="">Todos os revisores</option>' +
      revisores
        .map(
          (v) =>
            `<option value="${esc(v)}">${esc(v)}</option>`
        )
        .join("");

    if (
      semestres.includes(
        semestreAtual
      )
    ) {
      sem.value =
        semestreAtual;
    }

    if (
      revisores.includes(
        revisorAtual
      )
    ) {
      rev.value =
        revisorAtual;
    }
  }

  // ============================================================
  // RENDERIZAÇÃO DA TABELA
  // ============================================================

  function render() {
    const sem =
      $("certSemestre")?.value || "";

    const rev =
      $("certRevisor")?.value || "";

    const emailFiltro =
      $("certEmail")?.value || "";

    const q =
      norm(
        $("certBusca")?.value || ""
      );

    filtrados = base.filter(
      (r) =>
        (!sem ||
          r.semestre === sem) &&
        (!rev ||
          r.revisor === rev) &&
        (!emailFiltro ||
          (emailFiltro === "com" && emailValido(r.email)) ||
          (emailFiltro === "sem" && !emailValido(r.email))) &&
        (
          !q ||
          norm(
            [
              r.revisor,
              r.email,
              r.name,
              r.titulo,
              r.semestre
            ].join(" ")
          ).includes(q)
        )
    );

    if ($("certElegiveis")) {
      $("certElegiveis").textContent =
        filtrados.length;
    }

    if ($("certRevisores")) {
      $("certRevisores").textContent =
        new Set(
          filtrados.map(
            (x) =>
              norm(x.revisor)
          )
        ).size;
    }

    if ($("certSemEmail")) {
      $("certSemEmail").textContent =
        filtrados.filter(
          (x) => !x.email
        ).length;
    }

    const tb =
      $("certTbody");

    if (!tb) return;

    if (!filtrados.length) {
      tb.innerHTML =
        `
        <tr>
          <td colspan="8" class="empty-table">
            Nenhum certificado encontrado.
          </td>
        </tr>
        `;

      atualizarSel();
      return;
    }

    tb.innerHTML =
      filtrados
        .map(
          (r, i) => `
            <tr>

              <td>
                <input
                  type="checkbox"
                  class="cert-check"
                  data-i="${i}"
                  ${(!emailValido(r.email) || historico.has(r.chave)) ? "disabled" : ""}
                >
              </td>

              <td>
                ${esc(r.revisor)}
              </td>

              <td>
                ${
                  r.email
                    ? `<span class="cert-email-auto" title="E-mail localizado automaticamente no Monday">${esc(r.email)}</span>`
                    : `
                      <input
                        type="email"
                        class="cert-email-manual"
                        data-i="${i}"
                        value=""
                        placeholder="Digite o e-mail"
                        autocomplete="email"
                        aria-label="E-mail de ${esc(r.revisor)}"
                        style="width:100%;min-width:220px;padding:8px 10px;border:1px solid #d8d1e6;border-radius:8px;background:#fff;"
                      >
                    `
                }
              </td>

              <td>
                ${esc(r.name)}
              </td>

              <td>
                ${esc(r.titulo || "--")}
              </td>

              <td>
                ${esc(r.semestre || "--")}
              </td>

              <td>
                <span class="cert-pill">
                  ${
                    historico.has(r.chave)
                      ? "Enviado"
                      : "Pendente"
                  }
                </span>
              </td>

              <td>
                <button
                  class="cert-btn cert-one"
                  data-i="${i}"
                  type="button"
                >
                  PDF
                </button>
              </td>

            </tr>
          `
        )
        .join("");

    atualizarSel();
  }

  // ============================================================
  // SELEÇÃO
  // ============================================================

  function selecionados() {
    return [
      ...document.querySelectorAll(
        ".cert-check:checked"
      )
    ]
      .map(
        (c) =>
          filtrados[
            Number(
              c.dataset.i
            )
          ]
      )
      .filter((r) => r && emailValido(r.email) && !historico.has(r.chave));
  }

  function atualizarSel() {
    const el =
      $("certSelecionados");

    if (el) {
      el.textContent =
        selecionados().length;
    }
  }

  // ============================================================
  // IMAGEM DO CERTIFICADO
  // ============================================================

  function carregarImagem() {
    return new Promise(
      (resolve, reject) => {

        const img =
          new Image();

        img.onload =
          () =>
            resolve(img);

        img.onerror =
          () =>
            reject(
              new Error(
                "Não foi possível carregar assets_certificado.png."
              )
            );

        img.src =
          "assets_certificado.png";
      }
    );
  }

  // ============================================================
  // QUEBRA DE TEXTO
  // ============================================================

  function quebrar(
    ctx,
    texto,
    max
  ) {
    const words =
      txt(texto)
        .split(/\s+/);

    const lines = [];

    let line = "";

    for (
      const word of words
    ) {

      const teste =
        line
          ? line + " " + word
          : word;

      if (
        ctx.measureText(
          teste
        ).width > max &&
        line
      ) {
        lines.push(line);
        line = word;

      } else {
        line = teste;
      }
    }

    if (line) {
      lines.push(line);
    }

    return lines;
  }

  // ============================================================
  // GERAÇÃO DO PDF
  // ============================================================

  async function pdf(
    r,
    baixar = true
  ) {

    if (
      !window.jspdf ||
      !window.jspdf.jsPDF
    ) {
      throw new Error(
        "Biblioteca jsPDF não carregada."
      );
    }

    const imagem =
      await carregarImagem();

    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.width =
      2000;

    canvas.height =
      1414;

    const ctx =
      canvas.getContext(
        "2d"
      );

    ctx.drawImage(
      imagem,
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.fillStyle =
      "#171717";

    ctx.font =
      "30px Arial";

    ctx.textAlign =
      "left";

    const texto =
      `Certificamos que ${r.revisor} participou da criação e validação do material didático digital denominado Unidade de Aprendizagem ${r.name}, vinculada ao ${r.titulo}, concluída no período de ${r.semestre}, em conformidade com os parâmetros de qualidade e as diretrizes pedagógicas, técnicas e editoriais estabelecidas pela Ânima Educação.`;

    const linhas =
      quebrar(
        ctx,
        texto,
        1560
      );

    const alturaLinha =
      43;

    const inicioY =
      535;

    linhas.forEach(
      (linha, i) => {
        ctx.fillText(
          linha,
          220,
          inicioY +
          i *
          alturaLinha
        );
      }
    );

    const {
      jsPDF
    } = window.jspdf;

    const doc =
      new jsPDF({
        orientation:
          "landscape",
        unit:
          "mm",
        format:
          "a4"
      });

    doc.addImage(
      canvas.toDataURL(
        "image/jpeg",
        0.95
      ),
      "JPEG",
      0,
      0,
      297,
      210
    );

    const nome =
      (
        `Certificado_${r.revisor}_${r.name}`
      )
        .replace(
          /[^\p{L}\p{N}_-]+/gu,
          "_"
        ) +
      ".pdf";

    if (baixar) {
      doc.save(nome);
    }

    return {
      base64:
        doc
          .output(
            "datauristring"
          )
          .split(",")[1],

      nome
    };
  }

  // ============================================================
  // ENVIO PELO SUPABASE + RESEND
  // ============================================================

  async function enviar(r) {

    if (!r.email) {
      throw new Error(
        "E-mail do revisor não localizado."
      );
    }

    const certificado =
      await pdf(
        r,
        false
      );

    const {
      data: {
        session
      }
    } =
      await window
        .biSupabase
        .auth
        .getSession();

    if (!session) {
      throw new Error(
        "Sessão expirada. Entre novamente no BI."
      );
    }

    const url =
      `${window.BI_CONFIG.SUPABASE_URL}/functions/v1/enviar-certificado`;

    const resp =
      await fetch(
        url,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${session.access_token}`,

            "apikey":
              window.BI_CONFIG
                .SUPABASE_PUBLISHABLE_KEY
          },

          body:
            JSON.stringify({
              destinatario:
                r.email,

              nome_revisor:
                r.revisor,

              name:
                r.name,

              titulo:
                r.titulo,

              semestre_oferta:
                r.semestre,

              pdf_base64:
                certificado.base64,

              nome_arquivo:
                certificado.nome
            })
        }
      );

    const out =
      await resp
        .json()
        .catch(
          () => ({})
        );

    if (
      !resp.ok ||
      !out.success
    ) {
      throw new Error(
        out?.detalhe?.message ||
        out?.error ||
        `Erro HTTP ${resp.status}`
      );
    }

    historico.add(
      r.chave
    );

    // Salva histórico.
    // Falha no histórico não deve impedir
    // que um e-mail já enviado seja considerado sucesso.
    try {

      const {
        error
      } =
        await window.biSupabase
          .from(
            "certificados_envios"
          )
          .insert({
            chave_certificado:
              r.chave,

            revisor:
              r.revisor,

            email:
              r.email,

            name_ua:
              r.name,

            titulo:
              r.titulo,

            semestre_oferta:
              r.semestre,

            status:
              "enviado",

            resend_id:
              out.resend_id
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
  // INICIALIZAÇÃO
  // ============================================================

  async function init(
    dados
  ) {

    if (
      !window.biSupabase
    ) {
      console.error(
        "biSupabase não foi inicializado."
      );
      return;
    }

    if (!inicializado) {

      inicializado =
        true;

      await Promise.all([
        carregarBaseRevisores(),
        carregarHistorico()
      ]);

      [
        "certSemestre",
        "certRevisor",
        "certEmail"
      ].forEach(
        (id) => {
          $(id)
            ?.addEventListener(
              "change",
              render
            );
        }
      );

      $("certBusca")
        ?.addEventListener(
          "input",
          render
        );

      document.addEventListener(
        "change",
        (e) => {
          if (
            e.target
              ?.classList
              ?.contains(
                "cert-check"
              )
          ) {
            atualizarSel();
          }
        }
      );

      // E-mail manual: disponível somente quando o Monday não localizou um endereço.
      // Um e-mail válido libera imediatamente a seleção daquele certificado.
      document.addEventListener(
        "input",
        (e) => {
          const campo = e.target?.closest?.(".cert-email-manual");
          if (!campo) return;

          const indice = Number(campo.dataset.i);
          const registro = filtrados[indice];
          if (!registro) return;

          const valor = txt(campo.value).toLowerCase();
          const valido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);

          registro.email = valido ? valor : "";
          campo.setCustomValidity(
            !valor || valido ? "" : "Informe um e-mail válido."
          );

          const linha = campo.closest("tr");
          const check = linha?.querySelector(".cert-check");
          if (check) {
            check.disabled = !valido || historico.has(registro.chave);
            if (check.disabled) check.checked = false;
          }

          if ($("certSemEmail")) {
            $("certSemEmail").textContent = filtrados.filter((x) => !x.email).length;
          }
          atualizarSel();

          // Se o filtro de e-mail estiver ativo, atualiza a lista imediatamente.
          if ($("certEmail")?.value) {
            render();
          }
        }
      );

      $("certImportarRevisores")?.addEventListener("change", async (e) => {
        const arquivo = e.target.files?.[0];
        if (!arquivo) return;
        const status = $("certStatus");
        try {
          if (status) status.textContent = "Atualizando Base Oficial de Revisores...";
          const total = await importarBaseRevisores(arquivo);
          montar(window.__BI_CERT_DADOS || []);
          popular();
          render();
          if (status) status.textContent = `Base de Revisores atualizada: ${total} vínculo(s).`;
        } catch (erro) {
          console.error(erro);
          if (status) status.textContent = `Erro ao importar revisores: ${erro.message}`;
          alert(`Erro ao importar Base de Revisores: ${erro.message}`);
        } finally {
          e.target.value = "";
        }
      });

      // Selecionar todos
      $("certSelecionarTodos")
        ?.addEventListener(
          "click",
          () => {

            document
              .querySelectorAll(
                ".cert-check:not(:disabled)"
              )
              .forEach(
                (x) => {
                  x.checked =
                    true;
                }
              );

            atualizarSel();
          }
        );

      // Gerar PDFs selecionados
      $("certGerar")
        ?.addEventListener(
          "click",
          async () => {

            const arr =
              selecionados();

            if (
              !arr.length
            ) {
              alert(
                "Selecione ao menos um certificado."
              );
              return;
            }

            const botao =
              $("certGerar");

            const status =
              $("certStatus");

            if (botao) {
              botao.disabled =
                true;
            }

            try {

              for (
                let i = 0;
                i < arr.length;
                i++
              ) {

                if (status) {
                  status.textContent =
                    `Gerando ${i + 1} de ${arr.length}: ${arr[i].revisor}`;
                }

                await pdf(
                  arr[i],
                  true
                );
              }

              if (status) {
                status.textContent =
                  `${arr.length} certificado(s) gerado(s).`;
              }

            } catch (e) {

              console.error(e);

              if (status) {
                status.textContent =
                  `Erro ao gerar PDF: ${e.message}`;
              }

              alert(
                `Erro ao gerar certificado: ${e.message}`
              );

            } finally {

              if (botao) {
                botao.disabled =
                  false;
              }
            }
          }
        );

      // Enviar selecionados
      $("certEnviar")
        ?.addEventListener(
          "click",
          async () => {

            const arr =
              selecionados();

            if (
              !arr.length
            ) {
              alert(
                "Selecione ao menos um certificado com e-mail."
              );
              return;
            }

            if (
              !confirm(
                `Enviar ${arr.length} certificado(s)?`
              )
            ) {
              return;
            }

            const botao =
              $("certEnviar");

            const status =
              $("certStatus");

            if (botao) {
              botao.disabled =
                true;
            }

            let ok =
              0;

            let erros =
              0;

            for (
              const r of arr
            ) {

              if (status) {
                status.textContent =
                  `Enviando ${ok + erros + 1} de ${arr.length}: ${r.revisor}`;
              }

              try {

                await enviar(r);

                ok++;

              } catch (e) {

                erros++;

                console.error(
                  "Erro ao enviar certificado:",
                  r,
                  e
                );
              }
            }

            if (botao) {
              botao.disabled =
                false;
            }

            if (status) {
              status.textContent =
                `Concluído: ${ok} enviado(s), ${erros} erro(s).`;
            }

            render();
          }
        );

      // PDF individual
      document.addEventListener(
        "click",
        async (e) => {

          const botao =
            e.target
              ?.closest?.(
                ".cert-one"
              );

          if (!botao) {
            return;
          }

          const indice =
            Number(
              botao.dataset.i
            );

          const registro =
            filtrados[
              indice
            ];

          if (!registro) {
            return;
          }

          botao.disabled =
            true;

          try {

            await pdf(
              registro,
              true
            );

          } catch (erro) {

            console.error(
              erro
            );

            alert(
              `Erro ao gerar certificado: ${erro.message}`
            );

          } finally {

            botao.disabled =
              false;
          }
        }
      );
    }

    window.__BI_CERT_DADOS = dados || [];

    montar(
      dados
    );

    popular();

    render();
  }

  // ============================================================
  // FUNÇÃO EXPOSTA PARA O DASHBOARD
  // ============================================================

  window.atualizarCertificados =
    init;

})();