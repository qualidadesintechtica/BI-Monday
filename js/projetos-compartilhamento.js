(function(){
  'use strict';
  const included=item=>![false,'false',0,'0'].includes(item?.incluir_relatorio);
  const paths=edition=>new Set((Array.isArray(edition?.evidencias)?edition.evidencias:[]).filter(included).map(e=>String(e.storage_path||'').trim()).filter(Boolean));
  function endpoint(){
    const base=String(window.BI_CONFIG?.SUPABASE_URL||'').replace(/\/$/,'');
    if(!/^https:\/\//.test(base))throw new Error('Configuração do Supabase indisponível para as evidências.');
    return base+'/functions/v1/pq-evidencia-publica';
  }
  function removePrivateAction(block,message){
    const action=block.querySelector('.evidence-open-file');
    if(action){const text=document.createElement('span');text.textContent=message;action.replaceWith(text);}
  }
  async function confirmarServico(base){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch(base+'?status=1',{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});
      const status=response.ok?await response.json():null;
      if(status?.ok!==true||status.versao!=='25.46.69')throw new Error('Serviço não confirmado.');
    }catch{throw new Error('Publique pq-evidencia-publica com a verificação JWT desativada somente nessa função para habilitar os downloads sem login.');}
    finally{clearTimeout(timer);}
  }
  async function prepararPdf(root,edition){
    const blocks=[...root.querySelectorAll('.report-evidence-file')].filter(b=>b.querySelector('[data-storage-path]'));
    if(!blocks.length)return;
    if(!edition?.id){for(const block of blocks)removePrivateAction(block,'Salve uma versão para incluir o link de download no PDF.');return;}
    const expected=paths(edition),base=endpoint();
    await confirmarServico(base);
    const {data,error}=await window.biSupabase.rpc('pq_emitir_links_evidencias',{p_edicao_id:String(edition.id)});
    if(error)throw new Error(['PGRST202','42883'].includes(error.code)?'Para gerar downloads sem login, instale docs/25_DOWNLOAD_EVIDENCIAS_RELATORIO.sql e publique pq-evidencia-publica.':error.message||'Não foi possível preparar os links das evidências.');
    if(!Array.isArray(data))throw new Error('O serviço não retornou os links das evidências.');
    const links=new Map();
    for(const row of data){
      if(!expected.has(row.storage_path)||!/^[0-9a-f]{64}$/.test(row.token||''))throw new Error('O vínculo da evidência mudou. Atualize a versão antes de imprimir.');
      links.set(row.storage_path,base+'?token='+row.token);
    }
    for(const block of blocks){
      const action=block.querySelector('[data-storage-path]'),path=action.dataset.storagePath;
      if(!expected.has(path)||!links.has(path))throw new Error('Uma evidência do relatório não recebeu link de download. Confira a versão salva.');
      const a=document.createElement('a');a.href=links.get(path);a.className='report-evidence-external-link pq-evidence-public-link';
      a.target='_blank';a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';a.textContent='Baixar evidência';
      a.title='Download disponível para quem tiver este relatório, sem login no BI.';action.replaceWith(a);
      const help=block.querySelector('small');if(help)help.textContent='Disponível para download por quem receber este relatório.';
    }
  }
  async function revogar(editionID){
    const {data,error}=await window.biSupabase.rpc('pq_revogar_links_evidencias',{p_edicao_id:String(editionID)});
    if(error)throw new Error(error.message||'Não foi possível desativar os links.');return data;
  }
  window.biProjetosCompartilhamento={prepararPdf,revogar};
})();
