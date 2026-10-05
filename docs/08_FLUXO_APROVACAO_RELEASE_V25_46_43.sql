-- ============================================================
-- V25.46.43 | PROJETO QUALIDADE | FLUXO DE APROVAÇÃO DO RELEASE
-- Rascunho -> Em revisão -> Finalizado
-- Execute UMA VEZ no Supabase > SQL Editor.
-- Preserva todas as versões existentes.
-- ============================================================

alter table public.pq_projetos_edicoes
  add column if not exists enviado_revisao_em timestamptz,
  add column if not exists enviado_revisao_por uuid,
  add column if not exists enviado_revisao_por_email text,
  add column if not exists finalizado_em timestamptz,
  add column if not exists finalizado_por uuid,
  add column if not exists finalizado_por_email text;

comment on column public.pq_projetos_edicoes.enviado_revisao_em is
  'Data/hora em que a versão entrou no estado Em revisão.';
comment on column public.pq_projetos_edicoes.finalizado_em is
  'Data/hora em que a versão foi aprovada e finalizada.';

create index if not exists idx_pq_edicoes_workflow
  on public.pq_projetos_edicoes (projeto_id, status_edicao, versao desc);

-- Check leve usado pelo front-end.
create or replace function public.pq_release_workflow_disponivel()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'versao', '25.46.43',
    'fluxo', jsonb_build_array('rascunho', 'em_revisao', 'finalizada')
  );
$$;

revoke all on function public.pq_release_workflow_disponivel() from public;
grant execute on function public.pq_release_workflow_disponivel() to authenticated;

-- Cria uma NOVA versão como Rascunho ou já a envia diretamente para revisão.
-- Versões finalizadas nunca são criadas diretamente: precisam passar por revisão.
create or replace function public.pq_salvar_edicao_workflow(
  p_projeto_id bigint,
  p_contexto_objetivo text,
  p_resultados_esperados text,
  p_acoes_complementares text,
  p_resultados_alcancados text,
  p_impacto text,
  p_observacoes text,
  p_evidencias jsonb,
  p_status_edicao text default 'rascunho'
)
returns public.pq_projetos_edicoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_status text := lower(trim(coalesce(p_status_edicao, 'rascunho')));
  v_versao integer;
  v_origem jsonb;
  v_reg public.pq_projetos_edicoes;
begin
  if v_user is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if v_email not like '%@animaeducacao.com.br' then
    raise exception 'Domínio institucional não autorizado.';
  end if;

  if v_status in ('em revisao', 'em-revisao', 'revisao') then
    v_status := 'em_revisao';
  end if;

  if v_status not in ('rascunho', 'em_revisao') then
    raise exception 'Status de criação inválido. Use rascunho ou em_revisao.';
  end if;

  if not exists (
    select 1
      from public.pq_projetos_atual
     where id = p_projeto_id
       and ativo = true
  ) then
    raise exception 'Projeto não encontrado na base atual.';
  end if;

  perform pg_advisory_xact_lock(p_projeto_id);

  select coalesce(max(versao), 0) + 1
    into v_versao
    from public.pq_projetos_edicoes
   where projeto_id = p_projeto_id;

  select jsonb_build_object(
    'projeto', to_jsonb(p),
    'tarefas', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.data_inicio nulls last, t.id)
        from public.vw_pq_tarefas_v245 t
       where t.projeto_id = p.id
    ), '[]'::jsonb)
  )
    into v_origem
    from public.vw_pq_projetos_v245 p
   where p.id = p_projeto_id;

  insert into public.pq_projetos_edicoes (
    projeto_id,
    versao,
    status_edicao,
    contexto_objetivo,
    resultados_esperados,
    acoes_complementares,
    resultados_alcancados,
    impacto,
    observacoes,
    evidencias,
    dados_origem,
    criado_por,
    criado_por_email,
    enviado_revisao_em,
    enviado_revisao_por,
    enviado_revisao_por_email
  ) values (
    p_projeto_id,
    v_versao,
    v_status,
    p_contexto_objetivo,
    p_resultados_esperados,
    p_acoes_complementares,
    p_resultados_alcancados,
    p_impacto,
    p_observacoes,
    coalesce(p_evidencias, '[]'::jsonb),
    coalesce(v_origem, '{}'::jsonb),
    v_user,
    v_email,
    case when v_status = 'em_revisao' then now() else null end,
    case when v_status = 'em_revisao' then v_user else null end,
    case when v_status = 'em_revisao' then v_email else null end
  )
  returning * into v_reg;

  return v_reg;
end;
$$;

revoke all on function public.pq_salvar_edicao_workflow(
  bigint,text,text,text,text,text,text,jsonb,text
) from public;

grant execute on function public.pq_salvar_edicao_workflow(
  bigint,text,text,text,text,text,text,jsonb,text
) to authenticated;

-- Transição de uma versão já salva: Rascunho -> Em revisão.
create or replace function public.pq_enviar_edicao_revisao(
  p_edicao_id bigint
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

  update public.pq_projetos_edicoes
     set status_edicao = 'em_revisao',
         enviado_revisao_em = now(),
         enviado_revisao_por = v_user,
         enviado_revisao_por_email = v_email
   where id = p_edicao_id
     and lower(trim(coalesce(status_edicao, ''))) = 'rascunho'
  returning * into v_reg;

  if v_reg.id is null then
    raise exception 'A versão não está em rascunho ou não foi localizada.';
  end if;

  return v_reg;
end;
$$;

revoke all on function public.pq_enviar_edicao_revisao(bigint) from public;
grant execute on function public.pq_enviar_edicao_revisao(bigint) to authenticated;

-- Transição final: Em revisão -> Finalizado.
-- O conteúdo da versão não é alterado; apenas o estado e a auditoria do fluxo.
create or replace function public.pq_finalizar_edicao(
  p_edicao_id bigint
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

  update public.pq_projetos_edicoes
     set status_edicao = 'finalizada',
         finalizado_em = now(),
         finalizado_por = v_user,
         finalizado_por_email = v_email
   where id = p_edicao_id
     and lower(trim(coalesce(status_edicao, ''))) = 'em_revisao'
  returning * into v_reg;

  if v_reg.id is null then
    raise exception 'Somente uma versão Em revisão pode ser finalizada.';
  end if;

  return v_reg;
end;
$$;

revoke all on function public.pq_finalizar_edicao(bigint) from public;
grant execute on function public.pq_finalizar_edicao(bigint) to authenticated;

-- Atualiza explicitamente tarefas escolhidas para refletir a conclusão também
-- na base atual. A autorização passa a ser vinculada à FINALIZAÇÃO da versão,
-- não mais à data em que a versão foi criada, permitindo revisão em outro dia.
create or replace function public.pq_aplicar_status_tarefa(
  p_tarefa_id bigint,
  p_edicao_id bigint,
  p_status_novo text default 'Finalizado'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_edicao public.pq_projetos_edicoes;
  v_tarefa_id bigint;
  v_projeto_id bigint;
  v_status_anterior text;
  v_status_novo text := nullif(trim(coalesce(p_status_novo, '')), '');
begin
  if v_user is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if v_email not like '%@animaeducacao.com.br' then
    raise exception 'Domínio institucional não autorizado.';
  end if;

  if v_status_novo is null then
    v_status_novo := 'Finalizado';
  end if;

  select *
    into v_edicao
    from public.pq_projetos_edicoes
   where id = p_edicao_id
     and status_edicao = 'finalizada'
     and finalizado_por = v_user
     and finalizado_em >= now() - interval '30 minutes';

  if v_edicao.id is null then
    raise exception 'Versão finalizada não localizada ou fora da janela segura de atualização.';
  end if;

  select id, projeto_id, status
    into v_tarefa_id, v_projeto_id, v_status_anterior
    from public.pq_tarefas_atual
   where id = p_tarefa_id
     and ativo = true
   for update;

  if v_tarefa_id is null then
    raise exception 'Tarefa ativa não localizada.';
  end if;

  if v_projeto_id is distinct from v_edicao.projeto_id then
    raise exception 'A tarefa não pertence ao projeto desta versão.';
  end if;

  if lower(trim(coalesce(v_status_anterior, ''))) = lower(trim(v_status_novo)) then
    return jsonb_build_object(
      'ok', true,
      'alterada', false,
      'tarefa_id', p_tarefa_id,
      'status_anterior', v_status_anterior,
      'status_novo', v_status_novo
    );
  end if;

  update public.pq_tarefas_atual
     set status = v_status_novo,
         updated_at = now()
   where id = p_tarefa_id
     and ativo = true;

  insert into public.pq_tarefas_status_auditoria (
    tarefa_id,
    projeto_id,
    edicao_id,
    status_anterior,
    status_novo,
    alterado_por,
    alterado_por_email
  ) values (
    p_tarefa_id,
    v_edicao.projeto_id,
    p_edicao_id,
    v_status_anterior,
    v_status_novo,
    v_user,
    v_email
  );

  return jsonb_build_object(
    'ok', true,
    'alterada', true,
    'tarefa_id', p_tarefa_id,
    'status_anterior', v_status_anterior,
    'status_novo', v_status_novo
  );
end;
$$;

revoke all on function public.pq_aplicar_status_tarefa(bigint,bigint,text) from public;
grant execute on function public.pq_aplicar_status_tarefa(bigint,bigint,text) to authenticated;

grant select on public.pq_projetos_edicoes to authenticated;

-- Conferência da instalação.
select
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'pq_projetos_edicoes'
       and column_name = 'enviado_revisao_em'
  ) as coluna_revisao,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'pq_projetos_edicoes'
       and column_name = 'finalizado_em'
  ) as coluna_finalizacao,
  to_regprocedure('public.pq_release_workflow_disponivel()') as funcao_check,
  to_regprocedure('public.pq_salvar_edicao_workflow(bigint,text,text,text,text,text,text,jsonb,text)') as funcao_salvar,
  to_regprocedure('public.pq_enviar_edicao_revisao(bigint)') as funcao_revisao,
  to_regprocedure('public.pq_finalizar_edicao(bigint)') as funcao_finalizar,
  to_regprocedure('public.pq_aplicar_status_tarefa(bigint,bigint,text)') as funcao_status_tarefa;
