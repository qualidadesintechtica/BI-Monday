-- ============================================================
-- V22 — Sincronização automática 3x ao dia + Histórico de Sync
-- Rode este script inteiro no SQL Editor do Supabase (projeto
-- nkjmgzyjjbepebzurowy), uma única vez.
-- ============================================================

-- 1) Tabela de log de sincronizações -----------------------------------
-- Cada execução da Edge Function "sync-criterios-avaliacao-uas" grava
-- uma linha aqui (sucesso ou falha).

create table if not exists public.sync_log (
  id               bigint generated always as identity primary key,
  function_name    text not null default 'sync-criterios-avaliacao-uas',
  board_id         bigint,
  itens_lidos      int,
  itens_gravados   int,
  erros            int,
  sucesso          boolean not null,
  mensagem_erro    text,
  executado_em     timestamptz not null default now()
);

create index if not exists sync_log_executado_em_idx
  on public.sync_log (executado_em desc);

-- RLS: leitura liberada para o front-end (chave publishable/anon),
-- escrita só acontece via Service Role dentro da Edge Function
-- (que ignora RLS por padrão).
alter table public.sync_log enable row level security;

drop policy if exists "sync_log_select_publico" on public.sync_log;
create policy "sync_log_select_publico"
  on public.sync_log
  for select
  using (true);

-- ============================================================
-- 2) Agendamento automático (pg_cron + pg_net) -----------------------
-- Habilita as extensões necessárias (idempotente).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- IMPORTANTE sobre horários:
-- O pg_cron do Supabase roda em UTC. O Brasil não tem mais horário
-- de verão (desde 2019), então o fuso é fixo em UTC-3.
--   08:00 BRT -> 11:00 UTC
--   13:00 BRT -> 16:00 UTC
--   18:00 BRT -> 21:00 UTC
--
-- Troque '<SUPABASE_ANON_OU_SERVICE_KEY>' abaixo pela sua chave
-- (a publishable key já usada no front-end funciona, pois só
-- precisa passar na verificação de JWT da Function Gateway).

-- Remove agendamentos antigos com o mesmo nome, se existirem, para
-- este script poder ser executado de novo sem duplicar.
select cron.unschedule(jobid)
from cron.job
where jobname in (
  'sync-criterios-uas-08h',
  'sync-criterios-uas-13h',
  'sync-criterios-uas-18h'
);

select cron.schedule(
  'sync-criterios-uas-08h',
  '0 11 * * *',
  $$
  select net.http_post(
    url := 'https://nkjmgzyjjbepebzurowy.supabase.co/functions/v1/sync-criterios-avaliacao-uas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SUPABASE_ANON_OU_SERVICE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'sync-criterios-uas-13h',
  '0 16 * * *',
  $$
  select net.http_post(
    url := 'https://nkjmgzyjjbepebzurowy.supabase.co/functions/v1/sync-criterios-avaliacao-uas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SUPABASE_ANON_OU_SERVICE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'sync-criterios-uas-18h',
  '0 21 * * *',
  $$
  select net.http_post(
    url := 'https://nkjmgzyjjbepebzurowy.supabase.co/functions/v1/sync-criterios-avaliacao-uas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SUPABASE_ANON_OU_SERVICE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Para conferir se os 3 jobs foram criados:
-- select jobid, jobname, schedule, active from cron.job order by jobname;

-- Para ver as últimas execuções feitas pelo pg_cron (não confundir
-- com sync_log — este é o log interno do pg_cron/pg_net):
-- select * from cron.job_run_details order by start_time desc limit 20;
