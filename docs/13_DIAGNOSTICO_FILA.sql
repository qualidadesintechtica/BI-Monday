select pausado,motivo,iniciar_apos,ultima_execucao,ultimo_erro,ciclo_inicio,ciclo_fim from public.certificados_fila_config;
select status,count(*) from public.certificados_fila group by status order by status;
select id,chave_certificado,revisor,email,name_ua,titulo,status,smtp2go_id,erro from public.certificados_fila where status in ('erro','conferir') order by criado_em;
select count(*) as pendentes_em_conferencia from public.certificados_fila_conferencia where ativo;
select jobname,schedule,active from cron.job where jobname='certificados-smtp2go-fila';
select status,return_message,start_time from cron.job_run_details
where jobid in(select jobid from cron.job where jobname='certificados-smtp2go-fila')
order by start_time desc limit 10;
-- O cron confirma a chamada HTTP, não a entrega do e-mail.
select status_code,error_msg,created from net._http_response order by created desc limit 10;
