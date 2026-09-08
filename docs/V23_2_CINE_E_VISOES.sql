-- BI MONDAY V23.2 | NQ Formação e CINE
-- Execute o BLOCO INTEIRO no SQL Editor.

INSERT INTO public.nq_areas_cine
(formacao_normalizada, area_cine, subarea_cine)
VALUES
('FÍSICA','05 · Ciências naturais, matemática e estatística','Física'),
('MATEMÁTICA','05 · Ciências naturais, matemática e estatística','Matemática'),
('DIREITO','04 · Negócios, administração e direito','Direito'),
('PSICOLOGIA','03 · Ciências sociais, comunicação e informação','Psicologia'),
('ENFERMAGEM','09 · Saúde e bem-estar','Enfermagem'),
('BIOLOGIA','05 · Ciências naturais, matemática e estatística','Biologia'),
('BIOMEDICINA','09 · Saúde e bem-estar','Biomedicina'),
('MEDICINA VETERINÁRIA','08 · Agricultura, silvicultura, pesca e veterinária','Veterinária'),
('SISTEMAS DE INFORMAÇÃO','06 · Computação e Tecnologias da Informação e Comunicação (TIC)','Sistemas de informação'),
('ARQUITETURA E URBANISMO','07 · Engenharia, produção e construção','Arquitetura e urbanismo'),
('ENGENHARIA CIVIL','07 · Engenharia, produção e construção','Engenharia civil'),
('ADMINISTRAÇÃO','04 · Negócios, administração e direito','Administração'),
('CIÊNCIAS CONTÁBEIS','04 · Negócios, administração e direito','Contabilidade e tributação'),
('SERVIÇO SOCIAL','09 · Saúde e bem-estar','Serviço social'),
('COMUNICAÇÃO SOCIAL - JORNALISMO','03 · Ciências sociais, comunicação e informação','Jornalismo e reportagem'),
('FISIOTERAPIA','09 · Saúde e bem-estar','Fisioterapia'),
('ENGENHARIA DE CONTROLE E AUTOMAÇÃO','07 · Engenharia, produção e construção','Eletrônica e automação'),
('GESTÃO COMERCIAL','04 · Negócios, administração e direito','Gestão e administração'),
('TECNOLOGIA EM INFORMÁTICA','06 · Computação e Tecnologias da Informação e Comunicação (TIC)','Tecnologias da Informação e Comunicação'),
('GESTÃO DA INFORMAÇÃO','03 · Ciências sociais, comunicação e informação','Biblioteconomia, informação e estudos arquivísticos'),
('FONOAUDIOLOGIA','09 · Saúde e bem-estar','Fonoaudiologia'),
('TURISMO','10 · Serviços','Viagens, turismo e lazer'),
('PEDAGOGIA','01 · Educação','Ciência da educação')
ON CONFLICT (formacao_normalizada)
DO UPDATE SET area_cine=EXCLUDED.area_cine, subarea_cine=EXCLUDED.subarea_cine, updated_at=now();

UPDATE public.nq_especialistas_formacoes f
SET area_cine=c.area_cine, area_formacao=c.subarea_cine, updated_at=now()
FROM public.nq_areas_cine c
WHERE upper(trim(f.formacao))=upper(trim(c.formacao_normalizada));

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
c.subarea_cine
FROM public.nq_especialistas e
LEFT JOIN public.nq_especialistas_formacoes f ON f.especialista_id=e.id
LEFT JOIN public.nq_areas_cine c ON upper(trim(f.formacao))=upper(trim(c.formacao_normalizada))
WHERE e.ativo=true;

GRANT SELECT ON public.vw_nq_especialistas_formacoes TO authenticated;

CREATE OR REPLACE VIEW public.vw_nq_cobertura_especialistas AS
SELECT
e.id AS especialista_id,
e.professor,
e.marca_area_contratante,
e.titulacao_maxima,
e.situacao_contratacao,
COUNT(f.id) AS total_formacoes,
COUNT(DISTINCT upper(trim(f.formacao))) AS formacoes_distintas,
COUNT(DISTINCT COALESCE(f.area_formacao,c.subarea_cine)) AS areas_formacao_distintas,
COUNT(DISTINCT COALESCE(f.area_cine,c.area_cine)) AS areas_cine_distintas
FROM public.nq_especialistas e
LEFT JOIN public.nq_especialistas_formacoes f ON f.especialista_id=e.id
LEFT JOIN public.nq_areas_cine c ON upper(trim(f.formacao))=upper(trim(c.formacao_normalizada))
WHERE e.ativo=true
GROUP BY e.id,e.professor,e.marca_area_contratante,e.titulacao_maxima,e.situacao_contratacao;

GRANT SELECT ON public.vw_nq_cobertura_especialistas TO authenticated;

UPDATE public.nq_importacoes
SET status='erro',
    mensagem=COALESCE(mensagem,'Tentativa anterior encerrada após falha de processamento.'),
    finished_at=COALESCE(finished_at,now())
WHERE status='processando'
  AND created_at < now() - interval '5 minutes';

SELECT formacao_normalizada, area_cine, subarea_cine
FROM public.nq_areas_cine
ORDER BY area_cine, formacao_normalizada;
