-- V25.46.64 | Permitir planilhas no armazenamento de evidências existente.
-- Execute inteiro no SQL Editor. Reaplicável; preserva arquivos e permissões.
begin;
do $$
begin
  if not exists (select 1 from storage.buckets where id='pq-evidencias') then
    raise exception 'Instale docs/V25_39_ARMAZENAMENTO_EVIDENCIAS.sql antes de habilitar os anexos de planilhas.';
  end if;
end;
$$;
-- Soma os novos formatos à lista existente. Uma lista nula já permite todos
-- os formatos; preservamos essa configuração em instalações personalizadas.
update storage.buckets
set allowed_mime_types=case when allowed_mime_types is null then null else
  array(select distinct mime from unnest(allowed_mime_types || array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/vnd.oasis.opendocument.spreadsheet'
  ]) as mime order by mime) end
where id='pq-evidencias';
commit;
select 'Anexos XLSX, XLS, CSV e ODS habilitados' as resultado;
