async function carregarDadosBI(esteira = null) {
  let query = window.biSupabase
    .from(window.BI_CONFIG.VIEW_NAME)
    .select("*");
  if (esteira) query = query.eq("esteira_producao", esteira);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
window.carregarDadosBI = carregarDadosBI;
