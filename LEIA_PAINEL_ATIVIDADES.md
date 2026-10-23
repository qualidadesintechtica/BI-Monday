# Planejamento: atividades por responsável — V25.46.72

## Atualizar o BI

1. Publique o conteúdo completo da pasta **BI-Monday** na raiz do site atual do BI, substituindo os arquivos da versão anterior.
2. Pressione **Ctrl + F5**. Confira **v25.46.72 · Atividades por responsável** no menu.
3. Abra **Planejamento → Por responsável**. O painel usa a leitura compartilhada de tarefas e Projeto Qualidade que a aba já carrega.

Esta alteração não exige SQL novo, tabela nova, Secret novo ou nova Edge Function. As estruturas já usadas pelo Planejamento precisam continuar instaladas. As instruções antigas de Equipe e da função de avaliações continuam disponíveis, mas não precisam ser repetidas para este painel.

Arquivos principais desta alteração: `index.html`, `projetos.html`, `js/planejamento.js`, `js/planejamento-atividades-core.js` e `css/planejamento.css`. Publique a pasta completa para carregar os arquivos com as versões correspondentes.

## Consultar responsável, atividade e vencimento

O painel apresenta os responsáveis, a atividade, o projeto/card de origem, o vencimento, a situação do prazo e o status. O resumo **Distribuição por responsável** mostra atividades, pendências, vencidas, vencimentos em até cinco dias e concluídas. Clique em um nome para filtrar suas atividades.

Os filtros superiores passam a selecionar **atividades individuais** nesta visão. Uma atividade de Cléa não traz junto todas as atividades de outras pessoas do mesmo projeto. O status também é o da atividade: uma tarefa ainda pendente permanece pendente mesmo que o projeto esteja marcado como concluído na fonte.

Use **Situação do vencimento** para localizar vencidas, vencimentos de hoje, até cinco dias, mais de cinco dias, datas ausentes ou inválidas e atividades concluídas. **Vencimento de** e **Vencimento até** delimitam um período inclusivo. Datas ausentes ou inválidas ficam fora quando um período é informado. Um período invertido mostra uma mensagem e impede a exportação até a correção.

**Limpar filtros** restaura a pesquisa, responsável, status, prioridade, atenção, arquivadas, área e período. A tabela mostra 25 atividades por página. **Exportar CSV** exporta todas as atividades do filtro, incluindo as demais páginas, com uma linha por atividade. No quadro ou na lista originais, o mesmo botão mantém a exportação anterior de cards.

O botão **Abrir** leva ao card existente e posiciona o foco no passo correspondente quando houver um. O acompanhamento, a conclusão dos passos, o status e o arquivamento continuam nas ações já existentes do Planejamento.

## Como os registros são contados

- Um card com passos funciona como agrupador. Seus passos entram como atividades; o card não é somado novamente.
- Um card sem passos aparece como uma atividade. Quando vier de um projeto sem tarefas, a tabela identifica **Projeto sem tarefas**.
- As tarefas do Projeto Qualidade entram com seus responsáveis, status e vencimentos próprios. Tarefas sem projeto correspondente continuam visíveis com o projeto informado na fonte.
- Se um passo não tiver responsável, usa o responsável do card, com a indicação **Responsável do card**. Sem responsável no passo e no card, aparece **Sem responsável**, também disponível no filtro.
- Vencimento vazio no passo continua vazio. A data do projeto/card não preenche automaticamente a data da atividade.
- A prioridade usada nesta visão é a do card, seguindo o filtro já existente.
- Uma atividade com dois responsáveis entra na carga de ambos. O total geral conta a atividade uma única vez. A soma das cargas por pessoa pode ser maior que o total geral.
- A identidade da atividade usa seu registro de origem ou o ID do card/passo. Atividades diferentes com títulos iguais continuam separadas.

## Prazos e atualização

As situações do prazo usam dias corridos pela data de Brasília. **Até cinco dias** inclui hoje e o quinto dia. Concluídas não recebem alerta de atraso; arquivadas ficam fora da visão ativa e podem ser consultadas com o filtro **Arquivados**. Datas inválidas recebem indicação explícita.

O painel acompanha a atualização já existente do Planejamento: ao abrir a aba, após importar, ao retornar à página e na atualização periódica enquanto ela estiver visível. Ele não altera o agendamento de sincronização da Monday nem executa atualizações com o BI fechado.

Se a leitura de Projeto Qualidade falhar, a mensagem da aba informa o problema e mantém a última leitura completa disponível. Se o próprio Planejamento não puder ser carregado, o painel não apresenta a contagem anterior como uma consulta concluída.

## Verificação desta versão

Foram concluídas **84 verificações locais**, com dados simulados: 45 para projeção, identidades, pessoas, compartilhamento, filtros, limites de datas e CSV; 39 para interface DOM, paginação, atualização da base, abertura dos passos, tratamento de erros e navegação entre quadro, lista e painel.

A consulta, filtros, abertura de detalhes e exportação não usam operações de escrita. O acesso e os dados continuam seguindo a autenticação e as tabelas existentes. As demais funções e scripts SQL não foram alterados. A verificação visual em navegador não esteve disponível nesta sessão; a publicação e a conferência no BI em produção ainda precisam ser feitas.
