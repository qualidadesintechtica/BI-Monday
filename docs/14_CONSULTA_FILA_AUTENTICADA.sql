-- Consulta alternativa para o BI. Requer as tabelas do SQL 09.
create or replace function public.certificados_fila_status()
returns jsonb language plpgsql security definer set search_path=public as $$
declare configuracao jsonb; registros jsonb; conferencia jsonb;
begin
 if auth.uid() is null or not exists(
  select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null
   and lower(split_part(u.email,'@',2))='animaeducacao.com.br'
 ) then raise exception 'Sessão inválida ou domínio não autorizado.'; end if;
 if to_regclass('public.certificados_fila') is null
  or to_regclass('public.certificados_fila_config') is null
  or to_regclass('public.certificados_fila_conferencia') is null then
  raise exception 'Instale primeiro o SQL 09_FILA_CERTIFICADOS_SMTP2GO.sql.';
 end if;
 select jsonb_build_object(
  'pausado',c.pausado,'motivo',c.motivo,'iniciar_apos',c.iniciar_apos,
  'ultima_execucao',c.ultima_execucao,'ultimo_erro',c.ultimo_erro
 ) into configuracao from public.certificados_fila_config c where c.id;
 if configuracao is null then raise exception 'Configuração da fila não encontrada. Execute o SQL 09.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'chave_certificado',f.chave_certificado,'status',f.status,'aceito_em',f.aceito_em,
  'smtp2go_id',f.smtp2go_id,'erro',f.erro,'email',f.email,'revisor',f.revisor
 ) order by f.id),'[]'::jsonb) into registros from public.certificados_fila f;
 select coalesce(jsonb_agg(jsonb_build_object(
  'monday_item_id',c.monday_item_id,'email',c.email,'revisor',c.revisor
 )),'[]'::jsonb) into conferencia from public.certificados_fila_conferencia c where c.ativo;
 return jsonb_build_object('success',true,'config',configuracao,'registros',registros,'conferencia',conferencia);
end $$;
revoke all on function public.certificados_fila_status() from public,anon;
grant execute on function public.certificados_fila_status() to authenticated;
notify pgrst,'reload schema';
