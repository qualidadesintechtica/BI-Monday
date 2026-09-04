-- 1. Indicadores usados no gráfico da amostra
SELECT
    monday_item_id,
    indicador_1,
    indicador_2,
    indicador_3,
    indicador_4,
    indicador_5,
    indicador_6,
    indicador_7
FROM public.monday_criterios_avaliacao_uas
ORDER BY synced_at DESC
LIMIT 100;

-- 2. Pareceres usados em Respostas dos professores / Padrões recorrentes
SELECT
    monday_item_id,
    nome_item,
    avaliador,
    numero_criterio,
    criterio_titulo,
    parecer,
    tipo_formulario,
    synced_at
FROM public.monday_criterios_pareceres
ORDER BY synced_at DESC
LIMIT 100;

-- 3. Histórico
SELECT *
FROM public.sync_log
ORDER BY created_at DESC
LIMIT 20;
