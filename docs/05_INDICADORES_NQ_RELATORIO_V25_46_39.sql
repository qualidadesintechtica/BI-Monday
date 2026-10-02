-- ============================================================
-- V25.46.39 | PROJETO QUALIDADE | SNAPSHOT DE INDICADORES NQ
-- Execute UMA VEZ no Supabase > SQL Editor.
-- Não altera versões existentes nem a função pq_salvar_edicao.
-- ============================================================

alter table public.pq_projetos_edicoes
  add column if not exists indicadores_nq jsonb not null default '{}'::jsonb;

comment on column public.pq_projetos_edicoes.indicadores_nq is
  'Fotografia imutável dos indicadores NQ incluída no relatório desta versão.';

create or replace function public.pq_salvar_indicadores_nq(
  p_edicao_id bigint,
  p_indicadores jsonb
)
returns public.pq_projetos_edicoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_reg public.pq_projetos_edicoes;
begin
  if v_user is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if v_email not like '%@animaeducacao.com.br' then
    raise exception 'Domínio institucional não autorizado.';
  end if;

  -- Snapshot write-once: só pode ser anexado à versão recém-criada,
  -- pelo próprio usuário e enquanto o campo ainda está vazio.
  update public.pq_projetos_edicoes
     set indicadores_nq = coalesce(p_indicadores, '{}'::jsonb)
   where id = p_edicao_id
     and criado_por = v_user
     and criado_em >= now() - interval '10 minutes'
     and coalesce(indicadores_nq, '{}'::jsonb) = '{}'::jsonb
  returning * into v_reg;

  if v_reg.id is null then
    raise exception 'Snapshot não gravado: versão inexistente, antiga, de outro usuário ou já protegida.';
  end if;

  return v_reg;
end;
$$;

revoke all on function public.pq_salvar_indicadores_nq(bigint,jsonb) from public;
grant execute on function public.pq_salvar_indicadores_nq(bigint,jsonb) to authenticated;

grant select on public.pq_projetos_edicoes to authenticated;

select
  to_regclass('public.pq_projetos_edicoes') as tabela,
  exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'pq_projetos_edicoes'
       and column_name = 'indicadores_nq'
  ) as coluna_indicadores_nq,
  to_regprocedure('public.pq_salvar_indicadores_nq(bigint,jsonb)') as funcao_snapshot;
