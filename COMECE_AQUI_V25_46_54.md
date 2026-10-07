# BI-Monday V25.46.54 — Importação e Planejamento conectado ao Projeto Qualidade

## O que foi incluído

- Paula Madalena nas opções de responsável da tarefa, dos passos e dos filtros.
- Importação de Excel diretamente no Planejamento, usando o mesmo serviço da aba Projeto Qualidade.
- Conferência antes do envio: quantidade de projetos e tarefas, abas utilizadas e avisos de IDs ausentes. IDs reais repetidos ou linhas inválidas impedem o envio.
- Projetos da base atual como cartões, com Tarefa e Action Plan como passos.
- Status, sponsor, prioridade e datas lidos da fonte. O texto original do status e todas as colunas originais ficam disponíveis no detalhe.
- Atenção, anotações, comentários, vínculos adicionais e passos de acompanhamento compartilhados com a equipe, preservados nas próximas importações.
- Atualização ao abrir o Planejamento, ao voltar à janela, após importar e a cada 60 segundos enquanto o BI está visível.

Os responsáveis fixos são João Guilherme, Ligia Paolilo, Cléa Domingues, Cristina Quiteria, Luciana Bandeira e Paula Madalena. Nomes abreviados conhecidos na planilha são apresentados com esses nomes completos. Os demais nomes são mantidos. O filtro também encontra responsáveis dos passos; passos sem sponsor usam o sponsor do projeto.

## Instalação

1. Se o Planejamento ainda não foi instalado, execute primeiro **docs/15_INSTALAR_PLANEJAMENTO.sql** no SQL Editor do Supabase do BI.
2. Execute **docs/16_ANOTACOES_PLANEJAMENTO_QUALIDADE.sql**. Essa instalação é aditiva e pode ser reaplicada. Ela guarda o acompanhamento dos cartões e impede duas anotações separadas para o mesmo projeto.
3. Atualize no site os sete arquivos abaixo, mantendo os caminhos:
   - `index.html`
   - `projetos.html`
   - `css/planejamento.css`
   - `js/planejamento.js`
   - `js/planejamento-qualidade.js` (novo)
   - `js/qualidade-importacao.js` (novo)
   - `js/projeto-qualidade.js`
4. Publique os arquivos e abra o BI com **Ctrl + F5**.

Esta versão reutiliza a Edge Function **import-projeto-qualidade** e as tabelas **pq_projetos_atual**, **pq_tarefas_atual** e **pq_importacoes_atual** já usadas pelo importador atual. Ela não exige publicar uma nova Edge Function. Caso o importador do Projeto Qualidade ainda não esteja instalado no ambiente, conclua essa instalação antes de enviar uma planilha.

Os arquivos do pacote ainda precisam ser publicados no site e o SQL precisa ser executado no ambiente. Os testes desta entrega foram locais, com a planilha anexada; a base de produção não foi modificada.

## Usar

1. Abra **Planejamento → Importar planilha de Projeto Qualidade**.
2. Escolha um `.xlsx` ou `.xls` e confira o resumo.
3. Clique em **Atualizar Projeto Qualidade e Planejamento**.
4. Abra um cartão para consultar os passos importados, sinalizar atenção e salvar anotações ou passos adicionais. Salve o acompanhamento uma vez para habilitar comentários.

A importação recebe uma planilha completa e substitui a base ativa de Projeto Qualidade. Itens ausentes ficam inativos. Quando um projeto acompanhado sai da base ativa, seu cartão fica em **Arquivadas**, com anotações e histórico preservados. Uma importação em processamento ou com erro não substitui a última leitura completa já carregada nesta janela; o painel mostra o aviso.

As abas atuais são localizadas pelo status: **Em Progresso**, **Não Iniciado**, **Pausado** e **Finalizados**, inclusive com sufixos de data. As abas históricas não entram no total atual; `Work item e filhos (1)` serve para reconciliar projetos renomeados por ID. Sem abas de status, usa essa aba consolidada ou a primeira aba. Se houver duas abas para o mesmo status, mantenha apenas a atual antes de enviar.

Para a atualização de um mesmo item, mantenha seu ID único. `NOVO`, `new` e outros marcadores não são IDs: cada linha é preservada, mas sua chave depende do nome, da aba e da posição. Mudanças nesses campos podem criar uma nova referência para o acompanhamento; por isso o resumo avisa quando faltam IDs. Tarefas sem projeto correspondente aparecem como cartões próprios para que nenhuma ação desapareça.

Os dados importados são editados na fonte de Projeto Qualidade. O Planejamento guarda o acompanhamento separado; suas alterações de atenção, anotações e passos adicionais não sobrescrevem o status, os responsáveis ou as datas da fonte. Tarefas manuais continuam editáveis no quadro.
