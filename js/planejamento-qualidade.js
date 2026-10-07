(() => {
  'use strict';
  const txt = v => String(v ?? '').trim();
  const norm = v => txt(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLowerCase();
  const aliases = {'joao':'João Guilherme','joao guilherme':'João Guilherme','ligia':'Ligia Paolilo','ligia paolilo':'Ligia Paolilo',
    'clea':'Cléa Domingues','clea domingues':'Cléa Domingues','cris':'Cristina Quiteria','cristina':'Cristina Quiteria',
    'cristina quiteria':'Cristina Quiteria','luciana':'Luciana Bandeira','luciana bandeira':'Luciana Bandeira','paula':'Paula Madalena','paula madalena':'Paula Madalena'};
  function nomes(v) {
    const lista = (Array.isArray(v) ? v : [v]).flatMap(x => txt(x).split(/\s*(?:,|;|\||\/|&|\be\b)\s*/i)).filter(Boolean);
    return [...new Map(lista.map(n => {const nome = aliases[norm(n)] || txt(n).replace(/\s+/g, ' '); return [norm(nome), nome];})).values()];
  }
  function status(v) {
    const n = norm(v);
    if (/finaliz|conclu|^done$|^closed$/.test(n)) return 'concluida';
    if (/progres|andamento|^active$/.test(n)) return 'em_andamento';
    if (/paus|bloque|cancel/.test(n)) return 'bloqueada';
    if (/fazer|nao iniciado|^new$|^to do$/.test(n)) return 'a_fazer';
    // Estados desconhecidos ficam visíveis em Bloqueada, com o texto original.
    return 'bloqueada';
  }
  function prioridade(v) {
    const n = norm(v);
    return /critic|urgent|^1$/.test(n) ? 'critica' : /alta|^2$/.test(n) ? 'alta' : /baixa|^4$/.test(n) ? 'baixa' : 'media';
  }
  const chave = (x, tipo) => `${tipo}:${txt(x.source_key) || (txt(x.id_azure) ? `${tipo === 'projeto' ? 'P' : 'T'}|${x.id_azure}` : `base|${x.id}`)}`;
  const responsaveis = x => nomes(x.sponsor_lista?.length ? x.sponsor_lista : x.sponsor || x.responsavel);
  function ref(x, tipo) {
    return {tipo:tipo === 'projeto' ? 'projeto' : 'tarefa_projeto',id:txt(x.id),label:txt(x.projeto || x.acao).slice(0,600),pagina:'projeto-qualidade',
      dados:{id:txt(x.id),projeto:x.projeto,descricao:tipo === 'tarefa' ? x.acao : '',status:x.status,sponsor:x.sponsor || '',
        azure_id:txt(x.id_azure),planejamento_qualidade:true,source_key:txt(x.source_key),qualidade_chave:chave(x,tipo)}};
  }
  function projetar(persistidas, fonte) {
    const anotacoes = new Map(persistidas.filter(t => t.qualidade_chave).map(t => [t.qualidade_chave,t]));
    const resultado = persistidas.filter(t => !t.qualidade_chave), usadas = new Set(), passosUsados = new Set();
    const projetos = fonte.projetos || [], tarefas = (fonte.tarefas || []).filter(t => t.ativo !== false);
    const nomesProjetos = new Map();
    projetos.filter(p => p.ativo !== false).forEach(p => {const n=norm(p.projeto);nomesProjetos.set(n,[...(nomesProjetos.get(n)||[]),p]);});
    function criar(x,tipo,filhos) {
      const key=chave(x,tipo), salvo=anotacoes.get(key), vinculo=ref(x,tipo), pessoas=responsaveis(x);
      usadas.add(key);
      const etapasFonte=filhos.map(t => {
        passosUsados.add(chave(t,'tarefa'));
        const donos=responsaveis(t);
        return {id:chave(t,'tarefa'),titulo:txt(t.acao || t.descricao),concluida:status(t.status)==='concluida',statusOriginal:txt(t.status),
          responsavel:(donos.length?donos:pessoas).join('; '),prazo:txt(t.data_fim).slice(0,10),fonte:t};
      });
      const ativos=x.ativo!==false;
      resultado.push({...salvo,id:salvo?.id || `pq:${key}`,titulo:txt(tipo==='projeto'?x.projeto:x.acao || x.descricao),
        descricao:salvo?.descricao || '',responsavel:pessoas.join('; '),prazo:txt(x.data_fim).slice(0,10),status:status(x.status),prioridade:prioridade(x.prioridade),
        atencao:salvo?.atencao || false,arquivada:!ativos || !!salvo?.arquivada,
        etapas:[...etapasFonte,...(salvo?.etapas || [])],vinculos:[vinculo,...(salvo?.vinculos || []).filter(r=>!r.dados?.planejamento_qualidade)],
        atualizado_em:x.updated_at || salvo?.atualizado_em || fonte.lidoEm,qualidade_chave:key,
        qualidade:{chave:key,fonte:x,tipo,etapas:etapasFonte,salvo:salvo || null,ativo:ativos,ref:vinculo}});
    }
    projetos.filter(p => p.ativo!==false || anotacoes.has(chave(p,'projeto'))).forEach(p => {
      const filhos=p.ativo===false?[]:tarefas.filter(t => {
        if (t.projeto_id != null && txt(t.projeto_id)===txt(p.id)) return true;
        return norm(t.projeto)===norm(p.projeto) && nomesProjetos.get(norm(p.projeto))?.length===1;
      });
      criar(p,'projeto',filhos);
    });
    // Nunca descarta ações sem um projeto correspondente ou com nome ambíguo.
    tarefas.filter(t => !passosUsados.has(chave(t,'tarefa'))).forEach(t => criar(t,'tarefa',[]));
    anotacoes.forEach((t,key) => {
      if (!usadas.has(key)) resultado.push({...t,arquivada:true,qualidade:{chave:key,fonte:null,tipo:key.startsWith('projeto:')?'projeto':'tarefa',etapas:[],salvo:t,ativo:false,ref:t.vinculos.find(r=>r.dados?.planejamento_qualidade)}});
    });
    return resultado;
  }
  async function ler(todasLinhas) {
    const sb=window.biSupabase;
    async function ultima() {
      const {data,error}=await sb.from('pq_importacoes_atual').select('*').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1);
      if(error) throw error;
      const log=data?.[0];
      if (log && !['concluida','concluída'].includes(norm(log.status)))
        throw new Error(norm(log.status)==='processando' ? 'Projeto Qualidade está sendo importado. O quadro será atualizado após a conclusão.' : 'A última importação de Projeto Qualidade falhou. Confira a importação antes de atualizar o quadro.');
      return log;
    }
    const antes=await ultima();
    const [projetos,tarefas]=await Promise.all([todasLinhas('pq_projetos_atual'),todasLinhas('pq_tarefas_atual')]);
    const depois=await ultima();
    if(JSON.stringify([antes?.id,antes?.finished_at])!==JSON.stringify([depois?.id,depois?.finished_at]))
      throw new Error('Projeto Qualidade mudou durante a leitura. A próxima atualização buscará a base completa.');
    return {projetos,tarefas,lidoEm:new Date().toISOString()};
  }
  window.biPlanejamentoQualidade={nomes,status,prioridade,projetar,ler};
})();
