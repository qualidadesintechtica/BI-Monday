# Equipe · Avaliações automáticas — V25.46.71

As notas e os comentários vêm do quadro **Avaliação da Atuação na Validação — 18430296590**. O docente avaliado é o nome de **Revisores - NQ**; **Gestores Validadores - NQ** identifica quem avaliou. O quadro 18414801798 trata dos critérios de materiais e não é a fonte desta avaliação de atuação.

## Instalar no BI atual

1. No Supabase do **BI DataHub**, execute **todo** `docs/26_BANCO_VALIDADORES_EQUIPE.sql` se ainda não o instalou. Depois execute **todo** `docs/27_ATUACAO_VALIDADORES_MONDAY.sql`. Cada arquivo já inclui início e fim da transação; não copie fragmentos.
2. Em **Edge Functions**, crie **sync-atuacao-validadores**. Pelo editor do painel, cole **todo** `INSTALAR_PELO_PAINEL/sync-atuacao-validadores.ts` no arquivo principal e publique. Mantenha **Verify JWT ativado**. Se já existir, substitua o código completo.
3. Em **Edge Functions > Secrets**, confira se **MONDAY_API_TOKEN**, já usado pela sincronização do BI, existe no mesmo projeto. A conta do token precisa ter acesso de leitura ao quadro **18430296590**. O token fica somente no Supabase. `SUPABASE_URL` e a chave interna de serviço são fornecidos pelo ambiente da função. Não coloque tokens em `js/config.js` ou no GitHub.
4. Publique o conteúdo completo de **BI-Monday** na raiz do site atual. Pressione **Ctrl + F5** e confira **v25.46.71 · Avaliações automáticas** no menu lateral.
5. Se o cadastro ainda estiver vazio, abra **Equipe > Importar Excel > Cadastro completo e vínculos**, selecione `Banco_de_Validadores.xlsx`, confira a aba **Banco** e confirme.
6. Abra **Equipe**. A leitura da Monday acontece automaticamente quando a última conferência tem mais de 15 minutos. Use **Atualizar avaliações da Monday** para conferir imediatamente. A aba deve mostrar fonte, horário da leitura, notas e comentários.

Alternativa por terminal, executada na pasta BI-Monday já vinculada ao projeto correto: `supabase functions deploy sync-atuacao-validadores`. Este caminho usa os arquivos da pasta `supabase/functions/sync-atuacao-validadores`. Não precisa publicar as outras funções.

## Reconhecimento automático do nome

O nome completo de **Revisores - NQ** é comparado ao **DOCENTE VALIDADOR** do cadastro, desconsiderando acentos, maiúsculas/minúsculas e espaços repetidos. O e-mail institucional identifica o cadastro encontrado. Várias UCs do mesmo e-mail são a mesma pessoa. Dois e-mails diferentes com o mesmo nome tornam a correspondência ambígua e impedem a associação automática.

Não há correspondência por parte do nome ou por semelhança. As avaliações pendentes continuam na aba de avaliação, com **Sem cadastro correspondente** ou **Mais de um cadastro com este nome**. Corrigir o nome na fonte ou no cadastro e atualizar o banco refaz o vínculo automaticamente, sem digitar notas. Importar novos docentes também refaz esse reconhecimento.

A exportação enviada tem **28 avaliações e 28 comentários**. Comparando com os **69 docentes** do Banco, **24 nomes** são reconhecidos e **4 ficam pendentes**:

- Marcus Andre Ferreira As
- Fabio Santos
- Tania Barbosa Tomaz
- Marcella De Avelar Sampaio

Isso é o resultado da comparação dos dois arquivos enviados, não uma contagem verificada na Monday ao vivo. Novos registros e correções podem mudar esses números.

## Notas, comentários e filtros

A aba mostra as seis notas de critérios, a **Média Critérios (P1)** fornecida pela fonte, a avaliação geral, a recomendação, o gestor/avaliador e o comentário integral. As notas não são recalculadas ou convertidas em conceitos. Zero é preservado; valor vazio aparece como não informado. Os comentários são exibidos como texto, preservando quebras de linha.

As avaliações são **gerais do docente**. A exportação não informa UC, semestre nem data da avaliação. O sistema não inventa esses campos. No cadastro, a avaliação aparece junto aos vínculos do docente; a aba de avaliação conta cada resposta uma única vez. A contagem de docentes com avaliação usa e-mails distintos.

A pesquisa e os filtros próprios podem ser combinados. Na aba de avaliação, a pesquisa aceita também gestor e comentários; o filtro **Reconhecimento do nome** encontra os pendentes. Filtros de IES, UC, semestre, titulação e situação selecionam as avaliações dos docentes que possuem esses vínculos no cadastro. Pendentes não têm esses dados e ficam fora quando esses filtros são aplicados. **Limpar filtros** restaura todas as respostas.

## Importar a exportação da Monday

Se precisar iniciar com o arquivo enviado antes da função estar disponível, instale os SQLs e escolha **Equipe > Importar Excel > Avaliações — exportação da Monday**. Selecione o Excel de Avaliação da Atuação na Validação, confira a prévia e confirme. Não use o Banco de Validadores neste modo.

O cabeçalho da exportação enviada está na linha 3. As linhas 4 a 31 são as 28 respostas. O rodapé da linha 32 contém totais, incluindo **123,17** em P1; esse total é ignorado e não vira nota. A coluna **Name**, com títulos de resposta 1 a 28, não é usada como ID Monday. O arquivo de exportação não traz os IDs reais dos itens.

Importe sempre a **exportação completa**: cada publicação substitui a leitura atual e guarda a anterior no histórico protegido. A importação não acrescenta cópias das mesmas respostas à leitura ativa. Depois de instalar a função, a próxima sincronização completa passa a usar a Monday como fonte. Em caso de falha na API ou em qualquer página da consulta, a última leitura salva é preservada e a tela informa a falha. A atualização automática ocorre enquanto o BI está aberto, ao entrar/voltar à aba e a cada 15 minutos de defasagem; não é uma tarefa agendada com o site fechado.

## Cadastro e desligamentos

O Banco enviado tem 139 linhas, 69 docentes e 8 duplicatas idênticas; a importação resulta em **131 vínculos únicos**, por e-mail, IES, UC e semestre. IES e titulação são preservadas por vínculo. As duplicatas ignoradas estão nas linhas 34, 39, 78, 96, 102, 110, 120 e 122. Há 31 vínculos em 2026.1 e 100 em 2026.2. O erro de origem `#N/A` na formação fica visível para correção.

Para desligamentos, escolha **Somente datas de desligamento**, com **E-MAIL INSTITUCIONAL** e **DATA DE DESLIGAMENTO**. Use datas do Excel, DD/MM/AAAA ou AAAA-MM-DD. Inclua **IES DE VINCULO** para restringir a uma instituição; sem IES, todos os vínculos do e-mail são atualizados. Datas vazias são ignoradas. Dados inválidos ou conflitantes impedem o lote inteiro de ser salvo. Reimportar o cadastro com desligamento vazio não apaga a data existente.

O tempo é calculado em dias corridos, pela data de Brasília. No dia do desligamento, mostra zero. Desligado sem data mostra “—”; data futura mostra **Desligamento agendado**. O cálculo se atualiza ao voltar à tela e a cada minuto com a aba aberta.

## Acesso e validação

Cadastros, avaliações e históricos exigem sessão institucional `@animaeducacao.com.br`. A função verifica a sessão antes de consultar a Monday. A publicação da fonte Monday é restrita ao serviço; a importação Excel usa uma operação autenticada. As duas publicam a leitura completa em uma única transação, validam os registros e recusam a substituição por uma sessão que esteja trabalhando sobre versão antiga.

As planilhas e seus comentários não estão embutidos nos arquivos públicos do pacote. Os campos antigos de avaliação por vínculo continuam preservados no banco, mas a tela de atuação usa a fonte específica da Monday.

Validação local: dados reais dos dois arquivos, 24 correspondências e 4 pendentes, nome normalizado, homônimos, cadastro novo, seis critérios, nota zero, comentário integral e proteção contra HTML; filtros, paginação e importações na simulação DOM; SQL 26 e SQL 27 instalados duas vezes em PostgreSQL de teste; acesso anônimo/externo bloqueado, histórico, concorrência e reversão integral; API com paginação e falhas simuladas. A visualização em navegador não esteve disponível. A função não foi executada contra a Monday ao vivo, nem instalada/publicada no seu ambiente nesta sessão.
