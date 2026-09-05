import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";

type LinhaExcel = {
  numero_linha?: number | null;
  id?: string | number | null;
  tipo?: string | null;
  projeto?: string | null;
  acao?: string | null;
  status?: string | null;
  data_inicio?: string | number | null;
  data_fim?: string | number | null;
  sponsor?: string | null;
  esforco?: string | null;
  prioridade?: string | null;
  evidencia?: string | null;
};

type Payload = {
  arquivo?: string;
  origem_url?: string;
  aba?: string;
  arquivo_hash?: string;
  linhas?: LinhaExcel[];
};

type UsuarioAutenticado = {
  id: string;
  email: string;
};

const LIMITE_LINHAS = 5000;
const TAMANHO_LOTE = 200;
const ORIGEM_PADRAO = "https://qualidadesintechtica.github.io";

function texto(valor: unknown): string {
  return String(valor ?? "").trim();
}

function normalizarTipo(valor: unknown): string {
  const v = texto(valor).toLowerCase();

  if (v === "projeto" || v === "project") return "Projeto";
  if (v === "tarefa" || v === "task") return "Tarefa";
  if (v === "action plan" || v === "plano de ação" || v === "plano de acao") {
    return "Action Plan";
  }

  return "Outro";
}

function normalizarStatus(valor: unknown): string | null {
  const v = texto(valor).toLowerCase();

  const mapa: Record<string, string> = {
    "não iniciado": "Não Iniciado",
    "nao iniciado": "Não Iniciado",
    new: "Não Iniciado",
    "a fazer": "A Fazer",
    iniciado: "Em Progresso",
    "em progresso": "Em Progresso",
    active: "Em Progresso",
    pausado: "Pausado",
    finalizado: "Finalizado",
    encerrado: "Finalizado",
    concluído: "Finalizado",
    concluido: "Finalizado",
    done: "Finalizado",
    closed: "Finalizado",
    cancelado: "Cancelado",
    removed: "Cancelado",
  };

  return mapa[v] ?? null;
}

function normalizarEsforco(valor: unknown): string | null {
  const v = texto(valor).toLowerCase();

  if (v === "baixo") return "Baixo";
  if (v === "médio" || v === "medio") return "Médio";
  if (v === "alto") return "Alto";

  return null;
}

function normalizarPrioridade(valor: unknown): string | null {
  const v = texto(valor).toLowerCase();

  if (v === "baixa") return "Baixa";
  if (v === "média" || v === "media") return "Média";
  if (v === "alta") return "Alta";
  if (v === "urgente") return "Urgente";

  return null;
}

function converterData(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === "") {
    return null;
  }

  const numero =
    typeof valor === "number"
      ? valor
      : typeof valor === "string" && /^\d+(?:[.,]\d+)?$/.test(valor.trim())
        ? Number(valor.trim().replace(",", "."))
        : null;

  if (numero !== null) {
    if (!Number.isFinite(numero) || numero <= 0 || numero > 2958465) {
      return null;
    }

    const origemExcel = Date.UTC(1899, 11, 30);
    const data = new Date(origemExcel + numero * 86400000);

    return Number.isNaN(data.getTime())
      ? null
      : data.toISOString().slice(0, 10);
  }

  const v = texto(valor);

  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s|$)/);
  if (iso) return dataValida(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s|$)/);
  if (br) return dataValida(Number(br[3]), Number(br[2]), Number(br[1]));

  const data = new Date(v);

  return Number.isNaN(data.getTime()) ? null : data.toISOString().slice(0, 10);
}

function dataValida(ano: number, mes: number, dia: number): string | null {
  const data = new Date(Date.UTC(ano, mes - 1, dia));

  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return null;
  }

  return data.toISOString().slice(0, 10);
}

function lotes<T>(itens: T[], tamanho = TAMANHO_LOTE): T[][] {
  const resultado: T[][] = [];

  for (let i = 0; i < itens.length; i += tamanho) {
    resultado.push(itens.slice(i, i + tamanho));
  }

  return resultado;
}

function mensagemErro(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  if (typeof erro === "object" && erro && "message" in erro) {
    return String((erro as { message: unknown }).message);
  }
  return String(erro);
}

function origensPermitidas(): string[] {
  const configuradas = Deno.env.get("PQ_ALLOWED_ORIGINS") || ORIGEM_PADRAO;
  return configuradas
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function origemPermitida(req: Request): boolean {
  const origem = req.headers.get("origin");
  if (!origem) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem)) return true;
  return origensPermitidas().includes(origem);
}

function cabecalhosCors(req: Request): HeadersInit {
  const origem = req.headers.get("origin");
  const origemResposta =
    origem && origemPermitida(req) ? origem : ORIGEM_PADRAO;

  return {
    "Access-Control-Allow-Origin": origemResposta,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function responderJson(
  req: Request,
  corpo: Record<string, unknown>,
  status = 200,
): Response {
  return Response.json(corpo, {
    status,
    headers: cabecalhosCors(req),
  });
}

async function autenticarUsuario(
  req: Request,
): Promise<UsuarioAutenticado | null> {
  const autorizacao = req.headers.get("authorization") || "";
  const token = autorizacao.match(/^Bearer\s+(.+)$/i)?.[1];
  const authUrl = Deno.env.get("BI_AUTH_SUPABASE_URL");
  const authKey = Deno.env.get("BI_AUTH_SUPABASE_PUBLISHABLE_KEY");

  if (!token || !authUrl || !authKey) return null;

  const resposta = await fetch(`${authUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: authKey,
    },
  });

  if (!resposta.ok) return null;

  const usuario = await resposta.json();
  const email = texto(usuario?.email).toLowerCase();
  const id = texto(usuario?.id);
  const dominios = (
    Deno.env.get("PQ_ALLOWED_DOMAINS") || "animaeducacao.com.br"
  )
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const emailsPermitidos = (Deno.env.get("PQ_ALLOWED_EMAILS") || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const dominio = email.split("@").pop() || "";

  if (!id || !email || !dominios.includes(dominio)) return null;
  if (emailsPermitidos.length && !emailsPermitidos.includes(email)) return null;
  return { id, email };
}

export default {
  fetch: withSupabase(
    { auth: "none" },

    async (req, ctx) => {
      if (!origemPermitida(req)) {
        return responderJson(
          req,
          { success: false, error: "Origem não autorizada." },
          403,
        );
      }

      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: cabecalhosCors(req),
        });
      }

      if (req.method !== "POST") {
        return responderJson(
          req,
          { success: false, error: "Use o método POST." },
          405,
        );
      }

      let usuario: UsuarioAutenticado | null = null;

      try {
        usuario = await autenticarUsuario(req);
      } catch {
        usuario = null;
      }

      if (!usuario) {
        return responderJson(
          req,
          { success: false, error: "Sessão inválida ou sem permissão." },
          401,
        );
      }

      let payload: Payload;

      try {
        payload = await req.json();
      } catch {
        return responderJson(
          req,
          { success: false, error: "O corpo enviado não é um JSON válido." },
          400,
        );
      }

      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return responderJson(
          req,
          { success: false, error: "O corpo precisa ser um objeto JSON." },
          400,
        );
      }

      const linhas = Array.isArray(payload.linhas) ? payload.linhas : [];

      if (linhas.length === 0) {
        return responderJson(
          req,
          { success: false, error: "Nenhuma linha foi recebida." },
          400,
        );
      }

      if (linhas.length > LIMITE_LINHAS) {
        return responderJson(
          req,
          {
            success: false,
            error: `O limite é de ${LIMITE_LINHAS.toLocaleString("pt-BR")} linhas por envio.`,
          },
          400,
        );
      }

      const banco = ctx.supabaseAdmin;
      const arquivoHash = texto(payload.arquivo_hash).toLowerCase();

      if (!/^[a-f0-9]{64}$/.test(arquivoHash)) {
        return responderJson(
          req,
          {
            success: false,
            error: "A identificação segura do arquivo é inválida.",
          },
          400,
        );
      }

      const { data: importacaoAnterior, error: erroDuplicidade } = await banco
        .from("pq_importacoes")
        .select("id,finalizado_em")
        .eq("arquivo_hash", arquivoHash)
        .eq("status", "concluida")
        .limit(1)
        .maybeSingle();

      if (erroDuplicidade) {
        return responderJson(
          req,
          {
            success: false,
            error: "Não foi possível verificar se o arquivo já foi importado.",
            detalhe: erroDuplicidade.message,
          },
          500,
        );
      }

      if (importacaoAnterior) {
        return responderJson(
          req,
          {
            success: false,
            error: "Esta mesma planilha já foi importada.",
            importacao_id: importacaoAnterior.id,
            importado_em: importacaoAnterior.finalizado_em,
          },
          409,
        );
      }

      const { data: importacao, error: erroImportacao } = await banco
        .from("pq_importacoes")
        .insert({
          nome_arquivo: payload.arquivo || "PROJETOS_QUALIDADE.xlsx",
          origem_url: payload.origem_url || null,
          arquivo_hash: arquivoHash,
          usuario_email: usuario.email,
          status: "processando",
          total_linhas: linhas.length,
        })
        .select("id")
        .single();

      if (erroImportacao || !importacao) {
        return responderJson(
          req,
          {
            success: false,
            error: "Não foi possível iniciar a importação.",
            detalhe: erroImportacao?.message,
          },
          500,
        );
      }

      const importacaoId = importacao.id;
      const aba = payload.aba || "Work item e filhos (1)";

      try {
        const frequenciasIds = new Map<string, number>();

        for (const linha of linhas) {
          if (!linha || typeof linha !== "object" || Array.isArray(linha))
            continue;
          const id = texto(linha.id);
          if (id) frequenciasIds.set(id, (frequenciasIds.get(id) ?? 0) + 1);
        }

        const linhasPreparadas = linhas.map((linhaRecebida, indice) => {
          const formatoValido = Boolean(
            linhaRecebida &&
            typeof linhaRecebida === "object" &&
            !Array.isArray(linhaRecebida),
          );
          const linha: LinhaExcel = formatoValido ? linhaRecebida : {};
          const id = texto(linha.id);
          const tipo = normalizarTipo(linha.tipo);
          const projeto = texto(linha.projeto);
          const statusOriginal = texto(linha.status);
          const status = normalizarStatus(linha.status);
          const dataInicio = converterData(linha.data_inicio);
          const dataFim = converterData(linha.data_fim);
          const numeroLinhaRecebido = Number(linha.numero_linha);
          const numeroLinha =
            Number.isInteger(numeroLinhaRecebido) && numeroLinhaRecebido > 0
              ? numeroLinhaRecebido
              : indice + 2;

          const erros: string[] = [];

          if (!formatoValido) erros.push("Linha não é um objeto JSON");
          if (!id) erros.push("ID não informado");
          if (id && (frequenciasIds.get(id) ?? 0) > 1)
            erros.push("ID duplicado");
          if (!projeto) erros.push("Projeto não informado");
          if (tipo === "Outro") erros.push("Tipo não reconhecido");

          if (statusOriginal && !status) {
            erros.push("Status não reconhecido");
          }

          if (texto(linha.data_inicio) && !dataInicio) {
            erros.push("Data inicial inválida");
          }

          if (texto(linha.data_fim) && !dataFim) {
            erros.push("Data final inválida");
          }

          if (dataInicio && dataFim && dataFim < dataInicio) {
            erros.push("Data final anterior à data inicial");
          }

          return {
            numero_linha: numeroLinha,
            original: linha,
            id,
            tipo,
            projeto,
            acao: texto(linha.acao),
            status,
            data_inicio: dataInicio,
            data_fim: dataFim,
            sponsor: texto(linha.sponsor) || null,
            esforco: normalizarEsforco(linha.esforco),
            prioridade: normalizarPrioridade(linha.prioridade),
            evidencia: texto(linha.evidencia) || null,
            erro: erros.length ? erros.join("; ") : null,
          };
        });

        const registrosBrutos = linhasPreparadas.map((linha) => ({
          importacao_id: importacaoId,
          numero_linha: linha.numero_linha,
          nome_aba: aba,
          azure_id_original: linha.id || null,
          tipo_original: texto(linha.original.tipo) || null,
          projeto_original: linha.projeto || null,
          acao_original: linha.acao || null,
          status_original: texto(linha.original.status) || null,
          dados_originais: linha.original,
          processado: !linha.erro,
          erro_validacao: linha.erro,
        }));

        for (const bloco of lotes(registrosBrutos)) {
          const { error } = await banco
            .from("pq_importacao_linhas")
            .insert(bloco);

          if (error) throw error;
        }

        const validas = linhasPreparadas.filter((linha) => !linha.erro);

        const projetosMap = new Map(
          validas
            .filter((linha) => linha.tipo === "Projeto")
            .map((linha) => [linha.id, linha]),
        );

        const tarefasMap = new Map(
          validas
            .filter(
              (linha) =>
                linha.tipo === "Tarefa" || linha.tipo === "Action Plan",
            )
            .map((linha) => [linha.id, linha]),
        );

        const projetos = [...projetosMap.values()];
        const tarefas = [...tarefasMap.values()];

        const idsProjetos = projetos.map((linha) => linha.id);
        const idsTarefas = tarefas.map((linha) => linha.id);

        let projetosExistentes = new Set<string>();
        let tarefasExistentes = new Set<string>();

        if (idsProjetos.length) {
          for (const bloco of lotes(idsProjetos)) {
            const { data, error } = await banco
              .from("pq_projetos")
              .select("azure_id")
              .in("azure_id", bloco);

            if (error) throw error;
            for (const item of data ?? []) {
              projetosExistentes.add(item.azure_id);
            }
          }
        }

        if (idsTarefas.length) {
          for (const bloco of lotes(idsTarefas)) {
            const { data, error } = await banco
              .from("pq_tarefas")
              .select("azure_id")
              .in("azure_id", bloco);

            if (error) throw error;
            for (const item of data ?? []) {
              tarefasExistentes.add(item.azure_id);
            }
          }
        }

        if (projetos.length) {
          const registrosProjetos = projetos.map((linha) => ({
            azure_id: linha.id,
            nome: linha.projeto,
            status: linha.status,
            data_inicio: linha.data_inicio,
            data_fim: linha.data_fim,
            sponsor: linha.sponsor,
            esforco: linha.esforco,
            prioridade: linha.prioridade,
            evidencia_original: linha.evidencia,
            ativo: true,
            presente_ultima_importacao: true,
            ultima_importacao_id: importacaoId,
            ultima_aparicao_em: new Date().toISOString(),
          }));

          for (const bloco of lotes(registrosProjetos)) {
            const { error } = await banco.from("pq_projetos").upsert(bloco, {
              onConflict: "azure_id",
            });

            if (error) throw error;
          }
        }

        const projetosBanco: Array<{ id: string; nome: string | null }> = [];
        const tamanhoPagina = 1000;

        for (let inicio = 0; ; inicio += tamanhoPagina) {
          const { data, error } = await banco
            .from("pq_projetos")
            .select("id,nome")
            .range(inicio, inicio + tamanhoPagina - 1);

          if (error) throw error;
          projetosBanco.push(...(data ?? []));
          if (!data || data.length < tamanhoPagina) break;
        }

        const projetosPorNome = new Map<string, string>();
        const idsPorNome = new Map<string, string[]>();

        for (const projeto of projetosBanco) {
          const chave = texto(projeto.nome).toLowerCase();
          if (!chave) continue;
          idsPorNome.set(chave, [...(idsPorNome.get(chave) ?? []), projeto.id]);
        }

        for (const [nome, ids] of idsPorNome) {
          // Se houver projetos homônimos, não criamos um vínculo potencialmente errado.
          if (ids.length === 1) projetosPorNome.set(nome, ids[0]);
        }

        let tarefasSemVinculo = 0;

        if (tarefas.length) {
          const registrosTarefas = tarefas.map((linha) => {
            const projetoId =
              projetosPorNome.get(linha.projeto.toLowerCase()) ?? null;
            if (!projetoId) tarefasSemVinculo++;

            return {
              azure_id: linha.id,
              projeto_id: projetoId,
              nome_projeto_origem: linha.projeto,
              tipo: linha.tipo,
              descricao: linha.acao || null,
              status: linha.status,
              data_inicio: linha.data_inicio,
              data_fim: linha.data_fim,
              sponsor: linha.sponsor,
              ativo: true,
              presente_ultima_importacao: true,
              ultima_importacao_id: importacaoId,
              ultima_aparicao_em: new Date().toISOString(),
            };
          });

          for (const bloco of lotes(registrosTarefas)) {
            const { error } = await banco.from("pq_tarefas").upsert(bloco, {
              onConflict: "azure_id",
            });

            if (error) throw error;
          }
        }

        const marcarAusentes = async (
          tabela: "pq_projetos" | "pq_tarefas",
          idsAtuais: string[],
        ): Promise<number> => {
          // Se nenhuma linha válida desse tipo chegou, preservamos o estado anterior.
          // Isso evita marcar toda a base como ausente por causa de uma planilha inválida.
          if (idsAtuais.length === 0) return 0;

          const presentes: string[] = [];
          const tamanhoPagina = 1000;

          for (let inicio = 0; ; inicio += tamanhoPagina) {
            const { data, error } = await banco
              .from(tabela)
              .select("azure_id")
              .eq("presente_ultima_importacao", true)
              .range(inicio, inicio + tamanhoPagina - 1);

            if (error) throw error;
            presentes.push(...(data ?? []).map((item) => item.azure_id));
            if (!data || data.length < tamanhoPagina) break;
          }

          const idsAtuaisSet = new Set(idsAtuais);
          const ausentes = presentes.filter((id) => !idsAtuaisSet.has(id));

          for (const bloco of lotes(ausentes)) {
            const { error } = await banco
              .from(tabela)
              .update({ presente_ultima_importacao: false })
              .in("azure_id", bloco);

            if (error) throw error;
          }

          return ausentes.length;
        };

        const projetosMarcadosAusentes = await marcarAusentes(
          "pq_projetos",
          idsProjetos,
        );
        const tarefasMarcadasAusentes = await marcarAusentes(
          "pq_tarefas",
          idsTarefas,
        );

        const idsProjetosImportados = new Set(
          projetos.map((linha) => linha.id),
        );

        const projetosAtualizados: Array<{
          id: string;
          azure_id: string;
          nome: string;
          status: string | null;
          data_inicio: string | null;
          data_fim: string | null;
          sponsor: string | null;
          esforco: string | null;
          prioridade: string | null;
        }> = [];

        for (const bloco of lotes(idsProjetos)) {
          const { data, error } = await banco
            .from("pq_projetos")
            .select(
              "id,azure_id,nome,status,data_inicio,data_fim,sponsor,esforco,prioridade",
            )
            .in("azure_id", bloco);

          if (error) throw error;
          projetosAtualizados.push(...(data ?? []));
        }

        const snapshots = projetosAtualizados
          .filter((projeto) => idsProjetosImportados.has(projeto.azure_id))
          .map((projeto) => ({
            projeto_id: projeto.id,
            importacao_id: importacaoId,
            nome: projeto.nome,
            status: projeto.status,
            data_inicio: projeto.data_inicio,
            data_fim: projeto.data_fim,
            sponsor: projeto.sponsor,
            esforco: projeto.esforco,
            prioridade: projeto.prioridade,
          }));

        if (snapshots.length) {
          for (const bloco of lotes(snapshots)) {
            const { error } = await banco
              .from("pq_projetos_snapshots")
              .upsert(bloco, {
                onConflict: "projeto_id,importacao_id",
              });

            if (error) throw error;
          }
        }

        const projetosInseridos = projetos.filter(
          (linha) => !projetosExistentes.has(linha.id),
        ).length;

        const tarefasInseridas = tarefas.filter(
          (linha) => !tarefasExistentes.has(linha.id),
        ).length;

        const linhasComErro = linhasPreparadas.filter(
          (linha) => linha.erro,
        ).length;

        const { error: erroFinalizacao } = await banco
          .from("pq_importacoes")
          .update({
            status: "concluida",
            finalizado_em: new Date().toISOString(),
            projetos_inseridos: projetosInseridos,
            projetos_atualizados: projetos.length - projetosInseridos,
            tarefas_inseridas: tarefasInseridas,
            tarefas_atualizadas: tarefas.length - tarefasInseridas,
            linhas_com_erro: linhasComErro,
            mensagem:
              tarefasSemVinculo > 0
                ? `Importação concluída com ${tarefasSemVinculo} tarefa(s) sem vínculo inequívoco com projeto.`
                : "Importação concluída.",
          })
          .eq("id", importacaoId);

        if (erroFinalizacao) throw erroFinalizacao;

        return responderJson(req, {
          success: true,
          importacao_id: importacaoId,
          linhas_recebidas: linhas.length,
          projetos_inseridos: projetosInseridos,
          projetos_atualizados: projetos.length - projetosInseridos,
          tarefas_inseridas: tarefasInseridas,
          tarefas_atualizadas: tarefas.length - tarefasInseridas,
          linhas_com_erro: linhasComErro,
          tarefas_sem_vinculo: tarefasSemVinculo,
          projetos_marcados_ausentes: projetosMarcadosAusentes,
          tarefas_marcadas_ausentes: tarefasMarcadasAusentes,
        });
      } catch (erro) {
        const mensagem = mensagemErro(erro);

        await banco
          .from("pq_importacoes")
          .update({
            status: "erro",
            finalizado_em: new Date().toISOString(),
            mensagem,
          })
          .eq("id", importacaoId);

        return responderJson(
          req,
          {
            success: false,
            importacao_id: importacaoId,
            error: "A importação falhou.",
            detalhe: mensagem,
          },
          500,
        );
      }
    },
  ),
};
