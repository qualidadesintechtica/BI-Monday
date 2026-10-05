V25.46.40 | PROJETO QUALIDADE - TRATAMENTO DE TAREFAS NO RELEASE

Implementação aprovada para a geração/finalização do release:
1. Lista somente tarefas com status A fazer / Em andamento (e equivalentes operacionais suportados).
2. Para cada tarefa, permite escolher:
   - Manter como está;
   - Marcar como finalizada nesta versão;
   - Finalizar e atualizar também o Projeto Qualidade.
3. O relatório/PDF preserva o Status original e mostra separadamente o Status no release.
4. A decisão de cada tarefa é salva como snapshot imutável da versão em pq_projetos_edicoes.tarefas_release.
5. Atualizações na base atual só acontecem ao FINALIZAR a versão e somente para tarefas marcadas explicitamente para isso.
6. Toda atualização real de status é registrada em pq_tarefas_status_auditoria com status anterior, novo, versão, usuário e data.
7. O status do projeto não é alterado automaticamente.
8. Uma futura importação continua refletindo o status vindo da planilha de origem; o histórico do release permanece preservado.

INSTALAÇÃO
Antes de usar o tratamento de tarefas, execute no Supabase SQL Editor:
docs/06_TAREFAS_RELEASE_V25_46_40.sql

Arquivos funcionais alterados nesta versão:
- projetos.html
- css/projetos.css
- js/projetos.js
- docs/06_TAREFAS_RELEASE_V25_46_40.sql

Demais módulos do BI foram preservados.
