# BI-Monday V25.46.55 — Ações de tarefas somente no Planejamento

Retirada a faixa com os botões **Ver tarefas de atenção** e **+ Criar tarefa nesta área**, inclusive da aba Projeto Qualidade e de sua tela de edição.

As ações de tarefas estão concentradas na aba Planejamento: **+ Nova tarefa**, filtro **Só atenção**, edição de cartões, passos e acompanhamento. Os atalhos **Criar tarefa** também foram retirados das tabelas de Operação, Ajustes e Certificados para manter essa exclusividade.

Os vínculos com os dados do BI, os indicadores de atenção no menu, a importação da planilha, a atualização automática pelo Projeto Qualidade e as tarefas já salvas foram preservados. Os controles próprios do Projeto Qualidade e dos Certificados continuam disponíveis.

## Atualizar quem já está na V25.46.54

Substitua no site estes cinco arquivos, mantendo os caminhos:

1. `index.html`
2. `projetos.html`
3. `js/planejamento.js`
4. `js/paginas.js`
5. `js/certificados.js`

Depois de publicar, abra o BI com **Ctrl + F5**. Esta alteração não exige SQL novo.

Se a V25.46.54 ainda não foi instalada, siga COMECE_AQUI_V25_46_54.md usando os arquivos desta pasta atualizada.

A entrega é um pacote pronto para publicação; o site de produção não foi alterado por esta entrega.
