-- Execute somente depois do arquivo 00_CRIAR_BANCO_PROJETOS_QUALIDADE.sql.
-- Este teste nao grava nem apaga dados.

select
  (select count(*) from public.pq_importacoes) as importacoes,
  (select count(*) from public.pq_projetos) as projetos,
  (select count(*) from public.pq_tarefas) as tarefas,
  (select count(*) from public.pq_importacao_linhas) as linhas_brutas,
  (select count(*) from public.pq_projetos_snapshots) as snapshots;

select
  tablename as table_name,
  rowsecurity as row_security
from pg_catalog.pg_tables
where schemaname = 'public'
  and tablename in (
    'pq_importacoes',
    'pq_projetos',
    'pq_tarefas',
    'pq_importacao_linhas',
    'pq_projetos_snapshots'
  )
order by tablename;
