-- V25.46.63 | Arquivar e restaurar qualquer card do Planejamento.
-- Execute depois dos SQLs 15 e 16. Reaplicável e sem excluir dados.
begin;

create or replace function public.bi_planejamento_arquivar(
  p_id uuid, p_versao bigint, p_chave text, p_arquivada boolean
) returns public.bi_planejamento_tarefas
language plpgsql security definer set search_path = '' as $$
declare
  v_antes public.bi_planejamento_tarefas;
  v_depois public.bi_planejamento_tarefas;
  v_fonte jsonb;
  v_tipo text;
  v_importacao text;
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_ref jsonb;
begin
  if not public.bi_planejamento_permitido() then
    raise exception 'Sessão institucional não autorizada.';
  end if;
  if p_arquivada is null then raise exception 'Informe a ação de arquivamento.'; end if;
  if p_chave is not null then
    if length(p_chave) not between 1 and 2000
       or (p_chave not like 'projeto:%' and p_chave not like 'tarefa:%') then
      raise exception 'Referência de Projeto Qualidade inválida.';
    end if;
    -- Mesmo bloqueio usado pelas anotações: protege o primeiro arquivamento.
    perform pg_advisory_xact_lock(hashtextextended(p_chave,0));
    select * into v_antes from public.bi_planejamento_tarefas
      where qualidade_chave=p_chave for update;
  else
    if p_id is null then raise exception 'Card não localizado.'; end if;
    select * into v_antes from public.bi_planejamento_tarefas where id=p_id for update;
    if not found then raise exception 'Card não localizado.'; end if;
  end if;

  if v_antes.id is not null then
    if p_id is distinct from v_antes.id or p_versao is distinct from v_antes.versao
       or p_chave is distinct from v_antes.qualidade_chave then
      raise exception 'Este card foi alterado pela equipe. Atualize o quadro e tente novamente.';
    end if;
  elsif p_id is not null or p_versao is not null then
    raise exception 'Card não localizado. Atualize o quadro.';
  end if;

  -- Uma importação não deve criar uma anotação usando uma base parcial.
  if p_chave is not null then
    select status into v_importacao from public.pq_importacoes_atual
      order by created_at desc,id desc limit 1;
    if v_importacao is not null and lower(trim(v_importacao)) not in ('concluida','concluída') then
      raise exception 'Aguarde uma importação concluída de Projeto Qualidade antes de arquivar ou restaurar.';
    end if;
    v_tipo := split_part(p_chave,':',1);
    if v_tipo='projeto' then
      select to_jsonb(p) into v_fonte from public.pq_projetos_atual p
      where 'projeto:' || coalesce(nullif(to_jsonb(p)->>'source_key',''),
        case when nullif(to_jsonb(p)->>'id_azure','') is not null
          then 'P|'||(to_jsonb(p)->>'id_azure') else 'base|'||(to_jsonb(p)->>'id') end)=p_chave;
    else
      select to_jsonb(t) into v_fonte from public.pq_tarefas_atual t
      where 'tarefa:' || coalesce(nullif(to_jsonb(t)->>'source_key',''),
        case when nullif(to_jsonb(t)->>'id_azure','') is not null
          then 'T|'||(to_jsonb(t)->>'id_azure') else 'base|'||(to_jsonb(t)->>'id') end)=p_chave;
    end if;
    if (v_antes.id is null or not p_arquivada)
       and (v_fonte is null or coalesce((v_fonte->>'ativo')::boolean,true) is false) then
      raise exception 'O item saiu da base ativa de Projeto Qualidade. Suas anotações permanecem disponíveis; restaure após ele voltar à base.';
    end if;
  end if;

  if v_antes.id is not null then
    if v_antes.arquivada=p_arquivada then return v_antes; end if;
    -- Altera só a visibilidade; não valida nem modifica status, passos ou edição.
    update public.bi_planejamento_tarefas set arquivada=p_arquivada,
      versao=versao+1, atualizado_em=now(), atualizado_por=auth.uid(), atualizado_por_email=v_email
      where id=v_antes.id returning * into v_depois;
  else
    if not p_arquivada then raise exception 'Este card ainda não foi arquivado.'; end if;
    v_ref:=jsonb_build_object('tipo',case v_tipo when 'projeto' then 'projeto' else 'tarefa_projeto' end,
      'id',v_fonte->>'id','label',left(coalesce(nullif(v_fonte->>'acao',''),v_fonte->>'projeto','Card'),600),
      'pagina','projeto-qualidade','dados',jsonb_build_object('id',v_fonte->>'id',
        'projeto',v_fonte->>'projeto','descricao',v_fonte->>'acao','status',v_fonte->>'status',
        'sponsor',v_fonte->>'sponsor','azure_id',v_fonte->>'id_azure','planejamento_qualidade',true,
        'source_key',v_fonte->>'source_key','qualidade_chave',p_chave));
    insert into public.bi_planejamento_tarefas(titulo,responsavel,prazo,vinculos,qualidade_chave,arquivada,
      criado_por,criado_por_email,atualizado_por,atualizado_por_email)
    values(left(coalesce(nullif(case v_tipo when 'projeto' then v_fonte->>'projeto'
        else coalesce(v_fonte->>'acao',v_fonte->>'descricao') end,''),'Card do Projeto Qualidade'),200),
      left(coalesce(v_fonte->>'sponsor',''),300),nullif(v_fonte->>'data_fim','')::date,
      jsonb_build_array(v_ref),p_chave,true,auth.uid(),v_email,auth.uid(),v_email)
    returning * into v_depois;
  end if;
  insert into public.bi_planejamento_historico(tarefa_id,acao,antes,depois,usuario_id,usuario_email)
  values(v_depois.id,case when p_arquivada then 'arquivada' else 'restaurada' end,
    case when v_antes.id is null then null else to_jsonb(v_antes) end,to_jsonb(v_depois),auth.uid(),v_email);
  return v_depois;
end;
$$;
revoke all on function public.bi_planejamento_arquivar(uuid,bigint,text,boolean) from public,anon;
grant execute on function public.bi_planejamento_arquivar(uuid,bigint,text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
select 'Arquivamento de cards V25.46.63 instalado' as resultado;
