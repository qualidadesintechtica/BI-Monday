-- V25.46.64 | Status escolhidos no sistema sobrevivem à importação.
-- Execute inteiro no SQL Editor, depois dos SQLs 15, 16 e 17.
-- Reaplicável. Mantém os dados originais da planilha e o histórico.
begin;

create table if not exists public.bi_planejamento_qualidade_status_ajustes (
  qualidade_chave text primary key,
  fonte_tipo text not null check (fonte_tipo in ('projeto','tarefa')),
  status text not null check (status in ('A Fazer','Em Progresso','Pausado','Finalizado')),
  usuario_id uuid not null,
  usuario_email text not null,
  atualizado_em timestamptz not null default now()
);
alter table public.bi_planejamento_qualidade_status_ajustes enable row level security;
drop policy if exists bi_planejamento_status_ajustes_leitura on public.bi_planejamento_qualidade_status_ajustes;
create policy bi_planejamento_status_ajustes_leitura on public.bi_planejamento_qualidade_status_ajustes
  for select to authenticated using (public.bi_planejamento_permitido());
revoke all on public.bi_planejamento_qualidade_status_ajustes from public,anon,authenticated;
grant select on public.bi_planejamento_qualidade_status_ajustes to authenticated;

-- Recupera a última escolha registrada, inclusive quando uma planilha a desfez.
-- A chave estável também é utilizada para anotações e arquivamento.
insert into public.bi_planejamento_qualidade_status_ajustes
  (qualidade_chave,fonte_tipo,status,usuario_id,usuario_email,atualizado_em)
select distinct on (qualidade_chave) qualidade_chave,fonte_tipo,depois->>'status',usuario_id,usuario_email,criado_em
from public.bi_planejamento_qualidade_status_historico
where depois->>'status' in ('A Fazer','Em Progresso','Pausado','Finalizado')
order by qualidade_chave,criado_em desc,id desc
on conflict (qualidade_chave) do nothing;

-- Decisões anteriores de atualizar tarefas pelo release também são preservadas.
do $$
begin
  if to_regclass('public.pq_tarefas_status_auditoria') is not null then
    execute $sql$
      insert into public.bi_planejamento_qualidade_status_ajustes
        (qualidade_chave,fonte_tipo,status,usuario_id,usuario_email,atualizado_em)
      select distinct on (t.id) 'tarefa:'||coalesce(nullif(to_jsonb(t)->>'source_key',''),
        case when nullif(to_jsonb(t)->>'id_azure','') is not null then 'T|'||(to_jsonb(t)->>'id_azure') else 'base|'||(to_jsonb(t)->>'id') end),
        'tarefa',a.status_novo,a.alterado_por,a.alterado_por_email,a.alterado_em
      from public.pq_tarefas_status_auditoria a join public.pq_tarefas_atual t
        on to_jsonb(t)->>'id'=a.tarefa_id::text
      where a.status_novo in ('A Fazer','Em Progresso','Pausado','Finalizado')
        and a.alterado_por is not null and a.alterado_por_email is not null
      order by t.id,a.alterado_em desc,a.id desc
      on conflict (qualidade_chave) do update
        set status=excluded.status,usuario_id=excluded.usuario_id,
          usuario_email=excluded.usuario_email,atualizado_em=excluded.atualizado_em
        where excluded.atualizado_em>public.bi_planejamento_qualidade_status_ajustes.atualizado_em
    $sql$;
  end if;
end;
$$;

create or replace function public.bi_planejamento_preservar_status_qualidade()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_tipo text:=TG_ARGV[0]; v_fonte jsonb:=to_jsonb(new); v_chave text; v_status text;
begin
  v_chave:=v_tipo||':'||coalesce(nullif(v_fonte->>'source_key',''),
    case when nullif(v_fonte->>'id_azure','') is not null then
      (case v_tipo when 'projeto' then 'P|' else 'T|' end)||(v_fonte->>'id_azure')
      else 'base|'||(v_fonte->>'id') end);
  -- As funções autenticadas continuam validando sessão, versão e vínculo.
  -- A importação usa service_role e nunca substitui uma escolha da equipe.
  if TG_OP='UPDATE' and old.status is distinct from new.status
     and public.bi_planejamento_permitido()
     and coalesce(auth.jwt()->>'role','')<>'service_role' then
    if new.status not in ('A Fazer','Em Progresso','Pausado','Finalizado') or new.status is null then
      raise exception 'Status de acompanhamento inválido.';
    end if;
    insert into public.bi_planejamento_qualidade_status_ajustes
      (qualidade_chave,fonte_tipo,status,usuario_id,usuario_email,atualizado_em)
    values (v_chave,v_tipo,new.status,auth.uid(),lower(auth.jwt()->>'email'),clock_timestamp())
    on conflict (qualidade_chave) do update
      set status=excluded.status,usuario_id=excluded.usuario_id,
        usuario_email=excluded.usuario_email,atualizado_em=excluded.atualizado_em;
  else
    select status into v_status from public.bi_planejamento_qualidade_status_ajustes
      where qualidade_chave=v_chave and fonte_tipo=v_tipo;
    if found then new.status:=v_status; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.bi_planejamento_preservar_status_qualidade() from public,anon,authenticated;
drop trigger if exists bi_planejamento_status_persistente on public.pq_projetos_atual;
create trigger bi_planejamento_status_persistente before insert or update on public.pq_projetos_atual
  for each row execute function public.bi_planejamento_preservar_status_qualidade('projeto');
drop trigger if exists bi_planejamento_status_persistente on public.pq_tarefas_atual;
create trigger bi_planejamento_status_persistente before insert or update on public.pq_tarefas_atual
  for each row execute function public.bi_planejamento_preservar_status_qualidade('tarefa');

-- Reconciliamos somente o status atual; snapshots de relatórios ficam intactos.
update public.pq_projetos_atual p set status=a.status,updated_at=clock_timestamp()
from public.bi_planejamento_qualidade_status_ajustes a
where a.fonte_tipo='projeto' and p.ativo=true and p.status is distinct from a.status
  and a.qualidade_chave='projeto:'||coalesce(nullif(to_jsonb(p)->>'source_key',''),
    case when nullif(to_jsonb(p)->>'id_azure','') is not null then 'P|'||(to_jsonb(p)->>'id_azure') else 'base|'||(to_jsonb(p)->>'id') end);
update public.pq_tarefas_atual t set status=a.status,updated_at=clock_timestamp()
from public.bi_planejamento_qualidade_status_ajustes a
where a.fonte_tipo='tarefa' and t.ativo=true and t.status is distinct from a.status
  and a.qualidade_chave='tarefa:'||coalesce(nullif(to_jsonb(t)->>'source_key',''),
    case when nullif(to_jsonb(t)->>'id_azure','') is not null then 'T|'||(to_jsonb(t)->>'id_azure') else 'base|'||(to_jsonb(t)->>'id') end);

create or replace function public.bi_planejamento_qualidade_status_disponivel()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.bi_planejamento_permitido() then raise exception 'Sessão institucional não autorizada.'; end if;
  return jsonb_build_object('ok',true,'versao','25.46.64');
end;
$$;
revoke all on function public.bi_planejamento_qualidade_status_disponivel() from public,anon;
grant execute on function public.bi_planejamento_qualidade_status_disponivel() to authenticated;

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
  if p_tipo='projeto' then
    select to_jsonb(p) into v_depois from public.pq_projetos_atual p where id=p_fonte_id;
  else
    select to_jsonb(t) into v_depois from public.pq_tarefas_atual t where id=p_fonte_id;
  end if;
  if v_depois->>'status' is distinct from v_status then
    raise exception 'O banco não manteve o status solicitado. Nenhuma alteração foi confirmada.';
  end if;
  insert into public.bi_planejamento_qualidade_status_historico(qualidade_chave,fonte_tipo,fonte_id,antes,depois,usuario_id,usuario_email)
    values(v_chave,p_tipo,p_fonte_id,v_antes,v_depois,auth.uid(),lower(auth.jwt()->>'email'));
  return v_depois;
end;
$$;
revoke all on function public.bi_planejamento_qualidade_alterar_status(text,bigint,text,text,text,timestamptz) from public,anon;
grant execute on function public.bi_planejamento_qualidade_alterar_status(text,bigint,text,text,text,timestamptz) to authenticated;


notify pgrst,'reload schema';
commit;
select 'Persistência de status V25.46.64 instalada' as resultado;
