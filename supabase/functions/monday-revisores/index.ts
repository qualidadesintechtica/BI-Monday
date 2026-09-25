import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_API_VERSION = "2026-07";
const BOARD_VALIDACAO = 9433297929;
const COLUNA_REVISOR = "multiple_person_mkx6ryhs";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
}

async function monday(token: string, query: string, variables: Record<string, unknown>) {
  const r = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token, "API-Version": MONDAY_API_VERSION },
    body: JSON.stringify({ query, variables }),
  });
  const out = await r.json();
  if (!r.ok || out.errors) throw new Error(out.errors?.[0]?.message || `Monday HTTP ${r.status}`);
  return out.data;
}

function idsDoValor(value: string | null): number[] {
  if (!value) return [];
  try {
    const v = JSON.parse(value);
    const arr = Array.isArray(v?.personsAndTeams) ? v.personsAndTeams : [];
    return arr.filter((p: any) => p?.kind === "person" && p?.id != null).map((p: any) => Number(p.id)).filter(Number.isFinite);
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "Método não permitido." }, 405);
  try {
    const token = Deno.env.get("MONDAY_API_TOKEN")?.trim();
    if (!token) throw new Error("Secret MONDAY_API_TOKEN não configurado.");
    const body = await req.json().catch(() => ({}));
    const boardId = Number(body?.board_id || BOARD_VALIDACAO);
    if (boardId !== BOARD_VALIDACAO) throw new Error("Board não autorizado para esta consulta.");

    const q = `query ($board:[ID!]) { boards(ids:$board) { items_page(limit:500) { cursor items { id column_values(ids:["${COLUNA_REVISOR}"]) { id text value } } } } }`;
    let data = await monday(token, q, { board: [String(boardId)] });
    let page = data?.boards?.[0]?.items_page;
    const itens = new Map<string, number[]>();
    const idsPessoas = new Set<number>();

    const consumir = (items:any[]) => (items || []).forEach((item:any) => {
      const cv = item?.column_values?.[0];
      const ids = idsDoValor(cv?.value || null);
      itens.set(String(item?.id || ""), ids);
      ids.forEach((id) => idsPessoas.add(id));
    });

    consumir(page?.items || []);
    let cursor = page?.cursor || null;
    while (cursor) {
      const nq = `query ($cursor:String!) { next_items_page(limit:500,cursor:$cursor) { cursor items { id column_values(ids:["${COLUNA_REVISOR}"]) { id text value } } } }`;
      data = await monday(token, nq, { cursor });
      page = data?.next_items_page;
      consumir(page?.items || []);
      cursor = page?.cursor || null;
    }

    const usuarios = new Map<number, any>();
    const ids = [...idsPessoas];
    for (let i = 0; i < ids.length; i += 100) {
      const lote = ids.slice(i, i + 100).map(String);
      const uq = `query ($ids:[ID!]) { users(ids:$ids) { id name email enabled } }`;
      const ud = await monday(token, uq, { ids: lote });
      (ud?.users || []).forEach((u:any) => usuarios.set(Number(u.id), {
        monday_user_id: Number(u.id),
        nome: u.name || "",
        email: u.email || "",
        ativo: u.enabled !== false
      }));
    }

    const saida = [...itens.entries()].map(([monday_item_id, pessoaIds]) => ({
      monday_item_id,
      pessoas: pessoaIds.map((id) => usuarios.get(id)).filter(Boolean)
    }));

    return json({
      success: true,
      fonte: "Monday",
      board_id: boardId,
      regra: "item_id -> person_id -> user_id -> email",
      total_itens: saida.length,
      itens: saida
    });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
