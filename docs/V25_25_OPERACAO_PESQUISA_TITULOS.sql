-- BI-Monday V25.25
-- Operação: universo completo de UCs/UAs a partir da Esteira de Produção
-- Execute no SQL Editor do Supabase antes de publicar a V25.25.
--
-- Objetivo:
--   1) monday_esteira_producao = universo operacional completo;
--   2) monday_validacao_materiais = status/responsáveis/datas quando o item já chegou à validação;
--   3) criar uma linha sintética de UC por ID Título para o Quadro principal;
--   4) preservar UAs que ainda não existem no board de Validação.

CREATE OR REPLACE VIEW public.vw_operacao_materiais_completa AS
WITH esteira_raw AS (
  SELECT
    e.*,
    to_jsonb(e) AS j,
    NULLIF(BTRIM(COALESCE(to_jsonb(e)->>'id_titulo', '')), '') AS id_titulo_raw,
    NULLIF(BTRIM(COALESCE(to_jsonb(e)->>'id_ua', '')), '') AS id_ua_raw,
    UPPER(REGEXP_REPLACE(BTRIM(COALESCE(to_jsonb(e)->>'id_titulo', '')), '_+$', '')) AS id_titulo_norm,
    UPPER(BTRIM(COALESCE(to_jsonb(e)->>'id_ua', ''))) AS id_ua_norm,
    COALESCE(
      NULLIF(BTRIM(to_jsonb(e)->>'categoria_material'), ''),
      NULLIF(BTRIM(to_jsonb(e)->>'tipo_material'), ''),
      NULLIF(BTRIM(to_jsonb(e)->>'categoria'), ''),
      ''
    ) AS categoria_raw,
    ROW_NUMBER() OVER (
      PARTITION BY CASE
        WHEN NULLIF(BTRIM(COALESCE(to_jsonb(e)->>'id_titulo', '')), '') IS NOT NULL
         AND NULLIF(BTRIM(COALESCE(to_jsonb(e)->>'id_ua', '')), '') IS NOT NULL
        THEN
          UPPER(REGEXP_REPLACE(BTRIM(COALESCE(to_jsonb(e)->>'id_titulo', '')), '_+$', ''))
          || '|' || UPPER(BTRIM(COALESCE(to_jsonb(e)->>'id_ua', '')))
          || '|' || UPPER(COALESCE(
               NULLIF(BTRIM(to_jsonb(e)->>'categoria_material'), ''),
               NULLIF(BTRIM(to_jsonb(e)->>'tipo_material'), ''),
               NULLIF(BTRIM(to_jsonb(e)->>'categoria'), ''),
               ''
             ))
        ELSE 'MONDAY|' || COALESCE(to_jsonb(e)->>'monday_item_id', to_jsonb(e)->>'id', md5(to_jsonb(e)::text))
      END
      ORDER BY
        COALESCE(
          NULLIF(to_jsonb(e)->>'sincronizado_em', ''),
          NULLIF(to_jsonb(e)->>'ultima_atualizacao_monday', ''),
          '1900-01-01T00:00:00Z'
        ) DESC,
        COALESCE(to_jsonb(e)->>'monday_item_id', to_jsonb(e)->>'id', '0') DESC
    ) AS ordem_material
  FROM public.monday_esteira_producao e
),
esteira AS (
  SELECT *
  FROM esteira_raw
  WHERE ordem_material = 1
),
validacao_raw AS (
  SELECT
    v.*,
    to_jsonb(v) AS j,
    UPPER(REGEXP_REPLACE(BTRIM(COALESCE(to_jsonb(v)->>'id_titulo', '')), '_+$', '')) AS id_titulo_norm,
    UPPER(BTRIM(COALESCE(to_jsonb(v)->>'id_ua', ''))) AS id_ua_norm,
    ROW_NUMBER() OVER (
      PARTITION BY
        UPPER(REGEXP_REPLACE(BTRIM(COALESCE(to_jsonb(v)->>'id_titulo', '')), '_+$', '')),
        UPPER(BTRIM(COALESCE(to_jsonb(v)->>'id_ua', '')))
      ORDER BY
        COALESCE(NULLIF(to_jsonb(v)->>'sincronizado_em', ''), '1900-01-01T00:00:00Z') DESC,
        COALESCE(to_jsonb(v)->>'monday_item_id', to_jsonb(v)->>'id', '0') DESC
    ) AS ordem_validacao
  FROM public.monday_validacao_materiais v
  WHERE NULLIF(BTRIM(COALESCE(to_jsonb(v)->>'id_titulo', '')), '') IS NOT NULL
    AND NULLIF(BTRIM(COALESCE(to_jsonb(v)->>'id_ua', '')), '') IS NOT NULL
),
validacao AS (
  SELECT *
  FROM validacao_raw
  WHERE ordem_validacao = 1
),
materiais AS (
  SELECT
    'MATERIAL'::text AS tipo_operacao,
    COALESCE(
      NULLIF(BTRIM(e.j->>'chave_material'), ''),
      CASE
        WHEN e.id_titulo_raw IS NOT NULL AND e.id_ua_raw IS NOT NULL
          THEN e.id_titulo_norm || '|' || e.id_ua_norm || '|' || UPPER(e.categoria_raw)
        ELSE 'MONDAY|' || COALESCE(e.j->>'monday_item_id', e.j->>'id', md5(e.j::text))
      END
    ) AS chave_material,
    CASE
      WHEN e.id_titulo_raw IS NOT NULL AND e.id_ua_raw IS NOT NULL
        THEN e.id_titulo_norm || '|' || e.id_ua_norm
      ELSE NULL
    END AS chave_ua,
    e.id_titulo_raw AS id_titulo,
    e.id_ua_raw AS id_ua,
    COALESCE(
      NULLIF(BTRIM(e.j->>'item_name'), ''),
      NULLIF(BTRIM(e.j->>'name'), ''),
      NULLIF(BTRIM(e.j->>'nome_item'), ''),
      NULLIF(BTRIM(e.j->>'titulo_ua'), ''),
      NULLIF(BTRIM(e.j->>'nome_ua'), ''),
      NULLIF(BTRIM(e.j->>'titulo'), ''),
      NULLIF(BTRIM(e.j->>'titulo_uc'), ''),
      NULLIF(BTRIM(e.j->>'nome_uc'), ''),
      e.id_ua_raw,
      e.id_titulo_raw
    ) AS item_name,
    COALESCE(
      NULLIF(BTRIM(e.j->>'titulo'), ''),
      NULLIF(BTRIM(e.j->>'titulo_uc'), ''),
      NULLIF(BTRIM(e.j->>'titulo_curricular'), ''),
      NULLIF(BTRIM(e.j->>'nome_titulo'), ''),
      NULLIF(BTRIM(e.j->>'nome_uc'), ''),
      NULLIF(BTRIM(e.j->>'unidade_curricular'), ''),
      NULLIF(BTRIM(e.j->>'uc'), ''),
      NULLIF(BTRIM(e.j->>'title'), ''),
      NULLIF(BTRIM(v.j->>'titulo'), ''),
      NULLIF(BTRIM(v.j->>'titulo_uc'), ''),
      NULLIF(BTRIM(v.j->>'nome_titulo'), ''),
      e.id_titulo_raw
    ) AS titulo,
    COALESCE(
      NULLIF(BTRIM(e.j->>'titulo_ua'), ''),
      NULLIF(BTRIM(e.j->>'nome_ua'), ''),
      NULLIF(BTRIM(e.j->>'unidade_material'), ''),
      NULLIF(BTRIM(e.j->>'ua'), ''),
      NULLIF(BTRIM(v.j->>'titulo_ua'), ''),
      NULLIF(BTRIM(v.j->>'nome_ua'), ''),
      e.id_ua_raw
    ) AS titulo_ua,
    COALESCE(NULLIF(BTRIM(e.j->>'esteira_producao'), ''), NULLIF(BTRIM(e.j->>'esteira'), '')) AS esteira_producao,
    COALESCE(NULLIF(BTRIM(e.j->>'matriz_oferta'), ''), NULLIF(BTRIM(e.j->>'matriz'), '')) AS matriz_oferta,
    NULLIF(BTRIM(e.j->>'bloco'), '') AS bloco,
    NULLIF(BTRIM(e.categoria_raw), '') AS categoria_material,
    COALESCE(NULLIF(BTRIM(e.j->>'escopo'), ''), NULLIF(BTRIM(e.j->>'nivel'), ''), NULLIF(BTRIM(e.j->>'nível'), '')) AS escopo,
    NULLIF(BTRIM(e.j->>'formato'), '') AS formato,
    NULLIF(BTRIM(e.j->>'area_cine'), '') AS area_cine,
    NULLIF(BTRIM(e.j->>'semestre_oferta'), '') AS semestre_oferta,
    NULLIF(BTRIM(e.j->>'produtora'), '') AS produtora,
    COALESCE(NULLIF(BTRIM(e.j->>'gestor_validacao_nq'), ''), NULLIF(BTRIM(e.j->>'gestor'), '')) AS gestor_planejado,
    COALESCE(NULLIF(BTRIM(e.j->>'docente_conteudista'), ''), NULLIF(BTRIM(e.j->>'conteudista'), '')) AS docente_conteudista,
    NULLIF(BTRIM(e.j->>'previsao_liberacao_validacao'), '') AS previsao_liberacao_validacao,
    CASE
      WHEN COALESCE(v.j->>'monday_item_id', v.j->>'id', '') ~ '^[0-9]+$'
        THEN COALESCE(v.j->>'monday_item_id', v.j->>'id')::bigint
      ELSE NULL
    END AS monday_item_validacao,
    COALESCE(NULLIF(BTRIM(v.j->>'monday_group_title'), ''), NULLIF(BTRIM(v.j->>'group_title'), ''), NULLIF(BTRIM(v.j->>'grupo'), '')) AS monday_group_title,
    COALESCE(NULLIF(BTRIM(v.j->>'status_validacao'), ''), NULLIF(BTRIM(v.j->>'status'), ''), NULLIF(BTRIM(e.j->>'status_validacao_espelho'), '')) AS status_validacao,
    COALESCE(NULLIF(BTRIM(v.j->>'revisor_validador'), ''), NULLIF(BTRIM(v.j->>'revisor'), '')) AS revisor_validador,
    COALESCE(
      NULLIF(BTRIM(v.j->>'gestor_validacao_nq'), ''),
      NULLIF(BTRIM(v.j->>'gestor'), ''),
      NULLIF(BTRIM(e.j->>'gestor_validacao_nq'), ''),
      NULLIF(BTRIM(e.j->>'gestor'), '')
    ) AS gestor_validacao_nq,
    NULLIF(BTRIM(v.j->>'data_liberacao_validacao'), '') AS data_liberacao_validacao,
    NULLIF(BTRIM(v.j->>'data_validacao'), '') AS data_validacao,
    (v.id_ua_norm IS NOT NULL AND v.id_ua_norm <> '') AS foi_liberada,
    NOT (v.id_ua_norm IS NOT NULL AND v.id_ua_norm <> '') AS nao_liberada,
    LOWER(COALESCE(v.j->>'status_validacao', v.j->>'status', '')) LIKE '%validado%' AS eh_validada,
    (
      LOWER(COALESCE(v.j->>'status_validacao', v.j->>'status', '')) LIKE '%liberado%'
      OR LOWER(COALESCE(v.j->>'status_validacao', v.j->>'status', '')) LIKE '%revalidar%'
    ) AS eh_nq,
    LOWER(COALESCE(v.j->>'status_validacao', v.j->>'status', '')) LIKE '%ajust%' AS eh_ajuste,
    (
      e.id_ua_raw IS NOT NULL
      OR LOWER(e.categoria_raw) LIKE '%unidade de aprendizagem%'
    ) AS eh_ua,
    COALESCE(NULLIF(e.j->>'sincronizado_em', ''), NULLIF(e.j->>'ultima_atualizacao_monday', '')) AS sincronizado_esteira,
    NULLIF(v.j->>'sincronizado_em', '') AS sincronizado_validacao
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
    COALESCE(
      MAX(NULLIF(titulo, '')),
      id_titulo
    ) AS item_name,
    COALESCE(
      MAX(NULLIF(titulo, '')),
      id_titulo
    ) AS titulo,
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

-- ==========================================================
-- CONFERÊNCIA
-- ==========================================================
WITH fonte AS (
  SELECT
    NULLIF(BTRIM(COALESCE(to_jsonb(e)->>'id_titulo', '')), '') AS id_titulo,
    NULLIF(BTRIM(COALESCE(to_jsonb(e)->>'id_ua', '')), '') AS id_ua
  FROM public.monday_esteira_producao e
),
visao AS (
  SELECT * FROM public.vw_operacao_materiais_completa
)
SELECT
  (SELECT COUNT(*) FROM public.monday_esteira_producao) AS linhas_esteira,
  (SELECT COUNT(DISTINCT UPPER(REGEXP_REPLACE(BTRIM(id_titulo), '_+$', ''))) FROM fonte WHERE id_titulo IS NOT NULL) AS ucs_fonte,
  (SELECT COUNT(DISTINCT UPPER(REGEXP_REPLACE(BTRIM(id_titulo), '_+$', '')) || '|' || UPPER(BTRIM(id_ua))) FROM fonte WHERE id_titulo IS NOT NULL AND id_ua IS NOT NULL) AS uas_fonte,
  (SELECT COUNT(*) FROM visao) AS linhas_visao_operacao,
  (SELECT COUNT(*) FROM visao WHERE tipo_operacao = 'UC') AS ucs_sinteticas,
  (SELECT COUNT(DISTINCT UPPER(REGEXP_REPLACE(BTRIM(id_titulo), '_+$', '')) || '|' || UPPER(BTRIM(id_ua))) FROM visao WHERE NULLIF(BTRIM(id_ua), '') IS NOT NULL) AS uas_visao;


-- ==========================================================
-- CONFERÊNCIA V25.25 · TÍTULOS E PESQUISA
-- ==========================================================
-- Localiza na Esteira qualquer registro que contenha "Contabilidade"
-- em qualquer coluna textual, independentemente do nome físico da coluna.
SELECT
  to_jsonb(e) AS registro_esteira
FROM public.monday_esteira_producao e
WHERE LOWER(to_jsonb(e)::text) LIKE '%contabilidade%'
LIMIT 20;

-- Confere como esses títulos chegam à view de Operação.
SELECT
  tipo_operacao,
  id_titulo,
  id_ua,
  titulo,
  titulo_ua,
  item_name,
  categoria_material,
  status_validacao
FROM public.vw_operacao_materiais_completa
WHERE LOWER(
  CONCAT_WS(
    ' ',
    COALESCE(titulo,''),
    COALESCE(titulo_ua,''),
    COALESCE(item_name,''),
    COALESCE(id_titulo,''),
    COALESCE(id_ua,'')
  )
) LIKE '%contabilidade%'
ORDER BY id_titulo, id_ua NULLS FIRST;
