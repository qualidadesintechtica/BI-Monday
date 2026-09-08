-- ============================================================
-- BI MONDAY V23.6
-- Projeto Qualidade | Importação recorrente da planilha
-- Execute este BLOCO INTEIRO no SQL Editor.
-- ============================================================

-- 1. Campos adicionais seguros para atualização recorrente
ALTER TABLE public.pq_projetos
ADD COLUMN IF NOT EXISTS source_key text;

ALTER TABLE public.pq_projetos
ADD COLUMN IF NOT EXISTS id_azure text;

ALTER TABLE public.pq_projetos
ADD COLUMN IF NOT EXISTS projeto text;

ALTER TABLE public.pq_projetos
ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE public.pq_projetos
ADD COLUMN IF NOT EXISTS data_inicio date;

ALTER TABLE public.pq_projetos
ADD COLUMN IF NOT EXISTS data_fim date;

ALTER TABLE public.pq_projetos
ADD COLUMN IF NOT EXISTS sponsor text;

ALTER TABLE public.pq_projetos
ADD COLUMN IF NOT EXISTS esforco text;

ALTER TABLE public.pq_projetos
ADD COLUMN IF NOT EXISTS prioridade text;

ALTER TABLE public.pq_projetos
ADD COLUMN IF NOT EXISTS link_evidencias text;

ALTER TABLE public.pq_projetos
ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

ALTER TABLE public.pq_projetos
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();


ALTER TABLE public.pq_tarefas
ADD COLUMN IF NOT EXISTS source_key text;

ALTER TABLE public.pq_tarefas
ADD COLUMN IF NOT EXISTS id_azure text;

ALTER TABLE public.pq_tarefas
ADD COLUMN IF NOT EXISTS projeto text;

ALTER TABLE public.pq_tarefas
ADD COLUMN IF NOT EXISTS acao text;

ALTER TABLE public.pq_tarefas
ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE public.pq_tarefas
ADD COLUMN IF NOT EXISTS data_inicio date;

ALTER TABLE public.pq_tarefas
ADD COLUMN IF NOT EXISTS data_fim date;

ALTER TABLE public.pq_tarefas
ADD COLUMN IF NOT EXISTS sponsor text;

ALTER TABLE public.pq_tarefas
ADD COLUMN IF NOT EXISTS link_evidencias text;

ALTER TABLE public.pq_tarefas
ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

ALTER TABLE public.pq_tarefas
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();


-- 2. Histórico de importações
ALTER TABLE public.pq_importacoes
ADD COLUMN IF NOT EXISTS arquivo_nome text;

ALTER TABLE public.pq_importacoes
ADD COLUMN IF NOT EXISTS arquivo_tamanho bigint;

ALTER TABLE public.pq_importacoes
ADD COLUMN IF NOT EXISTS aba text;

ALTER TABLE public.pq_importacoes
ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE public.pq_importacoes
ADD COLUMN IF NOT EXISTS total_linhas integer DEFAULT 0;

ALTER TABLE public.pq_importacoes
ADD COLUMN IF NOT EXISTS projetos_inseridos integer DEFAULT 0;

ALTER TABLE public.pq_importacoes
ADD COLUMN IF NOT EXISTS projetos_atualizados integer DEFAULT 0;

ALTER TABLE public.pq_importacoes
ADD COLUMN IF NOT EXISTS tarefas_inseridas integer DEFAULT 0;

ALTER TABLE public.pq_importacoes
ADD COLUMN IF NOT EXISTS tarefas_atualizadas integer DEFAULT 0;

ALTER TABLE public.pq_importacoes
ADD COLUMN IF NOT EXISTS linhas_com_erro integer DEFAULT 0;

ALTER TABLE public.pq_importacoes
ADD COLUMN IF NOT EXISTS mensagem text;

ALTER TABLE public.pq_importacoes
ADD COLUMN IF NOT EXISTS importado_por uuid;

ALTER TABLE public.pq_importacoes
ADD COLUMN IF NOT EXISTS finished_at timestamptz;

ALTER TABLE public.pq_importacoes
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();


-- 3. Chaves para impedir duplicações nas próximas importações
CREATE UNIQUE INDEX IF NOT EXISTS uq_pq_projetos_source_key
ON public.pq_projetos (source_key)
WHERE source_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pq_tarefas_source_key
ON public.pq_tarefas (source_key)
WHERE source_key IS NOT NULL;


-- 4. Permissões de leitura pelo BI
ALTER TABLE public.pq_importacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pq importacoes leitura" ON public.pq_importacoes;

CREATE POLICY "pq importacoes leitura"
ON public.pq_importacoes
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON public.pq_projetos TO authenticated;
GRANT SELECT ON public.pq_tarefas TO authenticated;
GRANT SELECT ON public.pq_importacoes TO authenticated;


-- 5. Conferência
SELECT
  'pq_projetos' AS tabela,
  COUNT(*) AS registros
FROM public.pq_projetos

UNION ALL

SELECT
  'pq_tarefas',
  COUNT(*)
FROM public.pq_tarefas

UNION ALL

SELECT
  'pq_importacoes',
  COUNT(*)
FROM public.pq_importacoes;
