(function () {
  "use strict";

  function dominioPermitido(email) {
    const dominio = String(email || "")
      .toLowerCase()
      .split("@")
      .pop();

    return window.BI_CONFIG
      .DOMINIOS_PERMITIDOS
      .includes(dominio);
  }

  async function protegerDashboard() {
    const { data, error } =
      await window.biSupabase.auth.getSession();

    if (error || !data?.session) {
      window.location.replace("login.html");
      return null;
    }

    const user = data.session.user;

    if (!dominioPermitido(user.email)) {
      await window.biSupabase.auth.signOut();
      window.location.replace("login.html");
      return null;
    }

    const nome =
      user.user_metadata?.nome ||
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      "Usuário";

    document
      .querySelectorAll("[data-user-name]")
      .forEach(
        el => el.textContent = nome
      );

    return user;
  }

  async function sair() {
    await window.biSupabase.auth.signOut();
    window.location.replace("login.html");
  }

  window.protegerDashboard = protegerDashboard;
  window.sairBI = sair;

})();