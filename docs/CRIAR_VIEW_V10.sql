CREATE OR REPLACE VIEW public.vw_materiais_bi_consolidada AS
WITH validacao_unica AS (
    SELECT DISTINCT ON (
        TRIM(id_titulo),
        TRIM(id_ua)
    )
        TRIM(id_titulo) AS id_titulo,
        TRIM(id_ua) AS id_ua,
        monday_item_id,
        monday_group_title,
        titulo AS titulo_validacao,
        status_validacao,
        revisor_validador,
        gestor_validacao_nq,
        bloco AS bloco_validacao,
        esteira AS esteira_validacao,
        data_liberacao_validacao,
        data_validacao,
        sincronizado_em AS sincronizado_validacao
    FROM public.monday_validacao_materiais
    WHERE id_titulo IS NOT NULL
      AND TRIM(id_titulo) <> ''
      AND id_ua IS NOT NULL
      AND TRIM(id_ua) <> ''
    ORDER BY
        TRIM(id_titulo),
        TRIM(id_ua),
        sincronizado_em DESC NULLS LAST,
        monday_item_id DESC
)
SELECT
    p.chave_material,
    CASE
        WHEN p.categoria_material = 'Unidade de Aprendizagem'
         AND p.id_titulo IS NOT NULL AND TRIM(p.id_titulo) <> ''
         AND p.id_ua IS NOT NULL AND TRIM(p.id_ua) <> ''
        THEN TRIM(p.id_titulo) || '|' || TRIM(p.id_ua)
        ELSE NULL
    END AS chave_ua,
    p.id_titulo,
    p.id_ua,
    p.item_name,
    p.titulo,
    p.titulo_ua,
    p.esteira_producao,
    p.matriz_oferta,
    p.bloco,
    p.categoria_material,
    p.escopo,
    p.formato,
    p.area_cine,
    p.semestre_oferta,
    p.produtora,
    p.gestor_validacao_nq AS gestor_planejado,
    p.docente_conteudista,
    p.previsao_liberacao_validacao,
    v.monday_item_id AS monday_item_validacao,
    v.monday_group_title,
    v.status_validacao,
    v.revisor_validador,
    COALESCE(v.gestor_validacao_nq, p.gestor_validacao_nq) AS gestor_validacao_nq,
    v.data_liberacao_validacao,
    v.data_validacao,
    (v.id_ua IS NOT NULL) AS foi_liberada,
    (v.id_ua IS NULL) AS nao_liberada,
    (v.status_validacao = 'Validado') AS eh_validada,
    (v.status_validacao IN ('Liberado para validação - NQ', 'Revalidar - NQ')) AS eh_nq,
    (v.status_validacao IN (
        'Ajustes - CONTEUDISTA E DA',
        'Ajustes - MODELAGEM',
        'Ajustes - GERÊNCIA DE TECNOLOGIA'
    )) AS eh_ajuste,
    (p.categoria_material = 'Unidade de Aprendizagem') AS eh_ua,
    p.sincronizado_em AS sincronizado_esteira,
    v.sincronizado_validacao
FROM public.vw_materiais_planejados p
LEFT JOIN validacao_unica v
    ON p.id_titulo IS NOT NULL
   AND p.id_ua IS NOT NULL
   AND TRIM(p.id_titulo) = v.id_titulo
   AND TRIM(p.id_ua) = v.id_ua;

-- Conferência das categorias disponíveis para o filtro:
SELECT
    categoria_material,
    COUNT(*) AS quantidade
FROM public.vw_materiais_bi_consolidada
GROUP BY categoria_material
ORDER BY quantidade DESC;
