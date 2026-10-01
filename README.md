# BI-Monday V25.46.23

Aba Certificados automatizada pela Monday e comparada com a planilha oficial de revisores enviada em 30/09/2026.

- Entram automaticamente UAs com Status Validação = Validado.
- Filtros: Semestre, Revisor, Com/Sem e-mail e Pesquisa.
- Comparação de revisor por nome com `data/revisores_planilha.json`.
- Base da planilha: 50 revisores; 48 com e-mail; 2 sem e-mail.
- Se o nome não for encontrado, o campo Revisor fica editável com sugestões da planilha.
- Se o e-mail não for encontrado, o campo E-mail fica editável.
- Edições manuais ficam preservadas no navegador via localStorage.


## V25.46.24 — Certificados automáticos com base oficial da planilha

A aba Certificados é alimentada automaticamente pelos dados sincronizados da Monday. UAs com Status Validação = Validado entram automaticamente; o revisor da Monday é comparado com a base oficial de 50 revisores gerada da planilha fornecida. Os nomes são exibidos em CAIXA ALTA. Quando nome ou e-mail não são encontrados, a própria tabela permite edição manual.

## V25.46.27 — Revisor correto diretamente da Monday

Correção estrutural da aba Certificados:

- `monday_validacao_materiais` passa a ser a fonte autoritativa para **Status Validação** e **Revisor**.
- O revisor é lido da coluna People `multiple_person_mkx6ryhs`, inclusive por `person_id` armazenado em `dados_originais`/`dados_colunas`.
- A Edge Function `monday-revisores` resolve `person_id -> nome + e-mail` diretamente na Monday.
- `vw_materiais_bi_consolidada` é usada apenas para completar **UC, Matriz e Semestre**.
- `revisores_cadastro`, `revisores_ua` e a planilha empacotada continuam servindo para padronizar o cadastro oficial.
- Se a pessoa existe na Monday mas não na base oficial, ela continua visível com os dados da Monday e pode ser editada.
- Nenhuma UA validada é excluída por ausência de cadastro oficial.
