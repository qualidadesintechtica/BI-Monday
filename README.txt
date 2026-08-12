BI Validação de Materiais - versão GitHub Pages

Conteúdo:
- login.html
- index.html
- css/
- js/

Backend:
- Supabase
- View: public.vw_validacao_bi_final
- Usuários: authenticated

Segurança:
- O frontend usa somente a Publishable Key.
- Nunca coloque service_role, sb_secret ou chave administrativa no GitHub.

Regras desta versão:
- filtros com múltipla seleção;
- KPIs calculados por UA consolidada, e não por quantidade de linhas;
- chave de negócio atual: titulo + unidade_material;
- fallback de chave: monday_item_id quando título/unidade estiverem vazios;
- Em NQ = Liberado para validação - NQ + Revalidar - NQ;
- Em ajuste inclui Conteudista/DA, Modelagem e Gerência de Tecnologia;
- gráficos usam a mesma consolidação dos KPIs;
- o cabeçalho informa UAs únicas e, quando houver duplicidade, também as linhas da base.

Observação de validação:
As fórmulas DAX completas vivem no modelo semântico remoto do Power BI e não estão incorporadas no PBIX enviado. Esta versão elimina a principal divergência conhecida (contagem de linhas duplicadas) e centraliza as regras para facilitar o ajuste fino quando as DAX forem disponibilizadas.

Publicação:
1. Envie o conteúdo desta pasta para a raiz do repositório.
2. Ative GitHub Pages na branch main, pasta root.
3. Após publicar, faça Ctrl+F5 no navegador.
