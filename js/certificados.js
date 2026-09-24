(function(){
  "use strict";
  let base=[], filtrados=[], emailMap=new Map(), historico=new Set(), inicializado=false;
  const $=id=>document.getElementById(id);
  const txt=v=>String(v??"").trim();
  const norm=v=>txt(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ");
  const esc=s=>txt(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  function emailDoTexto(v){const m=txt(v).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);return m?m[0].toLowerCase():""}
  function chave(r){return [norm(r.revisor),norm(r.name),norm(r.titulo),norm(r.semestre)].join("|")}
  async function carregarEmails(){
    try{const {data,error}=await window.biSupabase.from("nq_responsaveis").select("nome_oficial,aliases,emails,eh_revisor,ativo").eq("ativo",true).eq("eh_revisor",true); if(error) throw error;
      (data||[]).forEach(x=>{const em=(Array.isArray(x.emails)?x.emails:[]).map(emailDoTexto).find(Boolean)||""; [x.nome_oficial,...(x.aliases||[]),...(x.emails||[])].forEach(a=>{if(norm(a)&&em) emailMap.set(norm(a),em)})});
    }catch(e){console.warn("E-mails NQ não carregados",e)}
  }
  async function carregarHistorico(){
    try{const {data,error}=await window.biSupabase.from("certificados_envios").select("chave_certificado,status").eq("status","enviado"); if(error) throw error; historico=new Set((data||[]).map(x=>x.chave_certificado));}catch(e){console.warn("Histórico de certificados ainda não instalado.",e)}
  }
  function montar(dados){
    const map=new Map();
    (dados||[]).filter(x=>norm(x.status_validacao)==="validado" && txt(x.revisor_validador)).forEach(x=>{
      const revisor=txt(x.revisor_validador), name=txt(x.item_name||x.titulo_ua||x.unidade_material||x.id_ua), titulo=txt(x.titulo||x.id_titulo), semestre=txt(x.semestre_oferta);
      if(!name) return;
      const email=emailDoTexto(revisor)||emailMap.get(norm(revisor))||"";
      const r={revisor:revisor.replace(/\s*-?\s*[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,"").trim()||revisor,email,name,titulo,semestre}; r.chave=chave(r); if(!map.has(r.chave)) map.set(r.chave,r);
    }); base=[...map.values()].sort((a,b)=>a.revisor.localeCompare(b.revisor,"pt-BR"));
  }
  function popular(){
    const sem=$('certSemestre'), rev=$('certRevisor'); if(!sem||!rev)return;
    const sv=sem.value,rv=rev.value;
    sem.innerHTML='<option value="">Todos os semestres</option>'+[...new Set(base.map(x=>x.semestre).filter(Boolean))].sort().map(v=>`<option>${esc(v)}</option>`).join('');
    rev.innerHTML='<option value="">Todos os revisores</option>'+[...new Set(base.map(x=>x.revisor))].sort((a,b)=>a.localeCompare(b,'pt-BR')).map(v=>`<option>${esc(v)}</option>`).join('');
    sem.value=sv;rev.value=rv;
  }
  function render(){
    const sem=$('certSemestre')?.value||'', rev=$('certRevisor')?.value||'', q=norm($('certBusca')?.value||'');
    filtrados=base.filter(r=>(!sem||r.semestre===sem)&&(!rev||r.revisor===rev)&&(!q||norm([r.revisor,r.email,r.name,r.titulo,r.semestre].join(' ')).includes(q)));
    $('certElegiveis').textContent=filtrados.length; $('certRevisores').textContent=new Set(filtrados.map(x=>norm(x.revisor))).size; $('certSemEmail').textContent=filtrados.filter(x=>!x.email).length;
    const tb=$('certTbody'); if(!tb)return; tb.innerHTML=filtrados.length?filtrados.map((r,i)=>`<tr><td><input type="checkbox" class="cert-check" data-i="${i}" ${!r.email?'disabled':''}></td><td>${esc(r.revisor)}</td><td>${r.email?esc(r.email):'<span class="cert-email-missing">Não localizado</span>'}</td><td>${esc(r.name)}</td><td>${esc(r.titulo)}</td><td>${esc(r.semestre||'--')}</td><td><span class="cert-pill">${historico.has(r.chave)?'Enviado':'Pendente'}</span></td><td><button class="cert-btn cert-one" data-i="${i}">PDF</button></td></tr>`).join(''):'<tr><td colspan="8" class="empty-table">Nenhum certificado encontrado.</td></tr>';
    atualizarSel();
  }
  function selecionados(){return [...document.querySelectorAll('.cert-check:checked')].map(c=>filtrados[+c.dataset.i]).filter(Boolean)}
  function atualizarSel(){$('certSelecionados').textContent=selecionados().length}
  function carregarImagem(){return new Promise((ok,no)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=no;im.src='assets_certificado.png';})}
  function quebrar(ctx,text,max){const words=txt(text).split(/\s+/), lines=[];let line='';for(const w of words){const t=line?line+' '+w:w;if(ctx.measureText(t).width>max&&line){lines.push(line);line=w}else line=t}if(line)lines.push(line);return lines}
  async function pdf(r,baixar=true){
    const im=await carregarImagem(), c=document.createElement('canvas'); c.width=2000;c.height=1414;const ctx=c.getContext('2d');ctx.drawImage(im,0,0,c.width,c.height);ctx.fillStyle='#171717';ctx.font='30px Arial';ctx.textAlign='left';
    const texto=`Certificamos que ${r.revisor} participou da criação e validação do material didático digital denominado Unidade de Aprendizagem ${r.name}, vinculada ao ${r.titulo}, concluída no período de ${r.semestre}, em conformidade com os parâmetros de qualidade e as diretrizes pedagógicas, técnicas e editoriais estabelecidas pela Ânima Educação.`;
    const lines=quebrar(ctx,texto,1560), lh=43, y0=535;lines.forEach((l,i)=>ctx.fillText(l,220,y0+i*lh));
    const {jsPDF}=window.jspdf;const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});doc.addImage(c.toDataURL('image/jpeg',.95),'JPEG',0,0,297,210);const nome=`Certificado_${r.revisor}_${r.name}`.replace(/[^\p{L}\p{N}_-]+/gu,'_')+'.pdf'; if(baixar)doc.save(nome);return {base64:doc.output('datauristring').split(',')[1],nome};
  }
  async function enviar(r){
    if(!r.email)throw new Error('E-mail do revisor não localizado.'); const p=await pdf(r,false); const {data:{session}}=await window.biSupabase.auth.getSession(); if(!session)throw new Error('Sessão expirada. Entre novamente no BI.');
    const resp=await fetch(`${window.BI_CONFIG.SUPABASE_URL}/functions/v1/enviar-certificado`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'apikey':window.BI_CONFIG.SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({destinatario:r.email,nome_revisor:r.revisor,name:r.name,titulo:r.titulo,semestre_oferta:r.semestre,pdf_base64:p.base64,nome_arquivo:p.nome})});
    const out=await resp.json().catch(()=>({})); if(!resp.ok||!out.success)throw new Error(out?.detalhe?.message||out?.error||`Erro HTTP ${resp.status}`);
    historico.add(r.chave); try{await window.biSupabase.from('certificados_envios').insert({chave_certificado:r.chave,revisor:r.revisor,email:r.email,name_ua:r.name,titulo:r.titulo,semestre_oferta:r.semestre,status:'enviado',resend_id:out.resend_id})}catch(e){} return out;
  }
  async function init(dados){
    if(!inicializado){inicializado=true;await Promise.all([carregarEmails(),carregarHistorico()]); ['certSemestre','certRevisor'].forEach(id=>$(id)?.addEventListener('change',render));$('certBusca')?.addEventListener('input',render);document.addEventListener('change',e=>{if(e.target.classList.contains('cert-check'))atualizarSel()});
      $('certSelecionarTodos')?.addEventListener('click',()=>{document.querySelectorAll('.cert-check:not(:disabled)').forEach(x=>x.checked=true);atualizarSel()});
      $('certGerar')?.addEventListener('click',async()=>{const arr=selecionados();if(!arr.length)return alert('Selecione ao menos um certificado.');for(const r of arr)await pdf(r,true)});
      $('certEnviar')?.addEventListener('click',async()=>{const arr=selecionados();if(!arr.length)return alert('Selecione ao menos um certificado com e-mail.');if(!confirm(`Enviar ${arr.length} certificado(s)?`))return;const b=$('certEnviar'),st=$('certStatus');b.disabled=true;let ok=0,er=0;for(const r of arr){st.textContent=`Enviando ${ok+er+1} de ${arr.length}: ${r.revisor}`;try{await enviar(r);ok++}catch(e){er++;console.error(r,e)}}b.disabled=false;st.textContent=`Concluído: ${ok} enviado(s), ${er} erro(s).`;render()});
      document.addEventListener('click',async e=>{const b=e.target.closest('.cert-one');if(b){b.disabled=true;try{await pdf(filtrados[+b.dataset.i],true)}finally{b.disabled=false}}});
    }
    montar(dados);popular();render();
  }
  window.atualizarCertificados=init;
})();
