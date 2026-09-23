-- V25.39 - Armazenamento privado das evidências de Projetos da Qualidade
-- Execute no SQL Editor do mesmo projeto Supabase usado pelo BI.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'pq-evidencias',
  'pq-evidencias',
  false,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "PQ evidencias - leitura institucional" on storage.objects;
create policy "PQ evidencias - leitura institucional"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'pq-evidencias'
    and lower(coalesce(auth.jwt() ->> 'email', '')) like '%@animaeducacao.com.br'
  );

drop policy if exists "PQ evidencias - envio institucional" on storage.objects;
create policy "PQ evidencias - envio institucional"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'pq-evidencias'
    and lower(coalesce(auth.jwt() ->> 'email', '')) like '%@animaeducacao.com.br'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- O bucket permanece privado. O navegador recebe somente links temporários
-- de 120 segundos após uma solicitação feita por usuário autenticado.
