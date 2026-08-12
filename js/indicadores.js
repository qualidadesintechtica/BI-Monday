(function () {
  "use strict";

  const STATUS_AJUSTE = new Set([
    "Ajustes - CONTEUDISTA E DA",
    "Ajustes - MODELAGEM",
    "Ajustes - GERÊNCIA DE TECNOLOGIA"
  ]);

  let chartOpBloco, chartOpStatus, chartDiasFaixas, chartDiasBloco, chartHistDia, chartHistAcum;

  function unicos(dados) {
    return typeof window.consolidarUAs === "function" ? window.consolidarUAs(dados || []) : (dados || []);
  }
  function texto(v, fallback="Em branco") { return v === null || v === undefined || String(v).trim()==="" ? fallback : String(v).trim(); }
  function setText(id, value) { const el=document.getElementById(id); if(el) el.textContent=value; }
  function initChart(id, atual) {
    const el=document.getElementById(id); if(!el || typeof echarts === "undefined") return null;
    atual?.dispose(); return echarts.init(el);
  }
  function ehNQ(x){ return ["Liberado para validação - NQ","Revalidar - NQ"].includes(x.status_validacao); }
  function ehAjuste(x){ return STATUS_AJUSTE.has(x.status_validacao); }

  function renderOperacional(dados) {
    const rows=unicos(dados);
    const cats={validadas:0,nq:0,ajuste:0,aLiberar:0};
    const blocos=new Map();
    rows.forEach(x=>{
      const b=texto(x.bloco,"Em branco");
      if(!blocos.has(b)) blocos.set(b,{total:0,validadas:0,nq:0,ajuste:0,aLiberar:0});
      const r=blocos.get(b); r.total++;
      if(x.status_validacao==="Validado"){r.validadas++;cats.validadas++;}
      if(ehNQ(x)){r.nq++;cats.nq++;}
      if(ehAjuste(x)){r.ajuste++;cats.ajuste++;}
      if(x.status_validacao==="A liberar"){r.aLiberar++;cats.aLiberar++;}
    });
    setText("opValidadas",cats.validadas); setText("opNQ",cats.nq); setText("opAjuste",cats.ajuste); setText("opALiberar",cats.aLiberar);
    const arr=Array.from(blocos.entries()).sort((a,b)=>a[0].localeCompare(b[0],"pt-BR",{numeric:true}));
    const tb=document.getElementById("tbodyGraficoOperacional");
    if(tb) tb.innerHTML=arr.length?arr.map(([b,r])=>`<tr><td>${b}</td><td>${r.total}</td><td>${r.validadas}</td><td>${r.nq}</td><td>${r.ajuste}</td><td>${r.aLiberar}</td></tr>`).join(""):'<tr><td colspan="6" class="empty-table">Nenhum registro nos filtros atuais.</td></tr>';

    chartOpBloco=initChart("graficoOperacionalBloco",chartOpBloco);
    chartOpBloco?.setOption({tooltip:{trigger:"axis"},legend:{top:0},grid:{left:45,right:20,top:50,bottom:60},xAxis:{type:"category",data:arr.map(x=>x[0]),axisLabel:{rotate:30}},yAxis:{type:"value",minInterval:1},series:[
      {name:"Validadas",type:"bar",stack:"total",data:arr.map(x=>x[1].validadas)},
      {name:"Em NQ",type:"bar",stack:"total",data:arr.map(x=>x[1].nq)},
      {name:"Em ajuste",type:"bar",stack:"total",data:arr.map(x=>x[1].ajuste)},
      {name:"A liberar",type:"bar",stack:"total",data:arr.map(x=>x[1].aLiberar)}
    ]});

    chartOpStatus=initChart("graficoOperacionalStatus",chartOpStatus);
    chartOpStatus?.setOption({tooltip:{trigger:"item"},legend:{bottom:0},series:[{type:"pie",radius:["45%","72%"],data:[
      {name:"Validadas",value:cats.validadas},{name:"Em NQ",value:cats.nq},{name:"Em ajuste",value:cats.ajuste},{name:"A liberar",value:cats.aLiberar}
    ],label:{formatter:"{b}\n{c}"}}]});
  }

  function diasEntre(a,b){ if(!a||!b)return null; const x=new Date(a),y=new Date(b); if(Number.isNaN(x.getTime())||Number.isNaN(y.getTime()))return null; return Math.max(0,Math.round((y-x)/86400000)); }
  function fmtData(v){ if(!v)return "--"; const d=new Date(v); return Number.isNaN(d.getTime())?"--":d.toLocaleDateString("pt-BR"); }
  function mediana(nums){ if(!nums.length)return 0; const s=[...nums].sort((a,b)=>a-b),m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; }

  function renderDias(dados){
    const rows=unicos(dados).map(x=>({...x,dias:diasEntre(x.data_liberacao_validacao,x.data_validacao)})).filter(x=>x.dias!==null);
    const nums=rows.map(x=>x.dias); const media=nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:0;
    setText("diasMedia",media.toFixed(1)); setText("diasMediana",mediana(nums).toFixed(1)); setText("diasAte7",nums.filter(x=>x<=7).length); setText("diasAcima15",nums.filter(x=>x>15).length);
    const faixas=[{n:"0–3",min:0,max:3},{n:"4–7",min:4,max:7},{n:"8–15",min:8,max:15},{n:"16–30",min:16,max:30},{n:"31+",min:31,max:Infinity}];
    chartDiasFaixas=initChart("graficoDiasFaixas",chartDiasFaixas);
    chartDiasFaixas?.setOption({tooltip:{trigger:"axis"},grid:{left:45,right:20,top:20,bottom:45},xAxis:{type:"category",data:faixas.map(f=>f.n)},yAxis:{type:"value",minInterval:1},series:[{type:"bar",data:faixas.map(f=>nums.filter(x=>x>=f.min&&x<=f.max).length),barMaxWidth:55}]});
    const bm=new Map(); rows.forEach(x=>{const b=texto(x.bloco,"Em branco"); if(!bm.has(b))bm.set(b,[]); bm.get(b).push(x.dias);});
    const ba=Array.from(bm.entries()).map(([b,a])=>[b,a.reduce((x,y)=>x+y,0)/a.length]).sort((a,b)=>a[0].localeCompare(b[0],"pt-BR",{numeric:true}));
    chartDiasBloco=initChart("graficoDiasBloco",chartDiasBloco);
    chartDiasBloco?.setOption({tooltip:{trigger:"axis"},grid:{left:45,right:20,top:20,bottom:60},xAxis:{type:"category",data:ba.map(x=>x[0]),axisLabel:{rotate:30}},yAxis:{type:"value",name:"dias"},series:[{type:"bar",data:ba.map(x=>Number(x[1].toFixed(1))),barMaxWidth:50}]});
    const tb=document.getElementById("tbodyDiasValidacao");
    if(tb) tb.innerHTML=rows.length?rows.sort((a,b)=>b.dias-a.dias).slice(0,500).map(x=>`<tr><td>${texto(x.titulo)}</td><td>${texto(x.unidade_material)}</td><td>${texto(x.bloco)}</td><td>${texto(x.status_validacao)}</td><td>${fmtData(x.data_liberacao_validacao)}</td><td>${fmtData(x.data_validacao)}</td><td>${x.dias}</td></tr>`).join(""):'<tr><td colspan="7" class="empty-table">Nenhum registro com datas suficientes nos filtros atuais.</td></tr>';
  }

  function chaveData(v){ if(!v)return null; const d=new Date(v); if(Number.isNaN(d.getTime()))return null; return d.toISOString().slice(0,10); }
  function renderHistorico(dados){
    const rows=unicos(dados); const m=new Map();
    function add(k,t){ if(!k)return; if(!m.has(k))m.set(k,{lib:0,val:0}); m.get(k)[t]++; }
    rows.forEach(x=>{add(chaveData(x.data_liberacao_validacao),"lib");add(chaveData(x.data_validacao),"val");});
    const arr=Array.from(m.entries()).sort((a,b)=>a[0].localeCompare(b[0])); let acum=0; const cumul=arr.map(([d,r])=>[d,acum+=r.lib]);
    const liberacoes=arr.reduce((a,[,r])=>a+r.lib,0),validacoes=arr.reduce((a,[,r])=>a+r.val,0),diasLib=arr.filter(([,r])=>r.lib>0).length;
    setText("histDiasLiberacao",diasLib); setText("histLiberacoes",liberacoes); setText("histValidacoes",validacoes); setText("histUltimoDia",arr.length?new Date(arr[arr.length-1][0]+"T12:00:00").toLocaleDateString("pt-BR"):"--");
    chartHistDia=initChart("graficoHistoricoDia",chartHistDia);
    chartHistDia?.setOption({tooltip:{trigger:"axis"},legend:{top:0},grid:{left:45,right:20,top:50,bottom:65},xAxis:{type:"category",data:arr.map(x=>x[0]),axisLabel:{rotate:45}},yAxis:{type:"value",minInterval:1},series:[{name:"Liberações",type:"bar",data:arr.map(x=>x[1].lib)},{name:"Validações",type:"line",smooth:true,data:arr.map(x=>x[1].val)}]});
    chartHistAcum=initChart("graficoHistoricoAcumulado",chartHistAcum);
    chartHistAcum?.setOption({tooltip:{trigger:"axis"},grid:{left:45,right:20,top:20,bottom:65},xAxis:{type:"category",data:cumul.map(x=>x[0]),axisLabel:{rotate:45}},yAxis:{type:"value"},series:[{type:"line",smooth:true,areaStyle:{},data:cumul.map(x=>x[1])}]});
    const tb=document.getElementById("tbodyHistorico"); if(tb) tb.innerHTML=arr.length?[...arr].reverse().slice(0,180).map(([d,r])=>`<tr><td>${new Date(d+"T12:00:00").toLocaleDateString("pt-BR")}</td><td>${r.lib}</td><td>${r.val}</td></tr>`).join(""):'<tr><td colspan="3" class="empty-table">Nenhum movimento encontrado.</td></tr>';
  }

  function renderAjustesGraficos(dados){
    const el1=document.getElementById("graficoAjustesTipo"), el2=document.getElementById("graficoAjustesTop"); if(!el1||!el2)return;
    const rows=(dados||[]).filter(ehAjuste);
    window.__aj1?.dispose(); window.__aj2?.dispose(); window.__aj1=echarts.init(el1); window.__aj2=echarts.init(el2);
    const tipos=["Ajustes - CONTEUDISTA E DA","Ajustes - MODELAGEM","Ajustes - GERÊNCIA DE TECNOLOGIA"];
    window.__aj1.setOption({tooltip:{trigger:"item"},series:[{type:"pie",radius:["45%","72%"],data:tipos.map(t=>({name:t.replace("Ajustes - ",""),value:rows.filter(x=>x.status_validacao===t).length}))}]});
    const top=rows.map(x=>({n:`${texto(x.titulo)} · ${texto(x.unidade_material)}`,v:Number(x.qtd_ajustes_total)||0})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v).slice(0,10).reverse();
    window.__aj2.setOption({tooltip:{trigger:"axis",axisPointer:{type:"shadow"}},grid:{left:180,right:25,top:15,bottom:30},xAxis:{type:"value",minInterval:1},yAxis:{type:"category",data:top.map(x=>x.n),axisLabel:{width:165,overflow:"truncate"}},series:[{type:"bar",data:top.map(x=>x.v)}]});
  }

  function atualizar(dados){ renderOperacional(dados); renderDias(dados); renderHistorico(dados); renderAjustesGraficos(dados); }
  window.addEventListener("resize",()=>[chartOpBloco,chartOpStatus,chartDiasFaixas,chartDiasBloco,chartHistDia,chartHistAcum,window.__aj1,window.__aj2].forEach(c=>c?.resize()));
  window.atualizarIndicadoresBI=atualizar;
})();
