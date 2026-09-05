(function () {
  "use strict";

  const CAMPOS = [
    { chave: "id", rotulo: "ID", aliases: ["id"] },
    {
      chave: "tipo",
      rotulo: "Work Item Type",
      aliases: ["work item type", "tipo", "tipo do item"],
    },
    { chave: "projeto", rotulo: "Projetos", aliases: ["projetos", "projeto"] },
    {
      chave: "acao",
      rotulo: "Ações",
      aliases: ["acoes", "acao", "ações", "ação"],
    },
    { chave: "status", rotulo: "State", aliases: ["state", "status"] },
    {
      chave: "data_inicio",
      rotulo: "Start Date",
      aliases: ["start date", "data inicio", "data de inicio"],
    },
    {
      chave: "data_fim",
      rotulo: "Target Date",
      aliases: ["target date", "data fim", "data de fim"],
    },
    {
      chave: "sponsor",
      rotulo: "Sponsor",
      aliases: ["sponsor", "patrocinador"],
    },
    { chave: "esforco", rotulo: "Esforço", aliases: ["esforco", "esforço"] },
    { chave: "prioridade", rotulo: "Prioridade", aliases: ["prioridade"] },
    {
      chave: "evidencia",
      rotulo: "link evidências",
      aliases: ["link evidencias", "link evidencia", "evidencias", "evidencia"],
    },
  ];

  const TIPOS_PROJETO = new Set(["projeto", "project"]);
  const TIPOS_TAREFA = new Set([
    "tarefa",
    "task",
    "action plan",
    "plano de acao",
  ]);
  const STATUS_VALIDOS = new Set([
    "nao iniciado",
    "new",
    "a fazer",
    "iniciado",
    "em progresso",
    "active",
    "pausado",
    "finalizado",
    "encerrado",
    "concluido",
    "done",
    "closed",
    "cancelado",
    "removed",
  ]);

  const estado = {
    arquivo: null,
    hash: null,
    aba: null,
    linhaCabecalho: 0,
    linhas: [],
    linhasVazias: 0,
    faltantes: [],
  };

  function texto(valor) {
    return String(valor ?? "").trim();
  }

  function normalizar(valor) {
    return texto(valor)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function formatoBytes(bytes) {
    if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function setMensagem(elemento, mensagem, tipo = "") {
    elemento.textContent = mensagem;
    elemento.className = `import-message${tipo ? ` ${tipo}` : ""}`;
    elemento.hidden = !mensagem;
  }

  function atualizarEtapa(etapaAtual) {
    document.querySelectorAll(".import-steps li").forEach((item) => {
      const numero = Number(item.dataset.step);
      item.classList.toggle("active", numero === etapaAtual);
      item.classList.toggle("done", numero < etapaAtual);
    });
  }

  function encontrarCabecalho(matriz) {
    let melhor = null;
    const limite = Math.min(matriz.length, 25);

    for (let indice = 0; indice < limite; indice += 1) {
      const valores = (matriz[indice] || []).map(normalizar);
      const mapa = {};
      let pontuacao = 0;

      CAMPOS.forEach((campo) => {
        const aliases = campo.aliases.map(normalizar);
        const coluna = valores.findIndex((valor) => aliases.includes(valor));
        mapa[campo.chave] = coluna;
        if (coluna >= 0) pontuacao += 1;
      });

      if (!melhor || pontuacao > melhor.pontuacao) {
        melhor = { indice, mapa, pontuacao };
      }
    }

    return melhor;
  }

  function encontrarMelhorAba(workbook) {
    let melhor = null;

    workbook.SheetNames.forEach((nome) => {
      const matriz = XLSX.utils.sheet_to_json(workbook.Sheets[nome], {
        header: 1,
        defval: null,
        raw: true,
        blankrows: true,
      });
      const cabecalho = encontrarCabecalho(matriz);

      if (!cabecalho) return;

      if (!melhor || cabecalho.pontuacao > melhor.cabecalho.pontuacao) {
        melhor = { nome, matriz, cabecalho };
      }
    });

    return melhor;
  }

  function linhaVazia(linha) {
    return CAMPOS.every((campo) => !texto(linha[campo.chave]));
  }

  function componentesDataValidos(ano, mes, dia) {
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    return (
      data.getUTCFullYear() === ano &&
      data.getUTCMonth() === mes - 1 &&
      data.getUTCDate() === dia
    );
  }

  function dataValida(valor) {
    if (!texto(valor)) return true;

    if (typeof valor === "number" || /^\d+(?:[.,]\d+)?$/.test(texto(valor))) {
      const numero = Number(texto(valor).replace(",", "."));
      return Number.isFinite(numero) && numero > 0 && numero <= 2958465;
    }

    const v = texto(valor);
    const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s|$)/);
    if (iso)
      return componentesDataValidos(
        Number(iso[1]),
        Number(iso[2]),
        Number(iso[3]),
      );

    const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s|$)/);
    if (br)
      return componentesDataValidos(
        Number(br[3]),
        Number(br[2]),
        Number(br[1]),
      );

    return !Number.isNaN(Date.parse(v));
  }

  function classificarLinha(linha) {
    const erros = [];
    const tipo = normalizar(linha.tipo);

    if (!texto(linha.id)) erros.push("ID não informado");
    if (!texto(linha.projeto)) erros.push("Projeto não informado");
    if (!TIPOS_PROJETO.has(tipo) && !TIPOS_TAREFA.has(tipo)) {
      erros.push("Tipo não reconhecido");
    }
    if (texto(linha.status) && !STATUS_VALIDOS.has(normalizar(linha.status))) {
      erros.push("Status não reconhecido");
    }
    if (!dataValida(linha.data_inicio)) erros.push("Data inicial inválida");
    if (!dataValida(linha.data_fim)) erros.push("Data final inválida");

    const inicio = dataComparavel(linha.data_inicio);
    const fim = dataComparavel(linha.data_fim);
    if (inicio && fim && fim < inicio) {
      erros.push("Data final anterior à data inicial");
    }

    return erros;
  }

  function dataComparavel(valor) {
    if (!texto(valor) || !dataValida(valor)) return null;

    if (typeof valor === "number" || /^\d+(?:[.,]\d+)?$/.test(texto(valor))) {
      const numero = Number(texto(valor).replace(",", "."));
      return new Date(Date.UTC(1899, 11, 30) + numero * 86400000)
        .toISOString()
        .slice(0, 10);
    }

    const v = texto(valor);
    const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s|$)/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s|$)/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;

    return new Date(v).toISOString().slice(0, 10);
  }

  function mapearLinhas(matriz, cabecalho) {
    const linhas = [];
    let vazias = 0;

    for (
      let indice = cabecalho.indice + 1;
      indice < matriz.length;
      indice += 1
    ) {
      const origem = matriz[indice] || [];
      const linha = { numero_linha: indice + 1 };

      CAMPOS.forEach((campo) => {
        const coluna = cabecalho.mapa[campo.chave];
        linha[campo.chave] = coluna >= 0 ? origem[coluna] : null;
      });

      if (linhaVazia(linha)) {
        vazias += 1;
        continue;
      }

      linha._erros = classificarLinha(linha);
      linhas.push(linha);
    }

    const frequencia = new Map();
    linhas.forEach((linha) => {
      const id = texto(linha.id);
      if (id) frequencia.set(id, (frequencia.get(id) || 0) + 1);
    });

    linhas.forEach((linha) => {
      const id = texto(linha.id);
      if (id && frequencia.get(id) > 1) linha._erros.push("ID duplicado");
    });

    return { linhas, vazias };
  }

  function serialExcelParaData(valor) {
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero <= 0) return texto(valor) || "—";
    const data = new Date(Date.UTC(1899, 11, 30) + numero * 86400000);
    return Number.isNaN(data.getTime())
      ? texto(valor) || "—"
      : data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  }

  function formatarData(valor) {
    if (valor === null || valor === undefined || valor === "") return "—";
    if (typeof valor === "number" || /^\d+(?:[.,]\d+)?$/.test(texto(valor))) {
      return serialExcelParaData(texto(valor).replace(",", "."));
    }
    return texto(valor);
  }

  function adicionarCelula(tr, valor, titulo = "") {
    const td = document.createElement("td");
    td.textContent = texto(valor) || "—";
    if (titulo) td.title = titulo;
    tr.appendChild(td);
  }

  function renderizarTabela(linhas) {
    const corpo = document.getElementById("previewBody");
    corpo.replaceChildren();

    linhas.slice(0, 10).forEach((linha) => {
      const tr = document.createElement("tr");
      if (linha._erros.length) {
        tr.classList.add("row-warning");
        tr.title = linha._erros.join("; ");
      }

      adicionarCelula(tr, linha.numero_linha, linha._erros.join("; "));
      adicionarCelula(tr, linha.id);
      adicionarCelula(tr, linha.tipo);
      adicionarCelula(tr, linha.projeto, texto(linha.projeto));
      adicionarCelula(tr, linha.acao, texto(linha.acao));
      adicionarCelula(tr, linha.status);
      adicionarCelula(tr, formatarData(linha.data_inicio));
      adicionarCelula(tr, formatarData(linha.data_fim));
      corpo.appendChild(tr);
    });
  }

  function calcularResumo() {
    let projetos = 0;
    let tarefas = 0;
    let alertas = 0;

    estado.linhas.forEach((linha) => {
      const tipo = normalizar(linha.tipo);
      if (TIPOS_PROJETO.has(tipo)) projetos += 1;
      if (TIPOS_TAREFA.has(tipo)) tarefas += 1;
      if (linha._erros.length) alertas += 1;
    });

    return { projetos, tarefas, alertas };
  }

  function renderizarPrevia() {
    const resumo = calcularResumo();
    const limite = Number(window.BI_CONFIG.PQ_IMPORT_MAX_ROWS || 5000);
    const preview = document.getElementById("previewSection");
    const botao = document.getElementById("importButton");
    const mensagem = document.getElementById("validationMessage");
    const dica = document.getElementById("importHint");

    document.getElementById("fileSummary").textContent =
      `${estado.arquivo.name} · ${formatoBytes(estado.arquivo.size)} · cabeçalho na linha ${estado.linhaCabecalho}`;
    document.getElementById("sheetBadge").textContent = `Aba: ${estado.aba}`;
    document.getElementById("totalRows").textContent =
      estado.linhas.length.toLocaleString("pt-BR");
    document.getElementById("totalProjects").textContent =
      resumo.projetos.toLocaleString("pt-BR");
    document.getElementById("totalTasks").textContent =
      resumo.tarefas.toLocaleString("pt-BR");
    document.getElementById("totalIssues").textContent =
      resumo.alertas.toLocaleString("pt-BR");
    renderizarTabela(estado.linhas);

    let bloqueio = "";
    if (estado.faltantes.length) {
      bloqueio = `Importação bloqueada. Colunas não encontradas: ${estado.faltantes.join(", ")}.`;
    } else if (!estado.linhas.length) {
      bloqueio = "Importação bloqueada. Nenhuma linha útil foi encontrada.";
    } else if (estado.linhas.length > limite) {
      bloqueio = `Importação bloqueada. O limite é de ${limite.toLocaleString("pt-BR")} linhas.`;
    }

    if (bloqueio) {
      setMensagem(mensagem, bloqueio, "error");
      botao.disabled = true;
      dica.textContent = "Corrija a planilha antes de continuar.";
    } else if (resumo.alertas || estado.linhasVazias) {
      const partes = [];
      if (resumo.alertas)
        partes.push(
          `${resumo.alertas} linha(s) com alerta serão registradas e ignoradas no processamento`,
        );
      if (estado.linhasVazias)
        partes.push(
          `${estado.linhasVazias} linha(s) vazia(s) foram descartadas`,
        );
      setMensagem(mensagem, `${partes.join(". ")}.`, "warning");
      botao.disabled = false;
      dica.textContent =
        "As linhas válidas serão processadas; os alertas ficarão registrados.";
    } else {
      setMensagem(
        mensagem,
        "Estrutura conferida. A planilha está pronta para importação.",
        "success",
      );
      botao.disabled = false;
      dica.textContent = "A planilha está pronta para atualizar a base.";
    }

    preview.hidden = false;
    atualizarEtapa(2);
    preview.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function gerarHash(arrayBuffer) {
    const hash = await crypto.subtle.digest("SHA-256", arrayBuffer);
    return Array.from(new Uint8Array(hash))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  async function processarArquivo(arquivo) {
    const status = document.getElementById("readStatus");
    document.getElementById("previewSection").hidden = true;
    document.getElementById("resultSection").hidden = true;
    atualizarEtapa(1);

    if (!arquivo) return;
    if (!/\.(xlsx|xls)$/i.test(arquivo.name)) {
      setMensagem(
        status,
        "Escolha um arquivo Excel no formato XLSX ou XLS.",
        "error",
      );
      return;
    }
    if (arquivo.size > 10 * 1024 * 1024) {
      setMensagem(status, "O arquivo excede o limite de 10 MB.", "error");
      return;
    }
    if (!window.XLSX) {
      setMensagem(
        status,
        "O leitor de Excel não foi carregado. Atualize a página e tente novamente.",
        "error",
      );
      return;
    }

    setMensagem(status, "Lendo e conferindo a planilha...");

    try {
      const conteudo = await arquivo.arrayBuffer();
      const workbook = XLSX.read(conteudo, { type: "array", cellDates: false });
      const encontrada = encontrarMelhorAba(workbook);

      if (!encontrada) throw new Error("Nenhuma aba pôde ser lida.");

      const faltantes = CAMPOS.filter(
        (campo) => encontrada.cabecalho.mapa[campo.chave] < 0,
      ).map((campo) => campo.rotulo);
      const mapeadas = mapearLinhas(encontrada.matriz, encontrada.cabecalho);

      estado.arquivo = arquivo;
      estado.hash = await gerarHash(conteudo);
      estado.aba = encontrada.nome;
      estado.linhaCabecalho = encontrada.cabecalho.indice + 1;
      estado.linhas = mapeadas.linhas;
      estado.linhasVazias = mapeadas.vazias;
      estado.faltantes = faltantes;

      setMensagem(status, "");
      renderizarPrevia();
    } catch (error) {
      console.error("Falha ao ler o Excel:", error);
      setMensagem(
        status,
        error?.message || "Não foi possível ler a planilha.",
        "error",
      );
    }
  }

  function limpar() {
    estado.arquivo = null;
    estado.hash = null;
    estado.aba = null;
    estado.linhaCabecalho = 0;
    estado.linhas = [];
    estado.linhasVazias = 0;
    estado.faltantes = [];
    document.getElementById("excelInput").value = "";
    document.getElementById("previewSection").hidden = true;
    document.getElementById("resultSection").hidden = true;
    setMensagem(document.getElementById("readStatus"), "");
    atualizarEtapa(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function adicionarDetalhe(lista, rotulo, valor) {
    const grupo = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = rotulo;
    dd.textContent = Number(valor || 0).toLocaleString("pt-BR");
    grupo.append(dt, dd);
    lista.appendChild(grupo);
  }

  function mostrarResultado(resultado, erro = false) {
    const secao = document.getElementById("resultSection");
    const titulo = document.getElementById("resultTitle");
    const textoResultado = document.getElementById("resultText");
    const marca = document.getElementById("resultMark");
    const detalhes = document.getElementById("resultDetails");

    secao.classList.toggle("error", erro);
    marca.textContent = erro ? "!" : "✓";
    titulo.textContent = erro
      ? "Importação não realizada"
      : "Importação concluída";
    textoResultado.textContent = erro
      ? resultado.error ||
        resultado.detalhe ||
        "Não foi possível concluir a importação."
      : `A base foi atualizada. Protocolo: ${resultado.importacao_id || "—"}.`;
    detalhes.replaceChildren();

    if (!erro) {
      adicionarDetalhe(
        detalhes,
        "Projetos inseridos",
        resultado.projetos_inseridos,
      );
      adicionarDetalhe(
        detalhes,
        "Projetos atualizados",
        resultado.projetos_atualizados,
      );
      adicionarDetalhe(
        detalhes,
        "Tarefas inseridas",
        resultado.tarefas_inseridas,
      );
      adicionarDetalhe(
        detalhes,
        "Tarefas atualizadas",
        resultado.tarefas_atualizadas,
      );
      adicionarDetalhe(detalhes, "Linhas com erro", resultado.linhas_com_erro);
      adicionarDetalhe(
        detalhes,
        "Tarefas sem vínculo",
        resultado.tarefas_sem_vinculo,
      );
      adicionarDetalhe(
        detalhes,
        "Registros ausentes",
        Number(resultado.projetos_marcados_ausentes || 0) +
          Number(resultado.tarefas_marcadas_ausentes || 0),
      );
    }

    secao.hidden = false;
    atualizarEtapa(erro ? 2 : 3);
    secao.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function prepararLinhasEnvio() {
    return estado.linhas.map((linha) => ({
      numero_linha: linha.numero_linha,
      id: linha.id,
      tipo: linha.tipo,
      projeto: linha.projeto,
      acao: linha.acao,
      status: linha.status,
      data_inicio: linha.data_inicio,
      data_fim: linha.data_fim,
      sponsor: linha.sponsor,
      esforco: linha.esforco,
      prioridade: linha.prioridade,
      evidencia: linha.evidencia,
    }));
  }

  async function importar() {
    const botao = document.getElementById("importButton");
    const mensagem = document.getElementById("validationMessage");

    if (!estado.arquivo || botao.disabled) return;

    botao.disabled = true;
    botao.textContent = "Importando...";
    setMensagem(mensagem, "Enviando as linhas conferidas para o Supabase...");

    let concluida = false;

    try {
      const { data, error } = await window.biSupabase.auth.getSession();
      if (error || !data?.session) {
        window.location.replace("login.html");
        return;
      }

      const url = window.BI_CONFIG.PQ_IMPORT_FUNCTION_URL;
      if (!url) throw new Error("A função de importação não foi configurada.");

      const resposta = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          arquivo: estado.arquivo.name,
          origem_url: null,
          aba: estado.aba,
          arquivo_hash: estado.hash,
          linhas: prepararLinhasEnvio(),
        }),
      });

      const resultado = await resposta.json().catch(() => ({
        success: false,
        error: "A função retornou uma resposta inválida.",
      }));

      if (!resposta.ok || !resultado.success) {
        mostrarResultado(resultado, true);
        return;
      }

      setMensagem(mensagem, "Importação concluída com segurança.", "success");
      concluida = true;
      mostrarResultado(resultado, false);
    } catch (error) {
      console.error("Falha na importação:", error);
      mostrarResultado(
        { error: error?.message || "Falha de comunicação com o Supabase." },
        true,
      );
    } finally {
      botao.disabled = concluida;
      botao.textContent = "Importar para o Supabase";
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const usuario = await window.protegerDashboard();
    if (!usuario) return;

    const entrada = document.getElementById("excelInput");
    const zona = document.getElementById("dropZone");

    document
      .getElementById("logoutButton")
      .addEventListener("click", window.sairBI);
    document
      .getElementById("changeFileButton")
      .addEventListener("click", () => {
        entrada.value = "";
        entrada.click();
      });
    document
      .getElementById("newImportButton")
      .addEventListener("click", limpar);
    document.getElementById("importButton").addEventListener("click", importar);
    entrada.addEventListener("change", () =>
      processarArquivo(entrada.files?.[0]),
    );

    zona.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        entrada.click();
      }
    });

    ["dragenter", "dragover"].forEach((evento) => {
      zona.addEventListener(evento, (event) => {
        event.preventDefault();
        zona.classList.add("dragging");
      });
    });

    ["dragleave", "drop"].forEach((evento) => {
      zona.addEventListener(evento, (event) => {
        event.preventDefault();
        zona.classList.remove("dragging");
      });
    });

    zona.addEventListener("drop", (event) => {
      processarArquivo(event.dataTransfer?.files?.[0]);
    });
  });
})();
