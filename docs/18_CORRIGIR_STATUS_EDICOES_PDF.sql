-- ============================================================
-- V25.46.57 | PROJETO QUALIDADE | STATUS DAS VERSÕES E PDF
-- Execute este arquivo inteiro no Supabase > SQL Editor.
-- Corrige a regra antiga que impede enviar para revisão ou aprovar.
-- Não altera conteúdo, status ou auditoria das versões existentes.
-- Pode ser executado novamente.
-- Pré-requisitos: editor (SQL 03) e fluxo de aprovação (SQL 08).
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.pq_projetos_edicoes') is null then
    raise exception 'O editor não está instalado. Instale o SQL 03 e o SQL 08 antes desta correção.';
  end if;
end;
$$;

-- As funções do fluxo usam estes três valores canônicos.
-- A regra anterior pode aceitar nomes incompatíveis, como "finalizado".
alter table public.pq_projetos_edicoes
  drop constraint if exists pq_projetos_edicoes_status_edicao_check;

-- NOT VALID preserva eventuais valores históricos de instalações antigas.
-- A regra já é aplicada a TODAS as novas inserções e atualizações.
alter table public.pq_projetos_edicoes
  add constraint pq_projetos_edicoes_status_edicao_check
  check (status_edicao in ('rascunho', 'em_revisao', 'finalizada'))
  not valid;

-- Valida também o histórico quando ele já usa o vocabulário atual.
-- Se houver status antigos, mantém essas versões exatamente como estão.
do $$
begin
  if not exists (
    select 1 from public.pq_projetos_edicoes
    where status_edicao is not null
      and status_edicao not in ('rascunho', 'em_revisao', 'finalizada')
  ) then
    alter table public.pq_projetos_edicoes
      validate constraint pq_projetos_edicoes_status_edicao_check;
  else
    raise notice 'Correção aplicada. Versões com status antigos foram preservadas; a regra atual já protege novas gravações.';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;

select
  c.conname as regra_status,
  pg_get_constraintdef(c.oid) as valores_permitidos,
  c.convalidated as historico_inteiro_validado,
  'Correção aplicada. Recarregue o site e tente Aprovar e gerar PDF novamente.' as orientacao
from pg_constraint c
where c.conrelid = 'public.pq_projetos_edicoes'::regclass
  and c.conname = 'pq_projetos_edicoes_status_edicao_check';
