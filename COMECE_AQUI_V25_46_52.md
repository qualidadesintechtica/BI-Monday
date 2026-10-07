# BI-Monday V25.46.52 — Planejamento

## Instalar

1. No mesmo projeto Supabase do BI, abra **SQL Editor**, copie todo o arquivo `docs/15_INSTALAR_PLANEJAMENTO.sql` e execute. O resultado esperado é **Planejamento V25.46.52 instalado**.
2. Atualize os arquivos do site com o conteúdo desta pasta e aguarde a publicação. Se preferir atualizar apenas o necessário, envie os oito arquivos listados abaixo.
3. Abra o BI, pressione **Ctrl + F5**, entre com a conta institucional e clique em **Planejamento**.

Arquivos do site que mudaram:

- `index.html`
- `projetos.html`
- `js/dashboard.js`
- `js/paginas.js`
- `js/projetos.js`
- `js/certificados.js`
- `js/planejamento.js` (novo)
- `css/planejamento.css` (novo)

A pasta está baseada na V25.46.51. Para esta atualização, execute apenas o SQL **15**. Os arquivos anteriores continuam no pacote como referência das instalações existentes. As funções de envio e de processamento de certificados não precisam ser republicadas.

## Usar

- **Nova tarefa**: informe título, descrição, responsável, prazo, status e prioridade.
- **Passos da tarefa**: adicione passos, defina responsável e prazo quando necessário, reorganize e marque a conclusão. A tarefa só pode ser concluída quando todos os passos estiverem concluídos.
- **Vínculos com o BI**: procure UA, UC, material, projeto, tarefa de projeto, professor NQ ou revisor. Também é possível associar qualquer visão do BI, registrando os filtros e indicadores disponíveis naquele momento.
- **Criar tarefa nesta área**: botão no cabeçalho de cada área. Na tela do Projeto Qualidade, a tarefa é associada ao projeto selecionado.
- **Criar tarefa**: ação disponível nas linhas de Operação, Ajustes e Certificados. Preserva o identificador do registro; itens com a mesma UA ou nome continuam distintos.
- **Sinalizar atenção**: destaque manual. Tarefas bloqueadas ou com prazo vencido também entram em **Só atenção**. Tarefas concluídas e arquivadas deixam de exigir atenção.
- **Quadro / Lista**: arraste os cartões entre colunas ou use o seletor de status. Filtre por responsável, prioridade, status e texto.
- **Comentários e histórico**: abra uma tarefa salva para comentar e conferir quem alterou cada registro.
- **Arquivar tarefa**: remove a tarefa do quadro ativo e preserva o histórico. Marque **Arquivadas** para consultar ou restaurar.
- **Atualizar**: consulta as alterações da equipe. A lista não usa atualização em tempo real.
- **Exportar CSV**: exporta as tarefas da visão filtrada, incluindo os passos e vínculos.

## Comportamento dos vínculos

O Planejamento registra ações e aponta para as fontes do BI. Mudar o status da tarefa de planejamento não muda o status do material na Monday, não finaliza um projeto e não envia certificados.

O contexto registrado permanece no histórico, mesmo quando a fonte é atualizada. Nos vínculos de materiais, o status atual é consultado na carga disponível do BI. Se o registro não estiver disponível nessa carga, o vínculo permanece visível. **Abrir no BI** abre a fonte em outra guia, preservando a tarefa que está sendo editada.

Os indicadores de atenção no menu correspondem às áreas associadas nos vínculos. Para dar atenção a mais de uma área, associe as respectivas visões à tarefa.

As tarefas e comentários ficam compartilhados entre as contas autenticadas do domínio `animaeducacao.com.br`, seguindo o domínio já permitido neste BI. O nome do responsável é uma atribuição de acompanhamento; este módulo não envia notificações.

## Erros conhecidos de instalação

Se aparecer a orientação para instalar a estrutura, execute `docs/15_INSTALAR_PLANEJAMENTO.sql` no mesmo Supabase utilizado pelo BI e clique em **Atualizar**.

Se aparecer **Outra pessoa alterou esta tarefa**, não force o salvamento. Feche o formulário, clique em **Atualizar**, reabra a tarefa e reaplique a alteração. A proteção evita apagar o trabalho de outra pessoa.
