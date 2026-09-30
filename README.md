# BI-Monday V25.46.23

Aba Certificados automatizada pela Monday e comparada com a planilha oficial de revisores enviada em 30/09/2026.

- Entram automaticamente UAs com Status Validação = Validado.
- Filtros: Semestre, Revisor, Com/Sem e-mail e Pesquisa.
- Comparação de revisor por nome com `data/revisores_planilha.json`.
- Base da planilha: 50 revisores; 48 com e-mail; 2 sem e-mail.
- Se o nome não for encontrado, o campo Revisor fica editável com sugestões da planilha.
- Se o e-mail não for encontrado, o campo E-mail fica editável.
- Edições manuais ficam preservadas no navegador via localStorage.
