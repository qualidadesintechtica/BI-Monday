-- Execute somente após:
-- a) fila antiga do SMTP2GO escoar (sem Processed pendentes);
-- b) instalar as funções novas, o SQL 09/10 e o cron 11;
-- c) parar disparos por versões antigas do BI ou outros sistemas da mesma conta.
-- A fila local aguarda mais 24h: protege as cotas após a migração.
update public.certificados_fila_config
set pausado=false,motivo='Fila automática ativa.',iniciar_apos=now()+interval '24 hours'
where id;
