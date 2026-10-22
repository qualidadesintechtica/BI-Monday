-- BI-Monday V25.46.70 | Banco de Validadores na aba Equipe.
-- Execute ESTE ARQUIVO INTEIRO no SQL Editor do Supabase do BI.
-- Depois publique o site e importe Banco_de_Validadores.xlsx na própria aba.
-- Aditivo, transacional e reaplicável. Não altera a sincronização Monday.
begin;

create or replace function public.bi_equipes_acesso_permitido()
returns boolean language sql stable security invoker set search_path='' as $$
  select auth.uid() is not null and lower(split_part(coalesce(auth.jwt()->>'email',''),'@',2))='animaeducacao.com.br';
$$;
revoke all on function public.bi_equipes_acesso_permitido() from public,anon;
grant execute on function public.bi_equipes_acesso_permitido() to authenticated;

create or replace function public.bi_equipes_chave(v text)
returns text language sql immutable parallel safe set search_path='' as $$
  select lower(translate(regexp_replace(btrim(coalesce(v,'')),'\s+',' ','g'),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'));
$$;
revoke all on function public.bi_equipes_chave(text) from public,anon;
grant execute on function public.bi_equipes_chave(text) to authenticated;

create table if not exists public.bi_validadores_cadastro (
  email text primary key check(email=lower(btrim(email)) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  docente text not null check(length(btrim(docente))>0),
  atualizado_em timestamptz not null default clock_timestamp()
);
create table if not exists public.bi_validadores_vinculos (
  id bigint generated always as identity primary key,
  email text not null references public.bi_validadores_cadastro(email),
  ies text not null default '',
  ies_chave text generated always as (public.bi_equipes_chave(ies)) stored,
  vinculo_ativo boolean,
  data_desligamento date check(data_desligamento between date '1900-01-01' and date '2199-12-31'),
  formacao text not null default '',
  titulacao text not null default '',
  lattes text not null default '' check(lattes='' or lattes ~* '^https?://'),
  uc text not null default '',
  uc_chave text generated always as (public.bi_equipes_chave(uc)) stored,
  semestre text not null default '',
  avaliacao text not null default '',
  comentarios text not null default '',
  atualizado_em timestamptz not null default clock_timestamp(),
  unique(email,ies_chave,uc_chave,semestre)
);
create table if not exists public.bi_validadores_historico (
  id bigint generated always as identity primary key,
  email text not null,
  vinculo_id bigint,
  operacao text not null,
  anterior jsonb,
  atual jsonb not null,
  arquivo text,
  alterado_por uuid,
  alterado_em timestamptz not null default clock_timestamp()
);
create index if not exists bi_validadores_historico_email on public.bi_validadores_historico(email,id desc);

alter table public.bi_validadores_cadastro enable row level security;
alter table public.bi_validadores_vinculos enable row level security;
alter table public.bi_validadores_historico enable row level security;
drop policy if exists bi_validadores_cadastro_leitura on public.bi_validadores_cadastro;
create policy bi_validadores_cadastro_leitura on public.bi_validadores_cadastro for select to authenticated using(public.bi_equipes_acesso_permitido());
drop policy if exists bi_validadores_vinculos_leitura on public.bi_validadores_vinculos;
create policy bi_validadores_vinculos_leitura on public.bi_validadores_vinculos for select to authenticated using(public.bi_equipes_acesso_permitido());
drop policy if exists bi_validadores_historico_leitura on public.bi_validadores_historico;
create policy bi_validadores_historico_leitura on public.bi_validadores_historico for select to authenticated using(public.bi_equipes_acesso_permitido());
revoke all on public.bi_validadores_cadastro,public.bi_validadores_vinculos,public.bi_validadores_historico from public,anon,authenticated;
grant select on public.bi_validadores_cadastro,public.bi_validadores_vinculos,public.bi_validadores_historico to authenticated;

create or replace function public.bi_validadores_auditar()
returns trigger language plpgsql security definer set search_path='' as $$
declare a jsonb; n jsonb;
begin
  n:=to_jsonb(new);
  if tg_op='UPDATE' then
    a:=to_jsonb(old);
    if (a-'atualizado_em') is not distinct from (n-'atualizado_em') then return new; end if;
  end if;
  insert into public.bi_validadores_historico(email,vinculo_id,operacao,anterior,atual,arquivo,alterado_por)
  values(new.email,case when tg_table_name='bi_validadores_vinculos' then (to_jsonb(new)->>'id')::bigint end,
    tg_op,a,to_jsonb(new),current_setting('bi_validadores.arquivo',true),auth.uid());
  return new;
end;
$$;
revoke all on function public.bi_validadores_auditar() from public,anon,authenticated;
create or replace function public.bi_validadores_marcar_atualizacao()
returns trigger language plpgsql set search_path='' as $$
begin
  if (to_jsonb(old)-'atualizado_em'-'ies_chave'-'uc_chave') is not distinct from (to_jsonb(new)-'atualizado_em'-'ies_chave'-'uc_chave') then
    new.atualizado_em:=old.atualizado_em;
  else new.atualizado_em:=clock_timestamp(); end if;
  return new;
end;
$$;
revoke all on function public.bi_validadores_marcar_atualizacao() from public,anon,authenticated;
drop trigger if exists bi_validadores_cadastro_auditoria on public.bi_validadores_cadastro;
create trigger bi_validadores_cadastro_auditoria after insert or update on public.bi_validadores_cadastro for each row execute function public.bi_validadores_auditar();
drop trigger if exists bi_validadores_vinculos_auditoria on public.bi_validadores_vinculos;
create trigger bi_validadores_vinculos_auditoria after insert or update on public.bi_validadores_vinculos for each row execute function public.bi_validadores_auditar();
drop trigger if exists bi_validadores_cadastro_atualizacao on public.bi_validadores_cadastro;
create trigger bi_validadores_cadastro_atualizacao before update on public.bi_validadores_cadastro for each row execute function public.bi_validadores_marcar_atualizacao();
drop trigger if exists bi_validadores_vinculos_atualizacao on public.bi_validadores_vinculos;
create trigger bi_validadores_vinculos_atualizacao before update on public.bi_validadores_vinculos for each row execute function public.bi_validadores_marcar_atualizacao();

create or replace view public.bi_validadores_banco with(security_invoker=true) as
 select v.id::text as vinculo_id,c.docente,c.email,v.ies,v.vinculo_ativo,v.data_desligamento,
   v.formacao,v.titulacao,v.lattes,v.uc,v.semestre,v.avaliacao,v.comentarios,v.atualizado_em
 from public.bi_validadores_vinculos v join public.bi_validadores_cadastro c on c.email=v.email;
revoke all on public.bi_validadores_banco from public,anon,authenticated;
grant select on public.bi_validadores_banco to authenticated;

create or replace function public.bi_validadores_importar(p_linhas jsonb,p_modo text,p_arquivo text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; v_email text; v_data date; v_ativo boolean; v_ies text; v_docente text;
  v_processados integer:=0;v_ignorados integer:=0;v_atingidos integer:=0;v_n integer;
begin
  if not public.bi_equipes_acesso_permitido() then raise exception 'Sessão institucional não autorizada.' using errcode='42501'; end if;
  if p_modo is null or p_modo not in ('cadastro','desligamentos') then raise exception 'Modo de importação inválido.'; end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' then raise exception 'Envie uma lista de registros.'; end if;
  if jsonb_array_length(p_linhas) not between 1 and 10000 or octet_length(p_linhas::text)>10000000 then raise exception 'Importação vazia ou acima do limite.'; end if;
  -- Valida tudo antes de gravar. Qualquer erro reverte o lote inteiro.
  for r in select value from jsonb_array_elements(p_linhas) loop
    if jsonb_typeof(r) is distinct from 'object' then raise exception 'Registro inválido.'; end if;
    v_email:=lower(btrim(coalesce(r->>'email','')));
    if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(v_email)>320 then raise exception 'E-mail inválido: %',v_email; end if;
    if length(r::text)>50000 then raise exception 'Registro muito extenso: %',v_email; end if;
    if nullif(btrim(r->>'data_desligamento'),'') is not null then
      if r->>'data_desligamento' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Data inválida: %',v_email; end if;
      v_data:=(r->>'data_desligamento')::date;
      if v_data not between date '1900-01-01' and date '2199-12-31' then raise exception 'Data fora do intervalo: %',v_email; end if;
    else v_data:=null; end if;
    if p_modo='cadastro' then
      if nullif(btrim(r->>'docente'),'') is null then raise exception 'Nome não informado: %',v_email; end if;
      if jsonb_typeof(r->'vinculo_ativo') not in ('boolean','null') then raise exception 'Vínculo ativo inválido: %',v_email; end if;
      if nullif(r->>'lattes','') is not null and r->>'lattes' !~* '^https?://' then raise exception 'Link Lattes inválido: %',v_email; end if;
      if (r->>'vinculo_ativo')::boolean is true and v_data<=(current_timestamp at time zone 'America/Sao_Paulo')::date then raise exception 'Vínculo SIM conflita com desligamento já ocorrido: %',v_email; end if;
    elsif v_data is not null then
      if not exists(select 1 from public.bi_validadores_vinculos v where v.email=v_email
        and (nullif(btrim(r->>'ies'),'') is null or v.ies_chave=public.bi_equipes_chave(r->>'ies'))) then
        raise exception 'Cadastro não encontrado para e-mail/IES: %',v_email;
      end if;
    end if;
  end loop;
  if p_modo='cadastro' then
    if exists(select 1 from jsonb_array_elements(p_linhas) t(rec) group by lower(btrim(rec->>'email'))
      having count(distinct public.bi_equipes_chave(rec->>'docente'))>1) then raise exception 'Mesmo e-mail associado a nomes diferentes.'; end if;
    if exists(select 1 from jsonb_array_elements(p_linhas) t(rec)
      group by lower(btrim(rec->>'email')),public.bi_equipes_chave(rec->>'ies'),public.bi_equipes_chave(rec->>'uc'),btrim(coalesce(rec->>'semestre',''))
      having count(distinct (rec-'email'-'docente'))>1) then raise exception 'Vínculos repetidos com informações diferentes.'; end if;
  else
    if exists(select 1 from jsonb_array_elements(p_linhas) t(rec) where nullif(btrim(rec->>'data_desligamento'),'') is not null
      group by lower(btrim(rec->>'email')) having count(distinct rec->>'data_desligamento')>1) then raise exception 'Datas de desligamento diferentes para o mesmo e-mail.'; end if;
  end if;
  perform set_config('bi_validadores.arquivo',left(coalesce(p_arquivo,''),250),true);
  -- Serializa importações para manter o resultado e o histórico consistentes.
  lock table public.bi_validadores_cadastro,public.bi_validadores_vinculos in share row exclusive mode;
  for r in select value from jsonb_array_elements(p_linhas) loop
    v_email:=lower(btrim(r->>'email'));v_docente:=btrim(r->>'docente');v_ies:=btrim(coalesce(r->>'ies',''));
    v_data:=nullif(btrim(r->>'data_desligamento'),'')::date;
    if p_modo='desligamentos' then
      if v_data is null then v_ignorados:=v_ignorados+1;continue;end if;
      update public.bi_validadores_vinculos v set data_desligamento=v_data,
        vinculo_ativo=case when v_data<=(current_timestamp at time zone 'America/Sao_Paulo')::date then false else v.vinculo_ativo end
        where v.email=v_email and (v_ies='' or v.ies_chave=public.bi_equipes_chave(v_ies));
      get diagnostics v_n=row_count;v_atingidos:=v_atingidos+v_n;
    else
      v_ativo:=(r->>'vinculo_ativo')::boolean;
      if v_data<=(current_timestamp at time zone 'America/Sao_Paulo')::date then v_ativo:=false; end if;
      insert into public.bi_validadores_cadastro as c(email,docente) values(v_email,v_docente)
      on conflict(email) do update set docente=excluded.docente;
      insert into public.bi_validadores_vinculos as v(email,ies,vinculo_ativo,data_desligamento,formacao,titulacao,lattes,uc,semestre,avaliacao,comentarios)
      values(v_email,v_ies,v_ativo,v_data,coalesce(r->>'formacao',''),coalesce(r->>'titulacao',''),coalesce(r->>'lattes',''),
        btrim(coalesce(r->>'uc','')),btrim(coalesce(r->>'semestre','')),coalesce(r->>'avaliacao',''),coalesce(r->>'comentarios',''))
      on conflict(email,ies_chave,uc_chave,semestre) do update set
        ies=excluded.ies,uc=excluded.uc,
        vinculo_ativo=case when v.data_desligamento is not null and excluded.data_desligamento is null then v.vinculo_ativo else coalesce(excluded.vinculo_ativo,v.vinculo_ativo) end,
        data_desligamento=coalesce(excluded.data_desligamento,v.data_desligamento),
        formacao=coalesce(nullif(excluded.formacao,''),v.formacao),titulacao=coalesce(nullif(excluded.titulacao,''),v.titulacao),
        lattes=coalesce(nullif(excluded.lattes,''),v.lattes),avaliacao=coalesce(nullif(excluded.avaliacao,''),v.avaliacao),
        comentarios=coalesce(nullif(excluded.comentarios,''),v.comentarios);
      v_atingidos:=v_atingidos+1;
    end if;
    v_processados:=v_processados+1;
  end loop;
  return jsonb_build_object('modo',p_modo,'registros_processados',v_processados,'vinculos_atingidos',v_atingidos,'datas_vazias_ignoradas',v_ignorados,
    'docentes',(select count(distinct lower(btrim(x->>'email'))) from jsonb_array_elements(p_linhas) x
      where p_modo='cadastro' or nullif(btrim(x->>'data_desligamento'),'') is not null));
end;
$$;
revoke all on function public.bi_validadores_importar(jsonb,text,text) from public,anon;
grant execute on function public.bi_validadores_importar(jsonb,text,text) to authenticated;

create or replace function public.bi_validadores_salvar_avaliacao(p_id bigint,p_avaliacao text,p_comentarios text,p_atualizado_em timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.bi_validadores_vinculos;
begin
  if not public.bi_equipes_acesso_permitido() then raise exception 'Sessão institucional não autorizada.' using errcode='42501'; end if;
  if length(coalesce(p_avaliacao,''))>2000 or length(coalesce(p_comentarios,''))>10000 then raise exception 'Avaliação ou comentário muito extenso.';end if;
  perform set_config('bi_validadores.arquivo','Edição da avaliação no BI',true);
  update public.bi_validadores_vinculos set avaliacao=btrim(coalesce(p_avaliacao,'')),comentarios=btrim(coalesce(p_comentarios,''))
    where id=p_id and atualizado_em=p_atualizado_em returning * into v;
  if v.id is null then raise exception 'O registro foi alterado por outra pessoa. Atualize a aba antes de salvar.' using errcode='40001'; end if;
  return to_jsonb(v);
end;
$$;
revoke all on function public.bi_validadores_salvar_avaliacao(bigint,text,text,timestamptz) from public,anon;
grant execute on function public.bi_validadores_salvar_avaliacao(bigint,text,text,timestamptz) to authenticated;

notify pgrst,'reload schema';
commit;
select 'V25.46.70 instalada. Publique os arquivos e importe o Excel em Equipe > Importar Excel.' as resultado;
