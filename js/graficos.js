let grafico1, grafico2;
function statusChart(dados) {
  const el = document.getElementById("graficoStatus");
  if (grafico1) grafico1.dispose();
  grafico1 = echarts.init(el);
  const c = {};
  dados.forEach(x => { const k = x.status_validacao || "Sem status"; c[k] = (c[k]||0)+1; });
  grafico1.setOption({
    tooltip:{trigger:"item"}, legend:{bottom:0,type:"scroll"},
    series:[{type:"pie", radius:["48%","72%"], center:["50%","44%"],
      data:Object.entries(c).map(([name,value]) => ({name,value}))}]
  });
}
function blocoChart(dados) {
  const el = document.getElementById("graficoBloco");
  if (grafico2) grafico2.dispose();
  grafico2 = echarts.init(el);
  const c = {};
  dados.forEach(x => { const k = x.bloco || "Sem bloco"; c[k] = (c[k]||0)+1; });
  const e = Object.entries(c).sort((a,b)=>String(a[0]).localeCompare(String(b[0]),"pt-BR",{numeric:true}));
  grafico2.setOption({
    tooltip:{trigger:"axis"}, grid:{left:42,right:20,top:20,bottom:55},
    xAxis:{type:"category",data:e.map(x=>x[0]),axisLabel:{rotate:30}},
    yAxis:{type:"value"}, series:[{type:"bar",data:e.map(x=>x[1]),barMaxWidth:42}]
  });
}
window.atualizarGraficos = dados => { statusChart(dados); blocoChart(dados); };
