(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BIPlanejamentoAtividadesCore=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const SEM_RESPONSAVEL='__SEM_RESPONSAVEL__';
  const STATUS={a_fazer:'A fazer',em_andamento:'Em andamento',bloqueada:'Bloqueada',concluida:'Concluída'};
  const PRIORIDADES={baixa:'Baixa',media:'Média',alta:'Alta',critica:'Crítica'};
  const text=v=>String(v??'').trim(),norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toLowerCase();
  function day(value){
    const iso=text(value).slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return null;
    const date=new Date(iso+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===iso?date.getTime()/86400000:null;
  }
  function deadline(row,today){
    const due=day(row.due),now=day(today),days=due===null||now===null?null:due-now;
    if(row.archived)return {kind:'arquivada',label:'Arquivada',days};
    if(row.status==='concluida')return {kind:'concluida',label:'Concluída',days};
    if(!text(row.due))return {kind:'sem-prazo',label:'Sem vencimento',days:null};
    if(due===null||now===null)return {kind:'invalida',label:'Data inválida',days:null};
    if(days<0)return {kind:'atrasada',label:`Vencida há ${-days} ${days===-1?'dia':'dias'}`,days};
    if(days===0)return {kind:'hoje',label:'Vence hoje',days};
    if(days<=5)return {kind:'proxima',label:days===1?'Vence amanhã':`Vence em ${days} dias`,days};
    return {kind:'em-dia',label:`Vence em ${days} dias`,days};
  }
  function project(cards,{names,sourceStatus},today){
    const rows=new Map();
    for(const card of cards){
      const parentKey=card.qualidade?.chave||'card:'+text(card.id),steps=Array.isArray(card.etapas)?card.etapas:[];
      const add=(step,index)=>{
        const source=step?.fonte,quality=source||card.qualidade;
        const sourceKey=text(step?.id)||(text(source?.source_key||source?.id)?'tarefa:'+text(source.source_key||source.id):'');
        const key=source?(sourceKey||parentKey+'|passo:'+index):step?parentKey+'|passo:'+text(step.id||index):parentKey;
        const ownNames=names(step?(source?(source.sponsor_lista?.length?source.sponsor_lista:source.sponsor||source.responsavel):step.responsavel):card.responsavel);
        const parentNames=step?names(card.responsavel):[],inherited=!!step&&!ownNames.length&&parentNames.length>0;
        const owners=inherited?parentNames:ownNames;
        const status=step?(source?sourceStatus(step.statusOriginal||source.status):step.concluida?'concluida':'a_fazer'):(STATUS[card.status]?card.status:'bloqueada');
        const row={key,cardId:text(card.id),stepId:step?text(step.id):'',stepIndex:step&&!source?index-(card.qualidade?.etapas?.length||0):null,sourceStep:!!source,
          activity:text(step?step.titulo:card.titulo)||'Atividade sem título',project:text(source?.projeto||card.qualidade?.fonte?.projeto||card.titulo),
          owners:[...new Map(owners.map(n=>[norm(n),text(n)])).values()],inheritedOwner:inherited,
          due:text(step?step.prazo:card.prazo),status,priority:card.prioridade,
          archived:!!card.arquivada||source?.ativo===false,attention:!!card.atencao,
          areas:[...new Set((card.vinculos||[]).map(r=>r.pagina))],
          context:[card.descricao,card.qualidade?.fonte?.contexto_objetivo_original,...(card.vinculos||[]).map(r=>r.label)].filter(Boolean).join(' '),
          source:quality?'Projeto Qualidade':'Planejamento',type:step?'Passo':card.qualidade?.tipo==='projeto'?'Projeto sem tarefas':'Atividade'};
        row.deadline=deadline(row,today);
        if(!rows.has(key)||(rows.get(key).archived&&!row.archived))rows.set(key,row);
      };
      // Cards com passos são contêineres; não se somam novamente às atividades.
      if(steps.length)steps.forEach(add);else add(null,null);
    }
    return [...rows.values()];
  }
  function filter(rows,f={}){
    const from=f.from?day(f.from):null,to=f.to?day(f.to):null;
    if((f.from&&from===null)||(f.to&&to===null))return {rows:[],error:'Informe datas válidas para o período de vencimento.'};
    if(from!==null&&to!==null&&from>to)return {rows:[],error:'O vencimento inicial deve ser anterior ou igual ao final.'};
    const q=norm(f.search);
    const selected=rows.filter(r=>{
      if(r.archived!==!!f.archived)return false;
      if(f.owner===SEM_RESPONSAVEL&&r.owners.length)return false;
      if(f.owner&&f.owner!==SEM_RESPONSAVEL&&!r.owners.some(n=>norm(n)===norm(f.owner)))return false;
      if(f.status&&r.status!==f.status)return false;
      if(f.priority&&r.priority!==f.priority)return false;
      if(f.area&&!r.areas.includes(f.area))return false;
      if(f.attention&&!f.archived&&!r.attention&&r.status!=='bloqueada'&&!['atrasada','hoje','proxima'].includes(r.deadline.kind))return false;
      if(f.due==='proximas'&&!['hoje','proxima'].includes(r.deadline.kind))return false;
      if(f.due&&f.due!=='proximas'&&r.deadline.kind!==f.due)return false;
      const date=day(r.due);if((from!==null||to!==null)&&(date===null||(from!==null&&date<from)||(to!==null&&date>to)))return false;
      return !q||norm([r.activity,r.project,r.owners.join(' '),r.context].join(' ')).includes(q);
    });
    selected.sort((a,b)=>Number(a.status==='concluida')-Number(b.status==='concluida')||(day(a.due)??Infinity)-(day(b.due)??Infinity)||norm(a.owners.join(' ')).localeCompare(norm(b.owners.join(' ')),'pt-BR')||a.activity.localeCompare(b.activity,'pt-BR')||a.key.localeCompare(b.key));
    return {rows:selected,error:''};
  }
  function stats(rows){
    return {total:rows.length,open:rows.filter(r=>r.status!=='concluida').length,overdue:rows.filter(r=>r.deadline.kind==='atrasada').length,
      soon:rows.filter(r=>['hoje','proxima'].includes(r.deadline.kind)).length,done:rows.filter(r=>r.status==='concluida').length,
      noDate:rows.filter(r=>!text(r.due)).length,noOwner:rows.filter(r=>!r.owners.length).length};
  }
  function summaries(rows){
    const groups=new Map();
    for(const r of rows)for(const owner of r.owners.length?r.owners:[SEM_RESPONSAVEL]){
      const key=norm(owner);if(!groups.has(key))groups.set(key,{owner,label:owner===SEM_RESPONSAVEL?'Sem responsável':owner,rows:[]});groups.get(key).rows.push(r);
    }
    return [...groups.values()].sort((a,b)=>a.label.localeCompare(b.label,'pt-BR')).map(g=>({...g,...stats(g.rows)}));
  }
  function csv(rows){
    const cell=value=>{let s=String(value??'');if(/^[\s\u0000-\u001f]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    const matrix=[['Responsável(is)','Atividade','Projeto / card','Vencimento','Situação do prazo','Status','Prioridade','Origem'],
      ...rows.map(r=>[r.owners.join('; ')||'Sem responsável',r.activity,r.project,r.due,r.deadline.label,STATUS[r.status],PRIORIDADES[r.priority]||'Não informada',r.source])];
    return '\uFEFF'+matrix.map(row=>row.map(cell).join(';')).join('\r\n');
  }
  return {SEM_RESPONSAVEL,STATUS,PRIORIDADES,text,norm,day,deadline,project,filter,stats,summaries,csv};
});
