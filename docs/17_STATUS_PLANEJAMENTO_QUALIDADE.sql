-- V25.46.56 | Alterar status no Planejamento e na mesma base do Projeto Qualidade.
-- Execute depois dos arquivos 15 e 16. Reaplicável.
begin;
create table if not exists public.bi_planejamento_qualidade_status_historico (
  id bigint generated always as identity primary key,
  qualidade_chave text not null,
  fonte_tipo text not null check (fonte_tipo in ('projeto','tarefa')),
  fonte_id bigint not null,
  antes jsonb not null,
  depois jsonb not null,
  usuario_id uuid not null,
  usuario_email text not null,
  criado_em timestamptz not null default now()
);
create index if not exists bi_planejamento_qualidade_status_chave
  on public.bi_planejamento_qualidade_status_historico(qualidade_chave,criado_em desc,id desc);
alter table public.bi_planejamento_qualidade_status_historico enable row level security;
drop policy if exists bi_planejamento_qualidade_status_leitura on public.bi_planejamento_qualidade_status_historico;
create policy bi_planejamento_qualidade_status_leitura on public.bi_planejamento_qualidade_status_historico
  for select to authenticated using (public.bi_planejamento_permitido());
revoke all on public.bi_planejamento_qualidade_status_historico from anon,authenticated;
grant select on public.bi_planejamento_qualidade_status_historico to authenticated;

create or replace function public.bi_planejamento_qualidade_alterar_status(
  p_tipo text,p_fonte_id bigint,p_chave text,p_status text,
  p_status_atual text,p_fonte_atualizada_em timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_antes jsonb; v_depois jsonb; v_status text; v_chave text; v_importacao text;
begin
  if not public.bi_planejamento_permitido() then raise exception 'Sessão institucional não autorizada.'; end if;
  if p_tipo is null or p_tipo not in ('projeto','tarefa') then raise exception 'Tipo de fonte inválido.'; end if;
  v_status:=case p_status when 'a_fazer' then 'A Fazer' when 'em_andamento' then 'Em Progresso'
    when 'bloqueada' then 'Pausado' when 'concluida' then 'Finalizado' else null end;
  if v_status is null then raise exception 'Status inválido.'; end if;

  select status into v_importacao from public.pq_importacoes_atual order by created_at desc,id desc limit 1;
  if v_importacao is not null and lower(trim(v_importacao))<>'concluida' then
    raise exception 'A importação de Projeto Qualidade está em processamento ou com erro. Aguarde uma importação concluída antes de alterar o status.';
  end if;
  if p_tipo='projeto' then
    select to_jsonb(p) into v_antes from public.pq_projetos_atual p where id=p_fonte_id for update;
  else
    select to_jsonb(t) into v_antes from public.pq_tarefas_atual t where id=p_fonte_id for update;
  end if;
  if v_antes is null or (v_antes->>'ativo')::boolean is false then
    raise exception 'O item não está mais ativo no Projeto Qualidade. Atualize o quadro.';
  end if;
  v_chave:=p_tipo||':'||coalesce(nullif(v_antes->>'source_key',''),
    case when nullif(v_antes->>'id_azure','') is not null then
      (case p_tipo when 'projeto' then 'P|' else 'T|' end)||(v_antes->>'id_azure')
      else 'base|'||(v_antes->>'id') end);
  if p_chave is distinct from v_chave then raise exception 'O vínculo do item mudou. Atualize o quadro.'; end if;
  if p_status_atual is distinct from v_antes->>'status'
     or p_fonte_atualizada_em is distinct from nullif(v_antes->>'updated_at','')::timestamptz then
    raise exception 'Este item foi atualizado pela equipe ou por uma importação. Atualize o quadro e tente novamente.';
  end if;
  if v_antes->>'status'=v_status then return v_antes; end if;
  if p_tipo='projeto' then
    update public.pq_projetos_atual p set status=v_status,updated_at=clock_timestamp()
      where id=p_fonte_id returning to_jsonb(p) into v_depois;
  else
    update public.pq_tarefas_atual t set status=v_status,updated_at=clock_timestamp()
      where id=p_fonte_id returning to_jsonb(t) into v_depois;
  end if;
  insert into public.bi_planejamento_qualidade_status_historico(qualidade_chave,fonte_tipo,fonte_id,antes,depois,usuario_id,usuario_email)
    values(v_chave,p_tipo,p_fonte_id,v_antes,v_depois,auth.uid(),lower(auth.jwt()->>'email'));
  return v_depois;
end;
$$;
revoke all on function public.bi_planejamento_qualidade_alterar_status(text,bigint,text,text,text,timestamptz) from public,anon;
grant execute on function public.bi_planejamento_qualidade_alterar_status(text,bigint,text,text,text,timestamptz) to authenticated;

-- Salvar status e acompanhamento no detalhe deve ser uma única transação.
create or replace function public.bi_planejamento_qualidade_acompanhar(
  p_chave text,p_id uuid,p_versao bigint,p_dados jsonb,p_tipo text,p_fonte_id bigint,
  p_status text,p_status_atual text,p_fonte_atualizada_em timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_fonte jsonb; v_anotacao public.bi_planejamento_tarefas;
begin
  v_fonte:=public.bi_planejamento_qualidade_alterar_status(p_tipo,p_fonte_id,p_chave,p_status,p_status_atual,p_fonte_atualizada_em);
  select * into v_anotacao from public.bi_planejamento_qualidade_salvar(p_chave,p_id,p_versao,p_dados);
  return jsonb_build_object('fonte',v_fonte,'anotacao',to_jsonb(v_anotacao));
end;
$$;
revoke all on function public.bi_planejamento_qualidade_acompanhar(text,uuid,bigint,jsonb,text,bigint,text,text,timestamptz) from public,anon;
grant execute on function public.bi_planejamento_qualidade_acompanhar(text,uuid,bigint,jsonb,text,bigint,text,text,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Status editável no Planejamento V25.46.56 instalado' as resultado;
