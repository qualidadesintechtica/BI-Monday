-- ============================================================
-- BI MONDAY V24.8
-- CORREÇÃO DOS CAMPOS DA PLANILHA DO PROJETO QUALIDADE
-- Execute este BLOCO INTEIRO.
-- ============================================================

-- Campos originais do projeto
ALTER TABLE public.pq_projetos_atual
ADD COLUMN IF NOT EXISTS contexto_objetivo_original text;

ALTER TABLE public.pq_projetos_atual
ADD COLUMN IF NOT EXISTS resultados_esperados_original text;

ALTER TABLE public.pq_projetos_atual
ADD COLUMN IF NOT EXISTS impacto_original text;

ALTER TABLE public.pq_projetos_atual
ADD COLUMN IF NOT EXISTS resultados_alcancados_original text;

-- Recriar view de projetos
DROP VIEW IF EXISTS public.vw_pq_projetos_v245;

CREATE VIEW public.vw_pq_projetos_v245 AS
SELECT
    p.id,
    p.id_azure AS azure_id,
    p.projeto AS nome,
    p.status,
    p.data_inicio,
    p.data_fim,
    p.sponsor,
    p.esforco,
    p.prioridade,
    p.link_evidencias,
    p.contexto_objetivo_original,
    p.resultados_esperados_original,
    p.impacto_original,
    p.resultados_alcancados_original,
    p.ativo,
    p.created_at,
    p.updated_at
FROM public.pq_projetos_atual p
WHERE p.ativo = true;

GRANT SELECT ON public.vw_pq_projetos_v245 TO authenticated;

-- Recriar view de tarefas com descrição compatível
DROP VIEW IF EXISTS public.vw_pq_tarefas_v245;

CREATE VIEW public.vw_pq_tarefas_v245 AS
SELECT
    t.id,
    t.id_azure AS azure_id,
    p.id AS projeto_id,
    t.projeto AS projeto_nome,
    t.acao AS nome,
    t.status,
    t.data_inicio,
    t.data_fim,
    t.sponsor,
    t.link_evidencias,
    t.ativo,
    t.created_at,
    t.updated_at,
    t.acao AS descricao,
    'Tarefa'::text AS tipo
FROM public.pq_tarefas_atual t
LEFT JOIN public.pq_projetos_atual p
    ON lower(trim(p.projeto)) = lower(trim(t.projeto))
   AND p.ativo = true
WHERE t.ativo = true;

GRANT SELECT ON public.vw_pq_tarefas_v245 TO authenticated;

-- Conferência estrutural
SELECT
    'projetos' AS origem,
    count(*) AS total
FROM public.vw_pq_projetos_v245

UNION ALL

SELECT
    'tarefas',
    count(*)
FROM public.vw_pq_tarefas_v245;
