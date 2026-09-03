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

  function renderPainel() {
    const el = $("ucxPainel");
    if (!el) return;
    el.innerHTML = vista === "comparativo"
      ? renderComparativo()
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

      const [resumoResp, detalheResp] = await Promise.all([
        window.biSupabase
          .from("vw_indicadores_uc_dashboard")
          .select("codigo_uc,total_uas,uas_avaliadas,uas_nao_avaliadas,indicador_1_media,indicador_2_media,indicador_3_media,indicador_4_media,indicador_5_media,indicador_6_media,indicador_7_media,media_geral_uc,media_percentual,classificacao_uc,percentual_conclusao,ranking_uc,nome_uc")
          .order("ranking_uc", { ascending: true }),
        window.biSupabase
          .from("vw_indicadores_uc")
          .select("nome_item,codigo_uc,numero_ua,data_avaliacao,avaliador,categoria_material,conceito_final,indicador_1,indicador_2,indicador_3,indicador_4,indicador_5,indicador_6,indicador_7,media_indicadores,avaliacao_completa,classificacao_ua,synced_at")
          .order("codigo_uc", { ascending: true })
          .order("numero_ua", { ascending: true })
      ]);

      if (resumoResp.error) throw resumoResp.error;
      if (detalheResp.error) throw detalheResp.error;

      ultimaSincronizacao = null;
      ucs = montarUCs(resumoResp.data || [], detalheResp.data || []);
      selecionada = ucs.find(u => u.uasAvaliadas > 0)?.cod || ucs[0]?.cod || null;
      carregado = true;

      const quando = ultimaSincronizacao
        ? new Date(ultimaSincronizacao).toLocaleString("pt-BR")
        : "sincronização disponível";
      atualizarFonte("Dados reais", `Monday → Supabase · ${quando}`);
      render();
    } catch (erro) {
      console.error("Indicadores UC:", erro);
      atualizarFonte("Falha ao carregar", "Verifique acesso às views no Supabase");
      if ($("ucxLista")) $("ucxLista").innerHTML = `<div class="ucx-empty">Não foi possível carregar os indicadores.<br><small>${esc(erro?.message || erro)}</small></div>`;
      if ($("ucxPainel")) $("ucxPainel").innerHTML = '<div class="ucx-empty">Dados indisponíveis.</div>';
    } finally {
      carregando = false;
    }
  }

  // V22: histórico de sincronizações automáticas (tabela sync_log)
  async function carregarSyncLog() {
    const tbody = $("ucxSyncTbody");
    const resumo = $("ucxSyncResumo");
    if (!tbody) return;

    try {
      if (!window.biSupabase) throw new Error("Cliente Supabase não disponível.");

      const { data, error } = await window.biSupabase
        .from("sync_log")
        .select("executado_em,sucesso,itens_lidos,itens_gravados,erros,mensagem_erro")
        .order("executado_em", { ascending: false })
        .limit(10);

      if (error) throw error;

      const linhas = data || [];

      if (!linhas.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="ucx-empty">Nenhuma sincronização registrada ainda.</td></tr>';
        if (resumo) resumo.textContent = "Aguardando a primeira execução automática";
        return;
      }

      tbody.innerHTML = linhas.map(l => {
        const quando = l.executado_em ? new Date(l.executado_em).toLocaleString("pt-BR") : "—";
        const status = l.sucesso
          ? '<span class="ucx-sync-status ok">Sucesso</span>'
          : `<span class="ucx-sync-status fail" title="${esc(l.mensagem_erro || "")}">Falha</span>`;
        return `<tr><td>${esc(quando)}</td><td>${status}</td><td>${l.itens_lidos ?? "—"}</td><td>${l.itens_gravados ?? "—"}</td><td>${l.erros ?? "—"}</td></tr>`;
      }).join("");

      const ultima = linhas[0];
      const quandoUltima = ultima.executado_em ? new Date(ultima.executado_em).toLocaleString("pt-BR") : "—";
      if (resumo) resumo.textContent = `Última execução: ${quandoUltima} · ${ultima.sucesso ? "sucesso" : "falha"}`;
    } catch (erro) {
      console.error("Sync log:", erro);
      tbody.innerHTML = `<tr><td colspan="5" class="ucx-empty">Não foi possível carregar o histórico de sincronizações.<br><small>${esc(erro?.message || erro)}</small></td></tr>`;
      if (resumo) resumo.textContent = "Falha ao carregar histórico";
    }
  }

  function init() {
    if (!$("viewIndicadoresUC")) return;
    ligarEventos();
    carregarDados();
    carregarSyncLog();
  }

  window.inicializarIndicadoresUC = init;
})();
