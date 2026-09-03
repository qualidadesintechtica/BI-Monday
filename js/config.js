window.BI_CONFIG = {
  SUPABASE_URL: "https://nkjmgzyjjbepebzurowy.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_6Tuuyz6nYSBa782OGDi1rg_XkBHmO8U",
  VIEW_NAME: "vw_materiais_bi_consolidada",
  BUILD_ID: "20260903-v21-nq-sem-periodo",
  REUNIAO_RESUMO_VIEW_NAME: "vw_nq_reuniao_resumo",
  REUNIAO_NC_VIEW_NAME: "vw_nq_reuniao_nao_conformidades",
  RESULTADOS_VIEW_NAME: "vw_resultados_alcancados",
  DOMINIOS_PERMITIDOS: ["animaeducacao.com.br"]
};

console.log("BI BUILD:", window.BI_CONFIG.BUILD_ID);
console.log("BI VIEW:", window.BI_CONFIG.VIEW_NAME);
