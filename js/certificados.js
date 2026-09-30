function revisoresDaUC(valor) {
  const chave = chaveUC(valor);
  if (!chave) return [];

  // Primeiro tenta a correspondência exata normalizada.
  const exatos = revisoresOficiaisPorUc.get(chave);

  if (exatos?.length) {
    return exatos;
  }

  // Depois aceita prefixo/sufixo somente quando houver
  // uma única UC possível na Base Oficial.
  const candidatos = [];

  for (const [ucBase, lista] of revisoresOficiaisPorUc.entries()) {
    if (
      chave.includes(ucBase) ||
      ucBase.includes(chave)
    ) {
      candidatos.push([
        ucBase,
        lista
      ]);
    }
  }

  if (candidatos.length === 1) {
    return candidatos[0][1];
  }

  return [];
}