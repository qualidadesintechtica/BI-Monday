-- ============================================================
-- BI MONDAY V24.10
-- CORREÇÃO DEFINITIVA DAS DATAS DO PROJETO QUALIDADE
--
-- A planilha armazena muitas datas como número serial do Excel,
-- por exemplo: 46090.
--
-- Este script:
-- 1) converte datas já existentes em dados_origem;
-- 2) preenche data_inicio e data_fim de projetos e tarefas;
-- 3) mantém as views atuais;
-- 4) mostra uma conferência no final.
--
-- Execute ESTE BLOCO INTEIRO.
-- ============================================================

-- -------------------------
-- PROJETOS
-- -------------------------
WITH origem AS (
    SELECT
        id,
        COALESCE(
            dados_origem->>'Data de inicio',
            dados_origem->>'Data de início',
            dados_origem->>'Start Date'
        ) AS inicio_raw,
        COALESCE(
            dados_origem->>'Data de fim',
            dados_origem->>'Data fim',
            dados_origem->>'Target Date'
        ) AS fim_raw
    FROM public.pq_projetos_atual
),
convertida AS (
    SELECT
        id,
        CASE
            WHEN inicio_raw ~ '^[0-9]+([.][0-9]+)?$'
                THEN DATE '1899-12-30' + FLOOR(inicio_raw::numeric)::int
            WHEN inicio_raw ~ '^\d{4}-\d{2}-\d{2}'
                THEN LEFT(inicio_raw, 10)::date
            WHEN inicio_raw ~ '^\d{1,2}/\d{1,2}/\d{4}'
                THEN TO_DATE(SPLIT_PART(inicio_raw, ' ', 1), 'DD/MM/YYYY')
            ELSE NULL
        END AS inicio_convertido,
        CASE
            WHEN fim_raw ~ '^[0-9]+([.][0-9]+)?$'
                THEN DATE '1899-12-30' + FLOOR(fim_raw::numeric)::int
            WHEN fim_raw ~ '^\d{4}-\d{2}-\d{2}'
                THEN LEFT(fim_raw, 10)::date
            WHEN fim_raw ~ '^\d{1,2}/\d{1,2}/\d{4}'
                THEN TO_DATE(SPLIT_PART(fim_raw, ' ', 1), 'DD/MM/YYYY')
            ELSE NULL
        END AS fim_convertido
    FROM origem
)
UPDATE public.pq_projetos_atual p
SET
    data_inicio = COALESCE(p.data_inicio, c.inicio_convertido),
    data_fim    = COALESCE(p.data_fim, c.fim_convertido),
    updated_at  = NOW()
FROM convertida c
WHERE p.id = c.id
  AND (
      (p.data_inicio IS NULL AND c.inicio_convertido IS NOT NULL)
      OR
      (p.data_fim IS NULL AND c.fim_convertido IS NOT NULL)
  );

-- -------------------------
-- TAREFAS
-- -------------------------
WITH origem AS (
    SELECT
        id,
        COALESCE(
            dados_origem->>'Data de inicio',
            dados_origem->>'Data de início',
            dados_origem->>'Start Date'
        ) AS inicio_raw,
        COALESCE(
            dados_origem->>'Data de fim',
            dados_origem->>'Data fim',
            dados_origem->>'Target Date'
        ) AS fim_raw
    FROM public.pq_tarefas_atual
),
convertida AS (
    SELECT
        id,
        CASE
            WHEN inicio_raw ~ '^[0-9]+([.][0-9]+)?$'
                THEN DATE '1899-12-30' + FLOOR(inicio_raw::numeric)::int
            WHEN inicio_raw ~ '^\d{4}-\d{2}-\d{2}'
                THEN LEFT(inicio_raw, 10)::date
            WHEN inicio_raw ~ '^\d{1,2}/\d{1,2}/\d{4}'
                THEN TO_DATE(SPLIT_PART(inicio_raw, ' ', 1), 'DD/MM/YYYY')
            ELSE NULL
        END AS inicio_convertido,
        CASE
            WHEN fim_raw ~ '^[0-9]+([.][0-9]+)?$'
                THEN DATE '1899-12-30' + FLOOR(fim_raw::numeric)::int
            WHEN fim_raw ~ '^\d{4}-\d{2}-\d{2}'
                THEN LEFT(fim_raw, 10)::date
            WHEN fim_raw ~ '^\d{1,2}/\d{1,2}/\d{4}'
                THEN TO_DATE(SPLIT_PART(fim_raw, ' ', 1), 'DD/MM/YYYY')
            ELSE NULL
        END AS fim_convertido
    FROM origem
)
UPDATE public.pq_tarefas_atual t
SET
    data_inicio = COALESCE(t.data_inicio, c.inicio_convertido),
    data_fim    = COALESCE(t.data_fim, c.fim_convertido),
    updated_at  = NOW()
FROM convertida c
WHERE t.id = c.id
  AND (
      (t.data_inicio IS NULL AND c.inicio_convertido IS NOT NULL)
      OR
      (t.data_fim IS NULL AND c.fim_convertido IS NOT NULL)
  );

-- Recarregar o schema do PostgREST
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA
-- Deve mostrar datas preenchidas.
-- ============================================================
SELECT
    id,
    id_azure,
    projeto,
    data_inicio,
    data_fim,
    sponsor
FROM public.pq_projetos_atual
WHERE ativo = true
ORDER BY id DESC
LIMIT 20;
