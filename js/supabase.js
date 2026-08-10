(function () {
  "use strict";
  if (!window.supabase) throw new Error("Supabase não carregado.");
  if (!window.BI_CONFIG) throw new Error("BI_CONFIG não carregado.");
  window.biSupabase = window.supabase.createClient(
    window.BI_CONFIG.SUPABASE_URL,
    window.BI_CONFIG.SUPABASE_PUBLISHABLE_KEY
  );
})();
