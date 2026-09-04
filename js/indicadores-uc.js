(function () {
  "use strict";

  const INDICADORES = [
    { id: "I1", curto: "Recursos multimídia", dim: "Interatividade", campo: "indicador_1" },
    { id: "I2", curto: "Taxonomia da Neuroaprendizagem", dim: "Modelo pedagógico", campo: "indicador_2" },
    { id: "I3", curto: "Fundamentação científica", dim: "Teórico", campo: "indicador_3" },
    { id: "I4", curto: "Recursos inovadores", dim: "Interatividade", campo: "indicador_4" },
    { id: "I5", curto: "Atualização de referenciais", dim: "Teórico", campo: "indicador_5" },
    { id: "I6", curto: "Competências profissionais", dim: "Empregabilidade", campo: "indicador_6" },
    { id: "I7", curto: "Integração à jornada da UC", dim: "Progressividade", campo: "indicador_7" }
  ];

  let cortes = { exc: 0.90, oti: 0.70, suf: 0.50 };
  let ucs = [];
  let selecionada = null;
  let ordem = "nota";
  let busca = "";
  let vista = "uc";
  let carregando = false;
  let carregado = false;
  let eventosLigados = false;
  let ultimaSincronizacao = null;
  let respostasProfessores = [];
  let criteriosRaw = [];
  let pareceresRaw = [];
  let syncHistorico = [];

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  const conceito = n => n === null || n === undefined ? null : n >= cortes.exc ? "Excelente" : n >= cortes.oti ? "Ótimo" : n >= cortes.suf ? "Suficiente" : "Insuficiente";
  const nivel = n => n === null || n === undefined ? "na" : n >= cortes.exc ? "exc" : n >= cortes.oti ? "oti" : n >= cortes.suf ? "suf" : "ins";
  const num = n => n === null || n === undefined || !Number.isFinite(Number(n)) ? "—" : Number(n).toFixed(2).replace(".", ",");
  const pontos = v => v === "Excelente" ? 1 : v === "Ótimo" ? 0.8 : v === "Suficiente" ? 0.5 : null;
  const media = a => {
    const n = a.map(Number).filter(Number.isFinite);
    return n.length ? n.reduce((s, x) => s + x, 0) / n.length : null;
  };

  function numeroUA(row) {
    const n = Number(row.numero_ua);
    if (Number.isFinite(n) && n > 0) return n;
    const m = String(row.nome_item || "").match(/_UA(\d+)$/i);
    return m ? Number(m[1]) : 0;
  }

  function montarUCs(resumo, detalhes) {
    const porUc = new Map();

    resumo.forEach(r => {
      porUc.set(r.codigo_uc, {
        cod: r.codigo_uc,
        nome: r.nome_uc || r.codigo_uc,
        totalUas: Number(r.total_uas || 0),
        uasAvaliadas: Number(r.uas_avaliadas || 0),
        uasNaoAvaliadas: Number(r.uas_nao_avaliadas || 0),
        porIndicador: INDICADORES.map((_, i) => {
          const v = r[`indicador_${i + 1}_media`];
          return v === null || v === undefined ? null : Number(v);
        }),
        nota: r.media_geral_uc === null || r.media_geral_uc === undefined ? null : Number(r.media_geral_uc),
        classificacaoBanco: r.classificacao_uc || "Não avaliada",
        rankingBanco: Number(r.ranking_uc || 0),
        percentualConclusao: Number(r.percentual_conclusao || 0),
        linhas: []
      });
    });

    detalhes.forEach(r => {
      if (!porUc.has(r.codigo_uc)) {
        porUc.set(r.codigo_uc, {
          cod: r.codigo_uc,
          nome: r.codigo_uc,
          totalUas: 0,
          uasAvaliadas: 0,
          uasNaoAvaliadas: 0,
          porIndicador: Array(7).fill(null),
          nota: null,
          classificacaoBanco: "Não avaliada",
          rankingBanco: 0,
          percentualConclusao: 0,
          linhas: []
        });
      }

      const uc = porUc.get(r.codigo_uc);
      uc.linhas.push({
        item: r.nome_item,
        ua: numeroUA(r),
        avaliador: r.avaliador,
        data: r.data_avaliacao,
        categoria: r.categoria_material,
        conceitoFinal: r.conceito_final,
        completa: r.avaliacao_completa === true,
        valores: INDICADORES.map(ind => r[ind.campo])
      });

      const ts = Date.parse(r.synced_at || "");
      if (Number.isFinite(ts) && (!ultimaSincronizacao || ts > ultimaSincronizacao)) ultimaSincronizacao = ts;
    });

    const arr = [...porUc.values()];
    arr.forEach(uc => uc.linhas.sort((a, b) => a.ua - b.ua));
    return arr;
  }

  function valorOrdem(uc) {
    return ordem === "nota" ? uc.nota : uc.porIndicador[Number(ordem)];
  }

  function ordenadas() {
    const q = busca.trim().toLowerCase();
    return ucs
      .filter(uc => !q || `${uc.nome} ${uc.cod}`.toLowerCase().includes(q))
      .sort((a, b) => (valorOrdem(b) ?? -1) - (valorOrdem(a) ?? -1) || (b.nota ?? -1) - (a.nota ?? -1) || a.cod.localeCompare(b.cod));
  }

  function atualizarFonte(status, detalhe) {
    const titulo = $("ucxSourceTitle");
    const texto = $("ucxSourceText");
    if (titulo) titulo.textContent = status;
    if (texto) texto.textContent = detalhe;
  }

  function renderResumo() {
    const avaliadas = ucs.filter(u => u.uasAvaliadas > 0);
    const geral = media(avaliadas.map(u => u.nota));
    const exc = avaliadas.filter(u => conceito(u.nota) === "Excelente").length;
    const oti = avaliadas.filter(u => conceito(u.nota) === "Ótimo").length;
    const suf = avaliadas.filter(u => conceito(u.nota) === "Suficiente").length;
    const na = ucs.filter(u => u.uasAvaliadas === 0).length;
    const inc = ucs.filter(u => u.uasNaoAvaliadas > 0).length;

    $("ucxTotal").textContent = avaliadas.length;
    $("ucxMedia").textContent = num(geral);
    $("ucxExcelente").textContent = exc;
    $("ucxOtimo").textContent = oti;
    $("ucxSuficiente").textContent = suf;
    $("ucxNaoAvaliada").textContent = na;
    $("ucxIncompletas").textContent = inc;
    $("ucxResumoConceitos").textContent = `${exc} excelentes · ${oti} ótimas · ${suf} suficientes · ${na} não avaliadas`;
  }

  function renderRanking() {
    const list = $("ucxLista");
    const itens = ordenadas();
    $("ucxContagem").textContent = `${itens.length} de ${ucs.length} UCs`;
    list.innerHTML = "";

    if (!itens.length) {
      list.innerHTML = '<div class="ucx-empty">Nenhuma UC encontrada.</div>';
      return;
    }

    itens.forEach((uc, i) => {
      const valor = valorOrdem(uc);
      const c = conceito(valor);
      const b = document.createElement("button");
      b.className = "ucx-rank-row" + (uc.cod === selecionada ? " active" : "");
      b.onclick = () => { selecionada = uc.cod; render(); };
      const pendencia = uc.uasNaoAvaliadas > 0 ? ` · ${uc.uasAvaliadas}/${uc.totalUas} UAs avaliadas` : "";
      b.innerHTML = `<span class="ucx-pos">${i + 1}</span><span class="ucx-rank-name"><b>${esc(uc.nome)}</b><small>${uc.uasAvaliadas} UA${uc.uasAvaliadas === 1 ? "" : "s"} avaliada${uc.uasAvaliadas === 1 ? "" : "s"}${pendencia}</small></span><span class="ucx-strip">${uc.porIndicador.map(m => `<i class="${nivel(m)}"></i>`).join("")}</span><strong>${num(valor)}</strong><span class="ucx-concept ${nivel(valor)}">${c ? c.slice(0, 3).toUpperCase() : "—"}</span>`;
      list.appendChild(b);
    });
  }

  function renderDetalhe(uc) {
    if (!uc) return '<div class="ucx-empty">Selecione uma UC.</div>';

    const uas = [...new Set(uc.linhas.map(l => l.ua).filter(Boolean))].sort((a, b) => a - b);
    const porUA = Object.fromEntries(uc.linhas.map(l => [l.ua, l]));
    const rows = INDICADORES.map((ind, j) => {
      const cells = uas.map(u => {
        const l = porUA[u];
        const v = l ? l.valores[j] : null;
        const p = pontos(v);
        const label = v === "Excelente" ? "E" : v === "Ótimo" ? "Ó" : v === "Suficiente" ? "S" : "—";
        return `<td><span class="ucx-cell ${nivel(p)}" title="${esc(v || "UA ainda não avaliada")}">${label}</span></td>`;
      }).join("");
      return `<tr><th>${esc(ind.curto)}<small>${ind.id} · ${esc(ind.dim)}</small></th>${cells}<td class="ucx-med">${num(uc.porIndicador[j])}</td></tr>`;
    }).join("");

    const avaliadores = [...new Set(uc.linhas.map(l => l.avaliador).filter(Boolean))];
    const datas = uc.linhas.map(l => l.data).filter(Boolean).sort();
    const periodo = datas.length ? `${datas[0]}${datas.length > 1 && datas.at(-1) !== datas[0] ? ` a ${datas.at(-1)}` : ""}` : "—";

    return `<div class="ucx-panel-head"><div><span class="ucx-kicker">Detalhe da UC</span><h3>${esc(uc.nome)}</h3><p>${uc.uasAvaliadas}/${uc.totalUas} UAs avaliadas · ${uc.uasNaoAvaliadas} pendentes</p></div><div class="ucx-score"><strong>${num(uc.nota)}</strong><span>${conceito(uc.nota) || "Não avaliada"}</span></div></div>
      <div class="ucx-table-wrap"><table class="ucx-matrix"><thead><tr><th>Indicador</th>${uas.map(u => `<th>UA${String(u).padStart(2, "0")}</th>`).join("")}<th>Média</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="ucx-meta"><span><b>Avaliador(es):</b> ${esc(avaliadores.join(", ") || "—")}</span><span><b>Período:</b> ${esc(periodo)}</span><span><b>Legenda:</b> E Excelente · Ó Ótimo · S Suficiente</span></div>`;
  }

  function renderComparativo() {
    const itens = ordenadas();
    const rows = itens.map((uc, i) => `<tr><th><span>${i + 1}</span>${esc(uc.nome)}<small>${uc.uasAvaliadas}/${uc.totalUas} UAs avaliadas</small></th>${uc.porIndicador.map(m => `<td><span class="ucx-heat ${nivel(m)}">${num(m)}</span></td>`).join("")}<td><b>${num(uc.nota)}</b></td></tr>`).join("");
    const medias = INDICADORES.map((_, j) => num(media(itens.map(u => u.porIndicador[j]))));
    return `<div class="ucx-panel-head"><div><span class="ucx-kicker">Visão comparativa</span><h3>Comparativo por indicador</h3><p>Dados reais sincronizados da Monday via Supabase.</p></div></div><div class="ucx-table-wrap"><table class="ucx-compare"><thead><tr><th>Unidade Curricular</th>${INDICADORES.map(i => `<th title="${esc(i.curto)}">${i.id}<small>${esc(i.curto)}</small></th>`).join("")}<th>Nota</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th>Média</th>${medias.map(m => `<td>${m}</td>`).join("")}<td>${num(media(itens.map(u => u.nota)))}</td></tr></tfoot></table></div>`;
  }

  function normalizarTexto(v) {
    return String(v || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ").trim();
  }

  function campoProvavel(obj, termos) {
    const keys = Object.keys(obj || {});
    return keys.find(k => termos.some(t => normalizarTexto(k).includes(normalizarTexto(t))));
  }

  function extrairRespostas(rows) {
    return (rows || []).map(r => {
      const kResp = campoProvavel(r, ["formulario de avaliacao","formulario_avaliacao","resposta","comentario","observacao"]);
      const kProf = campoProvavel(r, ["professor","avaliador","docente"]);
      const kUc = campoProvavel(r, ["codigo_uc","uc"]);
      const kUa = campoProvavel(r, ["numero_ua","nome_item","ua"]);
      const resposta = kResp ? r[kResp] : null;
      return {
        resposta: String(resposta || "").trim(),
        professor: kProf ? String(r[kProf] || "Não informado") : "Não informado",
        uc: kUc ? String(r[kUc] || "—") : "—",
        ua: kUa ? String(r[kUa] || "—") : "—"
      };
    }).filter(x => x.resposta && x.resposta.length > 2);
  }

  function agruparRespostas() {
    const grupos = new Map();
    respostasProfessores.forEach(r => {
      const chave = normalizarTexto(r.resposta);
      if (!grupos.has(chave)) grupos.set(chave, { texto: r.resposta, total: 0, professores: new Set(), ucs: new Set(), uas: new Set() });
      const g = grupos.get(chave);
      g.total++;
      g.professores.add(r.professor);
      g.ucs.add(r.uc);
      g.uas.add(r.ua);
    });
    return [...grupos.values()].sort((a,b) => b.total - a.total);
  }

  function agruparPareceresLiteraisV222() {
    const grupos = new Map();

    pareceresRaw.forEach(r => {
      const texto = String(r.parecer || "").trim();
      if (!texto) return;

      const chave = normalizarTexto(texto);

      if (!grupos.has(chave)) {
        grupos.set(chave, {
          texto,
          total: 0,
          professores: new Set(),
          criterios: new Set(),
          materiais: new Set(),
          tipos: new Set()
        });
      }

      const g = grupos.get(chave);
      g.total++;
      g.professores.add(r.avaliador || "Não informado");
      g.criterios.add(r.criterio_titulo || `Critério ${r.numero_criterio || "—"}`);
      g.materiais.add(r.nome_item || "—");
      g.tipos.add(r.tipo_formulario || "Geral");
    });

    return [...grupos.values()].sort((a, b) => b.total - a.total);
  }

  function renderRespostas() {
    if (!pareceresRaw.length) {
      return `<div class="ucx-panel-head"><div>
        <span class="ucx-kicker">Pareceres da Monday</span>
        <h3>Respostas dos professores</h3>
        <p>Nenhum parecer textual foi localizado em <b>monday_criterios_pareceres</b>.</p>
      </div></div>
      <div class="ucx-empty">A sincronização já está preparada para preencher essa tabela quando houver pareceres na Monday.</div>`;
    }

    const grupos = agruparPareceresLiteraisV222();
    const repetidas = grupos.filter(g => g.total > 1);
    const max = Math.max(...grupos.map(g => g.total), 1);
    const professores = new Set(pareceresRaw.map(r => r.avaliador || "Não informado")).size;

    const cards = `<div class="ucx-response-kpis">
      <article><span>Pareceres</span><strong>${pareceresRaw.length}</strong></article>
      <article><span>Textos distintos</span><strong>${grupos.length}</strong></article>
      <article><span>Repetições literais</span><strong>${repetidas.length}</strong></article>
      <article><span>Avaliadores</span><strong>${professores}</strong></article>
    </div>`;

    const bars = grupos.slice(0, 10).map((g, i) => `
      <div class="ucx-response-bar">
        <span class="ucx-response-rank">${i + 1}</span>
        <div class="ucx-response-text">
          <b>${esc(g.texto)}</b>
          <small>${g.professores.size} avaliador(es) · ${g.criterios.size} critério(s) · ${g.materiais.size} material(is)</small>
        </div>
        <div class="ucx-response-meter"><i style="width:${Math.max(6, (g.total / max) * 100)}%"></i></div>
        <strong>${g.total}×</strong>
      </div>
    `).join("");

    const rows = pareceresRaw
      .slice()
      .sort((a, b) => String(b.synced_at || "").localeCompare(String(a.synced_at || "")))
      .slice(0, 100)
      .map(r => `<tr>
        <td>${esc(r.avaliador || "Não informado")}</td>
        <td>${esc(r.nome_item || "—")}</td>
        <td>${esc(r.numero_criterio ?? "—")}</td>
        <td>${esc(r.criterio_titulo || "—")}</td>
        <td>${esc(r.parecer || "—")}</td>
        <td>${esc(r.tipo_formulario || "Geral")}</td>
      </tr>`).join("");

    return `<div class="ucx-panel-head"><div>
      <span class="ucx-kicker">Pareceres da Monday</span>
      <h3>Respostas dos professores</h3>
      <p>Os pareceres abaixo vêm diretamente de <b>monday_criterios_pareceres</b>. Repetição literal e similaridade temática são tratadas separadamente.</p>
    </div></div>
    ${cards}
    <div class="ucx-response-chart">
      <h4>Respostas mais frequentes — repetição literal</h4>
      ${bars || '<div class="ucx-empty">Nenhuma repetição literal encontrada.</div>'}
    </div>
    <div class="ucx-table-wrap">
      <table class="ucx-response-table">
        <thead><tr><th>Avaliador</th><th>Material / UA</th><th>Nº</th><th>Critério</th><th>Parecer</th><th>Formulário</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  async function carregarHistoricoSync() {
    const body = $("ucxSyncBody"), status = $("ucxSyncStatus");
    if (!window.biSupabase || !body) return;
    try {
      const resp = await window.biSupabase.from("sync_log").select("*").order("created_at", { ascending: false }).limit(15);
      if (resp.error) throw resp.error;
      syncHistorico = resp.data || [];
      status.textContent = syncHistorico.length ? "Últimas execuções registradas" : "Ainda não há execuções registradas";
      body.innerHTML = syncHistorico.length ? syncHistorico.map(r => {
        const quando = r.created_at || r.sincronizado_em || r.quando || r.executado_em;
        return `<tr><td>${quando ? new Date(quando).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}</td><td>${esc(r.status || (r.success === false ? "Erro" : "Sucesso"))}</td><td>${r.itens_lidos ?? "—"}</td><td>${r.itens_gravados ?? "—"}</td><td>${r.erros ?? 0}</td></tr>`;
      }).join("") : '<tr><td colspan="5">Nenhuma sincronização registrada ainda.</td></tr>';
    } catch (e) {
      status.textContent = "Histórico ainda não configurado no Supabase";
      body.innerHTML = '<tr><td colspan="5">A tabela sync_log ainda não está disponível. Use o arquivo docs/CONFIGURAR_SYNC_V21_1.sql incluído nesta versão.</td></tr>';
    }
  }


  function proximaAtualizacaoBRT() {
    const agora = new Date();
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        hour12: false
      }).formatToParts(agora).filter(x => x.type !== "literal").map(x => [x.type, x.value])
    );
    const hora = Number(p.hour);
    if (hora < 8) return "hoje às 08:00";
    if (hora < 13) return "hoje às 13:00";
    if (hora < 18) return "hoje às 18:00";
    return "amanhã às 08:00";
  }

  async function atualizarSeloDadosReais() {
    const selo =
      document.querySelector("[data-uc-live-badge]") ||
      document.querySelector(".uc-live-badge") ||
      document.querySelector(".ucx-live-badge") ||
      document.querySelector("#ucLiveBadge");

    if (!window.biSupabase || !selo) return;

    try {
      const resp = await window.biSupabase
        .from("monday_criterios_avaliacao_uas")
        .select("synced_at")
        .not("synced_at", "is", null)
        .order("synced_at", { ascending: false })
        .limit(1);

      if (resp.error) throw resp.error;

      const synced = resp.data?.[0]?.synced_at;
      if (!synced) return;

      const ultima = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).format(new Date(synced));

      selo.innerHTML = `
        <span class="ucx-live-dot"></span>
        <span>
          <b>Dados reais</b><br>
          <small>Última sincronização: ${ultima}</small><br>
          <small>Próxima atualização: ${proximaAtualizacaoBRT()}</small>
        </span>
      `;
      selo.title = `Monday → Supabase · ${ultima}`;
    } catch (err) {
      console.warn("Erro ao atualizar selo de dados reais:", err);
    }
  }



  const NOMES_INDICADORES_V221 = [
    "Fundamentação científica",
    "Taxonomia da Neuroaprendizagem",
    "Jornada contínua e integrada",
    "Atualização de conhecimentos",
    "Competências profissionais",
    "Diversidade de recursos multimídia",
    "Recursos inovadores"
  ];

  function conceitoCanonicoV221(v) {
    const n = normalizarTexto(v);
    if (n.includes("excelente")) return "Excelente";
    if (n.includes("otimo")) return "Ótimo";
    if (n.includes("suficiente")) return "Suficiente";
    return null;
  }


  function obterIndicadoresAmostraV223() {
    const nomes = [
      "Fundamentação científica",
      "Taxonomia da Neuroaprendizagem",
      "Jornada contínua e integrada",
      "Atualização de conhecimentos",
      "Competências profissionais",
      "Diversidade de recursos multimídia",
      "Recursos inovadores"
    ];

    const saida = nomes.map((nome, idx) => ({
      nome,
      excelente: 0,
      otimo: 0,
      suficiente: 0,
      total: 0
    }));

    criteriosRaw.forEach(r => {
      for (let i = 1; i <= 7; i++) {
        const valor = String(r[`indicador_${i}`] || "").trim();
        const alvo = saida[i - 1];

        if (!valor) continue;

        alvo.total++;

        const n = normalizarTexto(valor);

        if (n === "excelente") alvo.excelente++;
        else if (n === "otimo") alvo.otimo++;
        else if (n === "suficiente") alvo.suficiente++;
      }
    });

    return saida;
  }

  function renderResultadoAmostraV223() {
    const dados = obterIndicadoresAmostraV223();
    const uasAvaliadas = new Set(
      criteriosRaw
        .filter(r => Array.from({length:7}, (_,i) => r[`indicador_${i+1}`]).some(Boolean))
        .map(r => r.monday_item_id || r.nome_item)
        .filter(Boolean)
    ).size;

    const max = Math.max(
      1,
      ...dados.flatMap(d => [d.excelente, d.otimo, d.suficiente])
    );

    const grupos = dados.map(d => `
      <div class="v223-sample-group">
        <div class="v223-bars">
          <div class="v223-bar-col">
            <b>${d.excelente}</b>
            <span class="v223-bar excelente" style="height:${Math.max(2, (d.excelente/max)*170)}px"></span>
          </div>
          <div class="v223-bar-col">
            <b>${d.otimo}</b>
            <span class="v223-bar otimo" style="height:${Math.max(2, (d.otimo/max)*170)}px"></span>
          </div>
          <div class="v223-bar-col">
            <b>${d.suficiente}</b>
            <span class="v223-bar suficiente" style="height:${Math.max(2, (d.suficiente/max)*170)}px"></span>
          </div>
        </div>
        <div class="v223-sample-label">${esc(d.nome)}</div>
      </div>
    `).join("");

    return `<section class="v221-section">
      <div class="v221-title-row">
        <div>
          <h2>O resultado da amostra</h2>
          <p>${uasAvaliadas} unidades de aprendizagem avaliadas, distribuídas nos sete indicadores.</p>
        </div>
        <div class="v223-legend">
          <span><i class="excelente"></i>Excelente</span>
          <span><i class="otimo"></i>Ótimo</span>
          <span><i class="suficiente"></i>Suficiente</span>
        </div>
      </div>

      <div class="v223-axis-label">Nº de unidades</div>
      <div class="v223-sample-chart">${grupos}</div>
    </section>`;
  }

  function agruparPareceresLiteraisV223() {
    const mapa = new Map();

    pareceresRaw.forEach(r => {
      const texto = String(r.parecer || "").trim();
      if (!texto) return;

      const chave = normalizarTexto(texto);

      if (!mapa.has(chave)) {
        mapa.set(chave, {
          texto,
          total: 0,
          professores: new Set(),
          criterios: new Set(),
          materiais: new Set()
        });
      }

      const g = mapa.get(chave);
      g.total++;
      g.professores.add(r.avaliador || "Não informado");
      g.criterios.add(r.criterio_titulo || `Critério ${r.numero_criterio || "—"}`);
      g.materiais.add(r.nome_item || "—");
    });

    return [...mapa.values()].sort((a,b) => b.total - a.total);
  }

  function palavrasTemaV223(texto) {
    const stop = new Set([
      "para","com","sem","uma","umas","uns","que","dos","das","de","do","da",
      "em","no","na","nos","nas","por","como","mais","menos","muito","muita",
      "sobre","entre","este","esta","esse","essa","seu","sua","aos","ao","ou",
      "e","o","a","os","as","um","ser","foi","sao","tem","ter","deve","esta",
      "material","conteudo","unidade","atividade","atividades"
    ]);

    return normalizarTexto(texto)
      .split(/\s+/)
      .map(w => w.replace(/[^\p{L}\p{N}-]/gu, ""))
      .filter(w => w.length >= 5 && !stop.has(w));
  }

  function similaridadeV223(a,b) {
    const A = new Set(palavrasTemaV223(a));
    const B = new Set(palavrasTemaV223(b));
    if (!A.size || !B.size) return 0;
    const inter = [...A].filter(x => B.has(x)).length;
    const uniao = new Set([...A, ...B]).size;
    return inter / uniao;
  }

  function agruparTemasV223() {
    const itens = pareceresRaw
      .map(r => ({
        texto: String(r.parecer || "").trim(),
        avaliador: r.avaliador || "Não informado",
        criterio: r.criterio_titulo || `Critério ${r.numero_criterio || "—"}`,
        material: r.nome_item || "—"
      }))
      .filter(x => x.texto.length > 8);

    const grupos = [];

    for (const item of itens) {
      let melhor = null;
      let score = 0;

      for (const g of grupos) {
        const s = similaridadeV223(g.representante, item.texto);
        if (s > score) {
          score = s;
          melhor = g;
        }
      }

      if (melhor && score >= 0.28) {
        melhor.itens.push(item);
      } else {
        grupos.push({ representante: item.texto, itens: [item] });
      }
    }

    return grupos
      .filter(g => g.itens.length > 1)
      .sort((a,b) => b.itens.length - a.itens.length);
  }

  function tituloTemaV223(grupo) {
    const freq = new Map();

    grupo.itens.forEach(item => {
      palavrasTemaV223(item.texto).forEach(w => {
        freq.set(w, (freq.get(w) || 0) + 1);
      });
    });

    const termos = [...freq.entries()]
      .sort((a,b) => b[1] - a[1])
      .slice(0, 4)
      .map(([w]) => w);

    return termos.length ? termos.join(" · ") : "Tema recorrente";
  }

  function renderPadroesV223() {
    if (!pareceresRaw.length) {
      return `<section class="v221-section">
        <h2>Padrões recorrentes nas avaliações</h2>
        <div class="v221-empty">Nenhum parecer textual foi carregado da tabela monday_criterios_pareceres.</div>
      </section>`;
    }

    const literais = agruparPareceresLiteraisV223().filter(g => g.total > 1);
    const temas = agruparTemasV223();

    const cards = [];

    literais.slice(0,4).forEach(g => {
      cards.push(`
        <article class="v221-pattern">
          <h3>Repetição literal</h3>
          <b>${g.total} ocorrência(s)</b>
          <p>${esc(g.texto)}</p>
          <em>${g.professores.size} avaliador(es) · ${g.criterios.size} critério(s) · ${g.materiais.size} material(is)</em>
        </article>
      `);
    });

    temas.slice(0,6).forEach(g => {
      const avaliadores = new Set(g.itens.map(x => x.avaliador));
      const criterios = new Set(g.itens.map(x => x.criterio));
      const materiais = new Set(g.itens.map(x => x.material));

      cards.push(`
        <article class="v221-pattern">
          <h3>${esc(tituloTemaV223(g))}</h3>
          <b>${g.itens.length} parecer(es) relacionados</b>
          <p>${esc(g.itens[0].texto)}</p>
          <em>${avaliadores.size} avaliador(es) · ${criterios.size} critério(s) · ${materiais.size} material(is)</em>
        </article>
      `);
    });

    if (!cards.length) {
      const todos = pareceresRaw.slice(0,6).map(r => `
        <article class="v221-pattern">
          <h3>${esc(r.criterio_titulo || `Critério ${r.numero_criterio || "—"}`)}</h3>
          <b>1 ocorrência</b>
          <p>${esc(r.parecer || "")}</p>
          <em>${esc(r.avaliador || "Não informado")} · ${esc(r.nome_item || "—")}</em>
        </article>
      `).join("");

      return `<section class="v221-section">
        <div class="v221-title-row">
          <div>
            <h2>Padrões recorrentes nas avaliações</h2>
            <p>Os pareceres atuais ainda não formam recorrências fortes. Abaixo estão os registros mais recentes, sem inferir um padrão inexistente.</p>
          </div>
        </div>
        <div class="v221-pattern-grid">${todos}</div>
      </section>`;
    }

    return `<section class="v221-section">
      <div class="v221-title-row">
        <div>
          <h2>Padrões recorrentes nas avaliações</h2>
          <p>Repetições literais e aproximações temáticas calculadas sobre os pareceres reais sincronizados da Monday.</p>
        </div>
      </div>
      <div class="v221-pattern-grid">${cards.join("")}</div>
    </section>`;
  }

  function renderRespostas() {
    if (!pareceresRaw.length) {
      return `<div class="ucx-panel-head"><div>
        <span class="ucx-kicker">PARECERES DA MONDAY</span>
        <h3>Respostas dos professores</h3>
        <p>Nenhum parecer textual foi carregado da tabela monday_criterios_pareceres.</p>
      </div></div>`;
    }

    const grupos = agruparPareceresLiteraisV223();
    const repetidas = grupos.filter(g => g.total > 1);
    const professores = new Set(pareceresRaw.map(r => r.avaliador || "Não informado")).size;

    const rows = pareceresRaw
      .slice()
      .sort((a,b) => String(b.synced_at || "").localeCompare(String(a.synced_at || "")))
      .map(r => `<tr>
        <td>${esc(r.avaliador || "Não informado")}</td>
        <td>${esc(r.nome_item || "—")}</td>
        <td>${esc(r.numero_criterio ?? "—")}</td>
        <td>${esc(r.criterio_titulo || "—")}</td>
        <td>${esc(r.parecer || "—")}</td>
        <td>${esc(r.tipo_formulario || "Geral")}</td>
      </tr>`).join("");

    return `<div class="ucx-panel-head"><div>
      <span class="ucx-kicker">PARECERES DA MONDAY</span>
      <h3>Respostas dos professores</h3>
      <p>${pareceresRaw.length} parecer(es) reais sincronizados.</p>
    </div></div>

    <div class="ucx-response-kpis">
      <article><span>Pareceres</span><strong>${pareceresRaw.length}</strong></article>
      <article><span>Textos distintos</span><strong>${grupos.length}</strong></article>
      <article><span>Repetições literais</span><strong>${repetidas.length}</strong></article>
      <article><span>Avaliadores</span><strong>${professores}</strong></article>
    </div>

    <div class="ucx-table-wrap">
      <table class="ucx-response-table">
        <thead>
          <tr>
            <th>Avaliador</th>
            <th>Material / UA</th>
            <th>Nº</th>
            <th>Critério</th>
            <th>Parecer</th>
            <th>Formulário</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  function renderVisoesExecutivasV223() {
    const alvo = document.getElementById("ucxV22Executive");
    if (!alvo) return;
    alvo.innerHTML = renderResultadoAmostraV223() + renderPadroesV223();
  }

  function renderPainel() {
    const el = $("ucxPainel");
    if (!el) return;
    el.innerHTML = vista === "comparativo"
      ? renderComparativo()
      : vista === "respostas"
        ? renderRespostas()
        : renderDetalhe(ucs.find(u => u.cod === selecionada) || ordenadas()[0]);
  }

  function render() {
    renderResumo();
    renderRanking();
    renderPainel();
  }

  function ligarEventos() {
    if (eventosLigados) return;
    eventosLigados = true;

    $("ucxBusca")?.addEventListener("input", e => { busca = e.target.value; render(); });
    if ($("ucxOrdem")) {
      $("ucxOrdem").innerHTML = '<option value="nota">Nota final</option>' + INDICADORES.map((ind, j) => `<option value="${j}">${ind.id} · ${esc(ind.curto)}</option>`).join("");
      $("ucxOrdem").addEventListener("change", e => { ordem = e.target.value; render(); });
    }
    document.querySelectorAll("[data-ucx-view]").forEach(btn => btn.addEventListener("click", () => {
      vista = btn.dataset.ucxView;
      document.querySelectorAll("[data-ucx-view]").forEach(b => b.classList.toggle("active", b === btn));
      renderPainel();
    }));
    $("ucxApplyCuts")?.addEventListener("click", () => {
      cortes = { exc: Number($("ucxExc").value), oti: Number($("ucxOti").value), suf: Number($("ucxSuf").value) };
      render();
    });
  }

  async function carregarDados() {
    if (carregando || carregado) return;
    carregando = true;
    atualizarFonte("Carregando dados reais", "Consultando Supabase...");
    if ($("ucxLista")) $("ucxLista").innerHTML = '<div class="ucx-empty">Carregando indicadores...</div>';
    if ($("ucxPainel")) $("ucxPainel").innerHTML = '<div class="ucx-empty">Carregando detalhes das UAs...</div>';

    try {
      if (!window.biSupabase) throw new Error("Cliente Supabase não disponível.");

      const [resumoResp, detalheResp, respostasResp, pareceresResp] = await Promise.all([
        window.biSupabase
          .from("vw_indicadores_uc_dashboard")
          .select("codigo_uc,total_uas,uas_avaliadas,uas_nao_avaliadas,indicador_1_media,indicador_2_media,indicador_3_media,indicador_4_media,indicador_5_media,indicador_6_media,indicador_7_media,media_geral_uc,media_percentual,classificacao_uc,percentual_conclusao,ranking_uc,nome_uc")
          .order("ranking_uc", { ascending: true }),
        window.biSupabase
          .from("vw_indicadores_uc")
          .select("nome_item,codigo_uc,numero_ua,data_avaliacao,avaliador,categoria_material,conceito_final,indicador_1,indicador_2,indicador_3,indicador_4,indicador_5,indicador_6,indicador_7,media_indicadores,avaliacao_completa,classificacao_ua,synced_at")
          .order("codigo_uc", { ascending: true })
          .order("numero_ua", { ascending: true }),
        window.biSupabase
          .from("monday_criterios_avaliacao_uas")
          .select("*")
          .limit(5000),
        window.biSupabase
          .from("monday_criterios_pareceres")
          .select("monday_item_id,nome_item,avaliador,numero_criterio,criterio_id,criterio_titulo,parecer_id,parecer_titulo,parecer,tipo_formulario,data_avaliacao,data_avaliacao_hora,synced_at")
          .order("synced_at", { ascending: false })
          .limit(5000)
      ]);

      if (resumoResp.error) throw resumoResp.error;
      if (detalheResp.error) throw detalheResp.error;
      criteriosRaw = respostasResp?.error ? [] : (respostasResp?.data || []);
      pareceresRaw = pareceresResp?.error ? [] : (pareceresResp?.data || []);

      if (pareceresResp?.error) {
        console.warn("Pareceres UC:", pareceresResp.error);
      }

      respostasProfessores = pareceresRaw.map(r => ({
        resposta: String(r.parecer || "").trim(),
        professor: r.avaliador || "Não informado",
        uc: "—",
        ua: r.nome_item || "—"
      })).filter(x => x.resposta);

      ultimaSincronizacao = null;
      ucs = montarUCs(resumoResp.data || [], detalheResp.data || []);
      selecionada = ucs.find(u => u.uasAvaliadas > 0)?.cod || ucs[0]?.cod || null;
      carregado = true;

      const quando = ultimaSincronizacao
        ? new Date(ultimaSincronizacao).toLocaleString("pt-BR")
        : "sincronização disponível";
      atualizarFonte("Dados reais", `Monday → Supabase · ${quando}`);
      render();
      renderVisoesExecutivasV223();
      
      carregarHistoricoSync();
      atualizarSeloDadosReais();
    } catch (erro) {
      console.error("Indicadores UC:", erro);
      atualizarFonte("Falha ao carregar", "Verifique acesso às views no Supabase");
      if ($("ucxLista")) $("ucxLista").innerHTML = `<div class="ucx-empty">Não foi possível carregar os indicadores.<br><small>${esc(erro?.message || erro)}</small></div>`;
      if ($("ucxPainel")) $("ucxPainel").innerHTML = '<div class="ucx-empty">Dados indisponíveis.</div>';
    } finally {
      carregando = false;
    }
  }

  function init() {
    if (!$("viewIndicadoresUC")) return;
    ligarEventos();

    const exec = $("ucxV22Executive");
    if (exec && !carregado) {
      exec.innerHTML = '<section class="v221-section"><div class="v221-empty">Carregando resultado da amostra e padrões recorrentes...</div></section>';
    }

    carregarDados();
    carregarHistoricoSync();
    atualizarSeloDadosReais();

    if (carregado) {
      
    }
  }

  window.inicializarIndicadoresUC = init;
})();

