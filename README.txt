BI Monday — V24

Nova área: Editor e Relatórios dos Projetos da Qualidade
- dados importados do Ajure permanecem somente leitura;
- cada salvamento cria uma nova versão auditável;
- cada versão guarda uma fotografia do projeto e das tarefas originais;
- campos narrativos, novas ações e evidências podem ser complementados;
- versões finalizadas podem ser impressas ou salvas como PDF pelo navegador;
- histórico com autor, data e status de cada versão.

Para ativar o editor, execute também:
docs/03_CRIAR_EDITOR_RELATORIOS_PQ.sql
Instruções detalhadas: docs/INSTALAR_EDITOR_PROJETOS_V24.md

Recursos da V23 mantidos:

Nova área: Importar Projetos da Qualidade
- leitura local de arquivos XLSX/XLS;
- detecção automática da aba e dos 11 cabeçalhos esperados;
- prévia, contagens e alertas antes da gravação;
- autenticação pelo login existente do BI;
- bloqueio de arquivo repetido por SHA-256;
- envio direto para a Edge Function sem Power Automate Premium.

Para instalar do zero, abra COMECE_AQUI_PROJETOS_QUALIDADE.txt e execute
docs/00_CRIAR_BANCO_PROJETOS_QUALIDADE.sql no projeto datahub-validadores
(nkjmgzyjjbepebzurowy).

Mantém integralmente as telas e recursos anteriores.

Histórico anterior:

BI Monday — V19

Versão limpa baseada na V17 estável, com a tela Gestores e Materiais integrada sem marcadores de conflito.

Nova tela: Gestores e Materiais
- UAs por gestor
- UCs por gestor
- nomes das UCs e materiais
- gráfico UAs x UCs por gestor
- clique no gestor para filtrar a tabela
- respeita os filtros globais existentes do BI
- busca por gestor, UC ou material

Mantém:
- Indicadores da UC com nomes reais
- cores: Excelente verde, Ótimo amarelo, Suficiente marrom claro
- demais páginas e recursos da V17

Build: 20260901-v20-ordenacao-colunas

V20: tabela Gestores e Materiais com ordenação crescente/decrescente em cada coluna pelo cabeçalho.
