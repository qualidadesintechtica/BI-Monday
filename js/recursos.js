(function () {
  'use strict';
  const recursos = {
    excel: {url: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', pronto: () => !!window.XLSX},
    pdf: {url: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js', pronto: () => !!window.jspdf?.jsPDF}
  };
  const pendentes = new Map();
  window.biCarregarRecurso = function (nome) {
    const recurso = recursos[nome];
    if (!recurso) return Promise.reject(new Error('Recurso desconhecido.'));
    if (recurso.pronto()) return Promise.resolve();
    if (pendentes.has(nome)) return pendentes.get(nome);
    const promessa = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let encerrado = false;
      const terminar = erro => {
        if (encerrado) return;
        encerrado = true; clearTimeout(limite); script.onload = script.onerror = null;
        if (erro) {script.remove(); pendentes.delete(nome); reject(erro);}
        else resolve();
      };
      const limite = setTimeout(() => terminar(new Error('O recurso demorou para carregar. Tente novamente.')), 20000);
      script.src = recurso.url; script.async = true;
      script.onload = () => terminar(recurso.pronto() ? null : new Error('Não foi possível iniciar o recurso. Tente novamente.'));
      script.onerror = () => terminar(new Error('Não foi possível carregar o recurso. Confira a conexão e tente novamente.'));
      document.head.appendChild(script);
    });
    pendentes.set(nome, promessa);
    return promessa;
  };
})();
