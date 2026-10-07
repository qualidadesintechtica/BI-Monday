(() => {
  "use strict";
  const txt = v => String(v ?? "").replace(/\s+/g, " ").trim();
  const norm = v => txt(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let enviando = false;
  function excelDateToISO(v) {
    if (v === null || v === undefined || v === "") return null;

    if (v instanceof Date && !Number.isNaN(v.getTime())) {
      return v.toISOString().slice(0, 10);
    }

    // Excel stores many dates as serial numbers (e.g. 46090).
    // Convert without depending on SheetJS date helpers.
    const numero = Number(v);
    if (Number.isFinite(numero) && numero > 20000 && numero < 80000) {
      const diasInteiros = Math.floor(numero);
      const baseUtc = Date.UTC(1899, 11, 30);
      const d = new Date(baseUtc + diasInteiros * 86400000);
      return d.toISOString().slice(0, 10);
    }

    const s = String(v).trim();

    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (br) {
      return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
    }

    return s || null;
  }

  function prepararLinhasProjetoQualidade(rows) {
    return rows.map(r => ({
      "ID": r["ID"] ?? r["ID Azure"] ?? null,
      "Work Item Type": r["Work Item Type"] ?? null,
      "Projetos": r["Projetos"] ?? r["Projeto"] ?? null,

      "Contexto / Objetivo":
        r["Contexto / Objetivo"] ??
        r["Contexto/Objetivo"] ??
        r["Contexto"] ??
        null,

      "Objetivo":
        r["Objetivo"] ??
        null,

      "Resultados Esperados":
        r["Resultados Esperados"] ??
        r["Resultados esperados"] ??
        r["Resultado Esperado"] ??
        null,

      "Ações":
        r["Ações"] ??
        r["Ações / Tarefas"] ??
        r["Acoes"] ??
        r["Acoes / Tarefas"] ??
        r["Tarefa"] ??
        r["Tarefas"] ??
        null,

      "State":
        r["State"] ??
        r["Status"] ??
        null,

      "Start Date": excelDateToISO(
        r["Start Date"] ??
        r["Data de inicio"] ??
        r["Data de início"] ??
        null
      ),

      "Target Date": excelDateToISO(
        r["Target Date"] ??
        r["Data de fim"] ??
        r["Data fim"] ??
        null
      ),

      "Sponsor":
        r["Sponsor"] ??
        r["Responsável"] ??
        r["Responsavel"] ??
        null,

      "Esforço":
        r["Esforço"] ??
        r["Esforco"] ??
        null,

      "Prioridade": r["Prioridade"] ?? null,
      "Impacto": r["Impacto"] ?? null,

      "Resultados Alcançados":
        r["Resultados Alcançados"] ??
        r["Resultados Alcancados"] ??
        null,

      "link evidências":
        r["link evidências"] ??
        r["link evidencias"] ??
        null,

      "Operações EAD":
        r["Operações EAD"] ??
        r["Operacoes EAD"] ??
        null,

      "__aba_origem": r["__aba_origem"] ?? null,
      "__linha_origem": r["__linha_origem"] ?? null,

      // Preserva TODAS as colunas que existirem na planilha, inclusive antes
      // de uma reconciliação de nome de projeto.
      "__dados_originais": r["__dados_originais_original"] ?? r
    }));
  }

  function tipoLinhaImportacao(row) {
    const n = norm(row["Work Item Type"]);
    const projeto = txt(row["Projetos"] || row["Projeto"]);
    const acao = txt(row["Ações"] || row["Ações / Tarefas"] || row["Tarefa"]);
    if (n.includes("projeto")) return "projeto";
    if (n.includes("tarefa") || n.includes("action plan")) return "tarefa";
    if (projeto && acao) return "tarefa";
    return "nao_reconhecida";
  }

  function diagnosticoLocalImportacao(rows, abasParaLer, reconciliacoes = []) {
    const porAba = new Map();
    let projetos = 0;
    let tarefas = 0;
    let naoReconhecidas = 0;

    rows.forEach((row) => {
      const aba = txt(row.__aba_origem) || "Sem aba";
      const item = porAba.get(aba) || { linhas: 0, projetos: 0, tarefas: 0, naoReconhecidas: 0 };
      const tipo = tipoLinhaImportacao(row);
      item.linhas += 1;
      if (tipo === "projeto") { projetos += 1; item.projetos += 1; }
      else if (tipo === "tarefa") { tarefas += 1; item.tarefas += 1; }
      else { naoReconhecidas += 1; item.naoReconhecidas += 1; }
      porAba.set(aba, item);
    });

    return {
      linhas: rows.length,
      projetos,
      tarefas,
      naoReconhecidas,
      abas: abasParaLer.map((aba) => ({ aba, ...(porAba.get(aba) || { linhas: 0, projetos: 0, tarefas: 0, naoReconhecidas: 0 }) })),
      reconciliacoes,
      tarefasReconciliadas: reconciliacoes.length,
    };
  }

  async function conferirSnapshotImportado(esperado) {
    const sb = window.biSupabase;
    const [p, t] = await Promise.all([
      sb.from("pq_projetos_atual").select("id", { count: "exact", head: true }).eq("ativo", true),
      sb.from("pq_tarefas_atual").select("id", { count: "exact", head: true }).eq("ativo", true),
    ]);

    if (p.error || t.error) {
      return { ok: false, erro: p.error?.message || t.error?.message || "Não foi possível conferir o snapshot." };
    }

    const projetosBanco = Number(p.count || 0);
    const tarefasBanco = Number(t.count || 0);
    return {
      ok: projetosBanco === esperado.projetos && tarefasBanco === esperado.tarefas,
      projetosBanco,
      tarefasBanco,
      diferencaProjetos: projetosBanco - esperado.projetos,
      diferencaTarefas: tarefasBanco - esperado.tarefas,
    };
  }


  function prepararWorkbook(workbook) {

        const normalizarAba = (v) => String(v || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase();

        // As abas de status podem mudar o sufixo de data (ex.: Em Progresso_09_09).
        // Por isso, localizamos cada aba pelo status e não por um nome/data fixos.
        const encontrarAbaStatus = (statusBase) => {
          const alvo = normalizarAba(statusBase);

          const candidatas = workbook.SheetNames.filter(nome => {
            const atual = normalizarAba(nome);
            return atual === alvo ||
              atual.startsWith(`${alvo}_`) ||
              atual.startsWith(`${alvo} `) ||
              atual.startsWith(`${alvo}-`);
          });
          if (candidatas.length > 1) throw new Error(`Mais de uma aba atual de ${statusBase}: ${candidatas.join(", ")}. Mantenha apenas a aba atual de cada status.`);
          return candidatas[0] || null;
        };

        const abasEncontradas = [
          encontrarAbaStatus("Em Progresso"),
          encontrarAbaStatus("Não Iniciado"),
          encontrarAbaStatus("Pausado"),
          encontrarAbaStatus("Finalizados")
        ].filter(Boolean);

        const abasParaLer = abasEncontradas.length
          ? [...new Set(abasEncontradas)]
          : [
              workbook.SheetNames.includes("Work item e filhos (1)")
                ? "Work item e filhos (1)"
                : workbook.SheetNames[0]
            ];

        const rawRows = [];
        abasParaLer.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          if (!worksheet) return;

          const dados = window.XLSX.utils.sheet_to_json(worksheet, {
            defval: null,
            raw: true
          });

          dados.forEach((row, indice) => rawRows.push({
            ...row,
            __aba_origem: sheetName,
            __linha_origem: Number.isInteger(row.__rowNum__) ? row.__rowNum__ + 1 : indice + 2
          }));
        });

        if (!rawRows.length) {
          throw new Error("Nenhuma linha foi localizada nas abas atuais da planilha.");
        }

        // Reconciliação segura de projetos renomeados.
        // Exemplo real da planilha atual: as tarefas ainda usam
        // "Validação em Período de Férias Docentes", enquanto o projeto ID 384403
        // passou a se chamar "Validação em Período de Recesso de Aulas".
        // Usamos a aba histórica apenas como mapa nome antigo -> ID e mantemos as
        // quatro abas atuais como fonte oficial do snapshot.
        const nomeProjetoLinha = (row) => String(row["Projetos"] ?? row["Projeto"] ?? "").trim();
        const tipoLinhaBruto = (row) => normalizarAba(row["Work Item Type"]);
        const projetosAtuaisPorId = new Map();
        const nomesProjetosAtuais = new Set();

        rawRows.forEach((row) => {
          if (!tipoLinhaBruto(row).includes("projeto")) return;
          const id = String(row["ID"] ?? "").trim();
          const nomeAtual = nomeProjetoLinha(row);
          if (nomeAtual) nomesProjetosAtuais.add(normalizarAba(nomeAtual));
          if (id && nomeAtual) projetosAtuaisPorId.set(id, nomeAtual);
        });

        const projetoIdHistoricoPorNome = new Map();
        const abaHistorica = workbook.Sheets["Work item e filhos (1)"];
        if (abaHistorica) {
          const historico = window.XLSX.utils.sheet_to_json(abaHistorica, { defval: null, raw: true });
          historico.forEach((row) => {
            if (!normalizarAba(row["Work Item Type"]).includes("projeto")) return;
            const id = String(row["ID"] ?? "").trim();
            const nomeAntigo = nomeProjetoLinha(row);
            if (id && nomeAntigo) projetoIdHistoricoPorNome.set(normalizarAba(nomeAntigo), id);
          });
        }

        const reconciliacoes = [];
        rawRows.forEach((row) => {
          const tipo = tipoLinhaBruto(row);
          if (!(tipo.includes("tarefa") || tipo.includes("action plan") || (!tipo && nomeProjetoLinha(row) && (row["Ações"] || row["Ações / Tarefas"])))) return;

          const nomeInformado = nomeProjetoLinha(row);
          const chaveNome = normalizarAba(nomeInformado);
          if (!nomeInformado || nomesProjetosAtuais.has(chaveNome)) return;

          const idPai = projetoIdHistoricoPorNome.get(chaveNome);
          const nomeAtual = idPai ? projetosAtuaisPorId.get(idPai) : "";
          if (!nomeAtual || normalizarAba(nomeAtual) === chaveNome) return;

          row.__dados_originais_original = { ...row };
          row.__projeto_nome_original = nomeInformado;
          row.__projeto_id_reconciliado = idPai;
          if (Object.prototype.hasOwnProperty.call(row, "Projeto")) row["Projeto"] = nomeAtual;
          if (Object.prototype.hasOwnProperty.call(row, "Projetos")) row["Projetos"] = nomeAtual;
          if (!Object.prototype.hasOwnProperty.call(row, "Projeto") && !Object.prototype.hasOwnProperty.call(row, "Projetos")) row["Projetos"] = nomeAtual;

          reconciliacoes.push({ de: nomeInformado, para: nomeAtual, id: idPai, aba: row.__aba_origem, linha: row.__linha_origem });
        });

        const rowsPreparadas = prepararLinhasProjetoQualidade(rawRows);

        // Valores como "NOVO" são marcadores da planilha, não IDs reais.
        // Se forem tratados como ID, projetos/tarefas diferentes acabam sendo descartados.
        const idEhPlaceholder = (v) => {
          const n = String(v || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim()
            .toLowerCase();

          return [
            "novo",
            "nova",
            "new",
            "n/a",
            "na",
            "sem id",
            "s/id",
            "-"
          ].includes(n);
        };

        // A importação deve ser monotônica em relação à planilha: uma linha válida
        // não pode sumir no navegador. IDs de placeholder são enviados como nulos e
        // cada linha mantém aba + número de origem para ganhar uma chave estável no snapshot.
        const rows = rowsPreparadas.map(row => {
          const copia = { ...row };
          const idBruto = String(copia["ID Azure"] || copia["ID"] || "").trim();
          if (idEhPlaceholder(idBruto)) {
            if ("ID Azure" in copia) copia["ID Azure"] = null;
            copia["ID"] = null;
          }
          return copia;
        });

        const diagnostico = diagnosticoLocalImportacao(rows, abasParaLer, reconciliacoes);

    const problemas = [], ids = new Map();
    rows.forEach(row => {
      const tipo = tipoLinhaImportacao(row), origem = `${row.__aba_origem}, linha ${row.__linha_origem}`;
      if (tipo === 'nao_reconhecida' || !txt(row.Projetos) || (tipo === 'tarefa' && !txt(row['Ações'])))
        problemas.push(`${origem}: informe tipo, projeto e ação da tarefa.`);
      const id = txt(row['ID Azure'] || row.ID);
      if (id) {
        const chave = `${tipo}|${id}`;
        if (ids.has(chave)) problemas.push(`ID ${id} repetido em ${ids.get(chave)} e ${origem}.`);
        ids.set(chave, origem);
      }
    });
    if (!diagnostico.projetos) problemas.push('A planilha precisa conter ao menos um projeto.');
    if (problemas.length) throw new Error(problemas.slice(0, 8).join('\n'));
    diagnostico.semId = rows.filter(r => !txt(r['ID Azure'] || r.ID)).length;
    return {rows, abas: abasParaLer, diagnostico};
  }
  async function preparar(file) {
    if (!file || !/\.xlsx?$/i.test(file.name)) throw new Error('Selecione um arquivo Excel (.xlsx ou .xls).');
    if (!window.XLSX) throw new Error('Leitor de Excel não carregado. Atualize a página com Ctrl+F5.');
    const workbook = window.XLSX.read(await file.arrayBuffer(), {type:'array', cellDates:true, cellText:false});
    return {...prepararWorkbook(workbook), arquivo_nome:file.name, arquivo_tamanho:file.size};
  }
  async function enviar(preparada) {
    if (enviando) throw new Error('Já existe uma atualização de Projeto Qualidade em andamento nesta página.');
    enviando = true;
    try {
      const {data, error} = await window.biSupabase.auth.getSession();
      if (error || !data?.session?.access_token) throw new Error('Sessão expirada. Entre novamente no BI.');
      const response = await fetch(`${window.BI_CONFIG.SUPABASE_URL}/functions/v1/import-projeto-qualidade`, {
        method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${data.session.access_token}`, apikey:window.BI_CONFIG.SUPABASE_PUBLISHABLE_KEY},
        body:JSON.stringify({...preparada, aba:preparada.abas.join(', '), diagnostico_cliente:preparada.diagnostico})
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false || !payload.success)
        throw new Error(txt(payload.error || payload.mensagem) || `Falha HTTP ${response.status}`);
      const conferencia = await conferirSnapshotImportado(preparada.diagnostico);
      window.invalidarProjetoQualidade?.();
      window.dispatchEvent(new CustomEvent('bi:qualidade-atualizada', {detail:{payload, conferencia}}));
      return {payload, conferencia};
    } finally { enviando = false; }
  }
  window.biQualidadeImportacao = {preparar, prepararWorkbook, enviar};
})();
