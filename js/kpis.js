function calcularKPIs(dados) {
  const c = s => dados.filter(x => x.status_validacao === s).length;
  const total = dados.length;
  const aLiberar = c("A liberar");
  const pausado = c("Pausado");
  const nq = c("Liberado para validação - NQ");
  const ajuste = c("Ajustes - CONTEUDISTA E DA");
  const validadas = c("Validado");
  const revalidar = c("Revalidar - NQ");
  const liberadas = total - aLiberar - pausado;
  const analisadas = nq + ajuste + validadas + revalidar;
  return {
    total, liberadas, naoLiberadas:aLiberar, nq, ajuste, validadas, revalidar,
    percentualAnalisado: total ? analisadas/total*100 : 0,
    percentualAChegar: total ? aLiberar/total*100 : 0
  };
}
function preencherKPIs(k) {
  const m = {
    totalUAs:k.total, liberadas:k.liberadas, naoLiberadas:k.naoLiberadas,
    emNQ:k.nq, emAjuste:k.ajuste, validadas:k.validadas, revalidarNQ:k.revalidar,
    percentualAnalisado:`${k.percentualAnalisado.toFixed(1)}%`,
    percentualAChegar:`${k.percentualAChegar.toFixed(1)}%`
  };
  Object.entries(m).forEach(([id,v]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  });
}
window.calcularKPIs = calcularKPIs;
window.preencherKPIs = preencherKPIs;
