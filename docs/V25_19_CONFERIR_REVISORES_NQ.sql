-- V25.19 | Conferência do KPI Revisores mobilizados
-- Mostra quem aparece na coluna Revisor Validador e se pertence à Base de Especialistas ativa.

WITH revisores_monday AS (
  SELECT DISTINCT
    trim(pessoa) AS revisor
  FROM public.monday_validacao_materiais m,
       LATERAL regexp_split_to_table(coalesce(m.revisor_validador, ''), '\s*,\s*') pessoa
  WHERE coalesce(trim(pessoa), '') <> ''
    AND lower(coalesce(m.status_validacao, '')) LIKE '%validado%'
),
especialistas_ativos AS (
  SELECT DISTINCT
    lower(trim(professor)) AS professor_key,
    trim(professor) AS professor
  FROM public.nq_especialistas
  WHERE ativo = true
    AND coalesce(trim(professor), '') <> ''
)
SELECT
  r.revisor,
  CASE WHEN e.professor_key IS NOT NULL THEN 'REVISOR NQ' ELSE 'FORA DA BASE NQ' END AS classificacao
FROM revisores_monday r
LEFT JOIN especialistas_ativos e
  ON lower(trim(r.revisor)) = e.professor_key
ORDER BY classificacao, r.revisor;

-- Total que o KPI V25.19 deve considerar, sem filtros globais do front-end:
WITH revisores_monday AS (
  SELECT DISTINCT lower(trim(pessoa)) AS revisor_key
  FROM public.monday_validacao_materiais m,
       LATERAL regexp_split_to_table(coalesce(m.revisor_validador, ''), '\s*,\s*') pessoa
  WHERE coalesce(trim(pessoa), '') <> ''
    AND lower(coalesce(m.status_validacao, '')) LIKE '%validado%'
),
especialistas_ativos AS (
  SELECT DISTINCT lower(trim(professor)) AS professor_key
  FROM public.nq_especialistas
  WHERE ativo = true
    AND coalesce(trim(professor), '') <> ''
)
SELECT count(*) AS revisores_nq_mobilizados
FROM revisores_monday r
JOIN especialistas_ativos e
  ON r.revisor_key = e.professor_key;
