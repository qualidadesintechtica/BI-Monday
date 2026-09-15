-- BI-Monday V25.17
-- Diagnóstico da fonte dos critérios de não conformidade.

-- 1. Veja quais colunas a view de detalhe expõe.
SELECT
    ordinal_position,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'vw_nq_reuniao_criterios_detalhe'
ORDER BY ordinal_position;

-- 2. Amostra dos dados da view.
SELECT *
FROM public.vw_nq_reuniao_criterios_detalhe
LIMIT 20;

-- A V25.17 procura automaticamente um campo equivalente a:
-- apontamos_inconformidade / apontamos_inconformidades / “Apontamos inconformidade?”
