(function () {
  "use strict";

  let base = [];
  let filtrados = [];
  let emailMap = new Map();
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

  function chave(r) {
    return [
      norm(r.revisor),
      norm(r.name),
      norm(r.titulo),
      norm(r.semestre)
    ].join("|");
  }

  // ============================================================
  // E-MAILS DOS REVISORES
  // ============================================================

  async function carregarEmails() {
    try {
      const { data, error } = await window.biSupabase
        .from("nq_responsaveis")
        .select(
          "nome_oficial,aliases,emails,eh_revisor,ativo"
        )
        .eq("ativo", true)
        .eq("eh_revisor", true);

      if (error) throw error;

      (data || []).forEach((x) => {
        const emails = Array.isArray(x.emails)
          ? x.emails
          : [];

        const email =
          emails
            .map(emailDoTexto)
            .find(Boolean) || "";

        const aliases = Array.isArray(x.aliases)
          ? x.aliases
          : [];

        [
          x.nome_oficial,
          ...aliases,
          ...emails
        ].forEach((alias) => {
          if (norm(alias) && email) {
            emailMap.set(
              norm(alias),
              email
            );
          }
        });
      });

    } catch (e) {
      console.warn(
        "E-mails NQ não carregados.",
        e
      );
    }
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

    (dados || [])
      .filter(
        (x) =>
          norm(x.status_validacao) === "validado" &&
          txt(x.revisor_validador)
      )
      .forEach((x) => {

        const revisorOriginal =
          txt(x.revisor_validador);

        const revisor =
          revisorOriginal
            .replace(
              /\s*-?\s*[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
              ""
            )
            .trim() ||
          revisorOriginal;

        const name = txt(
          x.item_name ||
          x.titulo_ua ||
          x.unidade_material ||
          x.id_ua
        );

        const titulo = txt(
          x.titulo ||
          x.id_titulo
        );

        const semestre = txt(
          x.semestre_oferta
        );

        if (!name) return;

        const email =
          emailDoTexto(revisorOriginal) ||
          emailMap.get(norm(revisor)) ||
          emailMap.get(norm(revisorOriginal)) ||
          "";

        const r = {
          revisor,
          email,
          name,
          titulo,
          semestre
        };

        r.chave = chave(r);

        if (!map.has(r.chave)) {
          map.set(r.chave, r);
        }
      });

    base = [...map.values()].sort(
      (a, b) =>
        a.revisor.localeCompare(
          b.revisor,
          "pt-BR"
        )
    );
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
                  ${!r.email ? "disabled" : ""}
                >
              </td>

              <td>
                ${esc(r.revisor)}
              </td>

              <td>
                ${
                  r.email
                    ? esc(r.email)
                    : `
                      <span class="cert-email-missing">
                        Não localizado
                      </span>
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
      .filter(Boolean);
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
        carregarEmails(),
        carregarHistorico()
      ]);

      [
        "certSemestre",
        "certRevisor"
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