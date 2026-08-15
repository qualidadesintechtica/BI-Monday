BI Monday - v10 categorias

Esta versão usa a view public.vw_materiais_bi_consolidada.
Antes de publicar no GitHub Pages, execute no Supabase o arquivo:
  docs/CRIAR_VIEW_V10.sql

Categorias esperadas no filtro:
- Unidade de Aprendizagem
- Avaliação A1
- Avaliação A2
- Avaliação A3
- Avaliação Lato
- Recurso Audiovisual
- Roteiro de Mediação (validação)
- Em branco (quando houver)

A view mantém planejamento da Esteira de Produção e cruza, quando possível,
status/revisor/gestor/datas da Validação de Materiais.

Publicação:
- Substitua index.html e a pasta js inteira.
- Recomenda-se também substituir css, login.html, README.txt, VERSAO.txt e docs.
- Faça Ctrl+F5 após o GitHub Pages atualizar.

Teste no Console:
  window.BI_CONFIG.BUILD_ID
  window.BI_CONFIG.VIEW_NAME

Esperado:
  20260815-v10-categorias
  vw_materiais_bi_consolidada
