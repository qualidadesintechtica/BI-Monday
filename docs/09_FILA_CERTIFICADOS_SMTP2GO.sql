-- Execute após docs/04_CERTIFICADOS_HISTORICO_V25_44.sql.
begin;
create table if not exists public.certificados_fila_config (
 id boolean primary key default true check(id),
 pausado boolean not null default true,
 motivo text not null default 'Instalação: conferir envios anteriores antes de ativar.',
 limite_hora int not null default 25 check(limite_hora between 1 and 25),
 limite_dia int not null default 200 check(limite_dia between 1 and 200),
 limite_mes int not null default 1000 check(limite_mes between 1 and 1000),
 iniciar_apos timestamptz not null default now()+interval '24 hours',
 ciclo_inicio text, ciclo_fim text, ciclo_base_usado int not null default 0, ciclo_base_em timestamptz,
 worker_token uuid, worker_ate timestamptz, ultima_execucao timestamptz, ultimo_erro text
);
insert into public.certificados_fila_config(id) values(true) on conflict do nothing;
create table if not exists public.certificados_fila (
 id uuid primary key default gen_random_uuid(), chave_certificado text not null unique,
 revisor text not null, email text not null, name_ua text not null, titulo text not null, semestre_oferta text not null,
 pdf_base64 text, nome_arquivo text not null, criado_por uuid not null references auth.users(id),
 criado_em timestamptz not null default now(),
 status text not null default 'na_fila' check(status in ('na_fila','processando','aceito','erro','conferir')),
 tentativa_em timestamptz, token_tentativa uuid, aceito_em timestamptz, smtp2go_id text, erro text
);
create index if not exists certificados_fila_status_idx on public.certificados_fila(status,criado_em);
create table if not exists public.certificados_fila_tentativas (
 id uuid primary key, fila_id uuid not null references public.certificados_fila(id), criado_em timestamptz not null default now()
);
create index if not exists certificados_tentativas_data_idx on public.certificados_fila_tentativas(criado_em);
create table if not exists public.certificados_fila_conferencia (
 monday_item_id text not null, email text not null, revisor text not null, ua text not null,
 titulo text not null, semestre text not null, motivo text not null, ativo boolean not null default true,
 primary key(monday_item_id,email,revisor)
);
alter table public.certificados_fila_config enable row level security;
alter table public.certificados_fila enable row level security;
alter table public.certificados_fila_tentativas enable row level security;
alter table public.certificados_fila_conferencia enable row level security;
revoke all on public.certificados_fila_config,public.certificados_fila,public.certificados_fila_tentativas,public.certificados_fila_conferencia from anon,authenticated;
grant all on public.certificados_fila_config,public.certificados_fila,public.certificados_fila_tentativas,public.certificados_fila_conferencia to service_role;

create or replace function public.certificados_fila_adicionar(p jsonb, usuario uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare f public.certificados_fila; item_id text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p->>'chave_certificado',0));
 if exists(select 1 from public.certificados_envios where chave_certificado=p->>'chave_certificado' and status='enviado') then
  return jsonb_build_object('success',true,'status','aceito','duplicado',true);
 end if;
 select * into f from public.certificados_fila where chave_certificado=p->>'chave_certificado';
 if found then return jsonb_build_object('success',true,'status',f.status,'duplicado',true,'id',f.id); end if;
 item_id:=regexp_replace(split_part(p->>'chave_certificado','|',1),'^monday:','');
 if exists(select 1 from public.certificados_fila_conferencia c where c.ativo and c.monday_item_id=item_id
  and (lower(c.email)=lower(p->>'destinatario') or upper(c.revisor)=upper(p->>'nome_revisor'))) then
  raise exception 'Certificado da lista de 61 pendentes: conferir no SMTP2GO antes de reenviar.';
 end if;
 insert into public.certificados_fila(chave_certificado,revisor,email,name_ua,titulo,semestre_oferta,pdf_base64,nome_arquivo,criado_por)
 values(p->>'chave_certificado',p->>'nome_revisor',lower(p->>'destinatario'),p->>'name',p->>'titulo',p->>'semestre_oferta',p->>'pdf_base64',p->>'nome_arquivo',usuario)
 returning * into f;
 return jsonb_build_object('success',true,'status',f.status,'id',f.id,'duplicado',false);
end $$;

create or replace function public.certificados_fila_worker_iniciar(token uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare c public.certificados_fila_config;
begin
 select * into c from public.certificados_fila_config where id for update;
 if c.worker_ate>now() then return false; end if;
 update public.certificados_fila_config set worker_token=token,worker_ate=now()+interval '3 minutes',ultima_execucao=now() where id;
 update public.certificados_fila set status='conferir',erro='Processamento interrompido. Conferir no SMTP2GO antes de repetir.'
 where status='processando' and tentativa_em<now()-interval '3 minutes';
 return true;
end $$;

create or replace function public.certificados_fila_reservar(token uuid, ciclo jsonb, observado_em timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.certificados_fila_config; f public.certificados_fila;
 hora_n int; dia_n int; mes_n int; desde_consulta int; usado int; restante int; inicio text; fim text;
begin
 select * into c from public.certificados_fila_config where id for update;
 if c.worker_token is distinct from token or c.worker_ate<=now() then return jsonb_build_object('motivo','Worker sem reserva.'); end if;
 if c.pausado then return jsonb_build_object('motivo',c.motivo); end if;
 if now()<c.iniciar_apos then return jsonb_build_object('motivo','Aguardando intervalo inicial de segurança.'); end if;
 usado:=(ciclo->>'cycle_used')::int; restante:=(ciclo->>'cycle_remaining')::int;
 inicio:=ciclo->>'cycle_start'; fim:=ciclo->>'cycle_end';
 if usado is null or usado<0 or restante is null or restante<0 or inicio is null or fim is null then
  raise exception 'Cota mensal indisponível. Nenhuma mensagem será enviada.';
 end if;
 if c.ciclo_inicio is distinct from inicio then
  update public.certificados_fila_config set ciclo_inicio=inicio,ciclo_fim=fim,ciclo_base_usado=usado,ciclo_base_em=observado_em where id returning * into c;
 end if;
 select count(*) into hora_n from public.certificados_fila_tentativas where criado_em>now()-interval '1 hour';
 select count(*) into dia_n from public.certificados_fila_tentativas where criado_em>now()-interval '24 hours';
 select count(*) into mes_n from public.certificados_fila_tentativas where criado_em>=c.ciclo_base_em;
 select count(*) into desde_consulta from public.certificados_fila_tentativas where criado_em>=observado_em;
 if restante=0 or greatest(usado+desde_consulta,c.ciclo_base_usado+mes_n)>=c.limite_mes then
  return jsonb_build_object('motivo','Cota mensal atingida. Aguardando renovação do SMTP2GO.');
 end if;
 if hora_n>=c.limite_hora then return jsonb_build_object('motivo','Limite de 25 por hora.'); end if;
 if dia_n>=c.limite_dia then return jsonb_build_object('motivo','Limite de 200 em 24 horas.'); end if;
 update public.certificados_fila q set status='aceito',pdf_base64=null,aceito_em=h.enviado_em,smtp2go_id=h.resend_id
 from public.certificados_envios h where q.status='na_fila' and h.status='enviado' and h.chave_certificado=q.chave_certificado;
 select * into f from public.certificados_fila where status='na_fila' order by criado_em,id limit 1 for update skip locked;
 if not found then return jsonb_build_object('motivo','Fila vazia.'); end if;
 update public.certificados_fila set status='processando',tentativa_em=now(),token_tentativa=gen_random_uuid() where id=f.id returning * into f;
 insert into public.certificados_fila_tentativas(id,fila_id) values(f.token_tentativa,f.id);
 return jsonb_build_object('job',to_jsonb(f));
end $$;

create or replace function public.certificados_fila_finalizar(fila uuid, tentativa uuid, resultado text, provedor_id text, detalhe text)
returns void language plpgsql security definer set search_path=public as $$
declare f public.certificados_fila;
begin
 if resultado not in ('aceito','erro','conferir') then raise exception 'Resultado inválido.'; end if;
 select * into f from public.certificados_fila where id=fila for update;
 if not found or f.token_tentativa is distinct from tentativa or f.status<>'processando' then raise exception 'Tentativa inválida.'; end if;
 if resultado='aceito' then
  insert into public.certificados_envios(chave_certificado,revisor,email,name_ua,titulo,semestre_oferta,status,resend_id,enviado_por)
  values(f.chave_certificado,f.revisor,f.email,f.name_ua,f.titulo,f.semestre_oferta,'enviado',provedor_id,f.criado_por)
  on conflict(chave_certificado) where status='enviado' do nothing;
 end if;
 update public.certificados_fila set status=resultado,smtp2go_id=provedor_id,erro=detalhe,
 aceito_em=case when resultado='aceito' then now() else null end,
 pdf_base64=case when resultado='aceito' then null else pdf_base64 end where id=fila;
end $$;
create or replace function public.certificados_fila_worker_encerrar(token uuid, detalhe text)
returns void language sql security definer set search_path=public as $$
 update public.certificados_fila_config set worker_token=null,worker_ate=null,ultimo_erro=detalhe where id and worker_token=token;
$$;
revoke all on function public.certificados_fila_adicionar(jsonb,uuid),public.certificados_fila_worker_iniciar(uuid),public.certificados_fila_reservar(uuid,jsonb,timestamptz),public.certificados_fila_finalizar(uuid,uuid,text,text,text),public.certificados_fila_worker_encerrar(uuid,text) from public,anon,authenticated;
grant execute on function public.certificados_fila_adicionar(jsonb,uuid),public.certificados_fila_worker_iniciar(uuid),public.certificados_fila_reservar(uuid,jsonb,timestamptz),public.certificados_fila_finalizar(uuid,uuid,text,text,text),public.certificados_fila_worker_encerrar(uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
