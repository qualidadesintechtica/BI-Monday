import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MONDAY_API_TOKEN = Deno.env.get("MONDAY_API_TOKEN")!;

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

const MONDAY_API_URL = "https://api.monday.com/v2";
const BOARD_ID = 18414801798;

const COLUNAS = {
  titulo: "lookup_mm5yd4cv",
  data: "date_mm3qr196",
  avaliador: "multiple_person_mm5xs4bg",
  categoria: "single_select8eeu4hu",
  matriz: "single_select50jusfr",
  conceitoFinal: "color_mm3qg1kp",
  relacaoValidacao: "board_relation_mm5x74nk",

  i1: "single_selectn9gbu6w",
  i2: "single_select0aexe7l",
  i3: "single_select5h53sel",
  i4: "single_selectmpl6ehf",
  i5: "single_selectc06x0ye",
  i6: "single_selectjo6s990",
  i7: "single_selectrwp4af6",
};

function score(valor: string | null) {
  if (!valor) return null;

  if (valor === "Excelente") return 1.0;
  if (valor === "Ótimo") return 0.8;
  if (valor === "Suficiente") return 0.5;

  return null;
}

function calcularMedia(valores: Array<string | null>) {
  const notas = valores
    .map(score)
    .filter((v): v is number => v !== null);

  if (notas.length === 0) return null;

  const soma = notas.reduce((acc, valor) => acc + valor, 0);

  return Number((soma / notas.length).toFixed(4));
}

function getColumnText(item: any, columnId: string) {
  const coluna = item.column_values?.find(
    (c: any) => c.id === columnId
  );

  return coluna?.text ?? null;
}

function getColumnValue(item: any, columnId: string) {
  const coluna = item.column_values?.find(
    (c: any) => c.id === columnId
  );

  return coluna?.value ?? null;
}

function extrairItemRelacionamento(value: string | null) {
  if (!value) return null;

  try {
    const obj = JSON.parse(value);

    const ids =
      obj?.linkedPulseIds ??
      obj?.linked_pulse_ids ??
      [];

    if (!Array.isArray(ids) || ids.length === 0) {
      return null;
    }

    const primeiro = ids[0];

    if (typeof primeiro === "number") {
      return primeiro;
    }

    if (typeof primeiro === "string") {
      return Number(primeiro) || null;
    }

    if (primeiro?.linkedPulseId) {
      return Number(primeiro.linkedPulseId) || null;
    }

    return null;
  } catch {
    return null;
  }
}

function parseDataHora(value: string | null) {
  if (!value) {
    return {
      data: null,
      dataHora: null,
    };
  }

  try {
    const obj = JSON.parse(value);

    const data = obj?.date ?? null;
    const time = obj?.time ?? null;

    let dataHora = null;

    if (data && time) {
      dataHora = `${data}T${time}Z`;
    } else if (data) {
      dataHora = `${data}T00:00:00Z`;
    }

    return {
      data,
      dataHora,
    };
  } catch {
    return {
      data: null,
      dataHora: null,
    };
  }
}

async function mondayRequest(query: string) {
  const response = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      Authorization: MONDAY_API_TOKEN,
      "Content-Type": "application/json",
      "API-Version": "2025-10",
    },
    body: JSON.stringify({ query }),
  });

  const json = await response.json();

  if (!response.ok || json.errors) {
    console.error("Erro Monday:", JSON.stringify(json));
    throw new Error(
      JSON.stringify(json.errors ?? json)
    );
  }

  return json.data;
}

async function buscarTodosItens() {
  const itens: any[] = [];

  let cursor: string | null = null;

  do {
    const cursorParte = cursor
      ? `cursor: "${cursor}"`
      : "";

    const query = `
      query {
        boards(ids: [${BOARD_ID}]) {
          items_page(
            limit: 500
            ${cursor ? `, ${cursorParte}` : ""}
          ) {
            cursor
            items {
              id
              name
              column_values(ids: [
                "${COLUNAS.titulo}",
                "${COLUNAS.data}",
                "${COLUNAS.avaliador}",
                "${COLUNAS.categoria}",
                "${COLUNAS.matriz}",
                "${COLUNAS.conceitoFinal}",
                "${COLUNAS.relacaoValidacao}",
                "${COLUNAS.i1}",
                "${COLUNAS.i2}",
                "${COLUNAS.i3}",
                "${COLUNAS.i4}",
                "${COLUNAS.i5}",
                "${COLUNAS.i6}",
                "${COLUNAS.i7}"
              ]) {
                id
                text
                value
              }
            }
          }
        }
      }
    `;

    const data = await mondayRequest(query);

    const pagina = data?.boards?.[0]?.items_page;

    if (!pagina) {
      break;
    }

    itens.push(...(pagina.items ?? []));

    cursor = pagina.cursor ?? null;
  } while (cursor);

  return itens;
}

// V22: registra o resultado da execução (sucesso ou falha) na tabela
// sync_log, para alimentar o painel "Histórico de sincronizações" do BI.
async function registrarLog(entrada: {
  itens_lidos: number | null;
  itens_gravados: number | null;
  erros: number | null;
  sucesso: boolean;
  mensagem_erro?: string | null;
}) {
  try {
    await supabase.from("sync_log").insert({
      function_name: "sync-criterios-avaliacao-uas",
      board_id: BOARD_ID,
      itens_lidos: entrada.itens_lidos,
      itens_gravados: entrada.itens_gravados,
      erros: entrada.erros,
      sucesso: entrada.sucesso,
      mensagem_erro: entrada.mensagem_erro ?? null,
    });
  } catch (logError) {
    // Nunca deixa uma falha ao gravar o log derrubar a resposta da
    // sincronização em si.
    console.error("Erro ao gravar sync_log:", logError);
  }
}

Deno.serve(async () => {
  try {
    if (!MONDAY_API_TOKEN) {
      throw new Error(
        "MONDAY_API_TOKEN não configurado."
      );
    }

    const itens = await buscarTodosItens();

    let gravados = 0;
    let erros = 0;

    const lotes = [];

    for (const item of itens) {
      const indicador1 = getColumnText(item, COLUNAS.i1);
      const indicador2 = getColumnText(item, COLUNAS.i2);
      const indicador3 = getColumnText(item, COLUNAS.i3);
      const indicador4 = getColumnText(item, COLUNAS.i4);
      const indicador5 = getColumnText(item, COLUNAS.i5);
      const indicador6 = getColumnText(item, COLUNAS.i6);
      const indicador7 = getColumnText(item, COLUNAS.i7);

      const dataInfo = parseDataHora(
        getColumnValue(item, COLUNAS.data)
      );

      const relacaoId = extrairItemRelacionamento(
        getColumnValue(
          item,
          COLUNAS.relacaoValidacao
        )
      );

      const registro = {
        monday_item_id: Number(item.id),
        monday_board_id: BOARD_ID,

        nome_item: item.name ?? null,

        data_avaliacao: dataInfo.data,
        data_avaliacao_hora: dataInfo.dataHora,

        avaliador:
          getColumnText(
            item,
            COLUNAS.avaliador
          ),

        categoria_material:
          getColumnText(
            item,
            COLUNAS.categoria
          ),

        matriz_oferta:
          getColumnText(
            item,
            COLUNAS.matriz
          ),

        conceito_final:
          getColumnText(
            item,
            COLUNAS.conceitoFinal
          ),

        validacao_material_item_id:
          relacaoId,

        indicador_1: indicador1,
        indicador_2: indicador2,
        indicador_3: indicador3,
        indicador_4: indicador4,
        indicador_5: indicador5,
        indicador_6: indicador6,
        indicador_7: indicador7,

        indicador_1_score:
          score(indicador1),

        indicador_2_score:
          score(indicador2),

        indicador_3_score:
          score(indicador3),

        indicador_4_score:
          score(indicador4),

        indicador_5_score:
          score(indicador5),

        indicador_6_score:
          score(indicador6),

        indicador_7_score:
          score(indicador7),

        media_indicadores:
          calcularMedia([
            indicador1,
            indicador2,
            indicador3,
            indicador4,
            indicador5,
            indicador6,
            indicador7,
          ]),

        updated_at:
          new Date().toISOString(),

        synced_at:
          new Date().toISOString(),
      };

      lotes.push(registro);
    }

    const TAMANHO_LOTE = 500;

    for (
      let i = 0;
      i < lotes.length;
      i += TAMANHO_LOTE
    ) {
      const lote = lotes.slice(
        i,
        i + TAMANHO_LOTE
      );

      const { error } = await supabase
        .from(
          "monday_criterios_avaliacao_uas"
        )
        .upsert(
          lote,
          {
            onConflict: "monday_item_id",
          }
        );

      if (error) {
        console.error(
          "Erro Supabase:",
          error
        );

        erros += lote.length;
      } else {
        gravados += lote.length;
      }
    }

    await registrarLog({
      itens_lidos: itens.length,
      itens_gravados: gravados,
      erros,
      sucesso: erros === 0,
    });

    return new Response(
      JSON.stringify(
        {
          success: true,
          board_id: BOARD_ID,
          itens_lidos: itens.length,
          itens_gravados: gravados,
          erros,
          sincronizado_em:
            new Date().toISOString(),
        },
        null,
        2
      ),
      {
        status: 200,
        headers: {
          "Content-Type":
            "application/json",
        },
      }
    );
  } catch (error) {
    console.error(error);

    const mensagem =
      error instanceof Error
        ? error.message
        : String(error);

    await registrarLog({
      itens_lidos: null,
      itens_gravados: null,
      erros: null,
      sucesso: false,
      mensagem_erro: mensagem,
    });

    return new Response(
      JSON.stringify(
        {
          success: false,
          error: mensagem,
        },
        null,
        2
      ),
      {
        status: 500,
        headers: {
          "Content-Type":
            "application/json",
        },
      }
    );
  }
});
