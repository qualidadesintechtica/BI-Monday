-- 1. Gere um token aleatório com 32 bytes.
-- 2. Salve o mesmo token nas Edge Function Secrets como CERTIFICADOS_WORKER_TOKEN.
-- 3. Troque SOMENTE o marcador abaixo pelo mesmo token e execute este arquivo.
-- A chave SMTP2GO NÃO deve aparecer no site, neste SQL ou em mensagens.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$
declare segredo text := 'SUBSTITUIR_PELO_TOKEN_DO_WORKER';
begin
 if segredo='SUBSTITUIR_PELO_TOKEN_DO_WORKER' or length(segredo)<40 then
  raise exception 'Preencha o token aleatório do worker antes de executar.';
 end if;
 if exists(select 1 from vault.secrets where name='certificados_worker_token') then
  perform vault.update_secret((select id from vault.secrets where name='certificados_worker_token' limit 1),segredo,'certificados_worker_token');
 else
  perform vault.create_secret(segredo,'certificados_worker_token');
 end if;
end $$;
-- Nome exclusivo: não altera os crons da Monday.
select cron.unschedule(jobid) from cron.job where jobname='certificados-smtp2go-fila';
select cron.schedule('certificados-smtp2go-fila','*/5 * * * *',$$
 select net.http_post(
  url:='https://nkjmgzyjjbepebzurowy.supabase.co/functions/v1/processar-certificados',
  headers:=jsonb_build_object('Content-Type','application/json',
    'x-certificados-worker',(select decrypted_secret from vault.decrypted_secrets where name='certificados_worker_token' limit 1)),
  body:='{}'::jsonb,
  timeout_milliseconds:=100000
 );
$$);
