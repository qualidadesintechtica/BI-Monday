# BI-Monday V25.46.62 — Links das evidências e pacote limpo

## Publicar no sistema existente

Esta entrega corrige os links dos anexos nos relatórios e mantém o layout do release: azul e roxo, cartões com ícones, seções numeradas, linha do tempo e produtos/evidências em destaque. O conteúdo vem dos campos existentes e da versão salva do projeto. Não há SQL novo nem função do Supabase nova para instalar.

Para publicar a pasta completa do site, mantenha estes caminhos na hospedagem:

- `index.html`, `projetos.html`, `importar.html` e `login.html`.
- Pastas `js`, `css` e `data`.
- `assets_certificado.png`, utilizado na geração dos certificados.

Publique o conteúdo da pasta, mantendo a estrutura dos arquivos. Recarregue com **Ctrl + F5** e confira **v25.46.62**.

Sobre a V25.46.61, publique estes sete arquivos: `index.html`, `projetos.html`, `login.html`, `js/auth.js`, `js/projetos.js`, `js/projetos-evidencias-fix.js` e `css/projetos-evidencias-fix.css`. Se você estiver em uma versão anterior, publique a pasta completa: `css/projetos-release.css` e `js/projetos-pdf.js` também são obrigatórios para o layout e a paginação.

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

- **Planejamento:** os SQLs 15, 16 e 17 mantêm a estrutura, as anotações e as alterações de status. Se já estão instalados, mantenha a instalação existente.
- **Aprovação e PDF:** se a correção de identificadores UUID ainda não foi instalada, execute `docs/19_CORRIGIR_APROVACAO_PDF_UUID.sql` no SQL Editor. O SQL 19 usa o tipo real do identificador, preserva as versões e já inclui a correção de status do antigo SQL 18.
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

Continuam fora do pacote os guias de versões antigas, relatórios de validação antigos, diagnósticos de planilhas antigas e a correção SQL 18 já incorporada ao SQL 19. As instruções atuais estão reunidas neste único guia. Esta atualização corrige os links do release e o retorno à evidência após login. Os arquivos das funções do Supabase permanecem iguais.
