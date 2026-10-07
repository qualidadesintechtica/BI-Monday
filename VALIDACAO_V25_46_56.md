# Validação V25.46.56

Verificação local em Chromium e PostgreSQL compatível (PGlite), usando o código das rotinas SQL e as interfaces completas do BI. Serviços externos foram simulados; produção não foi alterada.

- Cartão importado alterado pelo seletor, por arraste entre colunas e pelo campo Status no detalhe.
- Novo status persistido na tabela atual do Projeto Qualidade e mantido depois de recarregar a página.
- Histórico de mudanças com antes/depois, usuário e data, consultado no cartão mesmo antes do primeiro acompanhamento.
- Status e anotação salvos em uma transação; conflito no acompanhamento desfaz a mudança de status e seu histórico.
- Conflito de versão da fonte, status inválido e vínculo incorreto recusados.
- Mudança de status de uma tarefa da fonte validada; dados originais mantidos e projeto pai preservado.
- Atualização de projeto não altera automaticamente o status dos seus passos.
- Migração 17 executada duas vezes; acesso de domínio externo, execução anônima e escrita direta recusados.
- Importação em andamento bloqueia edição do snapshot incompleto.
- Faixa e botões de atenção/criação ausentes no painel principal e no editor do Projeto Qualidade.
- Nova tarefa e filtro de atenção continuam disponíveis no Planejamento, com vínculos a projetos e certificados.
- Atalhos de criação retirados de Operação, Ajustes e Certificados; tabelas de Operação e Ajustes alinhadas.
- Botão de PDF dos Certificados e controles próprios do Projeto Qualidade preservados.
- Páginas verificadas sem erros JavaScript; revisão visual do quadro e do editor.

A instalação no ambiente do usuário exige o SQL 17 e os cinco arquivos indicados em COMECE_AQUI_V25_46_56.md.
