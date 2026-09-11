window.BI_CONFIG = {
  SUPABASE_URL: "https://nkjmgzyjjbepebzurowy.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_6Tuuyz6nYSBa782OGDi1rg_XkBHmO8U",
  VIEW_NAME: "vw_materiais_bi_consolidada",

  BUILD_ID: "20260911-v25-9-professores-titulacoes",

  REUNIAO_RESUMO_VIEW_NAME: "vw_nq_reuniao_resumo",
  REUNIAO_NC_VIEW_NAME: "vw_nq_reuniao_criterios_resumo",
  REUNIAO_DETALHE_VIEW_NAME: "vw_nq_reuniao_criterios_detalhe",
  RESULTADOS_VIEW_NAME: "vw_resultados_alcancados",

  DOMINIOS_PERMITIDOS: [
    "animaeducacao.com.br"
  ]
};

console.log("BI BUILD:", window.BI_CONFIG.BUILD_ID);
console.log("BI VIEW:", window.BI_CONFIG.VIEW_NAME);