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

type BoardConfig = {
  boardId: number;
  nome: string;
  tabela: string;
  tipo: "validacao" | "esteira";
};

/* =========================================================
   CONFIGURAÇÕES
========================================================= */

const VERSAO = "V25.28";
const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_API_VERSION = "2026-07";
const PAGE_LIMIT = 500;

const BOARDS: BoardConfig[] = [
  {
    boardId: 9433297929,
    nome: "Validação de Materiais",
    tabela: "monday_validacao_materiais",
    tipo: "validacao",
  },
  {
    boardId: 9376982027,
    nome: "Esteira de Produção",
    tabela: "monday_esteira_producao",
    tipo: "esteira",
  },
];

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

async function testarBoardMonday(
  token: string,
  boardId: number,
  nomeEsperado: string,
): Promise<JsonRecord> {
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
    boardId: String(boardId),
    limit: 5,
  });

  const board = data?.boards?.[0];
  if (!board) {
    throw new Error(`Board ${nomeEsperado} (${boardId}) não encontrado.`);
  }

  return {
    board_id: String(board.id),
    board_name: board.name,
    colunas: board.columns?.length ?? 0,
    amostra_itens: board.items_page?.items?.length ?? 0,
    possui_cursor: Boolean(board.items_page?.cursor),
  };
}

async function testarBoardsMonday(token: string): Promise<JsonRecord[]> {
  const resultados: JsonRecord[] = [];
  for (const config of BOARDS) {
    resultados.push(
      await testarBoardMonday(token, config.boardId, config.nome),
    );
  }
  return resultados;
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
  tabela: string,
  boardId: number,
  sincronizadoEm: string,
): Promise<number> {
  const url =
    `${supabaseUrl}/rest/v1/${tabela}` +
    `?monday_board_id=eq.${boardId}` +
    `&sincronizado_em=lt.${encodeURIComponent(sincronizadoEm)}`;

  const resposta = await fetch(url, {
    method: "DELETE",
    headers: criarCabecalhosSupabase(chave, "return=representation"),
  });

  if (!resposta.ok) {
    throw new Error(
      `Erro ao limpar registros antigos de ${tabela}: ` +
      await resposta.text(),
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
  boardId: number,
  nomeBoard: string,
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
      boardId: String(boardId),
      limit: PAGE_LIMIT,
    },
  );

  const board = primeiraResposta?.boards?.[0] as MondayBoard | undefined;

  if (!board) {
    throw new Error(`Board ${nomeBoard} (${boardId}) não encontrado.`);
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

    console.log(`[${nomeBoard}] Página ${paginas}: ${itens.length} itens`);
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
  boardId: number,
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
    monday_board_id: boardId,
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
   MAPEAMENTO ESTEIRA DE PRODUÇÃO
========================================================= */

function mapearEsteira(
  item: MondayItem,
  sincronizadoEm: string,
  boardId: number,
): JsonRecord {
  return {
    monday_item_id: converterId(item.id),
    monday_board_id: boardId,
    monday_group_id: item.group?.id ?? null,
    monday_group_title: item.group?.title ?? null,
    item_name: limparTexto(item.name),

    titulo: obterTextoColuna(item, "text_mks7rjf0"),
    id_banco_ulife: obterTextoColuna(item, "text_mkzmj14c"),
    cod_crono_ua: obterTextoColuna(item, "text_mkv1fn8z"),
    titulo_ua: obterTextoColuna(item, "text_mm0drj8r"),
    id_ua: obterTextoColuna(item, "text_mksq4dnr"),
    id_titulo: obterTextoColuna(item, "text_mkskgjkk"),
    id_papel_docente: obterTextoColuna(item, "text_mkx6qej1"),

    matriz_oferta: obterTextoColuna(item, "color_mkvftgax"),
    escopo: obterTextoColuna(item, "color_mkvfcx0t"),
    bloco: obterTextoColuna(item, "color_mks999v5"),
    papel_conteudista: obterTextoColuna(item, "color_mkx6sxp0"),
    dinamica_producao: obterTextoColuna(item, "color_mkvf6g8b"),
    formato: obterTextoColuna(item, "color_mkvfffvq"),
    area_cine: obterTextoColuna(item, "color_mks6gxz2"),
    esteira_producao: obterTextoColuna(item, "color_mkvfvkym"),
    semestre_oferta: obterTextoColuna(item, "color_mkvf324y"),
    produtora: obterTextoColuna(item, "color_mksqzwx2"),
    categoria_material: obterTextoColuna(item, "color_mkxbz3rn"),

    docente_conteudista: obterTextoColuna(item, "text_mkr6ynhg"),
    email_conteudista: obterTextoColuna(item, "email_mkr09wjk"),
    designer_aprendizagem: obterTextoColuna(item, "project_owner"),
    cluster_av: obterTextoColuna(item, "multiple_person_mkswkexj"),
    produtora_equipe: obterTextoColuna(item, "multiple_person_mks9pxa"),
    produtora_videoaulas: obterTextoColuna(item, "multiple_person_mkwztn9d"),
    gestor_validacao_nq: obterTextoColuna(item, "multiple_person_mkx4raat"),
    cep: obterTextoColuna(item, "multiple_person_mkwy2xq8"),

    status_docente: obterTextoColuna(item, "project_status"),
    cronograma_docente: obterTextoColuna(item, "project_timeline"),
    data_entrega_docente: obterTextoColuna(item, "date_mkse46jw"),
    criticidade: obterTextoColuna(item, "color_mks9h9ev"),

    previsao_liberacao_validacao: obterTextoColuna(item, "date_mkwr7xpe"),
    data_liberacao_validacao: obterTextoColuna(item, "date_mks79cy6"),
    status_validacao_espelho: obterTextoColuna(item, "lookup_mkse5b2p"),
    data_validacao_espelho: obterTextoColuna(item, "lookup_mkyp81tb"),
    data_revalidacao_espelho: obterTextoColuna(item, "lookup_mm06ssjy"),
    data_solicitacao_ajuste_espelho: obterTextoColuna(item, "lookup_mm1arb2d"),
    data_envio_revalidacao_espelho: obterTextoColuna(item, "lookup_mkx66zpt"),
    qtd_ajustes_pos_validacao: obterTextoColuna(item, "lookup_mm0vn8nh"),
    relacao_validacao_materiais: obterTextoColuna(item, "board_relation_mkseetd5"),

    percentual_validacao: obterTextoColuna(item, "formula_mks9mp04"),
    percentual_numero: obterTextoColuna(item, "numeric_mktb2ath"),
    status_geral_producao: obterTextoColuna(item, "formula_mkzsd7jk"),
    status_subida_ulife: obterTextoColuna(item, "color_mkty383x"),
    data_subida_ulife: obterTextoColuna(item, "date_mkzss9d7"),
    total_ajustes: obterTextoColuna(item, "formula_mm0v6nbj"),
    ultima_atualizacao_monday: converterDataIso(
      obterTextoColuna(item, "last_updated"),
    ),
    sincronizado_em: sincronizadoEm,

    dados_originais: {
      id: item.id,
      name: item.name,
      group: item.group,
      column_values: item.column_values,
    },
  };
}

/* =========================================================
   CATÁLOGO DE COLUNAS
========================================================= */

async function gravarCatalogo(
  supabaseUrl: string,
  chave: string,
  boardId: number,
  colunas: MondayBoardColumn[],
  sincronizadoEm: string,
): Promise<number> {
  const registros = colunas.map((coluna) => ({
    monday_board_id: boardId,
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
  boardId: number,
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
        monday_board_id: boardId,
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
   V25.28 · ESTADO DE PAGINAÇÃO
   Cada execução processa apenas UMA página do Monday.
   Isso evita ultrapassar o tempo de execução da Edge Function.
========================================================= */

type SyncState = {
  board_id: number;
  board_name: string | null;
  tabela_destino: string | null;
  cursor: string | null;
  ciclo_sincronizado_em: string | null;
  paginas_processadas: number;
  itens_processados: number;
  em_ciclo: boolean;
  ultimo_ciclo_concluido_em: string | null;
  atualizado_em: string | null;
};

async function lerEstadoSync(
  supabaseUrl: string,
  chave: string,
  boardId: number,
): Promise<SyncState | null> {
  const resposta = await fetch(
    `${supabaseUrl}/rest/v1/monday_sync_state?board_id=eq.${boardId}&select=*&limit=1`,
    {
      method: "GET",
      headers: criarCabecalhosSupabase(chave),
    },
  );

  if (!resposta.ok) {
    throw new Error(
      `Erro ao ler monday_sync_state: HTTP ${resposta.status}. ${await resposta.text()}`,
    );
  }

  const dados = await resposta.json();
  if (!Array.isArray(dados) || dados.length === 0) return null;

  const s = dados[0] ?? {};
  return {
    board_id: Number(s.board_id ?? boardId),
    board_name: limparTexto(s.board_name),
    tabela_destino: limparTexto(s.tabela_destino),
    cursor: limparTexto(s.cursor),
    ciclo_sincronizado_em: limparTexto(s.ciclo_sincronizado_em),
    paginas_processadas: Number(s.paginas_processadas ?? 0),
    itens_processados: Number(s.itens_processados ?? 0),
    em_ciclo: Boolean(s.em_ciclo),
    ultimo_ciclo_concluido_em: limparTexto(s.ultimo_ciclo_concluido_em),
    atualizado_em: limparTexto(s.atualizado_em),
  };
}

async function salvarEstadoSync(
  supabaseUrl: string,
  chave: string,
  estado: JsonRecord,
): Promise<void> {
  const resposta = await fetch(
    `${supabaseUrl}/rest/v1/monday_sync_state?on_conflict=board_id`,
    {
      method: "POST",
      headers: criarCabecalhosSupabase(
        chave,
        "resolution=merge-duplicates,return=minimal",
      ),
      body: JSON.stringify([estado]),
    },
  );

  if (!resposta.ok) {
    throw new Error(
      `Erro ao salvar monday_sync_state: HTTP ${resposta.status}. ${await resposta.text()}`,
    );
  }
}

async function buscarMetadadosBoard(
  mondayToken: string,
  boardId: number,
  nomeBoard: string,
): Promise<{ id: string; name: string; columns: MondayBoardColumn[] }> {
  const query = `
    query ($boardId: ID!) {
      boards(ids: [$boardId]) {
        id
        name
        columns { id title type }
      }
    }
  `;

  const data = await consultarMonday(mondayToken, query, {
    boardId: String(boardId),
  });

  const board = data?.boards?.[0];
  if (!board) {
    throw new Error(`Board ${nomeBoard} (${boardId}) não encontrado.`);
  }

  return {
    id: String(board.id),
    name: String(board.name ?? nomeBoard),
    columns: Array.isArray(board.columns) ? board.columns : [],
  };
}

async function buscarPrimeiraPaginaBoard(
  mondayToken: string,
  boardId: number,
  nomeBoard: string,
): Promise<{
  board: { id: string; name: string; columns: MondayBoardColumn[] };
  pagina: MondayItemsPage;
}> {
  const query = `
    query ($boardId: ID!, $limit: Int!) {
      boards(ids: [$boardId]) {
        id
        name
        columns { id title type }
        items_page(limit: $limit) {
          cursor
          items {
            id
            name
            group { id title }
            column_values { id type text value }
          }
        }
      }
    }
  `;

  const data = await consultarMonday(mondayToken, query, {
    boardId: String(boardId),
    limit: PAGE_LIMIT,
  });

  const board = data?.boards?.[0];
  if (!board) {
    throw new Error(`Board ${nomeBoard} (${boardId}) não encontrado.`);
  }

  return {
    board: {
      id: String(board.id),
      name: String(board.name ?? nomeBoard),
      columns: Array.isArray(board.columns) ? board.columns : [],
    },
    pagina: {
      cursor: board.items_page?.cursor ?? null,
      items: Array.isArray(board.items_page?.items) ? board.items_page.items : [],
    },
  };
}

async function buscarPaginaPorCursor(
  mondayToken: string,
  cursor: string,
): Promise<MondayItemsPage> {
  const query = `
    query ($cursor: String!, $limit: Int!) {
      next_items_page(cursor: $cursor, limit: $limit) {
        cursor
        items {
          id
          name
          group { id title }
          column_values { id type text value }
        }
      }
    }
  `;

  const data = await consultarMonday(mondayToken, query, {
    cursor,
    limit: PAGE_LIMIT,
  });

  const pagina = data?.next_items_page;
  if (!pagina) {
    throw new Error("O Monday não retornou a próxima página do cursor salvo.");
  }

  return {
    cursor: pagina.cursor ?? null,
    items: Array.isArray(pagina.items) ? pagina.items : [],
  };
}


/* =========================================================
   SINCRONIZAÇÃO DE UM BOARD
========================================================= */

async function sincronizarBoard(
  config: BoardConfig,
  mondayToken: string,
  supabaseUrl: string,
  chave: string,
  sincronizacaoCompleta: boolean,
  acao: string,
): Promise<JsonRecord> {
  const inicio = Date.now();
  let etapa = "inicio";
  let itensPagina = 0;
  let paginaNumero = 0;

  try {
    etapa = "lendo-estado-paginacao";
    const estadoAnterior = await lerEstadoSync(
      supabaseUrl,
      chave,
      config.boardId,
    );

    const continuarCiclo = Boolean(
      estadoAnterior?.em_ciclo &&
      estadoAnterior?.cursor &&
      estadoAnterior?.ciclo_sincronizado_em,
    );

    let board: { id: string; name: string; columns: MondayBoardColumn[] };
    let pagina: MondayItemsPage;
    let cicloSincronizadoEm: string;
    let paginasAcumuladas = 0;
    let itensAcumulados = 0;

    if (continuarCiclo) {
      etapa = "buscando-metadados-board";
      board = await buscarMetadadosBoard(
        mondayToken,
        config.boardId,
        config.nome,
      );

      etapa = "buscando-proxima-pagina-monday";
      pagina = await buscarPaginaPorCursor(
        mondayToken,
        estadoAnterior!.cursor!,
      );

      cicloSincronizadoEm = estadoAnterior!.ciclo_sincronizado_em!;
      paginasAcumuladas = Number(estadoAnterior!.paginas_processadas ?? 0);
      itensAcumulados = Number(estadoAnterior!.itens_processados ?? 0);
      paginaNumero = paginasAcumuladas + 1;
    } else {
      etapa = "iniciando-novo-ciclo-monday";
      const primeira = await buscarPrimeiraPaginaBoard(
        mondayToken,
        config.boardId,
        config.nome,
      );
      board = primeira.board;
      pagina = primeira.pagina;
      cicloSincronizadoEm = new Date().toISOString();
      paginaNumero = 1;
      paginasAcumuladas = 0;
      itensAcumulados = 0;
    }

    itensPagina = pagina.items.length;
    const proximoCursor = pagina.cursor ?? null;
    const cicloConcluido = !proximoCursor;

    etapa = "mapeando-pagina";
    const registros = config.tipo === "validacao"
      ? pagina.items.map((item) =>
          mapearValidacao(
            item,
            board.columns,
            cicloSincronizadoEm,
            config.boardId,
          )
        )
      : pagina.items.map((item) =>
          mapearEsteira(item, cicloSincronizadoEm, config.boardId)
        );

    // O catálogo é pequeno. Regravá-lo por página evita depender da primeira
    // execução caso um ciclo seja retomado após falha/redeploy.
    etapa = "gravando-catalogo-colunas";
    const catalogo = await gravarCatalogo(
      supabaseUrl,
      chave,
      config.boardId,
      board.columns,
      cicloSincronizadoEm,
    );

    etapa = "gravando-pagina-tabela-principal";
    const gravados = await upsertRest(
      supabaseUrl,
      chave,
      config.tabela,
      registros,
      "monday_item_id",
      LOTE_TABELA_PRINCIPAL,
    );

    let valores = 0;
    if (sincronizacaoCompleta) {
      etapa = "gravando-valores-genericos-pagina";
      valores = await gravarValores(
        supabaseUrl,
        chave,
        config.boardId,
        pagina.items,
        board.columns,
        cicloSincronizadoEm,
      );
    }

    const novasPaginas = paginasAcumuladas + 1;
    const novosItens = itensAcumulados + itensPagina;
    let registrosAntigosRemovidos = 0;

    if (cicloConcluido) {
      etapa = "limpando-registros-antigos-fim-ciclo";
      registrosAntigosRemovidos = await limparRegistrosAntigos(
        supabaseUrl,
        chave,
        config.tabela,
        config.boardId,
        cicloSincronizadoEm,
      );
    }

    etapa = "salvando-estado-paginacao";
    await salvarEstadoSync(supabaseUrl, chave, {
      board_id: config.boardId,
      board_name: board.name,
      tabela_destino: config.tabela,
      cursor: cicloConcluido ? null : proximoCursor,
      ciclo_sincronizado_em: cicloConcluido ? null : cicloSincronizadoEm,
      paginas_processadas: cicloConcluido ? 0 : novasPaginas,
      itens_processados: cicloConcluido ? 0 : novosItens,
      em_ciclo: !cicloConcluido,
      ultimo_ciclo_concluido_em: cicloConcluido
        ? new Date().toISOString()
        : (estadoAnterior?.ultimo_ciclo_concluido_em ?? null),
      atualizado_em: new Date().toISOString(),
    });

    const duracao = Math.round(((Date.now() - inicio) / 1000) * 100) / 100;

    etapa = "gravando-log-sucesso";
    await inserirLogSeguro(supabaseUrl, chave, {
      function_name: "sync-monday",
      monday_board_id: config.boardId,
      status: "sucesso",
      itens_lidos: itensPagina,
      registros_gravados: gravados,
      paginas_lidas: 1,
      duracao_segundos: duracao,
      mensagem: cicloConcluido
        ? `${config.nome}: ciclo concluído na página ${paginaNumero}.`
        : `${config.nome}: página ${paginaNumero} sincronizada; ciclo continua.`,
      detalhes: {
        versao: VERSAO,
        acao,
        board_name: board.name,
        tabela_destino: config.tabela,
        pagina_processada: paginaNumero,
        itens_pagina: itensPagina,
        paginas_processadas_ciclo: novasPaginas,
        itens_processados_ciclo: novosItens,
        ciclo_concluido: cicloConcluido,
        proxima_pagina_pendente: !cicloConcluido,
        catalogo_gravado: catalogo,
        valores_colunas_gravados: valores,
        registros_antigos_removidos: registrosAntigosRemovidos,
      },
    });

    return {
      sucesso: true,
      board_id: config.boardId,
      board: board.name,
      tabela: config.tabela,
      pagina_processada: paginaNumero,
      itens_pagina: itensPagina,
      registros_gravados: gravados,
      paginas_processadas_ciclo: novasPaginas,
      itens_processados_ciclo: novosItens,
      ciclo_concluido: cicloConcluido,
      proxima_pagina_pendente: !cicloConcluido,
      registros_antigos_removidos: registrosAntigosRemovidos,
      duracao_segundos: duracao,
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    const duracao = Math.round(((Date.now() - inicio) / 1000) * 100) / 100;

    console.error(`[${config.nome}] ERRO`, { etapa, mensagem });

    await inserirLogSeguro(supabaseUrl, chave, {
      function_name: "sync-monday",
      monday_board_id: config.boardId,
      status: "erro",
      itens_lidos: itensPagina,
      registros_gravados: 0,
      paginas_lidas: 0,
      duracao_segundos: duracao,
      mensagem,
      detalhes: {
        versao: VERSAO,
        acao,
        etapa,
        pagina_processada: paginaNumero,
        tabela_destino: config.tabela,
        erro: mensagem,
      },
    });

    return {
      sucesso: false,
      board_id: config.boardId,
      board: config.nome,
      tabela: config.tabela,
      etapa,
      pagina_processada: paginaNumero,
      erro: mensagem,
      duracao_segundos: duracao,
    };
  }
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

  let acao = "sincronizar-validacao";

  try {
    etapa = "lendo-corpo";
    const body = await req.json().catch(() => ({}));
    acao = String(body?.acao ?? "sincronizar-validacao").trim() || "sincronizar-validacao";

    etapa = "validando-configuracao";
    if (!mondayToken) throw new Error("MONDAY_API_TOKEN não encontrado.");
    if (!supabaseUrl) throw new Error("SUPABASE_URL não encontrado.");
    if (!chave) throw new Error("Chave administrativa do Supabase não encontrada.");

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
      etapa = "testando-boards-monday";
      const boards = await testarBoardsMonday(mondayToken);
      return respostaJson({
        sucesso: true,
        mensagem: "Acesso aos boards do Monday confirmado.",
        versao: VERSAO,
        boards,
      });
    }

    // V25.28:
    // Cada chamada processa somente uma página do board, com cursor persistido no Supabase.
    // Isso evita timeout mesmo quando o board tem milhares de itens e muitas colunas.
    const acoesValidas = new Set([
      "sincronizar-validacao",
      "sincronizar-esteira",
      "sincronizar-validacao-completo",
      "sincronizar-esteira-completo",
      // Compatibilidade com o cron anterior:
      "sincronizar-principal",
      "sincronizar-completo",
    ]);

    if (!acoesValidas.has(acao)) {
      throw new Error(
        `Ação inválida: ${acao}. Use teste-token, teste-board, ` +
        `sincronizar-validacao, sincronizar-esteira, ` +
        `sincronizar-validacao-completo ou sincronizar-esteira-completo.`,
      );
    }

    etapa = "testando-supabase";
    await testarSupabase(supabaseUrl, chave);
    console.log("Supabase OK.");

    let configSelecionada: BoardConfig;
    let sincronizacaoCompleta = false;

    if (
      acao === "sincronizar-esteira" ||
      acao === "sincronizar-esteira-completo"
    ) {
      configSelecionada = BOARDS.find((b) => b.tipo === "esteira")!;
      sincronizacaoCompleta = acao === "sincronizar-esteira-completo";
    } else {
      // "sincronizar-principal" continua funcionando como alias da Validação.
      // "sincronizar-completo" continua como alias da Validação completa.
      configSelecionada = BOARDS.find((b) => b.tipo === "validacao")!;
      sincronizacaoCompleta =
        acao === "sincronizar-validacao-completo" ||
        acao === "sincronizar-completo";
    }

    etapa = `sincronizando-${configSelecionada.tipo}`;

    const resultado = await sincronizarBoard(
      configSelecionada,
      mondayToken,
      supabaseUrl,
      chave,
      sincronizacaoCompleta,
      acao,
    );

    const duracao = Math.round(((Date.now() - inicio) / 1000) * 100) / 100;

    etapa = "concluido";

    // IMPORTANTE: sincronizarBoard já captura o erro do board e o devolve no JSON.
    // Mantemos HTTP 200 para o testador do Supabase não mascarar a mensagem real
    // com "Cannot read properties of undefined (reading 'error')".
    return respostaJson({
      sucesso: resultado.sucesso === true,
      versao: VERSAO,
      acao,
      mensagem: resultado.sucesso === true
        ? `${configSelecionada.nome} sincronizada com sucesso.`
        : `${configSelecionada.nome} apresentou erro. Consulte resultado.`,
      resumo: {
        board: configSelecionada.nome,
        tipo: configSelecionada.tipo,
        duracao_segundos: duracao,
      },
      resultado,
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
