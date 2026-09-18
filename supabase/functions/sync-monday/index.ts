import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type MondayBoardColumn = {
  id: string;
  title: string;
  type: string;
};

type MondayColumnValue = {
  id: string;
  type: string;
  text: string | null;
  value: string | null;
};

type MondayItem = {
  id: string;
  name: string;
  group: {
    id: string;
    title: string;
  } | null;
  column_values: MondayColumnValue[];
};

type MondayItemsPage = {
  cursor: string | null;
  items: MondayItem[];
};

type MondayBoard = {
  id: string;
  name: string;
  columns: MondayBoardColumn[];
  items_page: MondayItemsPage;
};

type JsonRecord = Record<string, unknown>;

/* =========================================================
   CONFIGURAÇÕES
========================================================= */

const VERSAO = "V25.21";
const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_API_VERSION = "2026-07";
const BOARD_ID = 9433297929;
const TABLE_NAME = "monday_validacao_materiais";
const PAGE_LIMIT = 500;

// Lotes menores para evitar statement timeout no Postgres.
const LOTE_TABELA_PRINCIPAL = 50;
const LOTE_CATALOGO_COLUNAS = 100;
const LOTE_VALORES_COLUNAS = 150;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* =========================================================
   RESPOSTA JSON
========================================================= */

function respostaJson(corpo: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

/* =========================================================
   CONVERSÕES
========================================================= */

function limparTexto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  return texto === "" ? null : texto;
}

function converterId(valor: string): number {
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero)) {
    throw new Error(`ID numérico inválido: ${valor}`);
  }
  return numero;
}

function converterDataIso(valor: string | null): string | null {
  if (!valor) return null;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return null;
  return data.toISOString();
}

function converterDataSql(valor: string | null): string | null {
  if (!valor) return null;

  const match = valor.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return null;
  return data.toISOString().slice(0, 10);
}

function converterJson(valor: string | null | undefined): unknown {
  if (!valor) return null;

  try {
    return JSON.parse(valor);
  } catch {
    return { valor_original: valor };
  }
}

function obterTextoColuna(item: MondayItem, columnId: string): string | null {
  const coluna = item.column_values.find((valor) => valor.id === columnId);
  return limparTexto(coluna?.text);
}

/* =========================================================
   UTILITÁRIOS
========================================================= */

function dividirEmLotes<T>(registros: T[], tamanhoLote: number): T[][] {
  const lotes: T[][] = [];

  for (let inicio = 0; inicio < registros.length; inicio += tamanhoLote) {
    lotes.push(registros.slice(inicio, inicio + tamanhoLote));
  }

  return lotes;
}

function esperar(milissegundos: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milissegundos));
}

/* =========================================================
   CHAVE ADMINISTRATIVA SUPABASE
========================================================= */

function procurarPrimeiraChave(valor: unknown): string | null {
  if (typeof valor === "string") {
    if (valor.startsWith("sb_secret_") || valor.startsWith("eyJ")) {
      return valor;
    }
    return null;
  }

  if (Array.isArray(valor)) {
    for (const item of valor) {
      const chave = procurarPrimeiraChave(item);
      if (chave) return chave;
    }
    return null;
  }

  if (valor !== null && typeof valor === "object") {
    for (const item of Object.values(valor)) {
      const chave = procurarPrimeiraChave(item);
      if (chave) return chave;
    }
  }

  return null;
}

function obterChaveAdministrativa(): string | null {
  const chaveLegada = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (chaveLegada) return chaveLegada;

  const chavesJson = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!chavesJson) return null;

  try {
    return procurarPrimeiraChave(JSON.parse(chavesJson));
  } catch (erro) {
    console.error("Erro ao interpretar SUPABASE_SECRET_KEYS:", erro);
    return null;
  }
}

/* =========================================================
   API MONDAY
========================================================= */

async function consultarMonday(
  token: string,
  query: string,
  variables: JsonRecord = {},
): Promise<any> {
  const resposta = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
      "API-Version": MONDAY_API_VERSION,
    },
    body: JSON.stringify({ query, variables }),
  });

  const textoResposta = await resposta.text();
  let resultado: any;

  try {
    resultado = textoResposta ? JSON.parse(textoResposta) : {};
  } catch {
    throw new Error("Resposta inválida da Monday: " + textoResposta);
  }

  if (!resposta.ok) {
    throw new Error(
      `Monday HTTP ${resposta.status}: ${JSON.stringify(resultado)}`,
    );
  }

  if (Array.isArray(resultado?.errors) && resultado.errors.length > 0) {
    throw new Error("Erro GraphQL Monday: " + JSON.stringify(resultado.errors));
  }

  return resultado?.data;
}

async function testarTokenMonday(token: string): Promise<JsonRecord> {
  const query = `
    query {
      me {
        id
        name
      }
      version {
        kind
        value
      }
    }
  `;

  const data = await consultarMonday(token, query, {});

  if (!data?.me) {
    throw new Error("O Monday não retornou o usuário autenticado.");
  }

  return {
    usuario_id: String(data.me.id),
    usuario_nome: data.me.name ?? null,
    api_version_kind: data.version?.kind ?? null,
    api_version_value: data.version?.value ?? MONDAY_API_VERSION,
  };
}

async function testarBoardMonday(token: string): Promise<JsonRecord> {
  const query = `
    query ($boardId: ID!, $limit: Int!) {
      boards(ids: [$boardId]) {
        id
        name
        columns {
          id
          title
          type
        }
        items_page(limit: $limit) {
          cursor
          items {
            id
            name
          }
        }
      }
    }
  `;

  const data = await consultarMonday(token, query, {
    boardId: String(BOARD_ID),
    limit: 5,
  });

  const board = data?.boards?.[0];
  if (!board) {
    throw new Error("Board Validação de Materiais não encontrado.");
  }

  return {
    board_id: String(board.id),
    board_name: board.name,
    colunas: board.columns?.length ?? 0,
    amostra_itens: board.items_page?.items?.length ?? 0,
    possui_cursor: Boolean(board.items_page?.cursor),
  };
}

/* =========================================================
   SUPABASE REST
========================================================= */

function criarCabecalhosSupabase(
  chave: string,
  prefer?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: chave,
    "Content-Type": "application/json",
  };

  if (chave.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${chave}`;
  }

  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function testarSupabase(supabaseUrl: string, chave: string): Promise<void> {
  const resposta = await fetch(
    `${supabaseUrl}/rest/v1/monday_sync_logs?select=id&limit=1`,
    {
      method: "GET",
      headers: criarCabecalhosSupabase(chave),
    },
  );

  if (!resposta.ok) {
    throw new Error("Falha no teste Supabase: " + await resposta.text());
  }
}

function ehErroStatementTimeout(status: number, corpo: string): boolean {
  const texto = corpo.toLocaleLowerCase("pt-BR");

  return (
    status === 500 &&
    (
      texto.includes("57014") ||
      texto.includes("statement timeout") ||
      texto.includes("canceling statement due to statement timeout")
    )
  );
}

function ehErroTemporarioHttp(status: number): boolean {
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

async function enviarLoteRestComRetry(
  supabaseUrl: string,
  chave: string,
  tabela: string,
  lote: JsonRecord[],
  colunasConflito: string,
  profundidade = 0,
  tentativa = 1,
): Promise<number> {
  const MAX_TENTATIVAS = 3;
  const MAX_PROFUNDIDADE = 8;

  try {
    const resposta = await fetch(
      `${supabaseUrl}/rest/v1/${tabela}?on_conflict=${encodeURIComponent(colunasConflito)}`,
      {
        method: "POST",
        headers: criarCabecalhosSupabase(
          chave,
          "resolution=merge-duplicates,return=minimal",
        ),
        body: JSON.stringify(lote),
      },
    );

    if (resposta.ok) return lote.length;

    const corpo = await resposta.text();

    if (
      ehErroStatementTimeout(resposta.status, corpo) &&
      lote.length > 1 &&
      profundidade < MAX_PROFUNDIDADE
    ) {
      const meio = Math.ceil(lote.length / 2);
      const esquerda = lote.slice(0, meio);
      const direita = lote.slice(meio);

      console.warn(
        `[${tabela}] statement timeout em lote de ${lote.length}. ` +
        `Dividindo em ${esquerda.length} + ${direita.length}.`,
      );

      await esperar(250);

      const totalEsquerda = await enviarLoteRestComRetry(
        supabaseUrl,
        chave,
        tabela,
        esquerda,
        colunasConflito,
        profundidade + 1,
        1,
      );

      const totalDireita = direita.length
        ? await enviarLoteRestComRetry(
            supabaseUrl,
            chave,
            tabela,
            direita,
            colunasConflito,
            profundidade + 1,
            1,
          )
        : 0;

      return totalEsquerda + totalDireita;
    }

    if (ehErroTemporarioHttp(resposta.status) && tentativa < MAX_TENTATIVAS) {
      const espera = 700 * tentativa;

      console.warn(
        `[${tabela}] HTTP ${resposta.status}. Tentativa ${tentativa}/${MAX_TENTATIVAS}. ` +
        `Nova tentativa em ${espera} ms.`,
      );

      await esperar(espera);

      return await enviarLoteRestComRetry(
        supabaseUrl,
        chave,
        tabela,
        lote,
        colunasConflito,
        profundidade,
        tentativa + 1,
      );
    }

    throw new Error(
      `Erro em ${tabela}: HTTP ${resposta.status}. ${corpo}`,
    );
  } catch (erro) {
    if (
      erro instanceof Error &&
      erro.message.startsWith(`Erro em ${tabela}:`)
    ) {
      throw erro;
    }

    if (tentativa < MAX_TENTATIVAS) {
      const espera = 700 * tentativa;

      console.warn(
        `[${tabela}] erro de rede na tentativa ${tentativa}/${MAX_TENTATIVAS}: ` +
        `${erro instanceof Error ? erro.message : String(erro)}. ` +
        `Nova tentativa em ${espera} ms.`,
      );

      await esperar(espera);

      return await enviarLoteRestComRetry(
        supabaseUrl,
        chave,
        tabela,
        lote,
        colunasConflito,
        profundidade,
        tentativa + 1,
      );
    }

    throw erro;
  }
}

async function upsertRest(
  supabaseUrl: string,
  chave: string,
  tabela: string,
  registros: JsonRecord[],
  colunasConflito: string,
  tamanhoLote: number,
): Promise<number> {
  if (registros.length === 0) return 0;

  const lotes = dividirEmLotes(registros, tamanhoLote);
  let totalGravado = 0;

  for (let indice = 0; indice < lotes.length; indice++) {
    const lote = lotes[indice];

    console.log(
      `[${tabela}] lote ${indice + 1}/${lotes.length} (${lote.length})`,
    );

    totalGravado += await enviarLoteRestComRetry(
      supabaseUrl,
      chave,
      tabela,
      lote,
      colunasConflito,
    );

    await esperar(80);
  }

  return totalGravado;
}

/* =========================================================
   LIMPEZA DE REGISTROS ANTIGOS
========================================================= */

async function limparRegistrosAntigos(
  supabaseUrl: string,
  chave: string,
  sincronizadoEm: string,
): Promise<number> {
  const url =
    `${supabaseUrl}/rest/v1/${TABLE_NAME}` +
    `?monday_board_id=eq.${BOARD_ID}` +
    `&sincronizado_em=lt.${encodeURIComponent(sincronizadoEm)}`;

  const resposta = await fetch(url, {
    method: "DELETE",
    headers: criarCabecalhosSupabase(chave, "return=representation"),
  });

  if (!resposta.ok) {
    throw new Error(
      "Erro ao limpar registros antigos: " + await resposta.text(),
    );
  }

  const removidos = await resposta.json();
  return Array.isArray(removidos) ? removidos.length : 0;
}

/* =========================================================
   LOG
========================================================= */

async function inserirLog(
  supabaseUrl: string,
  chave: string,
  registro: JsonRecord,
): Promise<void> {
  const resposta = await fetch(`${supabaseUrl}/rest/v1/monday_sync_logs`, {
    method: "POST",
    headers: criarCabecalhosSupabase(chave, "return=minimal"),
    body: JSON.stringify([registro]),
  });

  if (!resposta.ok) {
    console.error("Erro ao gravar log:", await resposta.text());
  }
}

async function inserirLogSeguro(
  supabaseUrl: string | null,
  chave: string | null,
  registro: JsonRecord,
): Promise<void> {
  if (!supabaseUrl || !chave) return;

  try {
    await inserirLog(supabaseUrl, chave, registro);
  } catch (erro) {
    console.error("Falha adicional ao gravar log:", erro);
  }
}

/* =========================================================
   BUSCA COMPLETA DO BOARD
========================================================= */

async function buscarBoardCompleto(
  mondayToken: string,
): Promise<{
  board: MondayBoard;
  itens: MondayItem[];
  paginas: number;
}> {
  const primeiraQuery = `
    query ($boardId: ID!, $limit: Int!) {
      boards(ids: [$boardId]) {
        id
        name
        columns {
          id
          title
          type
        }
        items_page(limit: $limit) {
          cursor
          items {
            id
            name
            group {
              id
              title
            }
            column_values {
              id
              type
              text
              value
            }
          }
        }
      }
    }
  `;

  const primeiraResposta = await consultarMonday(
    mondayToken,
    primeiraQuery,
    {
      boardId: String(BOARD_ID),
      limit: PAGE_LIMIT,
    },
  );

  const board = primeiraResposta?.boards?.[0] as MondayBoard | undefined;

  if (!board) {
    throw new Error("Board Validação de Materiais não encontrado.");
  }

  const itens: MondayItem[] = [...(board.items_page?.items ?? [])];
  let cursor = board.items_page?.cursor ?? null;
  let paginas = 1;

  const proximaQuery = `
    query ($cursor: String!, $limit: Int!) {
      next_items_page(cursor: $cursor, limit: $limit) {
        cursor
        items {
          id
          name
          group {
            id
            title
          }
          column_values {
            id
            type
            text
            value
          }
        }
      }
    }
  `;

  while (cursor) {
    const resposta = await consultarMonday(
      mondayToken,
      proximaQuery,
      { cursor, limit: PAGE_LIMIT },
    );

    const pagina = resposta?.next_items_page as MondayItemsPage | undefined;
    if (!pagina) break;

    itens.push(...(pagina.items ?? []));
    cursor = pagina.cursor ?? null;
    paginas++;

    console.log(`Página ${paginas}: ${itens.length} itens`);
  }

  return { board, itens, paginas };
}

/* =========================================================
   MAPEAMENTO VALIDAÇÃO
========================================================= */

function mapearValidacao(
  item: MondayItem,
  colunas: MondayBoardColumn[],
  sincronizadoEm: string,
): JsonRecord {
  const dadosColunas: JsonRecord = {};

  for (const valor of item.column_values ?? []) {
    const metadado = colunas.find((coluna) => coluna.id === valor.id);

    dadosColunas[valor.id] = {
      title: metadado?.title ?? null,
      type: valor.type ?? metadado?.type ?? null,
      text: limparTexto(valor.text),
      value: converterJson(valor.value),
    };
  }

  return {
    monday_item_id: converterId(item.id),
    monday_board_id: BOARD_ID,
    monday_group_id: item.group?.id ?? null,
    monday_group_title: item.group?.title ?? null,
    name: limparTexto(item.name),

    titulo: obterTextoColuna(item, "text_mks7qnkq"),
    status_validacao: obterTextoColuna(item, "status"),
    revisor_validador: obterTextoColuna(item, "multiple_person_mkx6ryhs"),
    gestor_validacao_nq: obterTextoColuna(item, "person"),
    id_titulo: obterTextoColuna(item, "text_mksw92ja"),
    id_ua: obterTextoColuna(item, "text_mkvf8t60"),
    bloco: obterTextoColuna(item, "color_mks9ebas"),

    data_liberacao_validacao: converterDataSql(
      obterTextoColuna(item, "data"),
    ),
    data_validacao: converterDataSql(
      obterTextoColuna(item, "date_mks9m7y6"),
    ),
    ultima_sincronizacao: sincronizadoEm,

    status: obterTextoColuna(item, "status"),
    codigo_uc: obterTextoColuna(item, "text_mksw92ja"),
    codigo_pp: obterTextoColuna(item, "text_mkvf8t60"),
    area_conhecimento: obterTextoColuna(item, "color_mks71k25"),
    tipo_material: obterTextoColuna(item, "color_mkvgaz7h"),
    tipo_unidade: obterTextoColuna(item, "color_mkv9rf79"),
    modelo_producao: obterTextoColuna(item, "color_mkv95fhn"),
    periodo: obterTextoColuna(item, "color_mkv9dfn4"),
    esteira: obterTextoColuna(item, "color_mkv9p57c"),
    origem: obterTextoColuna(item, "color_mkw13ayf"),
    ultima_atualizacao_monday: converterDataIso(
      obterTextoColuna(item, "pulse_updated_mks89ghh"),
    ),
    sincronizado_em: sincronizadoEm,

    dados_originais: {
      id: item.id,
      name: item.name,
      group: item.group,
      column_values: item.column_values,
    },

    dados_colunas: dadosColunas,
  };
}

/* =========================================================
   CATÁLOGO DE COLUNAS
========================================================= */

async function gravarCatalogo(
  supabaseUrl: string,
  chave: string,
  colunas: MondayBoardColumn[],
  sincronizadoEm: string,
): Promise<number> {
  const registros = colunas.map((coluna) => ({
    monday_board_id: BOARD_ID,
    column_id: coluna.id,
    column_title: coluna.title,
    column_type: coluna.type,
    sincronizado_em: sincronizadoEm,
  }));

  return await upsertRest(
    supabaseUrl,
    chave,
    "monday_board_colunas",
    registros,
    "monday_board_id,column_id",
    LOTE_CATALOGO_COLUNAS,
  );
}

/* =========================================================
   VALORES GENÉRICOS
========================================================= */

async function gravarValores(
  supabaseUrl: string,
  chave: string,
  itens: MondayItem[],
  colunas: MondayBoardColumn[],
  sincronizadoEm: string,
): Promise<number> {
  const mapa = new Map<string, MondayBoardColumn>();
  for (const coluna of colunas) mapa.set(coluna.id, coluna);

  const registros: JsonRecord[] = [];

  for (const item of itens) {
    for (const valor of item.column_values ?? []) {
      const texto = limparTexto(valor.text);
      const json = converterJson(valor.value);

      if (texto === null && json === null) continue;

      const metadado = mapa.get(valor.id);

      registros.push({
        monday_item_id: converterId(item.id),
        monday_board_id: BOARD_ID,
        monday_group_id: item.group?.id ?? null,
        monday_group_title: item.group?.title ?? null,
        column_id: valor.id,
        column_title: metadado?.title ?? valor.id,
        column_type: valor.type ?? metadado?.type ?? null,
        column_text: texto,
        column_value: json,
        sincronizado_em: sincronizadoEm,
      });
    }
  }

  return await upsertRest(
    supabaseUrl,
    chave,
    "monday_item_colunas",
    registros,
    "monday_item_id,column_id",
    LOTE_VALORES_COLUNAS,
  );
}

/* =========================================================
   FUNÇÃO PRINCIPAL
========================================================= */

Deno.serve(async (req: Request) => {
  const inicio = Date.now();
  let etapa = "inicio";

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (req.method !== "POST") {
    return respostaJson(
      {
        sucesso: false,
        error: "Utilize POST.",
        mensagem: "Utilize POST.",
        versao: VERSAO,
      },
      405,
    );
  }

  const mondayToken = Deno.env.get("MONDAY_API_TOKEN")?.trim() ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const chave = obterChaveAdministrativa();

  console.log("MONDAY_API_TOKEN existe:", Boolean(mondayToken));
  console.log("Tamanho do token:", mondayToken.length);
  console.log("Versão sync-monday:", VERSAO);

  let acao = "sincronizar-principal";

  try {
    etapa = "lendo-corpo";

    const body = await req.json().catch(() => ({}));
    acao = String(body?.acao ?? "sincronizar-principal").trim() || "sincronizar-principal";

    etapa = "validando-configuracao";

    if (!mondayToken) {
      throw new Error("MONDAY_API_TOKEN não encontrado.");
    }

    if (!supabaseUrl) {
      throw new Error("SUPABASE_URL não encontrado.");
    }

    if (!chave) {
      throw new Error("Chave administrativa do Supabase não encontrada.");
    }

    if (acao === "teste-token") {
      etapa = "testando-token-monday";
      const monday = await testarTokenMonday(mondayToken);

      return respostaJson({
        sucesso: true,
        mensagem: "Token do Monday autenticado com sucesso.",
        versao: VERSAO,
        monday,
      });
    }

    if (acao === "teste-board") {
      etapa = "testando-board-monday";
      const board = await testarBoardMonday(mondayToken);

      return respostaJson({
        sucesso: true,
        mensagem: "Acesso ao board do Monday confirmado.",
        versao: VERSAO,
        board,
      });
    }

    const sincronizacaoCompleta = acao === "sincronizar-completo";

    if (!sincronizacaoCompleta && acao !== "sincronizar-principal") {
      throw new Error(
        `Ação inválida: ${acao}. Use teste-token, teste-board, sincronizar-principal ou sincronizar-completo.`,
      );
    }

    etapa = "testando-supabase";
    await testarSupabase(supabaseUrl, chave);
    console.log("Supabase OK.");

    etapa = "buscando-board-monday";
    console.log("Buscando Validação de Materiais...");

    const resultado = await buscarBoardCompleto(mondayToken);
    const sincronizadoEm = new Date().toISOString();

    console.log(`Itens encontrados: ${resultado.itens.length}`);

    etapa = "mapeando-registros";
    const registros = resultado.itens.map((item) =>
      mapearValidacao(item, resultado.board.columns, sincronizadoEm)
    );

    etapa = "gravando-catalogo-colunas";
    const catalogo = await gravarCatalogo(
      supabaseUrl,
      chave,
      resultado.board.columns,
      sincronizadoEm,
    );

    etapa = "gravando-tabela-principal";
    const gravados = await upsertRest(
      supabaseUrl,
      chave,
      TABLE_NAME,
      registros,
      "monday_item_id",
      LOTE_TABELA_PRINCIPAL,
    );

    /*
      A limpeza só acontece DEPOIS que todos os registros atuais
      foram gravados com sucesso. Assim, uma execução que falhar no
      meio nunca apaga registros válidos da execução anterior.
    */
    etapa = "limpando-registros-antigos";
    const registrosAntigosRemovidos = await limparRegistrosAntigos(
      supabaseUrl,
      chave,
      sincronizadoEm,
    );

    console.log(
      `Registros antigos removidos: ${registrosAntigosRemovidos}`,
    );

    let valores = 0;

    if (sincronizacaoCompleta) {
      etapa = "gravando-valores-genericos";
      valores = await gravarValores(
        supabaseUrl,
        chave,
        resultado.itens,
        resultado.board.columns,
        sincronizadoEm,
      );
    } else {
      console.log(
        "Ação sincronizar-principal: monday_item_colunas não será atualizada nesta execução.",
      );
    }

    const duracao = Math.round(((Date.now() - inicio) / 1000) * 100) / 100;

    etapa = "gravando-log-sucesso";

    await inserirLogSeguro(supabaseUrl, chave, {
      function_name: "sync-monday",
      monday_board_id: BOARD_ID,
      status: "sucesso",
      itens_lidos: resultado.itens.length,
      registros_gravados: gravados,
      paginas_lidas: resultado.paginas,
      duracao_segundos: duracao,
      mensagem: sincronizacaoCompleta
        ? "Validação de Materiais sincronizada com sucesso (completa)."
        : "Validação de Materiais sincronizada com sucesso (tabela principal).",
      detalhes: {
        versao: VERSAO,
        acao,
        board_name: resultado.board.name,
        tabela_destino: TABLE_NAME,
        colunas_do_board: resultado.board.columns.length,
        catalogo_gravado: catalogo,
        valores_colunas_gravados: valores,
        registros_antigos_removidos: registrosAntigosRemovidos,
        lotes: {
          tabela_principal: LOTE_TABELA_PRINCIPAL,
          catalogo: LOTE_CATALOGO_COLUNAS,
          valores: LOTE_VALORES_COLUNAS,
        },
        ids_mapeados: {
          id_titulo: "text_mksw92ja",
          id_ua: "text_mkvf8t60",
          status_validacao: "status",
          revisor_validador: "multiple_person_mkx6ryhs",
          gestor_validacao_nq: "person",
          data_liberacao: "data",
          data_validacao: "date_mks9m7y6",
        },
      },
    });

    etapa = "concluido";

    return respostaJson({
      sucesso: true,
      versao: VERSAO,
      acao,
      board: resultado.board.name,
      resumo: {
        itens_lidos: resultado.itens.length,
        registros_gravados: gravados,
        registros_antigos_removidos: registrosAntigosRemovidos,
        paginas_lidas: resultado.paginas,
        catalogo_gravado: catalogo,
        valores_colunas_gravados: valores,
        duracao_segundos: duracao,
      },
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    const duracao = Math.round(((Date.now() - inicio) / 1000) * 100) / 100;

    console.error("Erro sync-monday:", {
      versao: VERSAO,
      acao,
      etapa,
      mensagem,
    });

    await inserirLogSeguro(supabaseUrl || null, chave, {
      function_name: "sync-monday",
      monday_board_id: BOARD_ID,
      status: "erro",
      itens_lidos: 0,
      registros_gravados: 0,
      paginas_lidas: 0,
      duracao_segundos: duracao,
      mensagem,
      detalhes: {
        versao: VERSAO,
        acao,
        etapa,
        erro: mensagem,
      },
    });

    return respostaJson(
      {
        sucesso: false,
        error: mensagem,
        mensagem,
        versao: VERSAO,
        acao,
        etapa,
        duracao_segundos: duracao,
      },
      500,
    );
  }
});
