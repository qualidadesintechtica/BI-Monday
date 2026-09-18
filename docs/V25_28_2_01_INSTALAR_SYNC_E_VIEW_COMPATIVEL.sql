-- =============================================================
-- BI-Monday V25.28.2 · INSTALAÇÃO / CORREÇÃO DE PERFORMANCE
-- Execute UMA VEZ no SQL Editor.
-- Este arquivo NÃO executa buscas pesadas de diagnóstico.
-- =============================================================

-- 1) Estado da sincronização paginada
CREATE TABLE IF NOT EXISTS public.monday_sync_state (
  board_id bigint PRIMARY KEY,
  board_name text,
  tabela_destino text,
  cursor text,
  ciclo_sincronizado_em timestamptz,
  paginas_processadas integer NOT NULL DEFAULT 0,
  itens_processados integer NOT NULL DEFAULT 0,
  em_ciclo boolean NOT NULL DEFAULT false,
  ultimo_ciclo_concluido_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Reinicia cursores antigos na primeira instalação da V25.28.
UPDATE public.monday_sync_state
SET cursor = NULL,
    ciclo_sincronizado_em = NULL,
    paginas_processadas = 0,
    itens_processados = 0,
    em_ciclo = false,
    atualizado_em = now()
WHERE board_id IN (9433297929, 9376982027);

-- 2) Garante os campos essenciais da Esteira usados pela V25.28
ALTER TABLE public.monday_esteira_producao
  ADD COLUMN IF NOT EXISTS monday_board_id bigint,
  ADD COLUMN IF NOT EXISTS monday_group_id text,
  ADD COLUMN IF NOT EXISTS monday_group_title text,
  ADD COLUMN IF NOT EXISTS item_name text,
  ADD COLUMN IF NOT EXISTS titulo text,
  ADD COLUMN IF NOT EXISTS titulo_ua text,
  ADD COLUMN IF NOT EXISTS id_ua text,
  ADD COLUMN IF NOT EXISTS id_titulo text,
  ADD COLUMN IF NOT EXISTS cod_crono_ua text,
  ADD COLUMN IF NOT EXISTS matriz_oferta text,
  ADD COLUMN IF NOT EXISTS escopo text,
  ADD COLUMN IF NOT EXISTS bloco text,
  ADD COLUMN IF NOT EXISTS formato text,
  ADD COLUMN IF NOT EXISTS area_cine text,
  ADD COLUMN IF NOT EXISTS esteira_producao text,
  ADD COLUMN IF NOT EXISTS semestre_oferta text,
  ADD COLUMN IF NOT EXISTS produtora text,
  ADD COLUMN IF NOT EXISTS categoria_material text,
  ADD COLUMN IF NOT EXISTS docente_conteudista text,
  ADD COLUMN IF NOT EXISTS gestor_validacao_nq text,
  ADD COLUMN IF NOT EXISTS previsao_liberacao_validacao text,
  ADD COLUMN IF NOT EXISTS status_validacao_espelho text,
  ADD COLUMN IF NOT EXISTS ultima_atualizacao_monday timestamptz,
  ADD COLUMN IF NOT EXISTS sincronizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS dados_originais jsonb;

-- 3) Garante os campos essenciais da Validação
ALTER TABLE public.monday_validacao_materiais
  ADD COLUMN IF NOT EXISTS monday_board_id bigint,
  ADD COLUMN IF NOT EXISTS monday_group_id text,
  ADD COLUMN IF NOT EXISTS monday_group_title text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS titulo text,
  ADD COLUMN IF NOT EXISTS id_titulo text,
  ADD COLUMN IF NOT EXISTS id_ua text,
  ADD COLUMN IF NOT EXISTS bloco text,
  ADD COLUMN IF NOT EXISTS status_validacao text,
  ADD COLUMN IF NOT EXISTS revisor_validador text,
  ADD COLUMN IF NOT EXISTS gestor_validacao_nq text,
  ADD COLUMN IF NOT EXISTS data_liberacao_validacao date,
  ADD COLUMN IF NOT EXISTS data_validacao date,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS sincronizado_em timestamptz;

-- 4) Índices leves para o cruzamento da página Operação
CREATE INDEX IF NOT EXISTS idx_esteira_titulo_ua
  ON public.monday_esteira_producao (id_titulo, id_ua);
CREATE INDEX IF NOT EXISTS idx_esteira_sync
  ON public.monday_esteira_producao (sincronizado_em DESC);
CREATE INDEX IF NOT EXISTS idx_validacao_titulo_ua
  ON public.monday_validacao_materiais (id_titulo, id_ua);
CREATE INDEX IF NOT EXISTS idx_validacao_sync
  ON public.monday_validacao_materiais (sincronizado_em DESC);

-- 5) View otimizada: sem to_jsonb(e)::text e sem varreduras JSON pesadas.
CREATE OR REPLACE VIEW public.vw_operacao_materiais_completa AS
WITH esteira_raw AS (
  SELECT
    e.*,
    NULLIF(BTRIM(e.id_titulo), '') AS id_titulo_raw,
    NULLIF(BTRIM(e.id_ua), '') AS id_ua_raw,
    UPPER(REGEXP_REPLACE(BTRIM(COALESCE(e.id_titulo, '')), '_+$', '')) AS id_titulo_norm,
    UPPER(BTRIM(COALESCE(e.id_ua, ''))) AS id_ua_norm,
    COALESCE(NULLIF(BTRIM(e.categoria_material), ''), '') AS categoria_raw,
    ROW_NUMBER() OVER (
      PARTITION BY CASE
        WHEN NULLIF(BTRIM(e.id_titulo), '') IS NOT NULL
         AND NULLIF(BTRIM(e.id_ua), '') IS NOT NULL
        THEN UPPER(REGEXP_REPLACE(BTRIM(e.id_titulo), '_+$', ''))
             || '|' || UPPER(BTRIM(e.id_ua))
             || '|' || UPPER(COALESCE(NULLIF(BTRIM(e.categoria_material), ''), ''))
        ELSE 'MONDAY|' || COALESCE(e.monday_item_id::text, md5(COALESCE(e.item_name,'') || COALESCE(e.titulo,'')))
      END
      ORDER BY COALESCE(e.sincronizado_em, '1900-01-01'::timestamptz) DESC,
               e.monday_item_id DESC NULLS LAST
    ) AS ordem_material
  FROM public.monday_esteira_producao e
),
esteira AS (
  SELECT * FROM esteira_raw WHERE ordem_material = 1
),
validacao_raw AS (
  SELECT
    v.*,
    UPPER(REGEXP_REPLACE(BTRIM(COALESCE(v.id_titulo, '')), '_+$', '')) AS id_titulo_norm,
    UPPER(BTRIM(COALESCE(v.id_ua, ''))) AS id_ua_norm,
    ROW_NUMBER() OVER (
      PARTITION BY
        UPPER(REGEXP_REPLACE(BTRIM(COALESCE(v.id_titulo, '')), '_+$', '')),
        UPPER(BTRIM(COALESCE(v.id_ua, '')))
      ORDER BY COALESCE(v.sincronizado_em, '1900-01-01'::timestamptz) DESC,
               v.monday_item_id DESC NULLS LAST
    ) AS ordem_validacao
  FROM public.monday_validacao_materiais v
  WHERE NULLIF(BTRIM(v.id_titulo), '') IS NOT NULL
    AND NULLIF(BTRIM(v.id_ua), '') IS NOT NULL
),
validacao AS (
  SELECT * FROM validacao_raw WHERE ordem_validacao = 1
),
materiais AS (
  SELECT
    'MATERIAL'::text AS tipo_operacao,
    CASE
      WHEN e.id_titulo_raw IS NOT NULL AND e.id_ua_raw IS NOT NULL
      THEN e.id_titulo_norm || '|' || e.id_ua_norm || '|' || UPPER(e.categoria_raw)
      ELSE 'MONDAY|' || COALESCE(e.monday_item_id::text, md5(COALESCE(e.item_name,'') || COALESCE(e.titulo,'')))
    END AS chave_material,
    CASE
      WHEN e.id_titulo_raw IS NOT NULL AND e.id_ua_raw IS NOT NULL
      THEN e.id_titulo_norm || '|' || e.id_ua_norm
      ELSE NULL
    END AS chave_ua,
    e.id_titulo_raw AS id_titulo,
    e.id_ua_raw AS id_ua,
    COALESCE(NULLIF(BTRIM(e.item_name), ''), NULLIF(BTRIM(e.titulo_ua), ''), NULLIF(BTRIM(e.titulo), ''), NULLIF(BTRIM(e.monday_group_title), ''), e.id_ua_raw, e.id_titulo_raw) AS item_name,
    COALESCE(NULLIF(BTRIM(e.titulo), ''), NULLIF(BTRIM(e.monday_group_title), ''), NULLIF(BTRIM(v.titulo), ''), e.id_titulo_raw) AS titulo,
    COALESCE(NULLIF(BTRIM(e.titulo_ua), ''), NULLIF(BTRIM(e.item_name), ''), e.id_ua_raw) AS titulo_ua,
    NULLIF(BTRIM(e.esteira_producao), '') AS esteira_producao,
    NULLIF(BTRIM(e.matriz_oferta), '') AS matriz_oferta,
    NULLIF(BTRIM(e.bloco), '') AS bloco,
    NULLIF(BTRIM(e.categoria_raw), '') AS categoria_material,
    NULLIF(BTRIM(e.escopo), '') AS escopo,
    NULLIF(BTRIM(e.formato), '') AS formato,
    NULLIF(BTRIM(e.area_cine), '') AS area_cine,
    NULLIF(BTRIM(e.semestre_oferta), '') AS semestre_oferta,
    NULLIF(BTRIM(e.produtora), '') AS produtora,
    NULLIF(BTRIM(e.gestor_validacao_nq), '') AS gestor_planejado,
    NULLIF(BTRIM(e.docente_conteudista), '') AS docente_conteudista,
    NULLIF(BTRIM(e.previsao_liberacao_validacao), '') AS previsao_liberacao_validacao,
    v.monday_item_id AS monday_item_validacao,
    COALESCE(NULLIF(BTRIM(v.monday_group_title), ''), NULLIF(BTRIM(e.monday_group_title), '')) AS monday_group_title,
    COALESCE(NULLIF(BTRIM(v.status_validacao), ''), NULLIF(BTRIM(v.status), ''), NULLIF(BTRIM(e.status_validacao_espelho), '')) AS status_validacao,
    NULLIF(BTRIM(v.revisor_validador), '') AS revisor_validador,
    COALESCE(NULLIF(BTRIM(v.gestor_validacao_nq), ''), NULLIF(BTRIM(e.gestor_validacao_nq), '')) AS gestor_validacao_nq,
    v.data_liberacao_validacao::text AS data_liberacao_validacao,
    v.data_validacao::text AS data_validacao,
    (v.monday_item_id IS NOT NULL) AS foi_liberada,
    (v.monday_item_id IS NULL) AS nao_liberada,
    LOWER(COALESCE(v.status_validacao, v.status, '')) LIKE '%validado%' AS eh_validada,
    (
      LOWER(COALESCE(v.status_validacao, v.status, '')) LIKE '%liberado%'
      OR LOWER(COALESCE(v.status_validacao, v.status, '')) LIKE '%revalidar%'
    ) AS eh_nq,
    LOWER(COALESCE(v.status_validacao, v.status, '')) LIKE '%ajust%' AS eh_ajuste,
    (e.id_ua_raw IS NOT NULL OR LOWER(e.categoria_raw) LIKE '%unidade de aprendizagem%') AS eh_ua,
    COALESCE(e.sincronizado_em::text, NULLIF(e.ultima_atualizacao_monday::text, '')) AS sincronizado_esteira,
    v.sincronizado_em::text AS sincronizado_validacao
  FROM esteira e
  LEFT JOIN validacao v
    ON e.id_titulo_norm <> ''
   AND e.id_ua_norm <> ''
   AND e.id_titulo_norm = v.id_titulo_norm
   AND e.id_ua_norm = v.id_ua_norm
),
ucs_sinteticas AS (
  SELECT
    'UC'::text AS tipo_operacao,
    'UC|' || UPPER(REGEXP_REPLACE(BTRIM(id_titulo), '_+$', '')) AS chave_material,
    NULL::text AS chave_ua,
    id_titulo,
    NULL::text AS id_ua,
    COALESCE(MAX(NULLIF(titulo, '')), id_titulo) AS item_name,
    COALESCE(MAX(NULLIF(titulo, '')), id_titulo) AS titulo,
    NULL::text AS titulo_ua,
    MAX(esteira_producao) AS esteira_producao,
    MAX(matriz_oferta) AS matriz_oferta,
    MAX(bloco) AS bloco,
    'Unidade Curricular'::text AS categoria_material,
    'UC'::text AS escopo,
    NULL::text AS formato,
    MAX(area_cine) AS area_cine,
    MAX(semestre_oferta) AS semestre_oferta,
    MAX(produtora) AS produtora,
    MAX(gestor_planejado) AS gestor_planejado,
    MAX(docente_conteudista) AS docente_conteudista,
    MAX(previsao_liberacao_validacao) AS previsao_liberacao_validacao,
    NULL::bigint AS monday_item_validacao,
    NULL::text AS monday_group_title,
    CASE
      WHEN BOOL_AND(LOWER(COALESCE(status_validacao, '')) LIKE '%validado%') THEN 'Validado'
      WHEN BOOL_OR(LOWER(COALESCE(status_validacao, '')) LIKE '%ajust%') THEN 'Em Ajustes - Conteudista e DA'
      WHEN BOOL_OR(LOWER(COALESCE(status_validacao, '')) LIKE '%revalidar%') THEN 'Revalidar - NQ'
      WHEN BOOL_OR(LOWER(COALESCE(status_validacao, '')) LIKE '%liberado%') THEN 'Liberado para Validação'
      ELSE 'A liberar'
    END AS status_validacao,
    NULLIF(STRING_AGG(DISTINCT NULLIF(BTRIM(revisor_validador), ''), ', '), '') AS revisor_validador,
    NULLIF(STRING_AGG(DISTINCT NULLIF(BTRIM(gestor_validacao_nq), ''), ', '), '') AS gestor_validacao_nq,
    NULL::text AS data_liberacao_validacao,
    NULL::text AS data_validacao,
    BOOL_OR(foi_liberada) AS foi_liberada,
    NOT BOOL_OR(foi_liberada) AS nao_liberada,
    BOOL_AND(eh_validada) AS eh_validada,
    BOOL_OR(eh_nq) AS eh_nq,
    BOOL_OR(eh_ajuste) AS eh_ajuste,
    FALSE AS eh_ua,
    MAX(sincronizado_esteira) AS sincronizado_esteira,
    MAX(sincronizado_validacao) AS sincronizado_validacao
  FROM materiais
  WHERE NULLIF(BTRIM(id_titulo), '') IS NOT NULL
  GROUP BY id_titulo
  HAVING COUNT(*) FILTER (
    WHERE LOWER(COALESCE(categoria_material, '')) LIKE '%unidade curricular%'
  ) = 0
)
SELECT * FROM materiais
UNION ALL
SELECT * FROM ucs_sinteticas;

GRANT SELECT ON public.vw_operacao_materiais_completa TO anon, authenticated;

-- Retorno leve para confirmar a instalação.
SELECT 'V25.28.2 instalada' AS resultado;
