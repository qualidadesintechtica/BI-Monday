-- =============================================================
-- BI-Monday V25.28 · DIAGNÓSTICO LEVE
-- Execute SOMENTE depois de completar um ciclo da Esteira.
-- Não usa to_jsonb(e)::text.
-- =============================================================

SELECT
  board_id,
  board_name,
  em_ciclo,
  paginas_processadas,
  itens_processados,
  ultimo_ciclo_concluido_em,
  atualizado_em
FROM public.monday_sync_state
WHERE board_id IN (9433297929, 9376982027)
ORDER BY board_id;

SELECT
  COUNT(*) AS total_esteira,
  MAX(sincronizado_em) AS ultima_sincronizacao
FROM public.monday_esteira_producao;

SELECT
  monday_item_id,
  monday_group_title,
  titulo,
  titulo_ua,
  id_titulo,
  id_ua,
  sincronizado_em
FROM public.monday_esteira_producao
WHERE COALESCE(titulo, '') ILIKE '%contabilidade%'
   OR COALESCE(titulo_ua, '') ILIKE '%contabilidade%'
   OR COALESCE(item_name, '') ILIKE '%contabilidade%'
   OR COALESCE(monday_group_title, '') ILIKE '%contabilidade%'
ORDER BY sincronizado_em DESC NULLS LAST
LIMIT 50;

SELECT
  tipo_operacao,
  id_titulo,
  id_ua,
  titulo,
  titulo_ua,
  status_validacao
FROM public.vw_operacao_materiais_completa
WHERE COALESCE(titulo, '') ILIKE '%contabilidade%'
   OR COALESCE(titulo_ua, '') ILIKE '%contabilidade%'
   OR COALESCE(item_name, '') ILIKE '%contabilidade%'
ORDER BY id_titulo, id_ua NULLS FIRST
LIMIT 100;
