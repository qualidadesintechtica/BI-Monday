-- BI-Monday V25.46.68 | Data de liberação e histórico de status em Operação.
-- Execute o arquivo inteiro. Aditivo, transacional e reaplicável.
-- O histórico começa nesta instalação; não recria eventos antigos da Monday.
-- Registra o instante em que a base observa a mudança, não a hora exata do clique na Monday.
begin;

do $$
begin
  if to_regclass('public.monday_validacao_materiais') is null then
    raise exception 'A fonte monday_validacao_materiais não existe neste projeto. Use o Supabase do BI com a sincronização instalada.';
  end if;
  if exists (
    select 1 from unnest(array['monday_item_id','status_validacao','data_liberacao_validacao']) c(nome)
    where not exists (select 1 from information_schema.columns i
      where i.table_schema='public' and i.table_name='monday_validacao_materiais' and i.column_name=c.nome)
  ) then
    raise exception 'A fonte de validação não contém monday_item_id, status_validacao e data_liberacao_validacao. Confira a sincronização antes de instalar.';
  end if;
end $$;

create or replace function public.bi_operacao_acesso_permitido()
returns boolean language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null
    and lower(split_part(coalesce(auth.jwt()->>'email',''),'@',2))='animaeducacao.com.br';
$$;
revoke all on function public.bi_operacao_acesso_permitido() from public,anon;
grant execute on function public.bi_operacao_acesso_permitido() to authenticated;

create table if not exists public.bi_operacao_status_historico (
  id bigint generated always as identity primary key,
  monday_item_id text not null,
  tipo_evento text not null check (tipo_evento in ('inicio_acompanhamento','material_observado','mudanca_status')),
  status_anterior text,
  status_novo text,
  observado_em timestamptz not null default clock_timestamp(),
  data_liberacao_validacao text,
  revisor_validador text,
  gestor_validacao_nq text,
  id_titulo text,
  id_ua text,
  titulo text
);
create index if not exists bi_operacao_status_item_evento
  on public.bi_operacao_status_historico(monday_item_id,id desc);
create unique index if not exists bi_operacao_status_primeira_observacao
  on public.bi_operacao_status_historico(monday_item_id)
  where tipo_evento in ('inicio_acompanhamento','material_observado');
alter table public.bi_operacao_status_historico enable row level security;
drop policy if exists bi_operacao_status_leitura on public.bi_operacao_status_historico;
create policy bi_operacao_status_leitura on public.bi_operacao_status_historico
  for select to authenticated using (public.bi_operacao_acesso_permitido());
revoke all on public.bi_operacao_status_historico from public,anon,authenticated;
grant select on public.bi_operacao_status_historico to authenticated;

create or replace function public.bi_operacao_registrar_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n jsonb:=to_jsonb(new); a jsonb; v_id text; v_status text; v_anterior text; v_tipo text;
begin
  v_id:=nullif(btrim(n->>'monday_item_id'),'');
  if v_id is null then return new; end if;
  v_status:=nullif(btrim(n->>'status_validacao'),'');
  if tg_op='INSERT' then
    v_tipo:='material_observado';
  else
    a:=to_jsonb(old);v_anterior:=nullif(btrim(a->>'status_validacao'),'');
    if v_anterior is not distinct from v_status then return new; end if;
    v_tipo:='mudanca_status';
  end if;
  insert into public.bi_operacao_status_historico
    (monday_item_id,tipo_evento,status_anterior,status_novo,data_liberacao_validacao,
     revisor_validador,gestor_validacao_nq,id_titulo,id_ua,titulo)
  values(v_id,v_tipo,v_anterior,v_status,nullif(n->>'data_liberacao_validacao',''),
    n->>'revisor_validador',n->>'gestor_validacao_nq',n->>'id_titulo',n->>'id_ua',coalesce(n->>'titulo',n->>'name'))
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.bi_operacao_registrar_status() from public,anon,authenticated;

-- Evita uma sincronização intercalada entre a fotografia inicial e o gatilho.
lock table public.monday_validacao_materiais in share row exclusive mode;
insert into public.bi_operacao_status_historico
  (monday_item_id,tipo_evento,status_novo,data_liberacao_validacao,
   revisor_validador,gestor_validacao_nq,id_titulo,id_ua,titulo)
select v.monday_item_id::text,'inicio_acompanhamento',nullif(btrim(v.status_validacao),''),
  v.data_liberacao_validacao::text,to_jsonb(v)->>'revisor_validador',to_jsonb(v)->>'gestor_validacao_nq',
  to_jsonb(v)->>'id_titulo',to_jsonb(v)->>'id_ua',coalesce(to_jsonb(v)->>'titulo',to_jsonb(v)->>'name')
from public.monday_validacao_materiais v where v.monday_item_id is not null
on conflict do nothing;
drop trigger if exists bi_operacao_capturar_status on public.monday_validacao_materiais;
create trigger bi_operacao_capturar_status after insert or update on public.monday_validacao_materiais
  for each row execute function public.bi_operacao_registrar_status();

create or replace function public.bi_operacao_resumo_acompanhamento(p_monday_item_ids text[])
returns table(monday_item_id text,data_liberacao_validacao text,mudancas bigint,iniciado_em timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.bi_operacao_acesso_permitido() then
    raise exception 'Sessão institucional não autorizada.' using errcode='42501';
  end if;
  if p_monday_item_ids is null or cardinality(p_monday_item_ids)>300 or exists(
    select 1 from unnest(p_monday_item_ids) i where i is null or i !~ '^[0-9]{1,30}$'
  ) then raise exception 'Informe até 300 IDs de itens da validação.'; end if;
  return query
    with ids as (select distinct unnest(p_monday_item_ids) as item_id)
    select v.monday_item_id::text,v.data_liberacao_validacao::text,
      count(h.id) filter(where h.tipo_evento='mudanca_status'),min(h.observado_em)
    from ids join public.monday_validacao_materiais v on v.monday_item_id::text=ids.item_id
    left join public.bi_operacao_status_historico h on h.monday_item_id=ids.item_id
    group by v.monday_item_id,v.data_liberacao_validacao;
end;
$$;
revoke all on function public.bi_operacao_resumo_acompanhamento(text[]) from public,anon;
grant execute on function public.bi_operacao_resumo_acompanhamento(text[]) to authenticated;
comment on table public.bi_operacao_status_historico is
  'Observações de status da tabela sincronizada. O primeiro evento é uma fotografia inicial, não uma transição. Mudanças entre sincronizações podem não ser observadas.';
notify pgrst,'reload schema';
commit;
select 'Operação V25.46.68 instalada: data de liberação disponível e mudanças de status registradas a partir de agora.' as resultado;
