# BI-Monday V25.46.65 — Alertas de prazo no Planejamento

## Ativar os avisos

Publique o conteúdo desta pasta no site existente e recarregue com **Ctrl + F5**. Confira **v25.46.65**. Sobre a V25.46.64, os arquivos alterados são `js/planejamento.js`, `css/planejamento.css`, `index.html`, `projetos.html`, este guia e `VERSAO.txt`.

**Esta correção de prazo não exige novo SQL nem Edge Function.** Se a V25.46.64 já está instalada, mantenha o banco como está. Os arquivos de banco abaixo permanecem disponíveis para instalações anteriores ainda não atualizadas.

## Entregas com prazo acabando

- **5 dias ou menos:** o Planejamento sinaliza a entrega pendente em amarelo, com os dias restantes, **Vence amanhã** ou **Vence hoje**.
- **Prazo vencido:** o aviso aparece em vermelho, indicando há quantos dias a entrega está atrasada.
- **Passos pendentes:** recebem o próprio aviso no detalhe. O card também mostra a quantidade de passos com prazo próximo ou atrasados, mesmo quando o prazo geral do projeto está mais distante.
- **Concluídos ou arquivados:** não recebem aviso automático de prazo. Passos já feitos também deixam de ser sinalizados.

A contagem usa dias corridos e a data de São Paulo, incluindo o dia de hoje e o limite de cinco dias. Itens sem prazo não recebem aviso de data. Os avisos aparecem no quadro, na lista e no detalhe; também entram no indicador **Exigem atenção** e no filtro **Somente atenção**.

Ao editar a data ou marcar um passo como feito, a sinalização no detalhe acompanha a alteração. O quadro reflete os dados salvos. As leituras automáticas existentes, a cada 60 segundos com a página visível e ao retornar ao sistema, também recalculam os avisos. As datas continuam sendo obtidas da base atual de Projeto Qualidade ou das tarefas manuais, conforme o tipo de card.

Os avisos são visuais no Planejamento. O sistema mantém responsáveis, datas, status, anotações e histórico; o aviso não altera esses dados. A conferência local verificou os limites de cinco/seis dias, hoje/amanhã, atraso, conclusão, arquivamento, passos, filtros, edição e viradas de data, mês, ano e ano bissexto.

## Correções anteriores: status e anexos (V25.46.64)

1. No **Supabase > SQL Editor** do BI, execute inteiro `docs/21_PRESERVAR_STATUS_QUALIDADE.sql`. Ele utiliza os SQLs 15, 16 e 17 já instalados. Não repita esses arquivos se o Planejamento já funciona.
2. Execute inteiro `docs/22_CONFIRMAR_FINALIZACAO_RELATORIO.sql`. Ele utiliza o editor e o fluxo dos SQLs 03 e 08, inclui a correção da constraint e aceita o tipo real do ID da versão, UUID ou bigint. Não precisa repetir o SQL 19.
3. Execute inteiro `docs/23_PERMITIR_PLANILHAS_EVIDENCIAS.sql` para permitir o envio dos novos formatos ao armazenamento existente.
4. Publique o conteúdo da pasta atual, mantendo a estrutura. Recarregue com **Ctrl + F5** e confira a identificação da versão atual.

Os três novos SQLs são reaplicáveis. Copiá-los para o GitHub não os executa. Não há nova Edge Function nem alteração na fila de certificados. Se o arquivamento ainda não foi instalado, execute também o SQL 20.

## O que muda na finalização

O status escolhido pela equipe no Planejamento fica associado ao identificador estável do projeto ou tarefa. A importação atualiza responsáveis, prazos, títulos e os demais dados, preservando essa escolha. Os itens sem alteração manual continuam acompanhando o status da planilha. Para reabrir um item, mude seu status no Planejamento; a nova escolha também será mantida.

A instalação do SQL 21 recupera a última escolha registrada no histórico de status, inclusive uma conclusão que tenha sido sobrescrita pela planilha. Recupera também decisões registradas de atualizar tarefas pelo release, quando essa auditoria existe. Mantenha os IDs estáveis da planilha: um identificador diferente representa outro item. Os dados originais e os snapshots dos relatórios são preservados.

O sistema consulta novamente a linha salva antes de informar sucesso. O relatório só gera o PDF de aprovação depois de confirmar status e data de finalização. Uma regra do banco que desfaça o status cancela a transação com erro explícito. Uma falha de confirmação após a gravação pede a atualização do quadro ou histórico para conferir o resultado, sem anunciar sucesso indevido.

O editor mostra **Status atual do projeto** separadamente de **Status nesta versão** nos relatórios já salvos. Uma versão antiga mantém a fotografia da época. Aprovar um relatório finaliza aquela versão; a conclusão do projeto continua sendo feita em Planejamento.

A validação local utiliza os SQLs reais em banco de teste e navegação com serviços simulados. Não foi feita alteração no banco de produção nem publicação automática do site.

## Anexar planilhas ao relatório

No editor do relatório, clique em **Anexar planilha** e selecione um arquivo **XLSX, XLS, CSV ou ODS**, de até **20 MB por arquivo**. O sistema preenche o tipo **Planilha** e sugere o título pelo nome do arquivo. Você pode ajustar o título, escrever uma descrição e escolher se a evidência entra no PDF. Os mesmos formatos estão disponíveis no seletor geral de anexos.

O arquivo é enviado ao salvar o rascunho ou enviar a versão para revisão, ficando vinculado àquela versão. **Abrir planilha**, no relatório e no PDF, abre o acesso autenticado com **Baixar planilha**. Ao baixar, o conteúdo original do arquivo é preservado. Em uma versão protegida, use **Usar como base** para criar outra versão com anexos novos; isso mantém o histórico anterior.

Os anexos usam o armazenamento privado de evidências já existente. O SQL 23 acrescenta os formatos permitidos, mantendo as permissões e o limite configurado. Se esse armazenamento ainda não existe, instale primeiro `docs/V25_39_ARMAZENAMENTO_EVIDENCIAS.sql`, que também está atualizado com os formatos de planilha.

## Arquivar, consultar e restaurar

- Em **Planejamento**, use **Arquivar card** no próprio card, na coluna Ações da lista ou no detalhe. Não precisa salvar anotações antes. A ação usa os dados já salvos; alterações ainda abertas no formulário devem ser guardadas com Salvar antes.
- Marque **Arquivados** para consultar os cards, usar a busca e os filtros e escolher **Restaurar card**. O filtro mostra a quantidade arquivada. O aviso também oferece **Desfazer arquivamento** após uma ação.
- O card sai do quadro ativo e, no caso de um projeto, da lista normal de cards da aba Projeto Qualidade. As ações de arquivar e restaurar ficam exclusivamente em Planejamento. Os indicadores gerais do BI e os dados usados nos relatórios continuam representando a base importada.
- A atualização da planilha mantém a escolha de arquivamento pelo identificador estável do item e atualiza suas informações de origem. Mantenha os mesmos IDs na planilha; um ID diferente representa outro item.
- **Abrir Projeto Qualidade**, no detalhe do card arquivado, permite consultar seu projeto de origem. Relatórios salvos e evidências continuam disponíveis para consulta e reimpressão.
- Itens que saíram da base ativa após uma importação mantêm suas anotações e histórico na consulta de arquivados. Eles poderão ser restaurados quando voltarem à base ativa; restaurar um card não reativa uma linha ausente da planilha.

O arquivamento não usa o status de conclusão nem altera `status_edicao`. Se outra pessoa modificou o card, a operação solicita atualizar o quadro. Uma falha de gravação não oculta o card. As permissões seguem a mesma sessão institucional já exigida pelo Planejamento.

A conferência local incluiu o SQL real em banco de teste e a navegação com serviços simulados: marcação e reabertura dos passos, progresso e histórico, preservação de rascunhos, tarefas manuais, projetos importados sem anotações, tarefas sem projeto, quadro, lista, detalhe, desfazer, busca, restauração após recarga, atualização da planilha, conflitos, fonte inativa e acesso institucional. A publicação e a execução do SQL no seu ambiente ainda precisam ser feitas.

## Marcar tarefas como feitas

No detalhe do card, em **Passos do Projeto Qualidade**, marque a caixa ao lado da tarefa para salvá-la como **Finalizado** na base compartilhada. O passo recebe a identificação **Feita** e a contagem de passos concluídos é atualizada. A marcação é salva imediatamente, sem precisar clicar em Salvar alterações; desmarcar reabre a tarefa em **A Fazer**.

O histórico do card inclui as mudanças dos seus passos, com tarefa, status anterior, novo status, usuário e data. Marcar um passo não conclui automaticamente o projeto nem outros passos e não salva alterações ainda abertas nas anotações. Nos passos adicionais ou de tarefas manuais, use a caixa existente e **Salvar tarefa/alterações** para guardar a edição.

Essa opção usa a função de alteração de status do **SQL 17**, atualizada pelo **SQL 21**. Se a edição de status ainda não foi ativada, execute `docs/17_STATUS_PLANEJAMENTO_QUALIDADE.sql` após os SQLs 15 e 16. Não há nova função de envio ou Edge Function. Uma tarefa alterada por outra pessoa exige atualizar o quadro; uma falha não deixa a caixa marcada sem confirmação. Cards arquivados precisam ser restaurados antes de alterar seus passos.

Os status escolhidos no sistema são preservados pelo SQL 21 nas próximas importações. A planilha continua disponível integralmente nos dados originais.

## Relatórios e links mantidos

O layout do release, a reimpressão e os links das evidências mantêm as correções anteriores. O fluxo de aprovação agora confirma o estado salvo antes de gerar o PDF. Para publicar a pasta completa, mantenha `index.html`, `projetos.html`, `importar.html`, `login.html`, as pastas `js`, `css`, `data` e `assets_certificado.png`.

## Abrir evidências pelo relatório

O cartão do anexo agora contém **Abrir PDF** ou **Abrir evidência** como link clicável, preservado na geração e na reimpressão. A inserção ocorre junto à montagem do relatório, antes da cópia para PDF. Os links externos continuam com seu destino original.

O link do anexo abre o DataHub, que solicita um acesso temporário ao arquivo no momento da abertura. O PDF não contém um token temporário que expire depois de alguns minutos. É necessário entrar no BI com uma conta autorizada; quando a sessão não existe, o login retorna à evidência escolhida. O arquivo permanece privado.

Depois de publicar, abra a versão salva e clique em **Reimprimir relatório**. PDFs já baixados sem links precisam ser gerados novamente. Não é necessário criar outra versão nem aprovar novamente. Links externos sujeitos a permissões de outros serviços continuam exigindo acesso nesses serviços.

## Relatórios e Planejamento

A tabela repetida **Todas as informações disponíveis na planilha** continua fora da prévia e dos PDFs. Os dados de identificação ficam no cabeçalho e em seis cartões, agrupando as datas no período e os sponsors em um campo. As tarefas agora aparecem em uma linha do tempo com descrição completa, ID, período e status original/no release. As evidências aparecem uma vez em cartões com descrição, arquivo, imagem quando disponível e link. Os dados completos da planilha permanecem em **Informações originais** no sistema.

O relatório apresenta origem/contexto/objetivo, resultados esperados, como construímos, resultados alcançados, produto entregue/evidências e valor gerado. Ações complementares e observações aparecem quando preenchidas. O contexto e o objetivo só são separados em cartões quando o texto contém um marcador explícito de objetivo; nenhum texto é resumido ou inventado. Os indicadores NQ incluídos na versão continuam disponíveis.

A identidade visual segue a referência, com a marca apresentada como texto vetorial. Sponsors, equipe e áreas contribuidoras não são preenchidos com nomes retirados da imagem: os dados de cada projeto são preservados. A quantidade de páginas depende do conteúdo; o modelo não limita o release a duas páginas nem reduz a fonte para fazê-lo caber.

O histórico das versões salvas oferece **Reimprimir relatório**, também disponível no botão principal da versão finalizada. Reimprimir baixa um novo PDF da mesma versão, sem nova aprovação e sem alterar conteúdo, status ou auditoria. Use essa opção para obter o novo modelo; PDFs já baixados permanecem como estão.

As quebras do PDF respeitam as linhas de texto, os passos da linha do tempo e os cartões que cabem em uma página. Conteúdos maiores continuam em outras páginas; as tabelas dos indicadores NQ repetem seus cabeçalhos. A partir da segunda página, o PDF repete o cabeçalho com a identificação do projeto e a marca. O rodapé acompanha o último conteúdo. A prévia se adapta ao celular; o PDF mantém a composição A4.

A conferência local incluiu relatório de política, texto longo com indicadores NQ, imagem grande, geração pelo celular, projeto sem tarefas e anexo DOCX com espaços, acentos e & no caminho. Os PDFs foram conferidos quanto às áreas clicáveis e aos destinos, incluindo links externos. A abertura foi testada com sessão ativa e após login, preservando o destino da evidência. A reimpressão e a abertura foram verificadas sem gravações na versão salva. Estes testes usam dados de conferência e serviços simulados; a publicação no seu sistema ainda precisa ser feita.

O Planejamento mantém os responsáveis cadastrados, os passos, os cartões com status editável e a associação aos dados importados do Projeto Qualidade. Os controles de tarefas ficam em Planejamento.

## Banco e funções: manutenção da instalação existente

Os arquivos de `docs`, `supabase` e `INSTALAR_PELO_PAINEL` são materiais de instalação e manutenção. Copiá-los para o GitHub não executa SQL nem publica funções no Supabase. A limpeza do pacote não exige reinstalar o banco ou reativar a fila de certificados.

- **Planejamento:** os SQLs 15, 16 e 17 mantêm a estrutura e as anotações; o SQL 20 permite arquivar e o novo SQL 21 preserva os status nas importações.
- **Aprovação e PDF:** execute o novo SQL 22. Ele inclui a correção da constraint e a compatibilidade com UUID ou bigint, sem apagar versões ou converter seus identificadores. O SQL 19 permanece para manutenção de clientes antigos; não é preciso reaplicá-lo.
- **Revisores de certificados:** o SQL 07 e `supabase/functions/monday-revisores/index.ts` permanecem para manutenção dessa integração.
- Os demais SQLs de estrutura e manutenção continuam em `docs`, junto às funções canônicas em `supabase/functions` e à configuração em `supabase/config.toml`.

## Fila de certificados: instalação quando ainda necessária

Este procedimento é para uma instalação da fila ainda não concluída. Ele não faz parte da limpeza do pacote.

1. Aguarde a fila antiga do SMTP2GO escoar e conclua a conferência dos envios anteriores. Os 61 registros do relatório de 06/10 têm proteção específica; um endereço de e-mail sozinho não comprova qual certificado foi aceito.
2. No SQL Editor, instale `docs/04_CERTIFICADOS_HISTORICO_V25_44.sql` se o histórico ainda não existir; depois, a estrutura de `docs/09_FILA_CERTIFICADOS_SMTP2GO.sql` e a proteção de `docs/10_PROTEGER_61_PENDENTES.sql`, quando ainda não instaladas. **Não repita o SQL 10 se já liberou registros após a conferência.** A fila começa pausada.
3. Nas Secrets das Edge Functions, configure `SMTP2GO_API_KEY`, `SMTP2GO_FROM` e `CERTIFICADOS_WORKER_TOKEN`. O remetente configurado nessa implementação é `Qualidade Sintechtica <qualidadesintechtica@outlook.com>`. O token do worker deve ser aleatório, com 32 bytes representados por 64 caracteres hexadecimais. `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são variáveis do ambiente Supabase; chaves privadas não devem entrar no site.
4. A chave SMTP2GO precisa permitir `email/send` e `stats/email_cycle`. O worker consulta o saldo antes de enviar.
5. Para instalação pelo painel, publique as funções `enviar-certificado`, `certificados-fila-status` e `processar-certificados` usando os respectivos arquivos de `INSTALAR_PELO_PAINEL` como `index.ts`. São versões completas, sem imports de auxiliares locais. Desative a verificação JWT do gateway nas três funções; o código valida a sessão e o domínio institucional nas funções do BI, e o worker exige seu token exclusivo. Para instalação por CLI, os arquivos equivalentes estão em `supabase/functions`, com auxiliares em `_shared` e configuração em `supabase/config.toml`.
6. Instale `docs/14_CONSULTA_FILA_AUTENTICADA.sql`, quando ainda necessário. A consulta da fila usa primeiro a função SQL autenticada e, em caso de falha, tenta a Edge Function.
7. Em `docs/11_AGENDAR_FILA_SMTP2GO.sql`, substitua `SUBSTITUIR_PELO_TOKEN_DO_WORKER` pelo mesmo token da Secret e instale o agendamento. O job se chama `certificados-smtp2go-fila`; os crons de sincronização da Monday são independentes.
8. Após a instalação e a conferência, use `docs/12_ATIVAR_FILA_APOS_CONFERENCIA.sql` para a primeira ativação. A implementação aguarda mais 24 horas antes dos primeiros novos disparos. Comece com um certificado novo, fora da lista de conferência, e confira o PDF, o destinatário e o resultado no Activity do SMTP2GO antes dos demais lotes.

A implementação da fila trabalha com até cinco mensagens a cada cinco minutos, respeitando os limites configurados de 25 tentativas por hora e 200 por 24 horas. Consulta o saldo do ciclo mensal no SMTP2GO. Estes são controles do código empacotado, não uma confirmação das condições atuais da conta.

## Conferir a fila e os envios anteriores

Use `docs/13_DIAGNOSTICO_FILA.sql` para conferir fila, limites, erros e chamadas do agendamento. Na aba Certificados, selecione as UAs validadas com revisor e e-mail e use **Adicionar à fila automática**. Aguarde a confirmação de inclusão; o processamento instalado ocorre no Supabase.

- **Na fila automática:** aguardando capacidade.
- **Processando:** tentativa reservada.
- **Enviado:** serviço confirmou o recebimento com EmailID; confira a entrega no Activity do SMTP2GO.
- **Erro — conferir**, **Conferir no SMTP2GO** e **Conferir envio anterior:** exigem conferência antes de liberar outra tentativa.

Para os 61 pendentes, consulte `certificados_fila_conferencia`. Só retire o bloqueio específico após conferir o certificado correspondente. Se ele já foi aceito, registre sua chave exata no histórico com o EmailID antes de retirar o bloqueio. Não use apenas o e-mail como prova.

Uma tentativa com resultado desconhecido não é reenviada automaticamente. Para retomar após uma falha corrigida, ajuste `pausado=false` em `certificados_fila_config` com o motivo correspondente. Registros individuais com `erro` ou `conferir` só devem voltar a `na_fila` após confirmar que o SMTP2GO não aceitou a tentativa. Preserve o histórico.

## O que foi limpo

Continuam fora do pacote os guias de versões antigas, relatórios de validação antigos, diagnósticos de planilhas antigas e a correção SQL 18 já incorporada ao SQL 19. As instruções atuais estão reunidas neste único guia. Esta atualização acrescenta os SQLs 21, 22 e 23 para persistência, confirmação de status e anexos de planilhas, mantendo o arquivamento e a conclusão de passos. Os arquivos das funções do Supabase permanecem iguais.
