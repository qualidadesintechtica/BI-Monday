import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

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

function cpfDigits(v: unknown): string | null {
  const s = String(v ?? "").replace(/\D/g, "");
  return s || null;
}

function isoDate(v: unknown): string | null {
  if (!v) return null;

  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }

  if (typeof v === "number") {
    const o = XLSX.SSF.parse_date_code(v);
    if (o) {
      const mm = String(o.m).padStart(2, "0");
      const dd = String(o.d).padStart(2, "0");
      return `${o.y}-${mm}-${dd}`;
    }
  }

  const s = String(v).trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

function numberValue(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function splitFormacoes(v: unknown): string[] {
  const s = txt(v);
  if (!s) return [];
  const itens = s
    .split(/\s*\|\s*|\r?\n/)
    .map(x => x.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return [...new Map(itens.map(x => [x.toLocaleLowerCase("pt-BR"), x])).values()];
}

const COL = {
  area: "MARCA | ÁREA CONTRATANTE",
  origem: "MARCA ORIGEM",
  professor: "PROFESSOR INDICADO PARA CONTRATAÇÃO",
  cpf: "CPF",
  telefone: "TELEFONE",
  lattes: "LATTES",
  formacao: "FORMAÇÃO",
  titulacao: "TITULAÇÃO MÁXIMA",
  pit: "PIT",
  semestre: "SEMESTRE_ENTRADA NQ",
  situacao: "SITUAÇÃO CONTRATAÇÃO",
  dataIndicacao: "DATA INDICAÇÃO APP",
  regime: "REGIME CONTRATAÇÃO",
  ch: "CH",
  statusDocs: "STATUS DOCUMENTOS",
  dataAditivo: "DATA EMISSÃO ADITIVO",
  statusAditivo: "STATUS ADITIVO",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ success: false, error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await authClient.auth.getUser();
  const user = userData?.user;

  if (userError || !user) {
    return json({ success: false, error: "Usuário não autenticado." }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  let importacaoId: number | null = null;

  try {
    const form = await req.formData();
    const file = form.get("file");
    const sheetName = txt(form.get("sheet")) || "Export";

    if (!(file instanceof File)) {
      return json({ success: false, error: "Arquivo Excel não recebido." }, 400);
    }

    const ext = file.name.toLowerCase();
    if (!ext.endsWith(".xlsx") && !ext.endsWith(".xls")) {
      return json({ success: false, error: "Envie um arquivo .xlsx ou .xls." }, 400);
    }

    const { data: importacao, error: logError } = await admin
      .from("nq_importacoes")
      .insert({
        arquivo_nome: file.name,
        arquivo_tamanho: file.size,
        aba: sheetName,
        status: "processando",
        importado_por: user.id,
      })
      .select("id")
      .single();

    if (logError) throw logError;
    importacaoId = importacao.id;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const wb = XLSX.read(bytes, {
      type: "array",
      cellDates: true,
      cellText: false,
    });

    const ws = wb.Sheets[sheetName];
    if (!ws) {
      throw new Error(`A aba "${sheetName}" não foi encontrada. Abas disponíveis: ${wb.SheetNames.join(", ")}.`);
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: null,
      raw: true,
    });

    if (!rows.length) throw new Error(`A aba "${sheetName}" está vazia.`);

    const headers = new Set(Object.keys(rows[0] || {}));
    const obrigatorias = [COL.professor, COL.formacao];
    const ausentes = obrigatorias.filter(h => !headers.has(h));
    if (ausentes.length) {
      throw new Error(`Coluna(s) obrigatória(s) ausente(s): ${ausentes.join(", ")}.`);
    }

    const validos: Array<{
      row: number;
      professor: string;
      cpf_normalizado: string | null;
      payload: Record<string, unknown>;
      formacoes: string[];
    }> = [];

    const erros: string[] = [];

    rows.forEach((r, i) => {
      const professor = txt(r[COL.professor]);
      if (!professor) {
        if (Object.values(r).some(v => txt(v))) erros.push(`Linha ${i + 2}: professor não informado.`);
        return;
      }

      validos.push({
        row: i + 2,
        professor,
        cpf_normalizado: cpfDigits(r[COL.cpf]),
        formacoes: splitFormacoes(r[COL.formacao]),
        payload: {
          professor,
          cpf: txt(r[COL.cpf]),
          cpf_normalizado: cpfDigits(r[COL.cpf]),
          telefone: txt(r[COL.telefone]),
          lattes: txt(r[COL.lattes]),
          marca_area_contratante: txt(r[COL.area]),
          marca_origem: txt(r[COL.origem]),
          titulacao_maxima: txt(r[COL.titulacao]),
          pit: txt(r[COL.pit]),
          semestre_entrada_nq: txt(r[COL.semestre]),
          situacao_contratacao: txt(r[COL.situacao]),
          data_indicacao_app: isoDate(r[COL.dataIndicacao]),
          regime_contratacao: txt(r[COL.regime]),
          carga_horaria: numberValue(r[COL.ch]),
          status_documentos: txt(r[COL.statusDocs]),
          data_emissao_aditivo: isoDate(r[COL.dataAditivo]),
          status_aditivo: txt(r[COL.statusAditivo]),
          ativo: true,
          updated_at: new Date().toISOString(),
        },
      });
    });

    if (!validos.length) throw new Error("Nenhum especialista válido foi encontrado.");

    const { data: existentes, error: existingError } = await admin
      .from("nq_especialistas")
      .select("id,professor,cpf_normalizado");

    if (existingError) throw existingError;

    const porCpf = new Map((existentes || []).filter(x => x.cpf_normalizado).map(x => [x.cpf_normalizado, x]));
    const porNome = new Map((existentes || []).map(x => [String(x.professor).toLocaleLowerCase("pt-BR"), x]));

    let novos = 0;
    let atualizados = 0;
    let formacoesGravadas = 0;
    const idsAtivos: number[] = [];

    for (const item of validos) {
      const atual = (item.cpf_normalizado && porCpf.get(item.cpf_normalizado))
        || porNome.get(item.professor.toLocaleLowerCase("pt-BR"))
        || null;

      let especialistaId: number;

      if (atual) {
        const { data, error } = await admin
          .from("nq_especialistas")
          .update(item.payload)
          .eq("id", atual.id)
          .select("id")
          .single();

        if (error) throw new Error(`Linha ${item.row}: ${error.message}`);
        especialistaId = data.id;
        atualizados++;
      } else {
        const { data, error } = await admin
          .from("nq_especialistas")
          .insert(item.payload)
          .select("id")
          .single();

        if (error) throw new Error(`Linha ${item.row}: ${error.message}`);
        especialistaId = data.id;
        novos++;
      }

      idsAtivos.push(especialistaId);

      const { error: delError } = await admin
        .from("nq_especialistas_formacoes")
        .delete()
        .eq("especialista_id", especialistaId);

      if (delError) throw delError;

      if (item.formacoes.length) {
        const payloadFormacoes = item.formacoes.map(formacao => ({
          especialista_id: especialistaId,
          formacao,
          updated_at: new Date().toISOString(),
        }));

        const { error: formError } = await admin
          .from("nq_especialistas_formacoes")
          .insert(payloadFormacoes);

        if (formError) throw new Error(`Formações de ${item.professor}: ${formError.message}`);
        formacoesGravadas += payloadFormacoes.length;
      }
    }

    // Registros que estavam na base anterior, mas não vieram na planilha atual,
    // ficam inativos. Nada é apagado.
    const todosIds = (existentes || []).map(x => Number(x.id));
    const ativosSet = new Set(idsAtivos);
    const idsInativar = todosIds.filter(id => !ativosSet.has(id));

    if (idsInativar.length) {
      const { error: inactiveError } = await admin
        .from("nq_especialistas")
        .update({ ativo: false, updated_at: new Date().toISOString() })
        .in("id", idsInativar);

      if (inactiveError) throw inactiveError;
    }

    const linhasComErro = erros.length;
    const mensagem = linhasComErro
      ? `Importação concluída com ${linhasComErro} linha(s) ignorada(s).`
      : "Importação concluída com sucesso.";

    const result = {
      success: true,
      importacao_id: importacaoId,
      arquivo: file.name,
      aba: sheetName,
      total_linhas: rows.length,
      especialistas_gravados: validos.length,
      especialistas_novos: novos,
      especialistas_atualizados: atualizados,
      especialistas_inativados: idsInativar.length,
      formacoes_gravadas: formacoesGravadas,
      linhas_com_erro: linhasComErro,
      erros: erros.slice(0, 30),
      mensagem,
      finalizado_em: new Date().toISOString(),
    };

    await admin
      .from("nq_importacoes")
      .update({
        status: "concluida",
        total_linhas: rows.length,
        especialistas_gravados: validos.length,
        especialistas_novos: novos,
        especialistas_atualizados: atualizados,
        especialistas_inativados: idsInativar.length,
        formacoes_gravadas: formacoesGravadas,
        linhas_com_erro: linhasComErro,
        mensagem,
        finished_at: result.finalizado_em,
      })
      .eq("id", importacaoId);

    return json(result);
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);

    if (importacaoId) {
      await admin
        .from("nq_importacoes")
        .update({
          status: "erro",
          mensagem,
          finished_at: new Date().toISOString(),
        })
        .eq("id", importacaoId);
    }

    console.error("import-nq-especialistas:", e);
    return json({ success: false, error: mensagem }, 400);
  }
});
