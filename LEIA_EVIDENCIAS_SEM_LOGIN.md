# Relatório com download das evidências sem login — V25.46.69

## Instalar

Esta pasta parte da V25.46.68 e preserva a chegada ao validador e o histórico da Operação. A nova instalação é somente a do compartilhamento das evidências.

1. No SQL Editor do mesmo projeto Supabase do BI, execute **todo** `docs/25_DOWNLOAD_EVIDENCIAS_RELATORIO.sql`. Confira **V25.46.69: compartilhamento das evidências instalado**.
2. Em **Edge Functions**, crie uma função chamada exatamente **pq-evidencia-publica**. Cole o arquivo completo `INSTALAR_PELO_PAINEL/pq-evidencia-publica.ts`, substituindo o exemplo, e publique. Esse arquivo funciona sozinho no editor.
3. Nas configurações **dessa função**, desative a verificação JWT do gateway (**Verify JWT**). Essa é a entrada de download dos leitores sem conta; o acesso ao arquivo é validado pelo token específico que consta no PDF. As configurações das outras funções não precisam ser alteradas.
4. Substitua o conteúdo da pasta publicada do BI pelos arquivos de **BI-Monday** deste ZIP. Inclua `js/projetos-compartilhamento.js`, `js/projetos.js` e `projetos.html`. Aguarde a publicação e pressione Ctrl + F5.
5. Em **Projetos → Histórico de versões**, use **Reimprimir relatório** na versão desejada. Distribua o novo PDF.

Quem já usa a CLI vinculada pode publicar a função a partir da pasta BI-Monday:

```bash
supabase functions deploy pq-evidencia-publica --no-verify-jwt
```

O serviço utiliza SUPABASE_URL e a chave de servidor fornecidos pelo ambiente hospedado, aceitando tanto SUPABASE_SECRET_KEYS quanto SUPABASE_SERVICE_ROLE_KEY. A chave fica somente no servidor. Não a coloque em js/config.js ou no relatório.

## Resultado

No PDF, os arquivos anexados e marcados como **Incluir no relatório** passam a ter **Baixar evidência**. O link entrega o arquivo original, com seu nome, sem abrir a página do BI nem pedir conta nele. Vale para PDF, Word, imagens e planilhas armazenados nas evidências, dentro do limite existente de 20 MB por arquivo.

O BI e o armazenamento continuam privados. O link concede acesso somente ao anexo vinculado à versão salva. Não permite consultar projetos, listar evidências ou alterar dados. Quem receber ou encaminhar o PDF também terá os links dos anexos incluídos; essa é a forma de compartilhamento solicitada.

Os links novos não dependem da sessão de quem imprimiu e não têm uma expiração automática curta. Continuam válidos enquanto não forem desativados, a versão existir e o arquivo estiver disponível. Cada nova impressão cria seus próprios links, mantendo os PDFs anteriores em funcionamento.

**PDFs antigos não são alterados automaticamente.** Eles continuam contendo o endereço antigo do BI. É necessário reimprimir e enviar a nova cópia. Relatórios já salvos podem ser reimpressos sem editar, reaprovar ou criar outra versão.

## Desativar o acesso de um relatório

No histórico da versão, clique em **Desativar links dos PDFs** e confirme. Todos os links já emitidos para aquela versão deixam de funcionar. Os arquivos, a versão e o histórico continuam no BI.

Uma nova reimpressão cria novos links. Desativar o acesso não remove cópias que alguém já tenha baixado.

## Prévias e links externos

- **Versão salva:** a geração do PDF prepara os links dos arquivos incluídos, inclusive na impressão alternativa do navegador. A tela de edição continua usando a visualização autenticada que já existia.
- **Prévia ainda não salva:** não cria links públicos. O PDF orienta salvar uma versão para incluir o download; um arquivo pendente precisa ser anexado e salvo antes de ser compartilhado.
- **Evidência excluída:** não entra no PDF e não recebe link de compartilhamento.
- **Link externo:** continua com seu destino original e as permissões do serviço onde está hospedado. Esta alteração não libera arquivos protegidos no SharePoint, Drive ou em outro sistema. Para distribuir o documento por este mecanismo, anexe ao relatório uma cópia cujo compartilhamento esteja autorizado.

## Conferir após a publicação

1. Entre no BI e reimprima uma versão salva com ao menos um arquivo incluído.
2. Abra o PDF baixado em uma janela anônima ou em outro navegador sem sessão no BI.
3. Clique em **Baixar evidência** e confira o arquivo e seu nome.
4. Confira que um anexo desmarcado como Incluir no relatório não aparece no PDF.
5. Se desejar testar a revogação, desative os links daquela versão e tente usar o PDF anterior. Depois reimprima para obter novos links.

Se o PDF não puder preparar o download, a página informa o problema em vez de emitir um PDF com um link de login disfarçado como download.

| Situação | Conferência |
| --- | --- |
| Pedido para instalar o SQL 25 | Execute o arquivo completo no projeto Supabase do BI. |
| Pedido para publicar pq-evidencia-publica | Confira nome, publicação e Verify JWT desativado somente nessa função. |
| Serviço ainda não configurado | Confira as variáveis do ambiente da função e a chave de servidor. |
| Link inválido ou desativado | O link foi revogado, está incompleto ou a versão não está mais disponível. Solicite uma nova emissão. |
| Arquivo indisponível | Confira se o arquivo ainda existe no armazenamento e reimprima. |
| Link ainda abre o BI | O PDF é antigo ou os arquivos publicados não foram substituídos. Atualize e reimprima. |
| Outro serviço pede login | Trata-se de um link externo; as permissões pertencem à origem. |

## Preservação e verificação

Não houve alteração de projetos, tarefas, status, versões, aprovações, comentários, certificados, fontes da Monday ou rotinas de sincronização. O SQL 25 acrescenta uma tabela de compartilhamentos protegida e três funções próprias. O bucket pq-evidencias não passa a ser público e as políticas anteriores permanecem como estavam.

Foram verificadas **50 condições do SQL**, com IDs bigint e UUID, incluindo inclusão/exclusão de anexos, tokens aleatórios armazenados somente como hash, autorização para emissão, bloqueio de leitura direta, resolução somente pelo servidor, revogação, reimpressão, reinstalação e preservação das versões e do bucket privado.

Passaram **46 verificações da função de download**, incluindo uma requisição sem sessão do BI que recebe o arquivo pelo token válido, e **37 verificações de interface/PDF**, incluindo o destino das anotações de links, preparação antes da captura, ausência da função/SQL, evidência excluída, prévia não salva, impressão alternativa e revogação. A inspeção em navegador usou dados fictícios e confirmou a apresentação do link destinado ao PDF e sua permanência após a atualização da interface.

A renderização final usou o fluxo existente; os testes de integração do PDF simularam o canvas e o gerador para conferir os destinos das anotações. Não foi gerado um relatório real da equipe, instalado SQL em produção ou publicada a função/site nesta preparação. O primeiro teste em janela anônima deverá ocorrer depois da instalação acima.
