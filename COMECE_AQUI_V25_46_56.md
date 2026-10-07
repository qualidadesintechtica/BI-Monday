# BI-Monday V25.46.56 — Status editável e ações no Planejamento

## Correções

- A faixa **Ver tarefas de atenção / + Criar tarefa nesta área** foi retirada do Projeto Qualidade e das outras áreas do BI.
- Criar tarefas, consultar atenção e editar cartões ficam na aba **Planejamento**. Os atalhos de criação também foram retirados de Operação, Ajustes e Certificados.
- Os cartões importados agora permitem trocar o status pelo seletor do cartão, pelo arraste entre colunas e pelo campo Status no detalhe.
- O novo status é gravado na mesma base do Projeto Qualidade, permanece após recarregar e aparece nas próximas leituras da equipe.
- As alterações de status registram usuário, data, estado anterior e novo estado no histórico do cartão. Alterações simultâneas não sobrescrevem uma versão mais recente silenciosamente.
- Salvar status e acompanhamento no detalhe é uma operação atômica: se houver conflito nas anotações, o status também não é alterado.

## Instalar sobre a V25.46.54

1. No SQL Editor do Supabase do BI, execute **docs/17_STATUS_PLANEJAMENTO_QUALIDADE.sql** inteiro. É reaplicável e depende dos arquivos 15 e 16 já instalados para Planejamento e acompanhamento.
2. Substitua no site estes cinco arquivos, mantendo os caminhos:
   - `index.html`
   - `projetos.html`
   - `js/planejamento.js`
   - `js/paginas.js`
   - `js/certificados.js`
3. Publique e recarregue o BI com **Ctrl + F5**.

Se a estrutura anterior ainda não foi instalada, execute primeiro **docs/15_INSTALAR_PLANEJAMENTO.sql** e depois **docs/16_ANOTACOES_PLANEJAMENTO_QUALIDADE.sql**, conforme o guia V25.46.54. Utilize os arquivos desta pasta atualizada.

## Trocar status

No Planejamento, escolha o novo estado no campo **Status** de um cartão ou arraste o cartão para outra coluna. Para salvar junto com anotações, abra o cartão, altere o campo **Status** e clique em **Salvar alterações**.

| Planejamento | Projeto Qualidade |
| --- | --- |
| A fazer | A Fazer |
| Em andamento | Em Progresso |
| Bloqueada | Pausado |
| Concluída | Finalizado |

O status do projeto e os status dos seus passos são independentes. Mudar o cartão do projeto não conclui automaticamente seus passos. Responsáveis, prazos e passos importados continuam acompanhando os campos da fonte.

A planilha completa continua sendo a fonte de cada importação: um Excel futuro pode atualizar novamente o status conforme o valor da planilha. Os dados originais da planilha são preservados. As anotações, comentários e passos adicionais de acompanhamento continuam vinculados ao cartão.

Durante uma importação em processamento ou com erro, a alteração de status é recusada para evitar editar um snapshot incompleto. Se outra pessoa ou uma importação tiver alterado o item desde a leitura, atualize o quadro e reabra o cartão antes de tentar novamente.

## Validação

Testes locais com Chromium e PostgreSQL compatível: troca por seletor, arraste e detalhe; recarga da página; gravação na base PQ; passos preservados; histórico; conflito de versões; rollback de status e anotações; controle institucional e migração reaplicável. Conferidos também os controles exclusivos de Planejamento, os dois painéis do Projeto Qualidade e os controles próprios das demais abas.

A entrega é um pacote pronto para publicação. O site e a base de produção precisam receber a atualização acima.
