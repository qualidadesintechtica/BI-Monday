-- ============================================================
-- BI MONDAY V24.9
-- PROJETO QUALIDADE COMPLETO
-- Datas + todas as colunas quando existirem + Sponsors e variações
-- Execute ESTE BLOCO INTEIRO no Supabase > SQL Editor.
-- ============================================================

-- PROJETOS
ALTER TABLE public.pq_projetos_atual
ADD COLUMN IF NOT EXISTS work_item_type text,
ADD COLUMN IF NOT EXISTS contexto_objetivo_original text,
ADD COLUMN IF NOT EXISTS resultados_esperados_original text,
ADD COLUMN IF NOT EXISTS acoes_tarefas_original text,
ADD COLUMN IF NOT EXISTS sponsor_lista text[] DEFAULT ARRAY[]::text[],
ADD COLUMN IF NOT EXISTS impacto_original text,
ADD COLUMN IF NOT EXISTS resultados_alcancados_original text,
ADD COLUMN IF NOT EXISTS operacoes_ead text,
ADD COLUMN IF NOT EXISTS aba_origem text,
ADD COLUMN IF NOT EXISTS dados_origem jsonb NOT NULL DEFAULT '{}'::jsonb;

-- TAREFAS
ALTER TABLE public.pq_tarefas_atual
ADD COLUMN IF NOT EXISTS work_item_type text,
ADD COLUMN IF NOT EXISTS contexto_objetivo_original text,
ADD COLUMN IF NOT EXISTS resultados_esperados_original text,
ADD COLUMN IF NOT EXISTS acoes_tarefas_original text,
ADD COLUMN IF NOT EXISTS sponsor_lista text[] DEFAULT ARRAY[]::text[],
ADD COLUMN IF NOT EXISTS esforco text,
ADD COLUMN IF NOT EXISTS prioridade text,
ADD COLUMN IF NOT EXISTS impacto_original text,
ADD COLUMN IF NOT EXISTS resultados_alcancados_original text,
ADD COLUMN IF NOT EXISTS operacoes_ead text,
ADD COLUMN IF NOT EXISTS aba_origem text,
ADD COLUMN IF NOT EXISTS dados_origem jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Recriar view de projetos com todas as informações.
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
    p.updated_at,
    p.work_item_type,
    p.acoes_tarefas_original,
    p.sponsor_lista,
    p.operacoes_ead,
    p.aba_origem,
    p.dados_origem
FROM public.pq_projetos_atual p
WHERE p.ativo = true;

GRANT SELECT ON public.vw_pq_projetos_v245 TO authenticated;

-- Recriar view de tarefas.
DROP VIEW IF EXISTS public.vw_pq_tarefas_v245;

CREATE VIEW public.vw_pq_tarefas_v245 AS
SELECT
    t.id,
    t.id_azure AS azure_id,
    p.id AS projeto_id,
    t.projeto AS projeto_nome,
    t.acao AS nome,
    t.acao AS descricao,
    COALESCE(t.work_item_type, 'Tarefa') AS tipo,
    t.status,
    t.data_inicio,
    t.data_fim,
    t.sponsor,
    t.link_evidencias,
    t.ativo,
    t.created_at,
    t.updated_at,
    t.work_item_type,
    t.contexto_objetivo_original,
    t.resultados_esperados_original,
    t.acoes_tarefas_original,
    t.sponsor_lista,
    t.esforco,
    t.prioridade,
    t.impacto_original,
    t.resultados_alcancados_original,
    t.operacoes_ead,
    t.aba_origem,
    t.dados_origem
FROM public.pq_tarefas_atual t
LEFT JOIN public.pq_projetos_atual p
       ON lower(trim(p.projeto)) = lower(trim(t.projeto))
      AND p.ativo = true
WHERE t.ativo = true;

GRANT SELECT ON public.vw_pq_tarefas_v245 TO authenticated;

-- Conferência
SELECT
  (SELECT count(*) FROM public.vw_pq_projetos_v245) AS projetos,
  (SELECT count(*) FROM public.vw_pq_tarefas_v245) AS tarefas;
