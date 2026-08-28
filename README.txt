BI Monday - v14 Indicadores da UC

Build: 20260828-v14-indicadores-uc

Esta versão mantém o BI de Validação de Materiais e adiciona a página "Reunião NQ".

Fontes principais no Supabase:
- public.vw_materiais_bi_consolidada
- public.vw_resultados_alcancados
- public.vw_nq_reuniao_resumo
- public.vw_nq_reuniao_nao_conformidades

Página Reunião NQ:
- Produtividade: UA, PP, A1, A2, A3 e Lato
- Operação atual: total, validados, liberados, revalidação, ajustes e a liberar
- Qualidade: critérios avaliados, conformes, não conformes e taxa de conformidade
- Top 10 de não conformidades

Publicação no GitHub Pages:
- Envie o CONTEÚDO deste pacote diretamente para a raiz do repositório BI-Monday.
- A raiz deve conter index.html, login.html, css/, js/, docs/, README.txt e VERSAO.txt.
- Não envie uma pasta externa contendo esses arquivos.
- Após o commit, aguarde o GitHub Pages e faça Ctrl+F5.

Teste no Console:
  window.BI_CONFIG.BUILD_ID

Esperado:
  20260828-v14-indicadores-uc
