V25.46.38 | PROJETO QUALIDADE - AUDITORIA, EVIDÊNCIAS E PDF

Alterações restritas ao Projeto Qualidade:
1. Card Tarefas passa a mostrar o total importado, incluindo tarefas sem vínculo.
2. Importação exibe auditoria por aba e compara Planilha x snapshot ativo do Supabase.
3. Linhas sem ID preservam aba + número da linha para não serem colapsadas.
4. Evidência detecta automaticamente PDF, Documento e Imagem pelo arquivo real.
5. Visualizar PDF gera uma prévia pronta; Finalizar versão gera download direto do PDF.
6. Finalizar versão não altera o status do projeto e a mensagem deixa isso explícito.

Para a planilha PROJETOS_QUALIDADE (2)(2).xlsx conferida em 02/10/2026:
- 367 linhas de dados
- 74 projetos
- 293 tarefas
- Em Progresso_09_09: 65 linhas
- Finalizados: 254 linhas
- Não Iniciado: 17 linhas
- Pausado: 31 linhas

ATENÇÃO: publique também a Edge Function supabase/functions/import-projeto-qualidade/index.ts para ativar a preservação 1:1 das linhas sem ID.

CORREÇÃO DOS 9 REGISTROS SEM VÍNCULO
O projeto 384403 foi renomeado de "Validação em Período de Férias Docentes" para "Validação em Período de Recesso de Aulas". As 9 tarefas ainda usavam o nome antigo. A V25.46.38 reconcilia o nome pelo ID histórico sem alterar a fonte original guardada para auditoria.
