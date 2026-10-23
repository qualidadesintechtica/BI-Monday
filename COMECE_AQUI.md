# BI-Monday V25.46.72 — Atividades por responsável no Planejamento

1. Publique o conteúdo completo da pasta **BI-Monday** no site atual do BI.
2. Pressione **Ctrl + F5**. Confira **v25.46.72 · Atividades por responsável**.
3. Abra **Planejamento → Por responsável** para consultar **responsável × atividade × vencimento**.

O painel detalha as atividades e os passos dos projetos, com resumo por responsável, status, vencimentos, alertas de prazo, filtros de período e exportação CSV. Atividades compartilhadas entram na carga de cada responsável, com contagem única no total geral. **Abrir** leva ao card e ao passo correspondente.

**Esta alteração não exige novo SQL ou Edge Function.** Usa a base já carregada pelo Planejamento. Leia **LEIA_PAINEL_ATIVIDADES.md** para as regras de contagem e os filtros.

Foram verificadas 84 condições locais com dados simulados, incluindo os fluxos da interface em simulação DOM. A versão ainda precisa ser publicada no seu BI.

---

# Histórico da V25.46.71 — Avaliações automáticas pelo nome do revisor

1. Execute **todo** `docs/27_ATUACAO_VALIDADORES_MONDAY.sql` no Supabase do BI, após o SQL 26 (se já instalou o 26, não precisa repeti-lo).
2. Publique a função **sync-atuacao-validadores** pelo painel, usando **todo** `INSTALAR_PELO_PAINEL/sync-atuacao-validadores.ts`. Mantenha **Verify JWT ativado** e confira o Secret **MONDAY_API_TOKEN**, com acesso ao quadro **18430296590**.
3. Publique o conteúdo completo da pasta **BI-Monday** no site atual e pressione **Ctrl + F5**. Confira **v25.46.71 · Avaliações automáticas**.
4. Abra **Equipe**. As notas e os comentários são reconhecidos automaticamente pelo nome de **Revisores - NQ**. Se ainda não importou o Banco de Validadores, faça a importação em **Importar Excel > Cadastro completo e vínculos**.

A comparação dos arquivos enviados encontrou **28 avaliações com comentários**, **24 docentes reconhecidos** e **4 nomes pendentes**. As avaliações pendentes continuam visíveis. Cada resposta é contada uma vez, mesmo quando o docente tem várias UCs. O reconhecimento considera acentos, maiúsculas e espaços, sem adivinhar nomes parecidos.

Leia **LEIA_EQUIPE_VALIDADORES.md** para a instalação pelo painel, a importação opcional da exportação da Monday, os filtros e as regras. O SQL e a função ainda precisam ser instalados no ambiente do BI; os testes deste pacote foram locais e com a API simulada.

---

# Histórico da V25.46.70 — Equipe e Banco de Validadores

1. Execute **todo** `docs/26_BANCO_VALIDADORES_EQUIPE.sql` no Supabase do BI.
2. Publique o conteúdo da pasta **BI-Monday** no site atual do BI e pressione **Ctrl + F5**.
3. Abra **Equipe > Importar Excel**, escolha **Cadastro completo e vínculos**, selecione `Banco_de_Validadores.xlsx`, confira a aba **Banco** e confirme a importação.

Pesquisa e filtros próprios, avaliação da atuação por vínculo, importação das datas de desligamento e cálculo automático do tempo em dias estão disponíveis na aba Equipe. Leia **LEIA_EQUIPE_VALIDADORES.md** para os campos e as regras de atualização.

O anexo tem 69 docentes e 131 vínculos únicos após ignorar 8 linhas duplicadas idênticas. As colunas de avaliação e comentários estão vazias.

**Para atualizar da V25.46.69, execute apenas o SQL 26.** As orientações abaixo documentam versões anteriores.

---

# BI-Monday V25.46.69 — Evidências do PDF sem login no BI

Na aba Projetos, o PDF passa a incluir **Baixar evidência** para os arquivos anexados e selecionados. O leitor consegue baixar sem uma conta no BI. Os links são específicos dos anexos da versão salva; o BI e o bucket continuam privados.

## Instalar esta alteração

1. Execute **todo** `docs/25_DOWNLOAD_EVIDENCIAS_RELATORIO.sql` no SQL Editor do mesmo projeto do BI.
2. Publique uma Edge Function chamada **pq-evidencia-publica**, colando o arquivo completo `INSTALAR_PELO_PAINEL/pq-evidencia-publica.ts`.
3. Desative **Verify JWT somente nessa nova função**, que valida o token específico do anexo no PDF. Não altere as configurações das outras funções.
4. Publique todos os arquivos desta pasta no site atual do BI, substituindo os anteriores. Pressione Ctrl + F5.
5. Abra Projetos, escolha a versão salva e use **Reimprimir relatório**. Envie o PDF novo: PDFs antigos continuam com os links antigos.

O histórico recebe **Desativar links dos PDFs**, para encerrar o acesso pelos links já emitidos daquela versão. Uma reimpressão posterior cria novos links.

As etapas completas, os limites dos links externos e a verificação em janela anônima estão em **LEIA_EVIDENCIAS_SEM_LOGIN.md**. Se o BI já está na V25.46.68 funcionando, não repita os scripts antigos das notas abaixo. Esta atualização preserva a chegada/histórico da Operação e os demais recursos.

Foram verificadas 50 condições de SQL, 46 da função de download e 37 de interface/PDF, com dados de teste. A instalação e a validação de um PDF real em produção ainda precisam ser realizadas.

---

# Notas da V25.46.68 preservada

# BI-Monday V25.46.68 — Operação: chegada e histórico

## Instalar esta atualização

1. Extraia o ZIP e abra a pasta **BI-Monday**.
2. No SQL Editor do mesmo Supabase do BI, crie uma consulta nova.
3. Copie e execute **todo o conteúdo** de `docs/24_HISTORICO_STATUS_OPERACAO.sql`. Confira a mensagem: **Operação V25.46.68 instalada: data de liberação disponível e mudanças de status registradas a partir de agora.**
4. Publique o conteúdo da pasta BI-Monday na raiz do site existente, mantendo os demais arquivos. Inclua os novos `js/operacao-historico.js` e `css/operacao-historico.css`.
5. Recarregue com **Ctrl + F5** e confira **v25.46.68 · Operação: datas e histórico**.

O SQL 24 é reaplicável. Ele cria o histórico e sua consulta protegida, registra o estado inicial dos materiais existentes e acompanha INSERT/UPDATE da tabela sincronizada. Mantém a fonte de materiais, a sincronização, os comentários, os certificados e os históricos anteriores. A mesma regra de acesso do BI anexado foi mantida: sessão com domínio @animaeducacao.com.br. Não é preciso reinstalar scripts antigos nem publicar outra Edge Function para esta mudança.

## Usar na aba Operação

- A coluna **Chegada ao validador (liberação)** mostra a data de `data_liberacao_validacao`, sincronizada da Monday. O código atual da sincronização lê a coluna `data` do quadro de Validação de Materiais. A data é exibida sem deslocamento de fuso horário.
- **Não informada** significa que a fonte consultada não tem uma data válida. A data da sincronização e a data de validação final não são usadas para preencher esse campo.
- **Ver histórico** abre o acompanhamento daquele ID exato da Monday. O número entre parênteses conta as mudanças de status registradas, sem contar a fotografia inicial.
- Cada registro mostra status anterior e novo, data/hora em que a base detectou a mudança e revisor atribuído naquele momento. O revisor é contexto do evento; o histórico não identifica quem clicou no status da Monday.
- **Atualizar histórico** consulta novamente. **Carregar mais registros** permite consultar as páginas anteriores, em lotes de 50.
- UCs e planos agregados exibem **Por material**. Consulte a linha do material vinculado para ver sua própria data e seu histórico.

As novas colunas aparecem nas visões Quadro principal, Planos, UA e Avaliações. Os filtros, a pesquisa e a exportação mantêm seu recorte. O CSV recebe a data ao final das oito colunas anteriores. Grupos recolhidos mantêm o comportamento anterior; a consulta complementar é feita ao abrir os grupos ou o histórico. O restante do BI conserva os arquivos e o fluxo da versão enviada.

## Alcance do histórico

O acompanhamento começa **quando o SQL 24 é instalado**. O primeiro registro de cada item existente é identificado como **Estado no início do acompanhamento**. Itens novos recebem **Primeira observação do material**. Depois disso, cada mudança de status observada na tabela sincronizada cria um evento permanente. Atualizar a mesma linha com o mesmo status não duplica o histórico. Reaplicar a instalação preserva os eventos existentes.

As datas representam a observação no Supabase, de acordo com a sincronização que já existe. Uma mudança intermediária que aconteça e seja desfeita entre duas leituras da Monday pode não ser capturada. O arquivo anexado contém o estado atual, sem um arquivo de eventos antigos da Monday; por isso, não recupera mudanças anteriores à instalação nem informa a hora exata do clique na Monday.

A chegada apresentada corresponde à data de liberação para validação da fonte. A correção dessa data na Monday será refletida após a sincronização e a próxima consulta. O histórico conserva a data que existia no instante de cada evento de status.

## Se houver aviso de acompanhamento indisponível

Execute o SQL 24 inteiro e abra novamente o histórico. As linhas da Operação continuam disponíveis quando essa consulta complementar falha. Confira se o SQL foi instalado no mesmo projeto configurado para o BI. Uma data já presente no conjunto de materiais continua visível; sem consulta complementar e sem data na linha, aparece Indisponível.

## Verificação desta versão

O SQL 24 foi executado em PostgreSQL de teste. Foram verificados fotografia inicial, três mudanças sucessivas, sincronização/upsert sem duplicação, limpeza de status, revisão do responsável, item novo, reinstalação, correção da data, consulta por ID, limites e bloqueio de acesso externo/anônimo e de escrita direta no histórico.

Em DOM simulado, foram verificados dez cabeçalhos, datas presentes/ausentes, IDs exatos, separação dos agregados, consultas sob demanda, 70 eventos com paginação, HTML seguro, troca rápida de material, instalação ausente e recuperação, pesquisa, CSV e encerramento da sessão. Os arquivos não relacionados à alteração foram comparados com o ZIP enviado. A inspeção visual em navegador real, o login institucional, a execução do SQL em produção e a publicação ainda precisam ocorrer no seu ambiente.

---

# Notas da versão anterior enviada no ZIP

# BI-Monday V25.46.67 — Reunião NQ e Certificados

## Atualizar o site

Publique o conteúdo desta pasta no site existente, mantendo a estrutura. Recarregue com **Ctrl + F5** e confira **v25.46.67 · Reunião e Certificados**.

**Não há novo SQL nem Edge Function nesta atualização.** Os arquivos alterados em relação à V25.46.66 são `index.html`, `projetos.html`, `css/dashboard.css`, `js/dashboard.js`, `js/reuniao-nq.js`, `js/certificados.js`, este guia e `VERSAO.txt`. Mantenha também `js/recursos.js`, incluído na versão anterior.

## Reunião NQ

Os indicadores de produtividade e operação aparecem sem aguardar todos os critérios de qualidade. Enquanto a leitura de qualidade está em andamento, o status informa o carregamento; seus números só são publicados depois de uma leitura completa.

A leitura dos critérios não depende mais de uma contagem exata prévia nem de duas consultas de resumo que eram substituídas pelo cálculo da própria tela. Continua lendo todos os lotes, preservando os filtros e a regra de uma UA, um critério e uma matriz por resultado vigente. Uma falha no meio da leitura permite nova tentativa, sem guardar um conjunto incompleto como definitivo.

Os PPs validados e os revisores são carregados junto com os critérios. Os PPs ficam disponíveis para filtrar na memória da página, com paginação integral da fonte. **Professores e Especialistas** consulta formações, perfil acadêmico e histórico de importações quando essa seção é aberta. A importação continua atualizando seus dados e histórico.

## Certificados

As consultas de revisores, histórico, ajustes, fila e Monday ao vivo começam em paralelo com a leitura da base. As fontes oficiais de revisores também são buscadas juntas, mantendo a ordem de aplicação e os mesmos fallbacks.

A tabela mostra **100 linhas por página**, com **Anterior**, **Próxima** e a indicação do intervalo/total. Os indicadores representam todo o filtro, e a pesquisa considera todas as páginas. Nenhum certificado foi retirado da base.

- As seleções são mantidas ao trocar de página. As ações consideram todos os certificados selecionados, incluindo os de outras páginas.
- **Selecionar elegíveis** considera todas as páginas do filtro atual.
- **Exportar relatório** continua gerando o Excel completo do filtro, incluindo Pendentes e Enviados.
- Ao mudar os filtros, a lista retorna à primeira página e a seleção é refeita.
- O mapeamento de nomes/e-mails, os ajustes auditados, os documentos e as regras de envio foram mantidos. O histórico é carregado antes de integrar os aceites da fila.
- Retornar à aba reaproveita os dados já carregados, sem reconstruir toda a base. A consulta automática da fila mantém seu intervalo de 30 segundos; **Atualizar fila** continua forçando uma nova leitura.

## Validação

Na comparação local controlada, com 11.501 critérios e 2.051 linhas de certificado, Reunião NQ passou de aproximadamente **2,4 segundos para 0,8 segundo**, com os mesmos indicadores. Seus cards de produtividade apareceram em cerca de **0,25 segundo**. Certificados passou de aproximadamente **1,4 segundo para 0,8 segundo**, com as mesmas 2.051 UAs na base.

Foram conferidos critérios e filtros, recuperação de leitura interrompida, professores/histórico sob demanda, paginação, seleção em várias páginas, geração de PDFs individuais, exportação das 2.051 linhas, classificação dos enviados e atualização manual da fila. Os tempos são de teste local com consultas simuladas. O tempo no seu ambiente ainda depende da rede e das respostas do Supabase e da Monday.

Esta versão foi preparada e testada localmente; é necessário publicar os arquivos no seu site.

## Atualização anterior: carregamento geral (V25.46.66)

## O que ficou mais rápido

- O Resumo Executivo carrega a base principal e os responsáveis juntos. A navegação já funciona enquanto os dados são consultados.
- A fonte completa de Operação é consultada ao abrir essa aba. A fonte direta da Monday, os revisores e o histórico/fila de Certificados são consultados ao abrir Certificados.
- As tabelas e os gráficos são atualizados na aba aberta. Filtros não recriam gráficos das abas fechadas. Ao mudar de aba, ela recebe os filtros atuais.
- Resultados, Reunião NQ e Indicadores UC iniciam suas consultas quando forem abertos. Planejamento e Projeto Qualidade podem abrir sem esperar a base de materiais.
- As fontes já carregadas são reaproveitadas na memória desta página. Trocar rapidamente de aba não duplica o download da mesma base nem devolve a navegação à aba anterior.
- Os scripts principais são baixados em paralelo, preservando a ordem de execução. Excel e PDF são carregados apenas ao usar essas funções; uma falha permite nova tentativa.
- A consulta periódica da fila de Certificados ocorre com essa aba aberta. Ao retornar, a fila é consultada novamente. O processamento dos envios no servidor continua independente da navegação.
- Os vínculos do Planejamento carregam as fontes completas de materiais ao abrir o detalhe da tarefa. A sinalização, a leitura de cards e o arquivamento continuam disponíveis.

A paginação da base foi mantida integralmente: os lotes continuam sendo lidos até o fim. Não foi aplicado limite para esconder linhas ou reduzir as contagens. As regras de elegibilidade, os filtros, o histórico, os status, as permissões e a geração dos documentos foram mantidos.

## Conferência local

Na comparação controlada com 2.301 registros e a mesma latência simulada para as duas versões, a primeira tela passou de aproximadamente **2,0 segundos para 0,7 segundo**, com os mesmos indicadores. As consultas iniciadas até a abertura do Resumo passaram de **27 para 9**. Esses números são de teste local; o tempo no seu ambiente depende da rede, do servidor e do volume da base.

A validação incluiu Operação com 2.401 registros, fonte direta com 2.051 itens, filtros iguais à versão anterior, troca rápida de abas, exportação Excel e certificado PDF reais, importação de Excel, recuperação de falha no recurso e abertura das abas com a base principal indisponível. Também foram conferidos os avisos de prazo, os passos, o arquivamento, os status e as permissões com os SQLs reais em banco de teste.

A atualização foi preparada e testada localmente. Ainda é necessário publicar os arquivos no seu site.

## Atualização anterior: avisos de prazo (V25.46.65)

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

Os três SQLs da V25.46.64 são reaplicáveis. Copiá-los para o GitHub não os executa. Não há nova Edge Function nem alteração na fila de certificados. Se o arquivamento ainda não foi instalado, execute também o SQL 20.

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
