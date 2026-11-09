-- Banco de Professores: instalar após docs/26_BANCO_VALIDADORES_EQUIPE.sql
-- Não modifica dados sincronizados da Monday nem notas já existentes.
begin;
create table if not exists public.bi_professores_notas_manuais (
 vinculo_id bigint primary key references public.bi_validadores_vinculos(id) on delete cascade,
 nota numeric(4,2) check (nota between 0 and 10),
 atualizado_por uuid, atualizado_em timestamptz not null default now()
);
create table if not exists public.bi_professores_notas_historico (
 id bigint generated always as identity primary key, vinculo_id bigint not null,
 nota_anterior numeric(4,2), nota_nova numeric(4,2), alterado_por uuid, alterado_em timestamptz not null default now()
);
alter table public.bi_professores_notas_manuais enable row level security;
alter table public.bi_professores_notas_historico enable row level security;
drop policy if exists bi_professores_notas_leitura on public.bi_professores_notas_manuais;
create policy bi_professores_notas_leitura on public.bi_professores_notas_manuais for select to authenticated using (public.bi_equipes_acesso_permitido());
revoke all on public.bi_professores_notas_manuais,public.bi_professores_notas_historico from public,anon,authenticated;
grant select on public.bi_professores_notas_manuais to authenticated;
create or replace function public.bi_professores_salvar_nota(p_vinculo_id bigint,p_nota numeric)
returns void language plpgsql security definer set search_path='' as $$
declare v_semestre text; v_antiga numeric(4,2);
begin
 if not public.bi_equipes_acesso_permitido() then raise exception 'Acesso institucional necessário' using errcode='42501';end if;
 if p_nota is not null and (p_nota<0 or p_nota>10 or p_nota<>round(p_nota,2)) then raise exception 'Nota inválida (0 a 10, duas casas decimais)';end if;
 select semestre into v_semestre from public.bi_validadores_vinculos where id=p_vinculo_id for update;
 if not found or btrim(v_semestre)<>'2026.2' then raise exception 'Apenas vínculos 2026.2 permitem nota manual';end if;
 select nota into v_antiga from public.bi_professores_notas_manuais where vinculo_id=p_vinculo_id;
 if v_antiga is not distinct from p_nota then return;end if;
 insert into public.bi_professores_notas_manuais(vinculo_id,nota,atualizado_por,atualizado_em) values(p_vinculo_id,p_nota,auth.uid(),now())
 on conflict(vinculo_id) do update set nota=excluded.nota,atualizado_por=excluded.atualizado_por,atualizado_em=excluded.atualizado_em;
 insert into public.bi_professores_notas_historico(vinculo_id,nota_anterior,nota_nova,alterado_por) values(p_vinculo_id,v_antiga,p_nota,auth.uid());
end;$$;
revoke all on function public.bi_professores_salvar_nota(bigint,numeric) from public,anon;
grant execute on function public.bi_professores_salvar_nota(bigint,numeric) to authenticated;
-- Catálogo da Esteira; não presume que conteudista seja o revisor.
create or replace view public.bi_professores_uc_20261 with (security_invoker=true) as
select distinct on (public.bi_equipes_chave(coalesce(nullif(btrim(titulo),''),nullif(btrim(item_name),''))))
 monday_item_id,coalesce(nullif(btrim(titulo),''),nullif(btrim(item_name),'')) as uc,
 semestre_oferta as semestre,docente_conteudista
from public.monday_esteira_producao
where semestre_oferta ~* '2026[./-]1' and coalesce(nullif(btrim(titulo),''),nullif(btrim(item_name),'')) is not null
order by public.bi_equipes_chave(coalesce(nullif(btrim(titulo),''),nullif(btrim(item_name),''))),monday_item_id;
revoke all on public.bi_professores_uc_20261 from public,anon;
grant select on public.bi_professores_uc_20261 to authenticated;
commit;
