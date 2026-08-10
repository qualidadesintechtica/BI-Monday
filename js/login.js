document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const msg = document.getElementById("loginMessage");
  const btn = document.getElementById("loginButton");

  function mensagem(texto) {
    msg.textContent = texto;
    msg.hidden = false;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.hidden = true;
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const dominio = email.split("@").pop();

    if (!window.BI_CONFIG.DOMINIOS_PERMITIDOS.includes(dominio)) {
      mensagem("Use um e-mail institucional autorizado.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Entrando...";
    try {
      const { error } = await window.biSupabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.assign("index.html");
    } catch (error) {
      mensagem(error?.message || "Não foi possível entrar.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Entrar";
    }
  });

  (async () => {
    const { data } = await window.biSupabase.auth.getSession();
    if (data?.session) window.location.replace("index.html");
  })();
});
