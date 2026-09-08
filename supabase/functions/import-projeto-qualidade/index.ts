import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function txt(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s || null;
}

function erroTexto(e: unknown): string {
  if (e instanceof Error) return e.message;

  if (e && typeof e === "object") {
    const obj = e as Record<string, unknown>;
    const partes = [
      obj.message,
      obj.details,
      obj.hint,
      obj.code ? `código ${obj.code}` : null,
    ].filter(Boolean);

    if (partes.length) return partes.map(String).join(" | ");

    try {
      return JSON.stringify(e);
    } catch {
      return "Erro não identificado.";
    }
  }

  return String(e ?? "Erro não identificado.");
}

function norm(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isoDate(v: unknown): string | null {
  if (!v) return null;

  const s = String(v).trim();

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function tipoLinha(v: unknown): string {
  const n = norm(v);
  if (n.includes("projeto")) return "projeto";
  if (n.includes("tarefa") || n.includes("action plan")) return "tarefa";
  return "";
}

function sourceKey(prefix: string, id: unknown, projeto: unknown, acao?: unknown): string {
  const sid = txt(id);
  if (sid) return `${prefix}|${sid}`;

  const p = norm(projeto);
  const a = norm(acao);

  return a ? `${prefix}|${p}|${a}` : `${prefix}|${p}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (req.method !== "POST") {
    return json({ success: false, error: "Método não permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";

  const auth = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await auth.auth.getUser();
  const user = userData?.user;

  if (userError || !user) {
    return json({ success: false, error: "Usuário não autenticado." }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  let importacaoId: number | string | null = null;

  try {
    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const arquivoNome = txt(body?.arquivo_nome) || "PROJETOS_QUALIDADE.xlsx";
    const arquivoTamanho = Number(body?.arquivo_tamanho || 0);
    const aba = txt(body?.aba) || "Work item e filhos (1)";

    if (!rows.length) throw new Error("Nenhuma linha foi recebida.");

    const headers = new Set(Object.keys(rows[0] || {}));
    const obrigatorias = ["Projetos", "State"];
    const ausentes = obrigatorias.filter(h => !headers.has(h));

    if (ausentes.length) {
      throw new Error(`Coluna(s) obrigatória(s) ausente(s): ${ausentes.join(", ")}.`);
    }

    const { data: log, error: logError } = await admin
      .from("pq_importacoes_atual")
      .insert({
        arquivo_nome: arquivoNome,
        arquivo_tamanho: arquivoTamanho,
        aba,
        status: "processando",
        total_linhas: rows.length,
        importado_por: user.id,
      })
      .select("id")
      .single();

    if (logError) throw new Error(erroTexto(logError));
    importacaoId = log.id;

    const projetos: Record<string, unknown>[] = [];
    const tarefas: Record<string, unknown>[] = [];
    const erros: string[] = [];

    rows.forEach((r: Record<string, unknown>, idx: number) => {
      const projeto = txt(r["Projetos"]);
      const acao = txt(r["Ações"]);
      let tipo = tipoLinha(r["Work Item Type"]);

      // A planilha atual possui 4 tarefas sem ID e sem Work Item Type.
      // Quando há projeto + ação, tratamos como tarefa para não perder informação.
      if (!tipo && projeto && acao) tipo = "tarefa";

      if (!projeto) {
        if (Object.values(r).some(v => txt(v))) {
          erros.push(`Linha ${idx + 2}: nome do projeto não informado.`);
        }
        return;
      }

      const base = {
        id_azure: txt(r["ID"]),
        projeto,
        status: txt(r["State"]),
        data_inicio: isoDate(r["Start Date"]),
        data_fim: isoDate(r["Target Date"]),
        sponsor: txt(r["Sponsor"]),
        link_evidencias: txt(r["link evidências"]),
        ativo: true,
        updated_at: new Date().toISOString(),
      };

      if (tipo === "projeto") {
        projetos.push({
          ...base,
          source_key: sourceKey("P", r["ID"], projeto),
          esforco: txt(r["Esforço"]),
          prioridade: txt(r["Prioridade"]),
          contexto_objetivo_original: txt(r["Contexto / Objetivo"]),
          resultados_esperados_original: txt(r["Resultados Esperados"]),
          impacto_original: txt(r["Impacto"]),
          resultados_alcancados_original: txt(r["Resultados Alcançados"]),
        });
      } else if (tipo === "tarefa") {
        tarefas.push({
          ...base,
          source_key: sourceKey("T", r["ID"], projeto, acao),
          acao,
        });
      } else {
        erros.push(`Linha ${idx + 2}: tipo não reconhecido.`);
      }
    });

    if (!projetos.length) throw new Error("Nenhum projeto válido foi encontrado.");

    // Guarda o estado anterior para calcular novos x atualizados
    const [oldP, oldT] = await Promise.all([
      admin.from("pq_projetos_atual").select("source_key"),
      admin.from("pq_tarefas_atual").select("source_key")
    ]);

    if (oldP.error) throw new Error(erroTexto(oldP.error));
    if (oldT.error) throw new Error(erroTexto(oldT.error));

    const oldPKeys = new Set((oldP.data || []).map(x => x.source_key).filter(Boolean));
    const oldTKeys = new Set((oldT.data || []).map(x => x.source_key).filter(Boolean));

    const projetosInseridos = projetos.filter(x => !oldPKeys.has(x.source_key)).length;
    const projetosAtualizados = projetos.length - projetosInseridos;
    const tarefasInseridas = tarefas.filter(x => !oldTKeys.has(x.source_key)).length;
    const tarefasAtualizadas = tarefas.length - tarefasInseridas;

    // Marcar snapshot anterior como inativo; nada é apagado.
    const now = new Date().toISOString();

    const [inactiveP, inactiveT] = await Promise.all([
      admin.from("pq_projetos_atual").update({ ativo: false, updated_at: now }).eq("ativo", true),
      admin.from("pq_tarefas_atual").update({ ativo: false, updated_at: now }).eq("ativo", true)
    ]);

    if (inactiveP.error) throw new Error(erroTexto(inactiveP.error));
    if (inactiveT.error) throw new Error(erroTexto(inactiveT.error));

    // Atualiza/inclui em lotes.
    for (let i = 0; i < projetos.length; i += 100) {
      const lote = projetos.slice(i, i + 100);
      const { error } = await admin
        .from("pq_projetos_atual")
        .upsert(lote, { onConflict: "source_key" });

      if (error) throw new Error(erroTexto(error));
    }

    for (let i = 0; i < tarefas.length; i += 100) {
      const lote = tarefas.slice(i, i + 100);
      const { error } = await admin
        .from("pq_tarefas_atual")
        .upsert(lote, { onConflict: "source_key" });

      if (error) throw new Error(erroTexto(error));
    }

    const mensagem = erros.length
      ? `Importação concluída com ${erros.length} linha(s) não aproveitada(s).`
      : "Importação concluída com sucesso.";

    const finishedAt = new Date().toISOString();

    await admin
      .from("pq_importacoes_atual")
      .update({
        status: "concluida",
        total_linhas: rows.length,
        projetos_inseridos: projetosInseridos,
        projetos_atualizados: projetosAtualizados,
        tarefas_inseridas: tarefasInseridas,
        tarefas_atualizadas: tarefasAtualizadas,
        linhas_com_erro: erros.length,
        mensagem,
        finished_at: finishedAt,
      })
      .eq("id", importacaoId);

    return json({
      success: true,
      importacao_id: importacaoId,
      arquivo: arquivoNome,
      aba,
      total_linhas: rows.length,
      projetos_gravados: projetos.length,
      projetos_inseridos: projetosInseridos,
      projetos_atualizados: projetosAtualizados,
      tarefas_gravadas: tarefas.length,
      tarefas_inseridas: tarefasInseridas,
      tarefas_atualizadas: tarefasAtualizadas,
      linhas_com_erro: erros.length,
      erros: erros.slice(0, 30),
      mensagem,
      finalizado_em: finishedAt,
    });

  } catch (e) {
    const mensagem = erroTexto(e);

    if (importacaoId !== null) {
      await admin
        .from("pq_importacoes_atual")
        .update({
          status: "erro",
          mensagem,
          finished_at: new Date().toISOString(),
        })
        .eq("id", importacaoId);
    }

    console.error("import-projeto-qualidade:", e);
    return json({ success: false, error: mensagem }, 400);
  }
});
