-- ============================================================
-- BI MONDAY V24.7
-- Projeto Qualidade | Compatibilidade de dados do relatório
-- Execute ESTE BLOCO INTEIRO no SQL Editor.
-- ============================================================

CREATE OR REPLACE VIEW public.vw_pq_tarefas_v245 AS
SELECT
    t.id,
    t.id_azure AS azure_id,
    p.id AS projeto_id,
    t.projeto AS projeto_nome,
    t.acao AS nome,
    t.acao AS descricao,
    'Tarefa'::text AS tipo,
    t.status,
    t.data_inicio,
    t.data_fim,
    t.sponsor,
    t.link_evidencias,
    t.ativo,
    t.created_at,
    t.updated_at
FROM public.pq_tarefas_atual t
LEFT JOIN public.pq_projetos_atual p
       ON lower(trim(p.projeto)) = lower(trim(t.projeto))
      AND p.ativo = true
WHERE t.ativo = true;

GRANT SELECT ON public.vw_pq_tarefas_v245 TO authenticated;

-- Conferência: deve trazer dados de projeto e tarefas.
SELECT
    p.id,
    p.azure_id,
    p.nome,
    p.status,
    p.sponsor,
    p.esforco,
    p.prioridade,
    count(t.id) AS tarefas
FROM public.vw_pq_projetos_v245 p
LEFT JOIN public.vw_pq_tarefas_v245 t
       ON t.projeto_id = p.id
GROUP BY
    p.id, p.azure_id, p.nome, p.status,
    p.sponsor, p.esforco, p.prioridade
ORDER BY p.nome
LIMIT 10;
