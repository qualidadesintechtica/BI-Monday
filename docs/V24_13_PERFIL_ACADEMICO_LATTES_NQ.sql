-- ============================================================
-- BI MONDAY V24.13 | NQ · Perfil Acadêmico / Currículo Lattes
-- Execute este BLOCO INTEIRO no SQL Editor do Supabase.
-- Depois publique novamente a Edge Function import-nq-especialistas.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.nq_especialistas_perfil_academico (
    especialista_id bigint PRIMARY KEY REFERENCES public.nq_especialistas(id) ON DELETE CASCADE,
    graduacao_1 text,
    graduacao_2 text,
    graduacao_3_mais text,
    especializacao_1 text,
    especializacao_2 text,
    especializacao_3_mais text,
    mestrado text,
    doutorado text,
    pos_doutorado text,
    titulacao_maxima_concluida text,
    titulacao_em_andamento text,
    experiencia_docente text,
    experiencia_profissional text,
    gestao_coordenacao text,
    pesquisa_grupos text,
    areas_atuacao text,
    destaques_observacoes text,
    status_verificacao text,
    fonte_complementar text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nq_especialistas_perfil_academico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nq perfil academico leitura" ON public.nq_especialistas_perfil_academico;
CREATE POLICY "nq perfil academico leitura"
ON public.nq_especialistas_perfil_academico
FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.nq_especialistas_perfil_academico TO authenticated;

ALTER TABLE public.nq_importacoes
ADD COLUMN IF NOT EXISTS perfis_lattes_gravados integer DEFAULT 0;

CREATE OR REPLACE VIEW public.vw_nq_perfil_academico AS
SELECT
    e.id AS especialista_id,
    e.professor,
    e.lattes,
    e.marca_area_contratante,
    e.marca_origem,
    e.titulacao_maxima,
    e.situacao_contratacao,
    p.graduacao_1,
    p.graduacao_2,
    p.graduacao_3_mais,
    p.especializacao_1,
    p.especializacao_2,
    p.especializacao_3_mais,
    p.mestrado,
    p.doutorado,
    p.pos_doutorado,
    p.titulacao_maxima_concluida,
    p.titulacao_em_andamento,
    p.experiencia_docente,
    p.experiencia_profissional,
    p.gestao_coordenacao,
    p.pesquisa_grupos,
    p.areas_atuacao,
    p.destaques_observacoes,
    p.status_verificacao,
    p.fonte_complementar,
    p.updated_at AS perfil_updated_at
FROM public.nq_especialistas e
LEFT JOIN public.nq_especialistas_perfil_academico p ON p.especialista_id = e.id
WHERE e.ativo = true;

GRANT SELECT ON public.vw_nq_perfil_academico TO authenticated;

CREATE OR REPLACE VIEW public.vw_nq_importacoes_resumo AS
SELECT
    id, arquivo_nome, status, total_linhas,
    especialistas_gravados, especialistas_novos, especialistas_atualizados,
    especialistas_inativados, formacoes_gravadas,
    COALESCE(perfis_lattes_gravados,0) AS perfis_lattes_gravados,
    linhas_com_erro, mensagem, created_at, finished_at
FROM public.nq_importacoes
ORDER BY created_at DESC;

GRANT SELECT ON public.vw_nq_importacoes_resumo TO authenticated;

SELECT 'V24.13 instalado' AS status,
       to_regclass('public.nq_especialistas_perfil_academico') AS tabela_perfil;
