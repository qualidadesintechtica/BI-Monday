-- DataHub | Projetos da Qualidade
-- Editor versionado de relatórios, sem alterar os dados importados do Ajure.
-- Execute este arquivo uma única vez no SQL Editor do projeto Supabase:
-- https://supabase.com/dashboard/project/nkjmgzyjjbepebzurowy/sql/new

begin;

create table if not exists public.pq_projetos_edicoes (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.pq_projetos(id) on delete cascade,
  versao integer not null check (versao > 0),
  contexto_objetivo text,
  resultados_esperados text,
  acoes_complementares text,
  resultados_alcancados text,
  impacto text,
  observacoes text,
  evidencias jsonb not null default '[]'::jsonb,
  dados_origem jsonb not null,
  status_edicao text not null default 'rascunho'
    check (status_edicao in ('rascunho', 'finalizada')),
  criado_por uuid not null,
  criado_por_email text not null,
  criado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  constraint pq_projetos_edicoes_projeto_versao_key
    unique (projeto_id, versao),
  constraint pq_projetos_edicoes_evidencias_array_check
    check (jsonb_typeof(evidencias) = 'array'),
  constraint pq_projetos_edicoes_origem_object_check
    check (jsonb_typeof(dados_origem) = 'object')
);

create index if not exists pq_projetos_edicoes_projeto_criado_idx
  on public.pq_projetos_edicoes (projeto_id, criado_em desc);

create index if not exists pq_projetos_edicoes_status_idx
  on public.pq_projetos_edicoes (status_edicao, criado_em desc);

alter table public.pq_projetos_edicoes enable row level security;

-- Centraliza a regra de acesso do módulo. O token continua sendo validado
-- pelo Supabase e somente o domínio corporativo é aceito.
create or replace function public.pq_usuario_autorizado()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and split_part(lower(coalesce(auth.jwt() ->> 'email', '')), '@', 2)
      = 'animaeducacao.com.br';
$$;

revoke all on function public.pq_usuario_autorizado() from public;
grant execute on function public.pq_usuario_autorizado() to authenticated;

-- Leitura autenticada dos dados originais e do histórico de edições.
drop policy if exists pq_importacoes_leitura_corporativa on public.pq_importacoes;
create policy pq_importacoes_leitura_corporativa
  on public.pq_importacoes for select to authenticated
  using (public.pq_usuario_autorizado());

drop policy if exists pq_projetos_leitura_corporativa on public.pq_projetos;
create policy pq_projetos_leitura_corporativa
  on public.pq_projetos for select to authenticated
  using (public.pq_usuario_autorizado());

drop policy if exists pq_tarefas_leitura_corporativa on public.pq_tarefas;
create policy pq_tarefas_leitura_corporativa
  on public.pq_tarefas for select to authenticated
  using (public.pq_usuario_autorizado());

drop policy if exists pq_linhas_leitura_corporativa on public.pq_importacao_linhas;
create policy pq_linhas_leitura_corporativa
  on public.pq_importacao_linhas for select to authenticated
  using (public.pq_usuario_autorizado());

drop policy if exists pq_edicoes_leitura_corporativa on public.pq_projetos_edicoes;
create policy pq_edicoes_leitura_corporativa
  on public.pq_projetos_edicoes for select to authenticated
  using (public.pq_usuario_autorizado());

grant select on table
  public.pq_importacoes,
  public.pq_projetos,
  public.pq_tarefas,
  public.pq_importacao_linhas,
  public.pq_projetos_edicoes
to authenticated;

-- Salvar nunca atualiza uma edição anterior: sempre cria a próxima versão.
-- O snapshot mantém no relatório exatamente o conteúdo original daquela data,
-- mesmo que uma planilha mais nova seja importada depois.
create or replace function public.pq_salvar_edicao(
  p_projeto_id uuid,
  p_contexto_objetivo text default null,
  p_resultados_esperados text default null,
  p_acoes_complementares text default null,
  p_resultados_alcancados text default null,
  p_impacto text default null,
  p_observacoes text default null,
  p_evidencias jsonb default '[]'::jsonb,
  p_finalizar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_projeto public.pq_projetos%rowtype;
  v_tarefas jsonb;
  v_origem jsonb;
  v_versao integer;
  v_edicao_id uuid;
  v_criado_em timestamptz;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_status text := case when p_finalizar then 'finalizada' else 'rascunho' end;
begin
  if not public.pq_usuario_autorizado() then
    raise exception 'Acesso não autorizado.' using errcode = '42501';
  end if;

  if p_evidencias is null then
    p_evidencias := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_evidencias) <> 'array' then
    raise exception 'Evidências devem ser enviadas como uma lista.'
      using errcode = '22023';
  end if;

  if p_finalizar and (
    nullif(btrim(coalesce(p_contexto_objetivo, '')), '') is null
    or nullif(btrim(coalesce(p_resultados_esperados, '')), '') is null
    or nullif(btrim(coalesce(p_resultados_alcancados, '')), '') is null
    or nullif(btrim(coalesce(p_impacto, '')), '') is null
    or jsonb_array_length(p_evidencias) = 0
  ) then
    raise exception 'Para finalizar, preencha contexto, resultados esperados, resultados alcançados, impacto e ao menos uma evidência.'
      using errcode = '22023';
  end if;

  select p.*
    into v_projeto
    from public.pq_projetos p
   where p.id = p_projeto_id
   for update;

  if not found then
    raise exception 'Projeto não encontrado.' using errcode = 'P0002';
  end if;

  select coalesce(
           jsonb_agg(to_jsonb(t) order by t.data_inicio nulls last, t.azure_id),
           '[]'::jsonb
         )
    into v_tarefas
    from public.pq_tarefas t
   where t.projeto_id = p_projeto_id;

  v_origem := jsonb_build_object(
    'projeto', to_jsonb(v_projeto),
    'tarefas', v_tarefas,
    'capturado_em', now()
  );

  select coalesce(max(e.versao), 0) + 1
    into v_versao
    from public.pq_projetos_edicoes e
   where e.projeto_id = p_projeto_id;

  insert into public.pq_projetos_edicoes (
    projeto_id,
    versao,
    contexto_objetivo,
    resultados_esperados,
    acoes_complementares,
    resultados_alcancados,
    impacto,
    observacoes,
    evidencias,
    dados_origem,
    status_edicao,
    criado_por,
    criado_por_email,
    finalizado_em
  ) values (
    p_projeto_id,
    v_versao,
    nullif(btrim(coalesce(p_contexto_objetivo, '')), ''),
    nullif(btrim(coalesce(p_resultados_esperados, '')), ''),
    nullif(btrim(coalesce(p_acoes_complementares, '')), ''),
    nullif(btrim(coalesce(p_resultados_alcancados, '')), ''),
    nullif(btrim(coalesce(p_impacto, '')), ''),
    nullif(btrim(coalesce(p_observacoes, '')), ''),
    p_evidencias,
    v_origem,
    v_status,
    auth.uid(),
    v_email,
    case when p_finalizar then now() else null end
  )
  returning id, criado_em into v_edicao_id, v_criado_em;

  return jsonb_build_object(
    'id', v_edicao_id,
    'projeto_id', p_projeto_id,
    'versao', v_versao,
    'status', v_status,
    'criado_em', v_criado_em
  );
end;
$$;

revoke all on function public.pq_salvar_edicao(
  uuid, text, text, text, text, text, text, jsonb, boolean
) from public, anon;

grant execute on function public.pq_salvar_edicao(
  uuid, text, text, text, text, text, text, jsonb, boolean
) to authenticated;

commit;

-- Conferência rápida: deve mostrar a tabela e a função.
select
  to_regclass('public.pq_projetos_edicoes') as tabela_edicoes,
  to_regprocedure(
    'public.pq_salvar_edicao(uuid,text,text,text,text,text,text,jsonb,boolean)'
  ) as funcao_salvar;
