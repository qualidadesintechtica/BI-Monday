# BI-Monday V25.46.57 — Correções de Planejamento e PDF

## O que foi corrigido

- **Planejamento:** criar tarefas, consultar atenção e editar cartões ficam nessa aba. A faixa “Ver tarefas de atenção / + Criar tarefa nesta área” e os atalhos de criação foram retirados das outras áreas.
- **Status dos cartões:** os projetos importados permitem alteração pelo seletor, pelo arraste e pelo detalhe. O status é salvo na mesma base do Projeto Qualidade, com histórico e controle de alterações simultâneas.
- **Aprovar e gerar PDF:** o SQL 18 substitui a regra antiga `pq_projetos_edicoes_status_edicao_check` pelos valores usados no fluxo atual: `rascunho`, `em_revisao` e `finalizada`. A aprovação pode concluir e seguir para o download do PDF. O site também orienta qual correção aplicar se o banco ainda estiver desatualizado.

## Instalação sobre a V25.46.54

1. No **Supabase > SQL Editor** do BI, execute inteiro:
   - **docs/17_STATUS_PLANEJAMENTO_QUALIDADE.sql** — libera a gravação de status dos cartões importados.
   - **docs/18_CORRIGIR_STATUS_EDICOES_PDF.sql** — corrige a validação das versões que impede a aprovação e o PDF.
2. Substitua no site os seis arquivos abaixo, mantendo os caminhos:
   - `index.html`
   - `projetos.html`
   - `js/planejamento.js`
   - `js/paginas.js`
   - `js/certificados.js`
   - `js/projetos.js`
3. Publique e recarregue o BI com **Ctrl + F5**.

Se o SQL 17 já estiver instalado, basta o SQL 18 para a correção do PDF. Ambos são reaplicáveis. O Planejamento depende dos SQLs 15 e 16; o editor e o fluxo de aprovação dependem dos SQLs 03 e 08, já presentes no sistema que usa “Aprovar e gerar PDF”. Não é necessário reinstalar esses módulos para corrigir a regra antiga.

## Retomar a versão que apresentou erro

Depois do SQL 18, abra novamente a versão **Em revisão** e clique em **Aprovar e gerar PDF**. A correção não exige copiar o relatório ou criar outra versão.

O SQL preserva integralmente os registros existentes. Caso existam versões antigas com outros nomes de status, o resultado pode mostrar `historico_inteiro_validado = false`: essas versões foram mantidas sem alteração, e a regra atual já está ativa para todas as novas gravações. As permissões e as etapas de aprovação continuam sendo controladas pelas funções existentes.

## Sincronização do Planejamento

| Planejamento | Projeto Qualidade |
| --- | --- |
| A fazer | A Fazer |
| Em andamento | Em Progresso |
| Bloqueada | Pausado |
| Concluída | Finalizado |

O status geral do projeto e os status dos seus passos são independentes. Alterar o cartão do projeto não conclui os passos automaticamente. Responsáveis, prazos e passos importados continuam seguindo a fonte; uma nova importação pode atualizar novamente o status conforme a planilha. Anotações e comentários permanecem vinculados ao cartão.

## Conferir após publicar

1. Troque o status de um cartão importado e recarregue: a alteração deve permanecer e aparecer no Projeto Qualidade.
2. Confirme que os controles de tarefas e atenção aparecem somente no Planejamento.
3. Abra uma versão Em revisão, aprove e confirme o download do PDF e o status Finalizado no histórico.

Esta entrega é o pacote de atualização. A aplicação no site e no banco de produção depende dos passos de instalação acima.
