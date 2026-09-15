-- BI-Monday V25.22 | Datas de contratação + filtros de especialistas
-- Execute UMA VEZ no SQL Editor do Supabase antes de reimportar a planilha.

ALTER TABLE public.nq_especialistas
  ADD COLUMN IF NOT EXISTS data_inicio date,
  ADD COLUMN IF NOT EXISTS data_saida date;

-- Mantém a ordem das colunas existentes da view e acrescenta os novos campos ao final.
CREATE OR REPLACE VIEW public.vw_nq_especialistas_formacoes AS
SELECT
  e.id AS especialista_id,
  e.professor,
  e.marca_area_contratante,
  e.marca_origem,
  e.titulacao_maxima,
  e.semestre_entrada_nq,
  e.situacao_contratacao,
  e.regime_contratacao,
  e.carga_horaria,
  f.id AS formacao_id,
  f.formacao,
  COALESCE(f.area_formacao,c.subarea_cine) AS area_formacao,
  COALESCE(f.area_cine,c.area_cine) AS area_cine,
  c.subarea_cine,
  e.data_inicio,
  e.data_saida,
  e.ativo
FROM public.nq_especialistas e
LEFT JOIN public.nq_especialistas_formacoes f ON f.especialista_id=e.id
LEFT JOIN public.nq_areas_cine c ON upper(trim(f.formacao))=upper(trim(c.formacao_normalizada))
WHERE e.ativo=true;

GRANT SELECT ON public.vw_nq_especialistas_formacoes TO authenticated;

-- Conferência após reimportar a planilha:
SELECT
  COUNT(DISTINCT especialista_id) AS especialistas,
  COUNT(DISTINCT especialista_id) FILTER (WHERE upper(coalesce(situacao_contratacao,''))='ATIVO') AS ativos,
  COUNT(DISTINCT especialista_id) FILTER (WHERE upper(coalesce(situacao_contratacao,''))='INATIVO') AS inativos,
  COUNT(DISTINCT especialista_id) FILTER (WHERE data_inicio IS NOT NULL) AS com_data_inicio,
  COUNT(DISTINCT especialista_id) FILTER (WHERE data_saida IS NOT NULL) AS com_data_saida
FROM public.vw_nq_especialistas_formacoes;
