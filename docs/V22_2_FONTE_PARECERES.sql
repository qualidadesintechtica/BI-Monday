-- Conferência da fonte usada pela V22.2
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

-- Histórico das sincronizações
SELECT
    id,
    rotina,
    status,
    itens_lidos,
    itens_gravados,
    erros,
    mensagem,
    created_at
FROM public.sync_log
ORDER BY created_at DESC
LIMIT 20;
