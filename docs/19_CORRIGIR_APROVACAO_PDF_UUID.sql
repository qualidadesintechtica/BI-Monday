-- ============================================================
-- V25.46.58 | PROJETO QUALIDADE | APROVAÇÃO COM UUID OU BIGINT
-- Execute este arquivo INTEIRO no Supabase > SQL Editor.
-- Corrige a aprovação/PDF sem converter ou recriar os IDs das versões.
-- Inclui a correção da constraint de status do SQL 18.
-- Não apaga versões ou modifica o conteúdo já salvo. Reaplicável.
-- Pré-requisitos: editor e fluxo de aprovação (SQLs 03 e 08).
-- ============================================================

begin;

do $$
begin
  if to_regclass('public.pq_projetos_edicoes') is null then
    raise exception 'A tabela do editor não existe. Instale os SQLs 03 e 08 antes desta correção.';
  end if;
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.pq_projetos_edicoes'::regclass
      and attname = 'finalizado_em' and not attisdropped
  ) then
    raise exception 'O fluxo de aprovação não está instalado. Execute o SQL 08 antes desta correção.';
  end if;
end;
$$;

-- Mesma correção do SQL 18, preservando status históricos antigos.
alter table public.pq_projetos_edicoes
  drop constraint if exists pq_projetos_edicoes_status_edicao_check;
alter table public.pq_projetos_edicoes
  add constraint pq_projetos_edicoes_status_edicao_check
  check (status_edicao in ('rascunho', 'em_revisao', 'finalizada'))
  not valid;

do $$
begin
  if not exists (
    select 1 from public.pq_projetos_edicoes
    where status_edicao is not null
      and status_edicao not in ('rascunho', 'em_revisao', 'finalizada')
  ) then
    alter table public.pq_projetos_edicoes
      validate constraint pq_projetos_edicoes_status_edicao_check;
  end if;
end;
$$;

-- Um nome novo de RPC evita conflito com as assinaturas bigint/uuid antigas
-- da API. O parâmetro de entrada é texto, mas a consulta usa o tipo REAL do ID
-- da tabela, preservando o índice, os relacionamentos e o identificador.
create or replace function public.pq_transicionar_edicao_compativel(
  p_edicao_id text,
  p_status_edicao text
)
returns public.pq_projetos_edicoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_id public.pq_projetos_edicoes.id%type;
  v_status text := lower(trim(coalesce(p_status_edicao, '')));
  v_reg public.pq_projetos_edicoes;
begin
  if v_user is null then
    raise exception 'Usuário não autenticado.';
  end if;
  if v_email not like '%@animaeducacao.com.br' then
    raise exception 'Domínio institucional não autorizado.';
  end if;
  if nullif(trim(coalesce(p_edicao_id, '')), '') is null then
    raise exception 'Informe o identificador da versão salva.';
  end if;
  if v_status not in ('em_revisao', 'finalizada') then
    raise exception 'Transição inválida. Use em_revisao ou finalizada.';
  end if;

  -- A atribuição converte para UUID em bases UUID e bigint em bases numéricas.
  -- Nunca converte um UUID para um número nem atribui um ID novo à versão.
  v_id := trim(p_edicao_id);

  if v_status = 'em_revisao' then
    update public.pq_projetos_edicoes
       set status_edicao = 'em_revisao',
           enviado_revisao_em = now(),
           enviado_revisao_por = v_user,
           enviado_revisao_por_email = v_email
     where id = v_id
       and lower(trim(coalesce(status_edicao, ''))) = 'rascunho'
    returning * into v_reg;
    if v_reg.id is null then
      raise exception 'A versão não está em rascunho ou não foi localizada.';
    end if;
  else
    update public.pq_projetos_edicoes
       set status_edicao = 'finalizada',
           finalizado_em = now(),
           finalizado_por = v_user,
           finalizado_por_email = v_email
     where id = v_id
       and lower(trim(coalesce(status_edicao, ''))) = 'em_revisao'
    returning * into v_reg;
    if v_reg.id is null then
      raise exception 'Somente uma versão Em revisão pode ser finalizada.';
    end if;
  end if;

  return v_reg;
end;
$$;

revoke all on function public.pq_transicionar_edicao_compativel(text,text)
  from public, anon;
grant execute on function public.pq_transicionar_edicao_compativel(text,text)
  to authenticated;

notify pgrst, 'reload schema';
commit;

select
  format_type(a.atttypid, a.atttypmod) as tipo_id_preservado,
  to_regprocedure('public.pq_transicionar_edicao_compativel(text,text)') as funcao_aprovacao,
  'Atualize projetos.html e js/projetos.js da V25.46.58. Depois reabra a versão Em revisão e clique em Aprovar e gerar PDF.' as orientacao
from pg_attribute a
where a.attrelid = 'public.pq_projetos_edicoes'::regclass
  and a.attname = 'id' and not a.attisdropped;
