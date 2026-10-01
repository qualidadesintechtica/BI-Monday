(function () {
  "use strict";

  // ============================================================
  // CERTIFICADOS V25.46.32 — UNIVERSO COMPLETO + MÚLTIPLOS REVISORES AO VIVO
  //
  // Regra:
  // 1. A Monday/Supabase define o universo da aba.
  // 2. Entram automaticamente UAs das matrizes-alvo com Status = Validado.
  // 3. O revisor vem DIRETAMENTE da coluna People de revisor da Monday.
  // 4. O item direto da Monday é cruzado com a base consolidada apenas para UC/matriz/semestre.
  // 5. Os nomes de revisores são padronizados em CAIXA ALTA.
  // 6. Quando nome ou e-mail não forem encontrados, a própria tabela permite edição manual.
  // 7. A base de revisores nunca exclui uma UA validada; ela apenas complementa/valida o cadastro.
  // ============================================================

  let base = [];
  let filtrados = [];
  let revisoresPlanilhaPorNome = new Map();
  let revisoresPlanilhaPorEmail = new Map();
  let revisoresPlanilhaPorLocalEmail = new Map();

  // Diretório real de usuários da coluna People da Monday.
  let mondayUsuariosPorId = new Map();
  let mondayUsuariosPorEmail = new Map();
  let mondayUsuariosPorNome = new Map();

  // V25.46.32: leitura ao vivo do board.
  // Garante que UAs ainda não refletidas na tabela sincronizada e segundos revisores
  // da coluna People também entrem na aba Certificados.
  let mondayRevisoresPorItem = new Map();
  let mondayItensLive = [];

  const BOARD_VALIDACAO = 9433297929;
  const COLUNA_REVISOR_MONDAY = "multiple_person_mkx6ryhs";

  let edicoesManuais = {};
  const STORAGE_KEY = "bi_certificados_edicoes_v25_46_27";
  let historico = new Set();
  let historicoDetalhes = new Map();
  let inicializado = false;

  const MATRIZES_ALVO = new Set([
    "e2a lato sensu",
    "e2a mandala express",
    "e2a mandala realize",
    "e2a radial"
  ]);

  const $ = (id) => document.getElementById(id);
  const txt = (v) => String(v ?? "").trim();

  const nomeCaixaAlta = (v) =>
    txt(v).toLocaleUpperCase("pt-BR");

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
    const matriz = normMatriz(
      item?.matriz_oferta ||
      item?.matriz ||
      item?.matriz_de_oferta ||
      ""
    );

    // Regra de segurança V25.46.32:
    // se a matriz ainda não veio no registro da Monday, NÃO eliminamos a UA.
    // O cruzamento com a base consolidada tenta completar essa informação depois.
    if (!matriz) return true;

    if (MATRIZES_ALVO.has(matriz)) return true;
    if (matriz.includes("radial")) return true;
    if (matriz.includes("lato") && matriz.includes("sensu")) return true;
    if (
      matriz.includes("mandala") &&
      (matriz.includes("express") || matriz.includes("realize"))
    ) return true;

    return false;
  }

  function ehUA(item) {
    if (item?.eh_ua === true) return true;

    const categoria = norm(
      item?.categoria_material ||
      item?.tipo_material ||
      item?.tipo_unidade ||
      ""
    );

    if (
      categoria === "unidade de aprendizagem" ||
      categoria === "ua" ||
      categoria.includes("unidade de aprendizagem")
    ) {
      return true;
    }

    // Não usa somente o primeiro campo preenchido. Alguns registros da Monday
    // trazem o título da UC em item_name e a identificação UNIDADE 02 / UA02
    // em outro campo. Todos os candidatos precisam ser avaliados.
    const candidatos = [
      item?.item_name,
      item?.titulo_ua,
      item?.unidade_material,
      item?.name,
      item?.id_ua,
      item?.tipo_unidade,
      item?.tipo_material
    ]
      .map((v) => norm(v))
      .filter(Boolean);

    const padraoUa =
      /^(?:ua|unidade|unidade de aprendizagem)\s*0?(?:[1-9]|1[0-9])(?:\b|\s|$)/i;

    return candidatos.some((valor) => padraoUa.test(valor));
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
  // USUÁRIOS E PEOPLE DA MONDAY
  // ============================================================

  function jsonSeguro(valor) {
    if (!valor) return null;
    if (typeof valor === "object") return valor;

    try {
      return JSON.parse(String(valor));
    } catch (_) {
      return null;
    }
  }

  function idsPessoasDoValor(valor) {
    const objeto = jsonSeguro(valor);
    const pessoas = Array.isArray(objeto?.personsAndTeams)
      ? objeto.personsAndTeams
      : [];

    return [...new Set(
      pessoas
        .filter((p) => p?.kind === "person" && p?.id != null)
        .map((p) => String(p.id))
        .filter(Boolean)
    )];
  }

  function dadosColunaRevisor(item) {
    const original = jsonSeguro(item?.dados_originais);
    const colunasOriginais = Array.isArray(original?.column_values)
      ? original.column_values
      : [];

    const colunaOriginal = colunasOriginais.find(
      (cv) => String(cv?.id || "") === COLUNA_REVISOR_MONDAY
    );

    const colunasMapeadas = jsonSeguro(item?.dados_colunas);
    const colunaMapeada =
      colunasMapeadas && typeof colunasMapeadas === "object"
        ? colunasMapeadas[COLUNA_REVISOR_MONDAY]
        : null;

    const mondayId = txt(
      item?.monday_item_validacao ||
      item?.monday_item_id ||
      item?.id
    );

    const live = mondayId ? mondayRevisoresPorItem.get(mondayId) : null;

    const ids = [
      ...idsPessoasDoValor(colunaOriginal?.value),
      ...idsPessoasDoValor(colunaMapeada?.value),
      ...(Array.isArray(live?.person_ids)
        ? live.person_ids.map((id) => String(id))
        : [])
    ].filter((v, i, a) => v && a.indexOf(v) === i);

    return {
      ids,
      texto: txt(
        live?.revisor_texto ||
        item?.revisor_validador ||
        colunaOriginal?.text ||
        colunaMapeada?.text ||
        ""
      )
    };
  }

  function registrarUsuarioMonday(usuario) {
    const id = txt(usuario?.monday_user_id || usuario?.id);
    const nome = txt(usuario?.nome || usuario?.name);
    const email = emailDoTexto(usuario?.email);

    if (!id && !nome && !email) return;

    const cadastro = {
      id,
      nome,
      email,
      aliases: Array.isArray(usuario?.aliases) ? usuario.aliases : []
    };

    if (id) mondayUsuariosPorId.set(id, cadastro);
    if (email) mondayUsuariosPorEmail.set(email.toLowerCase(), cadastro);

    if (nome) {
      mondayUsuariosPorNome.set(chavePessoa(nome), cadastro);
    }

    cadastro.aliases.forEach((alias) => {
      const chave = chavePessoa(alias);
      if (chave && !mondayUsuariosPorNome.has(chave)) {
        mondayUsuariosPorNome.set(chave, cadastro);
      }
    });
  }

  async function carregarUsuariosMonday() {
    mondayUsuariosPorId = new Map();
    mondayUsuariosPorEmail = new Map();
    mondayUsuariosPorNome = new Map();
    mondayRevisoresPorItem = new Map();
    mondayItensLive = [];

    try {
      const { data, error } = await window.biSupabase.functions.invoke(
        "monday-revisores",
        {
          body: {
            board_id: BOARD_VALIDACAO
          }
        }
      );

      if (error) throw error;
      if (data?.success === false) {
        throw new Error(data?.error || "Falha ao consultar revisores da Monday.");
      }

      const lista = Array.isArray(data?.revisores) ? data.revisores : [];
      lista.forEach(registrarUsuarioMonday);

      const itens = Array.isArray(data?.itens) ? data.itens : [];
      mondayItensLive = itens.map((item) => ({
        ...item,
        monday_item_id: txt(item?.monday_item_id || item?.id),
        monday_item_validacao: txt(item?.monday_item_id || item?.id),
        item_name: txt(item?.item_name || item?.name),
        titulo: txt(item?.titulo),
        status_validacao: txt(item?.status_validacao || item?.status),
        revisor_validador: txt(item?.revisor_texto || item?.revisor_validador),
        id_titulo: txt(item?.id_titulo),
        id_ua: txt(item?.id_ua),
        bloco: txt(item?.bloco),
        tipo_material: txt(item?.tipo_material),
        tipo_unidade: txt(item?.tipo_unidade),
        categoria_material: txt(item?.tipo_material),
        esteira: txt(item?.esteira),
        esteira_producao: txt(item?.esteira),
        __fonte_certificado: "monday_live"
      }));

      itens.forEach((item) => {
        const id = txt(item?.monday_item_id || item?.id);
        if (!id) return;
        mondayRevisoresPorItem.set(id, {
          person_ids: Array.isArray(item?.person_ids)
            ? item.person_ids.map((v) => String(v))
            : [],
          revisor_texto: txt(item?.revisor_texto)
        });
      });

      console.info(
        `Certificados: ${lista.length} usuários e ${itens.length} itens lidos diretamente da Monday.`
      );
    } catch (error) {
      console.warn(
        "Certificados: não foi possível carregar o diretório/itens ao vivo da Monday. " +
        "Será usado o conteúdo sincronizado como fallback.",
        error
      );
    }
  }

  function usuarioMondayPorTexto(valor) {
    const bruto = txt(valor);
    if (!bruto) return null;

    const email = emailDoTexto(bruto);
    if (email) {
      const porEmail = mondayUsuariosPorEmail.get(email.toLowerCase());
      if (porEmail) return porEmail;
    }

    const chave = chavePessoa(bruto);
    if (chave) {
      const porNome = mondayUsuariosPorNome.get(chave);
      if (porNome) return porNome;
    }

    return null;
  }

  function revisorResolvidoDaMonday(usuarioOuTexto) {
    const usuario =
      usuarioOuTexto && typeof usuarioOuTexto === "object"
        ? usuarioOuTexto
        : usuarioMondayPorTexto(usuarioOuTexto);

    const nomeMonday = txt(
      usuario?.nome ||
      usuario?.name ||
      (typeof usuarioOuTexto === "string" && !emailDoTexto(usuarioOuTexto)
        ? usuarioOuTexto
        : "")
    );

    const emailMonday =
      emailDoTexto(usuario?.email) ||
      emailDoTexto(
        typeof usuarioOuTexto === "string" ? usuarioOuTexto : ""
      );

    const oficial =
      localizarRevisorPlanilha(emailMonday) ||
      localizarRevisorPlanilha(nomeMonday);

    if (oficial) {
      return {
        revisor: oficial.revisor,
        revisorMonday: nomeMonday || emailMonday,
        email: oficial.email || emailMonday || "",
        localizado: true,
        fonte: oficial.fonte || "base_oficial",
        mondayUserId: txt(usuario?.id)
      };
    }

    return {
      revisor: nomeMonday ? nomeCaixaAlta(nomeMonday) : "",
      revisorMonday: nomeMonday || emailMonday,
      email: emailMonday || "",
      localizado: false,
      fonte: "monday",
      mondayUserId: txt(usuario?.id)
    };
  }

  // ============================================================
  // BASE OFICIAL DE REVISORES
  // Prioridade:
  // 1. public.revisores_cadastro (Supabase)
  // 2. data/revisores_planilha.json (fallback empacotado)
  // 3. public.revisores_ua (complemento legado)
  //
  // O cruzamento aceita NOME ou E-MAIL vindo da Monday.
  // ============================================================

  function chavePessoaCompacta(v) {
    const ignorar = new Set(["de", "da", "do", "das", "dos", "e"]);
    return chavePessoa(v)
      .split(" ")
      .filter((p) => p && !ignorar.has(p))
      .join(" ");
  }

  function localEmail(v) {
    const email = emailDoTexto(v);
    if (!email) return "";
    return email.split("@")[0].toLowerCase().trim();
  }

  function registrarRevisorBase(nomeValor, emailValor, fonte = "base") {
    const nome = nomeCaixaAlta(nomeValor);
    const chaveNome = chavePessoa(nome);
    const email = emailDoTexto(emailValor);

    if (!nome || !chaveNome) return null;

    const atual = revisoresPlanilhaPorNome.get(chaveNome);
    const cadastro = atual || {
      revisor: nome,
      email: "",
      fonte
    };

    // Preserva o nome padronizado e aproveita o melhor e-mail disponível.
    cadastro.revisor = nome;
    if (emailValido(email)) cadastro.email = email;
    cadastro.fonte = atual?.fonte === "revisores_cadastro" ? atual.fonte : fonte;

    revisoresPlanilhaPorNome.set(chaveNome, cadastro);

    if (emailValido(cadastro.email)) {
      revisoresPlanilhaPorEmail.set(cadastro.email.toLowerCase(), cadastro);

      const local = localEmail(cadastro.email);
      if (local) {
        const existente = revisoresPlanilhaPorLocalEmail.get(local);
        if (!existente) {
          revisoresPlanilhaPorLocalEmail.set(local, cadastro);
        } else if (existente.revisor !== cadastro.revisor) {
          // Local-part duplicado: marca como ambíguo para não associar errado.
          revisoresPlanilhaPorLocalEmail.set(local, null);
        }
      }
    }

    return cadastro;
  }

  async function carregarRevisoresPlanilha() {
    revisoresPlanilhaPorNome = new Map();
    revisoresPlanilhaPorEmail = new Map();
    revisoresPlanilhaPorLocalEmail = new Map();

    let totalJson = 0;
    let totalCadastro = 0;
    let totalUa = 0;

    // Fallback local: garante que a base anexada continue disponível
    // mesmo se a tabela nova ainda não estiver instalada.
    try {
      const resp = await fetch(
        "data/revisores_planilha.json?v=20261001-v25-46-26",
        { cache: "no-store" }
      );

      if (resp.ok) {
        const payload = await resp.json();
        const lista = Array.isArray(payload?.revisores) ? payload.revisores : [];
        totalJson = lista.length;

        lista.forEach((r) => {
          registrarRevisorBase(r.nome, r.email, "planilha");
        });
      }
    } catch (error) {
      console.warn("Certificados: fallback local de revisores não carregado.", error);
    }

    // Fonte principal: cadastro geral no Supabase.
    try {
      const { data, error } = await window.biSupabase
        .from("revisores_cadastro")
        .select("docente_revisor,email,ativo")
        .eq("ativo", true);

      if (error) throw error;

      totalCadastro = (data || []).length;
      (data || []).forEach((r) => {
        registrarRevisorBase(r.docente_revisor, r.email, "revisores_cadastro");
      });
    } catch (error) {
      console.warn(
        "Certificados: tabela revisores_cadastro indisponível; usando fallback da planilha.",
        error
      );
    }

    // Complemento legado: adiciona nomes/e-mails que existam em revisores_ua.
    try {
      const { data, error } = await window.biSupabase
        .from("revisores_ua")
        .select("docente_revisor,email,ativo")
        .eq("ativo", true);

      if (error) throw error;

      totalUa = (data || []).length;
      (data || []).forEach((r) => {
        registrarRevisorBase(r.docente_revisor, r.email, "revisores_ua");
      });
    } catch (error) {
      console.warn("Certificados: complemento revisores_ua não carregado.", error);
    }

    const listaFinal = [...revisoresPlanilhaPorNome.values()];
    const comEmail = listaFinal.filter((r) => emailValido(r.email)).length;
    const semEmail = listaFinal.length - comEmail;

    window.__BI_CERT_REVISORES_PLANILHA = {
      total: listaFinal.length,
      comEmail,
      semEmail,
      totalJson,
      totalCadastro,
      totalUa
    };

    console.info(
      `Certificados: base oficial carregada (${listaFinal.length} revisores únicos; ` +
      `${comEmail} com e-mail; ${semEmail} sem e-mail).`,
      window.__BI_CERT_REVISORES_PLANILHA
    );
  }

  function localizarRevisorPlanilha(valorMonday) {
    const original = txt(valorMonday);
    if (!original) return null;

    // 1. Se a Monday trouxe e-mail (inclusive "NOME <email>"),
    // tenta pelo e-mail completo.
    const email = emailDoTexto(original);
    if (email) {
      const porEmail = revisoresPlanilhaPorEmail.get(email.toLowerCase());
      if (porEmail) return porEmail;

      // 2. Se o domínio veio diferente/truncado, usa o local-part somente
      // quando ele é único na base oficial.
      const local = localEmail(email);
      const porLocal = local ? revisoresPlanilhaPorLocalEmail.get(local) : null;
      if (porLocal) return porLocal;
    }

    // 3. Correspondência exata pelo nome.
    const chave = chavePessoa(original);
    if (chave) {
      const exato = revisoresPlanilhaPorNome.get(chave);
      if (exato) return exato;
    }

    // 4. Nome sem conectores (DE, DA, DOS...).
    const compacta = chavePessoaCompacta(original);
    if (compacta) {
      const candidatosCompactos = [];
      for (const cadastro of revisoresPlanilhaPorNome.values()) {
        if (chavePessoaCompacta(cadastro.revisor) === compacta) {
          candidatosCompactos.push(cadastro);
        }
      }
      if (candidatosCompactos.length === 1) return candidatosCompactos[0];
    }

    // 5. Aproximação conservadora por inclusão de nome: aceita apenas
    // quando existe exatamente um candidato.
    if (chave) {
      const candidatos = [];
      for (const [chaveBase, cadastro] of revisoresPlanilhaPorNome.entries()) {
        if (chave.includes(chaveBase) || chaveBase.includes(chave)) {
          candidatos.push(cadastro);
        }
      }
      if (candidatos.length === 1) return candidatos[0];
    }

    return null;
  }

  function nomesRevisorMonday(valor) {
    if (Array.isArray(valor)) {
      return [...new Set(valor.flatMap(nomesRevisorMonday).filter(Boolean))];
    }

    if (valor && typeof valor === "object") {
      if (Array.isArray(valor.personsAndTeams)) {
        return [...new Set(
          valor.personsAndTeams
            .flatMap((p) => {
              const candidato =
                p?.email ||
                p?.name ||
                p?.text ||
                p?.display_name ||
                p?.label ||
                "";
              return nomesRevisorMonday(candidato);
            })
            .filter(Boolean)
        )];
      }

      return nomesRevisorMonday(
        valor.email || valor.name || valor.text || valor.label || ""
      );
    }

    const bruto = txt(valor);
    if (!bruto) return [];

    // Se o conteúdo completo já identifica um único revisor, não divide.
    if (localizarRevisorPlanilha(bruto)) return [bruto];

    let partes = bruto
      .split(/\s*(?:\||;|\n|\r|\/{1,})\s*/)
      .map((v) => txt(v))
      .filter(Boolean);

    // Monday/Supabase pode consolidar múltiplas pessoas por vírgula.
    if (partes.length === 1 && bruto.includes(",")) {
      const porVirgula = bruto
        .split(",")
        .map((v) => txt(v))
        .filter(Boolean);

      if (
        porVirgula.length > 1 &&
        porVirgula.every((item) => localizarRevisorPlanilha(item))
      ) {
        partes = porVirgula;
      }
    }

    return [...new Set(partes)];
  }

  function revisoresDaMonday(item) {
    const coluna = dadosColunaRevisor(item);
    const encontrados = [];

    // Fonte prioritária: IDs reais da coluna People do item da Monday.
    coluna.ids.forEach((id) => {
      const usuario = mondayUsuariosPorId.get(String(id));
      if (!usuario) return;

      encontrados.push(
        revisorResolvidoDaMonday(usuario)
      );
    });

    if (encontrados.length) {
      const unicos = new Map();

      encontrados.forEach((r) => {
        const chave =
          txt(r.mondayUserId) ||
          emailDoTexto(r.email) ||
          chavePessoa(r.revisor || r.revisorMonday);

        if (chave && !unicos.has(chave)) {
          unicos.set(chave, r);
        }
      });

      return [...unicos.values()];
    }

    // Fallback: texto sincronizado da mesma coluna People.
    const fonteMonday = coluna.texto;
    const nomes = nomesRevisorMonday(fonteMonday);

    return nomes.map((valorMonday) => {
      const usuario = usuarioMondayPorTexto(valorMonday);

      if (usuario) {
        return revisorResolvidoDaMonday(usuario);
      }

      return revisorResolvidoDaMonday(valorMonday);
    });
  }

  function carregarEdicoesManuais() {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY) || "{}";
      edicoesManuais = JSON.parse(salvo) || {};
    } catch (_) {
      edicoesManuais = {};
    }
  }

  function chaveEdicao(ua, revisor, indice) {
    const original = norm(revisor?.revisorMonday);
    return `${ua.chaveUa}|${original || `manual-${indice}`}`;
  }

  function salvarEdicaoManual(ua, revisor, indice) {
    const chave = chaveEdicao(ua, revisor, indice);
    edicoesManuais[chave] = {
      revisor: txt(revisor.revisor),
      email: txt(revisor.email)
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(edicoesManuais));
    } catch (e) {
      console.warn("Não foi possível persistir a edição manual do certificado.", e);
    }
  }

  function aplicarEdicaoManual(ua, revisor, indice) {
    const edicao = edicoesManuais[chaveEdicao(ua, revisor, indice)];
    if (!edicao) return;

    if (txt(edicao.revisor)) {
      const nomeEditado = nomeCaixaAlta(edicao.revisor);
      const oficial = localizarRevisorPlanilha(nomeEditado);
      if (oficial) {
        revisor.revisor = oficial.revisor;
        revisor.localizado = true;
        revisor.fonte = oficial.fonte || "base_oficial";
        if (emailValido(oficial.email)) revisor.email = oficial.email;
      } else {
        revisor.revisor = nomeEditado;
        revisor.localizado = false;
        revisor.fonte = "manual";
      }
      revisor.nomeManual = true;
    }

    if (emailValido(edicao.email)) {
      revisor.email = txt(edicao.email).toLowerCase();
      revisor.emailManual = true;
    }
  }

  // ============================================================
  // HISTÓRICO
  // ============================================================

  async function carregarHistorico() {
    try {
      const { data, error } = await window.biSupabase
        .from("certificados_envios")
        .select("chave_certificado,status,revisor,email,name_ua,titulo,semestre_oferta,enviado_em")
        .eq("status", "enviado");

      if (error) throw error;

      const registros = data || [];
      historico = new Set(registros.map((x) => x.chave_certificado));
      historicoDetalhes = new Map(
        registros
          .filter((x) => txt(x.chave_certificado))
          .map((x) => [x.chave_certificado, x])
      );
    } catch (e) {
      console.warn("Histórico de certificados ainda não instalado.", e);
      historico = new Set();
      historicoDetalhes = new Map();
    }
  }

  function chaveCertificado(ua, revisor) {
    // V25.46.32: cada revisor da mesma UA possui sua própria chave.
    // Prioridade: person_id da Monday -> e-mail -> nome normalizado.
    const chaveRevisor =
      txt(revisor?.mondayUserId) ||
      emailDoTexto(revisor?.email) ||
      norm(revisor?.revisor);

    return [
      ua.idEnvio || ua.chaveUa,
      chaveRevisor,
      norm(ua.name),
      norm(ua.titulo),
      norm(ua.semestre)
    ].join("|");
  }

  function registroCertificado(ua, revisor) {
    return {
      revisor: nomeCaixaAlta(revisor.revisor),
      email: revisor.email || "",
      name: ua.name,
      titulo: ua.titulo,
      semestre: ua.semestre,
      nqResponsavel: revisor.nqResponsavel || "",
      mondayUserId: txt(revisor.mondayUserId),
      chave: chaveCertificado(ua, revisor)
    };
  }

  function certificadosDaUa(ua) {
    if (!ua.validado || !Array.isArray(ua.revisores) || !ua.revisores.length) {
      return [];
    }

    // Uma UA pode ter 1, 2 ou mais revisores. Cada pessoa gera um
    // certificado independente, sem juntar nomes no mesmo PDF.
    const unicos = new Map();

    ua.revisores
      .filter((r) => txt(r?.revisor))
      .forEach((r) => {
        const chaveRevisor =
          txt(r.mondayUserId) ||
          emailDoTexto(r.email) ||
          norm(r.revisor);

        if (!chaveRevisor || unicos.has(chaveRevisor)) return;
        unicos.set(chaveRevisor, registroCertificado(ua, r));
      });

    return [...unicos.values()];
  }

  function estadoCertificado(ua) {
    if (!ua.revisores.some((r) => txt(r.revisor))) return "Revisor não informado na Monday";
    if (ua.revisores.some((r) => txt(r.revisor) && !r.localizado)) return "Revisor da Monday não localizado na base oficial";
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
  // RELATÓRIO DE CERTIFICADOS — V25.46.28
  // Gera Excel com Resumo, Pendentes e Enviados usando os filtros atuais.
  // ============================================================

  function formatarDataHora(valor) {
    if (!valor) return "";
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return txt(valor);
    return data.toLocaleString("pt-BR");
  }

  function situacaoCadastroRelatorio(revisor) {
    if (!txt(revisor?.revisor)) return "REVISOR NÃO INFORMADO";
    if (!revisor?.localizado) return "REVISOR NÃO LOCALIZADO NA BASE OFICIAL";
    if (!emailValido(revisor?.email)) return "SEM E-MAIL";
    return "CADASTRO OK";
  }

  function linhasRelatorioCertificados(lista) {
    const linhas = [];

    (Array.isArray(lista) ? lista : []).forEach((ua) => {
      const revisores = Array.isArray(ua?.revisores)
        ? ua.revisores.filter((r) => txt(r?.revisor))
        : [];

      if (!revisores.length) {
        linhas.push({
          Status: "PENDENTE",
          Motivo: "REVISOR NÃO INFORMADO",
          Revisor: "",
          "E-mail": "",
          UA: txt(ua?.name),
          UC: txt(ua?.titulo),
          Matriz: txt(ua?.matriz),
          Semestre: txt(ua?.semestre),
          "Status Validação": txt(ua?.statusValidacao || "Validado"),
          "Situação do cadastro": "REVISOR NÃO INFORMADO",
          "ID Monday": txt(ua?.idEnvio),
          "Data de envio": ""
        });
        return;
      }

      revisores.forEach((revisor) => {
        const cert = registroCertificado(ua, revisor);
        const enviado = historico.has(cert.chave);
        const detalhe = historicoDetalhes.get(cert.chave) || {};

        let motivo = "";
        if (!enviado) {
          if (!emailValido(revisor.email)) motivo = "SEM E-MAIL";
          else if (!revisor.localizado) motivo = "REVISOR NÃO LOCALIZADO NA BASE OFICIAL";
          else motivo = "AGUARDANDO ENVIO";
        }

        linhas.push({
          Status: enviado ? "ENVIADO" : "PENDENTE",
          Motivo: motivo,
          Revisor: nomeCaixaAlta(revisor.revisor),
          "E-mail": txt(revisor.email).toLowerCase(),
          UA: txt(ua.name),
          UC: txt(ua.titulo),
          Matriz: txt(ua.matriz),
          Semestre: txt(ua.semestre),
          "Status Validação": txt(ua.statusValidacao || "Validado"),
          "Situação do cadastro": situacaoCadastroRelatorio(revisor),
          "ID Monday": txt(ua.idEnvio),
          "Data de envio": enviado ? formatarDataHora(detalhe.enviado_em) : ""
        });
      });
    });

    return linhas;
  }

  function planilhaRelatorio(linhas) {
    const colunas = [
      "Status",
      "Motivo",
      "Revisor",
      "E-mail",
      "UA",
      "UC",
      "Matriz",
      "Semestre",
      "Status Validação",
      "Situação do cadastro",
      "ID Monday",
      "Data de envio"
    ];

    const ws = linhas.length
      ? window.XLSX.utils.json_to_sheet(linhas, { header: colunas })
      : window.XLSX.utils.aoa_to_sheet([colunas]);

    const larguras = colunas.map((coluna) => {
      const maior = Math.max(
        coluna.length,
        ...linhas.map((linha) => txt(linha[coluna]).length)
      );
      return { wch: Math.min(Math.max(maior + 2, 12), 48) };
    });

    ws["!cols"] = larguras;
    ws["!autofilter"] = { ref: `A1:L${Math.max(linhas.length + 1, 1)}` };
    return ws;
  }

  function exportarRelatorioCertificados() {
    if (!window.XLSX) {
      alert("Biblioteca XLSX não carregada. Atualize a página e tente novamente.");
      return;
    }

    const universo = aplicarFiltrosCertificados(base);
    const linhas = linhasRelatorioCertificados(universo);
    const pendentes = linhas.filter((x) => x.Status === "PENDENTE");
    const enviados = linhas.filter((x) => x.Status === "ENVIADO");

    const revisores = new Set(linhas.map((x) => norm(x.Revisor)).filter(Boolean));
    const semEmail = pendentes.filter((x) => x.Motivo === "SEM E-MAIL").length;
    const semRevisor = pendentes.filter((x) => x.Motivo === "REVISOR NÃO INFORMADO").length;

    const resumo = [
      { Indicador: "UAs validadas no filtro", Valor: universo.length },
      { Indicador: "Registros de certificados", Valor: linhas.length },
      { Indicador: "Certificados enviados", Valor: enviados.length },
      { Indicador: "Certificados pendentes", Valor: pendentes.length },
      { Indicador: "Pendentes sem e-mail", Valor: semEmail },
      { Indicador: "Pendentes sem revisor", Valor: semRevisor },
      { Indicador: "Revisores distintos", Valor: revisores.size },
      { Indicador: "Filtro - Semestre", Valor: txt($("certSemestre")?.value) || "Todos" },
      { Indicador: "Filtro - Revisor", Valor: txt($("certRevisor")?.value) || "Todos" },
      { Indicador: "Filtro - E-mail", Valor: txt($("certEmail")?.value) || "Com e sem e-mail" },
      { Indicador: "Filtro - Pesquisa", Valor: txt($("certBusca")?.value) || "Sem pesquisa" },
      { Indicador: "Global - Esteira", Valor: selecionadosFiltroGlobal("filtroEsteira").join(" | ") || "Todas" },
      { Indicador: "Global - Matriz", Valor: selecionadosFiltroGlobal("filtroMatriz").join(" | ") || "Todas" },
      { Indicador: "Global - Bloco", Valor: selecionadosFiltroGlobal("filtroBloco").join(" | ") || "Todos" },
      { Indicador: "Global - Status", Valor: selecionadosFiltroGlobal("filtroStatus").join(" | ") || "Todos" },
      { Indicador: "Global - Categoria", Valor: selecionadosFiltroGlobal("filtroCategoria").join(" | ") || "Todas" },
      { Indicador: "Global - Gestor", Valor: selecionadosFiltroGlobal("filtroGestor").join(" | ") || "Todos" },
      { Indicador: "Global - Revisor", Valor: selecionadosFiltroGlobal("filtroRevisor").join(" | ") || "Todos" }
    ];

    const wb = window.XLSX.utils.book_new();
    const wsResumo = window.XLSX.utils.json_to_sheet(resumo);
    wsResumo["!cols"] = [{ wch: 30 }, { wch: 32 }];

    window.XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");
    window.XLSX.utils.book_append_sheet(wb, planilhaRelatorio(pendentes), "Pendentes");
    window.XLSX.utils.book_append_sheet(wb, planilhaRelatorio(enviados), "Enviados");

    const agora = new Date();
    const data = [
      agora.getFullYear(),
      String(agora.getMonth() + 1).padStart(2, "0"),
      String(agora.getDate()).padStart(2, "0")
    ].join("-");
    const hora = `${String(agora.getHours()).padStart(2, "0")}${String(agora.getMinutes()).padStart(2, "0")}`;

    window.XLSX.writeFile(wb, `Relatorio_Certificados_${data}_${hora}.xlsx`);

    const status = $("certStatus");
    if (status) {
      status.textContent = `Relatório gerado: ${pendentes.length} pendente(s) · ${enviados.length} enviado(s).`;
    }
  }

  // ============================================================
  // MONTA A ABA A PARTIR DOS DADOS SINCRONIZADOS DA MONDAY
  // ============================================================

  function indiceConsolidadoPorMondayId(dadosConsolidados) {
    const mapa = new Map();

    (dadosConsolidados || []).forEach((item) => {
      const id = txt(item?.monday_item_validacao || item?.monday_item_id);
      if (!id) return;

      if (!mapa.has(id)) {
        mapa.set(id, item);
      }
    });

    return mapa;
  }


  function chaveIdTituloUa(item) {
    const idTitulo = norm(item?.id_titulo || item?.codigo_uc || "");
    const idUa = norm(item?.id_ua || item?.codigo_ua || item?.codigo_pp || "");
    if (!idTitulo || !idUa) return "";
    return `${idTitulo}|${idUa}`;
  }

  function chaveTituloUa(item) {
    const titulo = norm(tituloDaUa(item));
    const ua = norm(nomeDaUa(item));
    if (!titulo || !ua) return "";
    return `${titulo}|${ua}`;
  }

  function indicesConsolidadosAlternativos(dadosConsolidados) {
    const porIdTituloUa = new Map();
    const porTituloUa = new Map();

    (dadosConsolidados || []).forEach((item) => {
      const a = chaveIdTituloUa(item);
      if (a && !porIdTituloUa.has(a)) porIdTituloUa.set(a, item);

      const b = chaveTituloUa(item);
      if (b && !porTituloUa.has(b)) porTituloUa.set(b, item);
    });

    return { porIdTituloUa, porTituloUa };
  }

  function localizarMetadado(item, porMondayId, alternativos) {
    const mondayId = txt(
      item?.monday_item_validacao ||
      item?.monday_item_id ||
      item?.id
    );

    if (mondayId && porMondayId.has(mondayId)) {
      return porMondayId.get(mondayId);
    }

    const a = chaveIdTituloUa(item);
    if (a && alternativos.porIdTituloUa.has(a)) {
      return alternativos.porIdTituloUa.get(a);
    }

    const b = chaveTituloUa(item);
    if (b && alternativos.porTituloUa.has(b)) {
      return alternativos.porTituloUa.get(b);
    }

    return null;
  }

  function combinarMondayComMetadados(itemMonday, metadado) {
    const m = metadado || {};

    return {
      ...m,
      ...itemMonday,

      status_validacao:
        txt(itemMonday?.status_validacao || itemMonday?.status) ||
        txt(m?.status_validacao),

      revisor_validador:
        txt(itemMonday?.revisor_validador || itemMonday?.revisor) ||
        txt(m?.revisor_validador),

      matriz_oferta:
        txt(itemMonday?.matriz_oferta || itemMonday?.matriz) ||
        txt(m?.matriz_oferta),

      semestre_oferta:
        txt(itemMonday?.semestre_oferta || itemMonday?.semestre) ||
        txt(m?.semestre_oferta),

      titulo:
        txt(
          itemMonday?.titulo ||
          itemMonday?.titulo_validacao ||
          itemMonday?.nome_material
        ) ||
        txt(m?.titulo),

      titulo_ua:
        txt(
          itemMonday?.titulo_ua ||
          itemMonday?.unidade_material ||
          itemMonday?.nome_ua
        ) ||
        txt(m?.titulo_ua || m?.unidade_material),

      item_name:
        txt(
          itemMonday?.item_name ||
          itemMonday?.name ||
          itemMonday?.nome_item ||
          itemMonday?.material
        ) ||
        txt(m?.item_name),

      categoria_material:
        txt(
          itemMonday?.categoria_material ||
          itemMonday?.categoria ||
          itemMonday?.tipo_material ||
          itemMonday?.tipo_unidade
        ) ||
        txt(m?.categoria_material),

      tipo_material:
        txt(itemMonday?.tipo_material) ||
        txt(m?.tipo_material),

      tipo_unidade:
        txt(itemMonday?.tipo_unidade) ||
        txt(m?.tipo_unidade),

      id_titulo:
        txt(itemMonday?.id_titulo || itemMonday?.codigo_uc) ||
        txt(m?.id_titulo),

      id_ua:
        txt(itemMonday?.id_ua || itemMonday?.codigo_ua || itemMonday?.codigo_pp) ||
        txt(m?.id_ua),

      esteira_producao:
        txt(itemMonday?.esteira_producao || itemMonday?.esteira) ||
        txt(m?.esteira_producao),

      bloco:
        txt(itemMonday?.bloco) ||
        txt(m?.bloco),

      gestor_validacao_nq:
        txt(itemMonday?.gestor_validacao_nq || itemMonday?.gestor) ||
        txt(m?.gestor_validacao_nq),

      eh_ua:
        itemMonday?.eh_ua === true ||
        m?.eh_ua === true
    };
  }

  function montar(dadosConsolidados, dadosMondayDiretos) {
    const mapa = new Map();
    const metadataPorId = indiceConsolidadoPorMondayId(dadosConsolidados);
    const metadataAlternativa = indicesConsolidadosAlternativos(dadosConsolidados);

    // V25.46.32: união das três fontes.
    // 1) consolidada (fallback histórico)
    // 2) tabela monday_validacao_materiais
    // 3) leitura ao vivo do board via monday-revisores
    //
    // A leitura ao vivo tem prioridade para status/People e a consolidada
    // continua sendo usada para completar matriz, semestre, UC e demais metadados.
    const porId = new Map();
    const semId = [];

    const adicionarFonte = (lista, prioridade) => {
      (Array.isArray(lista) ? lista : []).forEach((item, indice) => {
        const id = txt(
          item?.monday_item_validacao ||
          item?.monday_item_id ||
          item?.id
        );

        if (!id) {
          semId.push({ item, prioridade, indice });
          return;
        }

        const atual = porId.get(id);
        if (!atual || prioridade >= atual.prioridade) {
          porId.set(id, { item, prioridade });
        }
      });
    };

    adicionarFonte(dadosConsolidados || [], 1);
    adicionarFonte(dadosMondayDiretos || [], 2);
    adicionarFonte(mondayItensLive || [], 3);

    const fonteUnificada = [
      ...[...porId.values()].map((x) => x.item),
      ...semId.map((x) => x.item)
    ];

    let totalValidadoMonday = 0;
    let totalComIdsPeople = 0;
    let totalSemRevisor = 0;
    let totalSemMatriz = 0;
    let totalRecuperadoLive = 0;

    fonteUnificada.forEach((itemMonday, indice) => {
      const mondayId = txt(
        itemMonday?.monday_item_validacao ||
        itemMonday?.monday_item_id ||
        itemMonday?.id
      );

      const metadado = localizarMetadado(
        itemMonday,
        metadataPorId,
        metadataAlternativa
      );

      const item = combinarMondayComMetadados(itemMonday, metadado);

      // Primeiro identificamos UA + Validado. A ausência temporária de matriz
      // não pode eliminar uma UA válida.
      if (!ehUA(item)) return;
      if (!estaValidada(item)) return;
      if (!matrizAlvo(item)) return;

      totalValidadoMonday += 1;
      if (!txt(item?.matriz_oferta)) totalSemMatriz += 1;
      if (itemMonday?.__fonte_certificado === "monday_live") {
        totalRecuperadoLive += 1;
      }

      const colunaRevisor = dadosColunaRevisor(itemMonday);
      if (colunaRevisor.ids.length) totalComIdsPeople += 1;

      const chaveUa =
        mondayId
          ? `monday:${mondayId}`
          : chaveMaterial(item, indice);

      // Se a mesma UA aparecer por mais de uma fonte, preserva a versão
      // que trouxe mais pessoas na coluna People.
      let revisores = revisoresDaMonday(itemMonday);

      if (!revisores.length && metadado && metadado !== itemMonday) {
        revisores = revisoresDaMonday(metadado);
      }

      if (!revisores.length) {
        totalSemRevisor += 1;

        revisores = [{
          revisor: "",
          revisorMonday: "",
          email: "",
          localizado: false,
          fonte: "manual",
          mondayUserId: ""
        }];
      }

      const ua = {
        chaveUa,
        idEnvio: mondayId || chaveUa,
        name: nomeDaUa(item),
        titulo: tituloDaUa(item),
        matriz: txt(item?.matriz_oferta),
        semestre: txt(item?.semestre_oferta),
        esteira: txt(item?.esteira_producao),
        bloco: txt(item?.bloco),
        categoria: txt(item?.categoria_material),
        gestor: txt(item?.gestor_validacao_nq),
        statusValidacao: txt(item?.status_validacao) || "Validado",
        validado: true,
        revisores,
        revisorMondayBruto: colunaRevisor.texto,
        origem: item,
        origemMonday: itemMonday
      };

      ua.revisores.forEach((revisor, ri) => {
        aplicarEdicaoManual(ua, revisor, ri);
      });

      const anterior = mapa.get(chaveUa);

      if (!anterior) {
        mapa.set(chaveUa, ua);
        return;
      }

      // Mescla revisores de fontes diferentes sem juntar pessoas no mesmo certificado.
      const revisoresMesclados = new Map();

      [...(anterior.revisores || []), ...(ua.revisores || [])].forEach((r) => {
        const chave =
          txt(r?.mondayUserId) ||
          emailDoTexto(r?.email) ||
          norm(r?.revisor || r?.revisorMonday);

        if (!chave) return;

        const existente = revisoresMesclados.get(chave);
        if (!existente) {
          revisoresMesclados.set(chave, r);
          return;
        }

        // Prefere o registro mais completo.
        const pontosAtual =
          (txt(existente.revisor) ? 1 : 0) +
          (emailValido(existente.email) ? 1 : 0) +
          (existente.localizado ? 1 : 0);

        const pontosNovo =
          (txt(r.revisor) ? 1 : 0) +
          (emailValido(r.email) ? 1 : 0) +
          (r.localizado ? 1 : 0);

        if (pontosNovo > pontosAtual) revisoresMesclados.set(chave, r);
      });

      anterior.revisores = [...revisoresMesclados.values()];
      anterior.revisorMondayBruto =
        txt(ua.revisorMondayBruto) || txt(anterior.revisorMondayBruto);

      // Completa metadados que eventualmente estavam vazios.
      [
        "name",
        "titulo",
        "matriz",
        "semestre",
        "esteira",
        "bloco",
        "categoria",
        "gestor",
        "statusValidacao"
      ].forEach((campo) => {
        if (!txt(anterior[campo]) && txt(ua[campo])) anterior[campo] = ua[campo];
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
      base
        .flatMap((ua) => ua.revisores.map((r) => norm(r.revisor)))
        .filter(Boolean)
    );

    const comEmail = base.filter(uaComEmail).length;
    const semEmail = base.length - comEmail;

    window.__BI_CERT_DIAGNOSTICO = {
      uasValidadas: base.length,
      revisores: revisores.size,
      comEmail,
      semEmail,
      totalValidadoMonday,
      totalComIdsPeople,
      totalSemRevisor,
      totalSemMatriz,
      totalRecuperadoLive,
      itensLiveMonday: mondayItensLive.length,
      fonte:
        "Monday ao vivo + monday_validacao_materiais + vw_materiais_bi_consolidada"
    };

    console.info(
      "[Certificados] V25.46.32 — universo completo + múltiplos revisores:",
      window.__BI_CERT_DIAGNOSTICO
    );
  }

  // ============================================================
  // FILTROS GLOBAIS + FILTROS DA ABA — V25.46.32
  // A aba Certificados participa do MESMO ciclo de atualização do BI.
  // Os filtros globais são aplicados primeiro e, em seguida, os filtros
  // próprios da aba (Semestre, Revisor, E-mail e Pesquisa).
  // ============================================================

  const EM_BRANCO_GLOBAL = "__EM_BRANCO__";

  function selecionadosFiltroGlobal(id) {
    if (typeof window.obterSelecionados !== "function") return [];
    return window.obterSelecionados(id) || [];
  }

  function partesPessoa(valor) {
    return txt(valor)
      .split(/\s*,\s*|\s*;\s*|\s*\|\s*|\r?\n+/)
      .map((v) => txt(v))
      .filter(Boolean);
  }

  function valorPassaFiltroGlobal(valor, selecionados) {
    if (!Array.isArray(selecionados) || !selecionados.length) return true;

    const vazio = !txt(valor);
    return selecionados.some((selecionado) => {
      if (selecionado === EM_BRANCO_GLOBAL) return vazio;
      return norm(valor) === norm(selecionado);
    });
  }

  function pessoaOficialNQ(tipo, valor) {
    const cadastro = window.BI_RESPONSAVEIS_NQ;
    const mapa = tipo === "gestor" ? cadastro?.gestores : cadastro?.revisores;
    if (!mapa || !(mapa instanceof Map)) return "";
    return txt(mapa.get(norm(valor)));
  }

  function pessoaPassaFiltroGlobal(valores, selecionados, tipo) {
    if (!Array.isArray(selecionados) || !selecionados.length) return true;

    const candidatos = (Array.isArray(valores) ? valores : [valores])
      .flatMap(partesPessoa)
      .filter(Boolean);

    return selecionados.some((selecionado) => {
      if (selecionado === EM_BRANCO_GLOBAL) return candidatos.length === 0;

      const selecionadoNorm = norm(selecionado);
      const selecionadoOficial = pessoaOficialNQ(tipo, selecionado);

      return candidatos.some((candidato) => {
        if (norm(candidato) === selecionadoNorm) return true;

        const candidatoOficial = pessoaOficialNQ(tipo, candidato);
        if (candidatoOficial && norm(candidatoOficial) === selecionadoNorm) return true;
        if (selecionadoOficial && norm(candidato) === norm(selecionadoOficial)) return true;
        if (selecionadoOficial && candidatoOficial && norm(candidatoOficial) === norm(selecionadoOficial)) return true;

        if (tipo === "revisor") {
          const a = localizarRevisorPlanilha(candidato);
          const b = localizarRevisorPlanilha(selecionado);
          if (a && b && norm(a.revisor) === norm(b.revisor)) return true;
          if (a && norm(a.revisor) === selecionadoNorm) return true;
        }

        return false;
      });
    });
  }

  function aplicarFiltrosGlobaisCertificados(lista = base) {
    const filtrosGlobais = {
      esteira: selecionadosFiltroGlobal("filtroEsteira"),
      matriz: selecionadosFiltroGlobal("filtroMatriz"),
      bloco: selecionadosFiltroGlobal("filtroBloco"),
      status: selecionadosFiltroGlobal("filtroStatus"),
      categoria: selecionadosFiltroGlobal("filtroCategoria"),
      gestor: selecionadosFiltroGlobal("filtroGestor"),
      revisor: selecionadosFiltroGlobal("filtroRevisor")
    };

    return (Array.isArray(lista) ? lista : []).filter((ua) => {
      if (!valorPassaFiltroGlobal(ua.esteira, filtrosGlobais.esteira)) return false;
      if (!valorPassaFiltroGlobal(ua.matriz, filtrosGlobais.matriz)) return false;
      if (!valorPassaFiltroGlobal(ua.bloco, filtrosGlobais.bloco)) return false;
      if (!valorPassaFiltroGlobal(ua.statusValidacao, filtrosGlobais.status)) return false;
      if (!valorPassaFiltroGlobal(ua.categoria, filtrosGlobais.categoria)) return false;

      if (!pessoaPassaFiltroGlobal(ua.gestor, filtrosGlobais.gestor, "gestor")) return false;

      const revisoresGlobais = [
        ua.revisorMondayBruto,
        ...(Array.isArray(ua.revisores)
          ? ua.revisores.flatMap((r) => [r.revisor, r.revisorMonday, r.email])
          : [])
      ];

      if (!pessoaPassaFiltroGlobal(revisoresGlobais, filtrosGlobais.revisor, "revisor")) return false;

      return true;
    });
  }


  function popular() {
    const sem = $("certSemestre");
    const rev = $("certRevisor");
    const email = $("certEmail");
    if (!sem || !rev || !email) return;

    // Preserva a seleção atual ao reconstruir as opções.
    const semestreAtual = sem.value;
    const revisorAtual = rev.value;
    const emailAtual = email.value;

    const universoGlobal = aplicarFiltrosGlobaisCertificados(base);

    const semestres = [...new Set(universoGlobal.map((x) => txt(x.semestre)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));

    sem.innerHTML =
      '<option value="">Todos os semestres</option>' +
      semestres.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");

    const revisores = [...new Set(
      universoGlobal
        .flatMap((ua) => ua.revisores.map((r) => nomeCaixaAlta(r.revisor)))
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, "pt-BR"));

    rev.innerHTML =
      '<option value="">Todos os revisores</option>' +
      '<option value="__sem_revisor__">Sem revisor informado</option>' +
      revisores.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");

    // Restaura os valores somente se ainda forem válidos.
    if (semestreAtual && semestres.some((v) => norm(v) === norm(semestreAtual))) {
      const oficial = semestres.find((v) => norm(v) === norm(semestreAtual));
      sem.value = oficial || "";
    }

    if (revisorAtual === "__sem_revisor__") {
      rev.value = revisorAtual;
    } else if (revisorAtual) {
      const oficial = revisores.find((v) => norm(v) === norm(revisorAtual));
      rev.value = oficial || "";
    }

    email.value = ["", "com", "sem"].includes(emailAtual) ? emailAtual : "";

    const lista = $("certRevisoresLista");
    if (lista) {
      lista.innerHTML = [...revisoresPlanilhaPorNome.values()]
        .sort((a, b) => a.revisor.localeCompare(b.revisor, "pt-BR"))
        .map((r) => `<option value="${esc(r.revisor)}">${esc(r.email || "Sem e-mail na planilha")}</option>`)
        .join("");
    }
  }

  function emailDaUa(ua) {
    const revisores = Array.isArray(ua?.revisores) ? ua.revisores : [];
    // Categorias exclusivas para o filtro: uma UA fica em "Com e-mail"
    // somente quando TODOS os revisores associados possuem e-mail válido.
    const temComEmail = revisores.length > 0 && revisores.every((r) => emailValido(r.email));
    const temSemEmail = !temComEmail;
    return { temComEmail, temSemEmail };
  }

  function atualizarKPIs(lista = base) {
    const universo = Array.isArray(lista) ? lista : [];
    const revisores = new Set(
      universo
        .flatMap((ua) => ua.revisores.map((r) => norm(r.revisor)))
        .filter(Boolean)
    );

    // Os KPIs contam UAs. Se uma UA tiver mais de um revisor, ela continua sendo uma UA.
    const comEmail = universo.filter((ua) => emailDaUa(ua).temComEmail).length;
    const semEmail = universo.filter((ua) => emailDaUa(ua).temSemEmail).length;

    if ($("certTotalUAs")) $("certTotalUAs").textContent = universo.length;
    if ($("certRevisores")) $("certRevisores").textContent = revisores.size;
    if ($("certComEmail")) $("certComEmail").textContent = comEmail;
    if ($("certSemEmail")) $("certSemEmail").textContent = semEmail;
  }

  function aplicarFiltrosCertificados(lista = base) {
    const listaComGlobais = aplicarFiltrosGlobaisCertificados(lista);
    const sem = txt($("certSemestre")?.value);
    const rev = txt($("certRevisor")?.value);
    const filtroEmail = txt($("certEmail")?.value);
    const q = norm($("certBusca")?.value || "");

    const semNorm = norm(sem);
    const revNorm = norm(rev);

    return listaComGlobais.filter((ua) => {
      if (semNorm && norm(ua.semestre) !== semNorm) return false;

      const revisoresUa = Array.isArray(ua.revisores) ? ua.revisores : [];
      const temRevisor = revisoresUa.some((r) => txt(r.revisor));

      if (rev === "__sem_revisor__") {
        if (temRevisor) return false;
      } else if (revNorm) {
        const corresponde = revisoresUa.some((r) => norm(r.revisor) === revNorm);
        if (!corresponde) return false;
      }

      const emailStatus = emailDaUa(ua);
      if (filtroEmail === "com" && !emailStatus.temComEmail) return false;
      if (filtroEmail === "sem" && !emailStatus.temSemEmail) return false;

      if (q) {
        const texto = norm([
          ua.name,
          ua.titulo,
          ua.matriz,
          ua.semestre,
          ua.statusValidacao,
          ua.revisorMondayBruto,
          ...revisoresUa.flatMap((r) => [r.revisor, r.revisorMonday, r.email])
        ].join(" "));

        if (!texto.includes(q)) return false;
      }

      return true;
    });
  }

  function render() {
    filtrados = aplicarFiltrosCertificados(base);

    atualizarKPIs(filtrados);

    const tb = $("certTbody");
    if (!tb) return;

    if (!filtrados.length) {
      tb.innerHTML = `
        <tr>
          <td colspan="10" class="empty-table">Nenhuma UA validada encontrada para os filtros selecionados.</td>
        </tr>`;
      atualizarSel();
      return;
    }

    tb.innerHTML = filtrados.map((ua, i) => {
      const qtdCertificadosUa = certificadosDaUa(ua).length;
      const podeGerar = qtdCertificadosUa > 0;

      const revisoresHtml = ua.revisores.map((r, ri) => {
        if (r.localizado && txt(r.revisor)) {
          return `
            <div>
              ${esc(r.revisor)}
              <small class="cert-email-manual-tag">Base oficial</small>
            </div>`;
        }

        return `
          <div class="cert-edit-field">
            <input
              type="text"
              class="cert-revisor-manual"
              data-i="${i}"
              data-ri="${ri}"
              value="${esc(r.revisor)}"
              list="certRevisoresLista"
              placeholder="Selecione ou digite o revisor"
              autocomplete="off"
              aria-label="Editar revisor da UA ${esc(ua.name)}"
            >
            <small class="cert-email-missing">
              ${txt(r.revisor) ? "Nome não localizado — edite ou selecione" : "Revisor não informado — edite ou selecione"}
            </small>
          </div>`;
      }).join("");

      const emailsHtml = ua.revisores.map((r, ri) => {
        if (emailValido(r.email)) {
          const origemEmail =
            r.emailManual
              ? "Informado manualmente"
              : r.localizado
                ? "Base oficial"
                : "Monday";

          return `<div>${esc(r.email)}<div class="cert-email-manual-tag">${esc(origemEmail)}</div></div>`;
        }

        return `
          <div class="cert-edit-field">
            <input
              type="email"
              class="cert-email-manual"
              data-i="${i}"
              data-ri="${ri}"
              value="${esc(r.email)}"
              placeholder="Digite o e-mail"
              autocomplete="off"
              aria-label="Editar e-mail de ${esc(r.revisor || "revisor")}" 
            >
            <div class="cert-email-manual-msg" data-email-msg="${i}-${ri}">E-mail não localizado — edição liberada</div>
          </div>`;
      }).join("");

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
          <td>${esc(ua.statusValidacao || "Validado")}</td>
          <td><small class="cert-pill">${esc(estadoCertificado(ua))}</small></td>
          <td>
            <button
              class="cert-btn cert-one"
              data-i="${i}"
              type="button"
              ${podeGerar ? "" : "disabled"}
            >${qtdCertificadosUa > 1 ? `${qtdCertificadosUa} PDFs` : "PDF"}</button>
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
      const universoGlobal = aplicarFiltrosGlobaisCertificados(base);
      status.textContent =
        `Exibindo ${filtrados.length} de ${universoGlobal.length} UAs após filtros globais · ` +
        `${base.length} UAs validadas sincronizadas da Monday.`;
    }
  }

  // Exposto apenas para diagnóstico no console do navegador.
  window.__BI_CERT_APLICAR_FILTROS_GLOBAIS = aplicarFiltrosGlobaisCertificados;
  window.__BI_CERT_APLICAR_FILTROS = aplicarFiltrosCertificados;

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

  async function init(dadosConsolidados, dadosMondayDiretos) {
    if (!window.biSupabase) {
      console.error("biSupabase não foi inicializado.");
      return;
    }

    if (!inicializado) {
      inicializado = true;

      carregarEdicoesManuais();

      await Promise.all([
        carregarRevisoresPlanilha(),
        carregarUsuariosMonday(),
        carregarHistorico()
      ]);

      const atualizarPorFiltro = () => {
        render();
      };

      ["certSemestre", "certRevisor", "certEmail"].forEach((id) => {
        const el = $(id);
        if (!el) return;
        el.addEventListener("change", atualizarPorFiltro);
        el.addEventListener("input", atualizarPorFiltro);
      });

      const busca = $("certBusca");
      if (busca) {
        busca.addEventListener("input", atualizarPorFiltro);
        busca.addEventListener("search", atualizarPorFiltro);
        busca.addEventListener("change", atualizarPorFiltro);
      }

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

        salvarEdicaoManual(ua, revisor, revisorIndice);
        atualizarKPIs(filtrados);
        atualizarSel();
      });

      document.addEventListener("change", (e) => {
        const inputRevisor = e.target?.closest?.(".cert-revisor-manual");
        if (inputRevisor) {
          const indice = Number(inputRevisor.dataset.i);
          const revisorIndice = Number(inputRevisor.dataset.ri);
          const ua = filtrados[indice];
          const revisor = ua?.revisores?.[revisorIndice];
          if (!ua || !revisor) return;

          const valor = nomeCaixaAlta(inputRevisor.value);
          inputRevisor.value = valor;
          const oficial = localizarRevisorPlanilha(valor);

          if (oficial) {
            revisor.revisor = oficial.revisor;
            revisor.localizado = true;
            revisor.fonte = oficial.fonte || "base_oficial";
            revisor.nomeManual = true;
            if (emailValido(oficial.email)) {
              revisor.email = oficial.email;
              revisor.emailManual = false;
            }
          } else {
            revisor.revisor = nomeCaixaAlta(valor);
            revisor.localizado = false;
            revisor.fonte = "manual";
            revisor.nomeManual = true;
            if (!revisor.emailManual) revisor.email = "";
          }

          salvarEdicaoManual(ua, revisor, revisorIndice);
          popular();
          render();
          return;
        }

        if (e.target?.classList?.contains("cert-check")) atualizarSel();
      });

      $("certSelecionarTodos")?.addEventListener("click", () => {
        document
          .querySelectorAll(".cert-check:not(:disabled)")
          .forEach((x) => { x.checked = true; });
        atualizarSel();
      });

      $("certRelatorio")?.addEventListener("click", exportarRelatorioCertificados);

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

    montar(dadosConsolidados, dadosMondayDiretos);
    popular();
    render();
  }

  window.atualizarCertificados = init;
})();
