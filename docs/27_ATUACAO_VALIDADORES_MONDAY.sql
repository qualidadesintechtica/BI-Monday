-- V25.46.71 | Execute este arquivo INTEIRO após o SQL 26.
-- Quadro: Avaliação da Atuação na Validação (18430296590).
-- Publicação atômica: uma exportação completa ou uma leitura completa da API.
begin;
create table if not exists public.bi_atuacao_estado(
  id integer primary key default 1 check(id=1),
  quadro_id text not null default '18430296590' check(quadro_id='18430296590'),
  versao bigint not null,
  fonte text not null check(fonte in ('excel','monday')),
  arquivo text not null default '',
  respostas jsonb not null check(jsonb_typeof(respostas)='array'),
  atualizado_em timestamptz not null default clock_timestamp(),
  verificado_em timestamptz not null default clock_timestamp(),
  alterado_por uuid
);
create table if not exists public.bi_atuacao_historico(
  versao bigint primary key,
  fonte text not null,
  arquivo text not null,
  respostas jsonb not null,
  atualizado_em timestamptz not null,
  alterado_por uuid
);
alter table public.bi_atuacao_estado enable row level security;
alter table public.bi_atuacao_historico enable row level security;
drop policy if exists bi_atuacao_estado_leitura on public.bi_atuacao_estado;
create policy bi_atuacao_estado_leitura on public.bi_atuacao_estado for select to authenticated using(public.bi_equipes_acesso_permitido());
drop policy if exists bi_atuacao_historico_leitura on public.bi_atuacao_historico;
create policy bi_atuacao_historico_leitura on public.bi_atuacao_historico for select to authenticated using(public.bi_equipes_acesso_permitido());
revoke all on public.bi_atuacao_estado,public.bi_atuacao_historico from public,anon,authenticated;
grant select on public.bi_atuacao_estado,public.bi_atuacao_historico to authenticated,service_role;

create or replace function public.bi_atuacao_publicar(p_respostas jsonb,p_fonte text,p_arquivo text,p_versao_esperada bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; n jsonb; v public.bi_atuacao_estado; v_versao bigint; v_servico boolean;
begin
  v_servico:=coalesce(auth.jwt()->>'role','')='service_role';
  if not v_servico and not public.bi_equipes_acesso_permitido() then raise exception 'Sessão institucional não autorizada.' using errcode='42501';end if;
  if p_fonte is null or p_fonte not in ('excel','monday') then raise exception 'Fonte inválida.';end if;
  if p_fonte='monday' and not v_servico then raise exception 'Somente a sincronização pode publicar a fonte Monday.' using errcode='42501';end if;
  if jsonb_typeof(p_respostas) is distinct from 'array' then raise exception 'Envie uma lista de avaliações.';end if;
  if jsonb_array_length(p_respostas) not between 1 and 10000 or octet_length(p_respostas::text)>10000000 then raise exception 'Lista de avaliações vazia ou acima do limite.';end if;
  for r in select value from jsonb_array_elements(p_respostas) loop
    if jsonb_typeof(r) is distinct from 'object' or nullif(btrim(r->>'revisor'),'') is null or nullif(btrim(r->>'chave'),'') is null then raise exception 'Avaliação sem identificador ou revisor.';end if;
    if length(r::text)>50000 then raise exception 'Avaliação muito extensa.';end if;
    if jsonb_typeof(r->'revisor') is distinct from 'string' or jsonb_typeof(r->'chave') is distinct from 'string'
      or jsonb_typeof(r->'avaliador') is distinct from 'string' or jsonb_typeof(r->'comentarios') is distinct from 'string' then raise exception 'Nomes e comentários devem ser texto.';end if;
    if jsonb_typeof(r->'criterios') is distinct from 'array' then raise exception 'Informe os seis critérios.';end if;
    if jsonb_array_length(r->'criterios')<>6 then raise exception 'Informe os seis critérios.';end if;
    for n in select value from jsonb_array_elements((r->'criterios')||jsonb_build_array(r->'media_p1',r->'avaliacao_geral',r->'recomendacao')) loop
      if jsonb_typeof(n) not in ('number','null') then raise exception 'Nota deve ser numérica ou vazia.';end if;
      if jsonb_typeof(n)='number' and (n::text)::numeric not between 0 and 5 then raise exception 'Nota fora do intervalo de 0 a 5.';end if;
    end loop;
    if p_fonte='monday' and (coalesce(r->>'monday_item_id','') !~ '^\d+$' or r->>'chave' is distinct from 'monday:'||(r->>'monday_item_id')) then raise exception 'Identificador Monday inválido.';end if;
    if p_fonte='excel' and nullif(r->>'monday_item_id','') is not null then raise exception 'A exportação não fornece IDs de itens Monday.';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_respostas) x group by x->>'chave' having count(*)>1) then raise exception 'Identificador de avaliação repetido.';end if;
  -- Serializa também a primeira publicação, quando ainda não há linha para bloquear.
  perform pg_advisory_xact_lock(1843029659,71);
  select * into v from public.bi_atuacao_estado where id=1 for update;
  if v.versao is distinct from p_versao_esperada then raise exception 'As avaliações foram atualizadas por outra sessão. Atualize os dados e confira a prévia novamente.' using errcode='40001';end if;
  if v.respostas is not distinct from p_respostas and v.fonte=p_fonte then
    update public.bi_atuacao_estado set verificado_em=clock_timestamp() where id=1;
    return jsonb_build_object('versao',v.versao,'registros',jsonb_array_length(p_respostas),'alterado',false);
  end if;
  if v.versao is not null then
    insert into public.bi_atuacao_historico(versao,fonte,arquivo,respostas,atualizado_em,alterado_por)
    values(v.versao,v.fonte,v.arquivo,v.respostas,v.atualizado_em,v.alterado_por);
  end if;
  v_versao:=coalesce(v.versao,0)+1;
  insert into public.bi_atuacao_estado(id,versao,fonte,arquivo,respostas,alterado_por) values(1,v_versao,p_fonte,left(coalesce(p_arquivo,''),250),p_respostas,auth.uid())
  on conflict(id) do update set versao=excluded.versao,fonte=excluded.fonte,arquivo=excluded.arquivo,respostas=excluded.respostas,
    alterado_por=excluded.alterado_por,atualizado_em=clock_timestamp(),verificado_em=clock_timestamp();
  return jsonb_build_object('versao',v_versao,'registros',jsonb_array_length(p_respostas),'alterado',true);
end;
$$;
revoke all on function public.bi_atuacao_publicar(jsonb,text,text,bigint) from public,anon;
grant execute on function public.bi_atuacao_publicar(jsonb,text,text,bigint) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
select 'V25.46.71 instalada. Implante sync-atuacao-validadores e publique os arquivos do BI.' as resultado;
