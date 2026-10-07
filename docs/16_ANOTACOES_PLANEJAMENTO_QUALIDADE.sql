-- V25.46.54 | Anotações do Planejamento vinculadas à base de Projeto Qualidade.
-- Execute depois de 15_INSTALAR_PLANEJAMENTO.sql. Reaplicável, sem alterar o PQ.
begin;
alter table public.bi_planejamento_tarefas add column if not exists qualidade_chave text;
create unique index if not exists bi_planejamento_qualidade_unica
  on public.bi_planejamento_tarefas(qualidade_chave) where qualidade_chave is not null;

create or replace function public.bi_planejamento_qualidade_salvar(
  p_chave text,p_id uuid,p_versao bigint,p_dados jsonb
) returns public.bi_planejamento_tarefas
language plpgsql security definer set search_path = '' as $$
declare v_existente public.bi_planejamento_tarefas; v_novo public.bi_planejamento_tarefas;
begin
  if not public.bi_planejamento_permitido() then raise exception 'Sessão institucional não autorizada.'; end if;
  if coalesce(length(p_chave),0) not between 1 and 2000
     or (p_chave not like 'projeto:%' and p_chave not like 'tarefa:%') then
    raise exception 'Referência de Projeto Qualidade inválida.';
  end if;
  -- Serializa o primeiro salvamento por projeto entre membros da equipe.
  perform pg_advisory_xact_lock(hashtextextended(p_chave,0));
  select * into v_existente from public.bi_planejamento_tarefas where qualidade_chave=p_chave for update;
  if found then
    if p_id is distinct from v_existente.id or p_versao is distinct from v_existente.versao then
      raise exception 'As anotações deste projeto foram alteradas pela equipe. Atualize o quadro e reabra o cartão antes de salvar.';
    end if;
  elsif p_id is not null then
    raise exception 'Anotações do projeto não localizadas. Atualize o quadro.';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(p_dados->'vinculos','[]'::jsonb)) r
    where r->'dados'->>'qualidade_chave'=p_chave and r->>'pagina'='projeto-qualidade'
  ) then raise exception 'Mantenha o vínculo com o Projeto Qualidade.'; end if;
  -- Status, prazo e sponsor do projeto são lidos da fonte; este registro guarda
  -- apenas atenção, anotações, passos adicionais, vínculos e seu histórico.
  select * into v_novo from public.bi_planejamento_salvar(p_id,p_versao,
    p_dados || jsonb_build_object('status','a_fazer'));
  update public.bi_planejamento_tarefas set qualidade_chave=p_chave where id=v_novo.id returning * into v_novo;
  return v_novo;
end;
$$;
revoke all on function public.bi_planejamento_qualidade_salvar(text,uuid,bigint,jsonb) from public,anon;
grant execute on function public.bi_planejamento_qualidade_salvar(text,uuid,bigint,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Anotações de Projeto Qualidade V25.46.54 instaladas' as resultado;
