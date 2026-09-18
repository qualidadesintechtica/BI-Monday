-- =============================================================
-- BI-Monday V25.28 · CRON PAGINADO
-- Cada execução processa 1 página (até 500 itens).
-- Validação: minutos 00,10,20,30,40,50
-- Esteira:   minutos 05,15,25,35,45,55
-- =============================================================

-- Atualiza o job já existente da Validação.
SELECT cron.alter_job(
  job_id := 1,
  schedule := '0,10,20,30,40,50 * * * *',
  command := $$
    SELECT net.http_post(
      url := (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'datahub_project_url'
      ) || '/functions/v1/sync-monday',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'datahub_publishable_key'
        ),
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'datahub_publishable_key'
        )
      ),
      body := '{"acao":"sincronizar-validacao"}'::jsonb,
      timeout_milliseconds := 120000
    );
  $$
);

-- Atualiza QUALQUER job existente da Esteira pelo nome, evitando duplicações.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT jobid FROM cron.job WHERE jobname = 'sync-monday-esteira-hourly'
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'sync-monday-esteira-hourly',
  '5,15,25,35,45,55 * * * *',
  $$
    SELECT net.http_post(
      url := (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'datahub_project_url'
      ) || '/functions/v1/sync-monday',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'datahub_publishable_key'
        ),
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'datahub_publishable_key'
        )
      ),
      body := '{"acao":"sincronizar-esteira"}'::jsonb,
      timeout_milliseconds := 120000
    );
  $$
);

SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname IN ('sync-monday-hourly', 'sync-monday-esteira-hourly')
ORDER BY jobid;
