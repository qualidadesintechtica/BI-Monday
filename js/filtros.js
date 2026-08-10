function valoresUnicos(dados, campo) {
  return [...new Set(dados.map(x => x[campo]).filter(v => v !== null && v !== undefined && String(v).trim() !== ""))]
    .sort((a,b) => String(a).localeCompare(String(b), "pt-BR", {numeric:true}));
}
function preencherSelect(id, valores, todos) {
  const s = document.getElementById(id);
  s.innerHTML = `<option value="">${todos}</option>`;
  valores.forEach(v => {
    const o = document.createElement("option");
    o.value = v; o.textContent = v; s.appendChild(o);
  });
}
function aplicarFiltros(dados) {
  const pares = [
    ["filtroBloco","bloco"],
    ["filtroStatus","status_validacao"],
    ["filtroCategoria","categoria_material"],
    ["filtroGestor","gestor_validacao_nq"],
    ["filtroRevisor","revisor_validador"]
  ];
  return dados.filter(item => pares.every(([id,campo]) => {
    const v = document.getElementById(id)?.value || "";
    return !v || item[campo] === v;
  }));
}
window.valoresUnicos = valoresUnicos;
window.preencherSelect = preencherSelect;
window.aplicarFiltros = aplicarFiltros;
