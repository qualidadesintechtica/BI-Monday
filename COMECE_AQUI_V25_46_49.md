# BI-Monday V25.46.49 — fila automática SMTP2GO

A pasta foi preparada a partir da V25.46.47. As alterações de funcionamento se concentram na aba Certificados e nas funções que ela utiliza.

## Como funciona depois da instalação

1. Na aba Certificados, selecione as UAs validadas com revisor e e-mail.
2. Clique em **Adicionar à fila automática**.
3. Aguarde a confirmação de inclusão. Depois disso, pode fechar o BI.
4. O Supabase verifica a fila a cada 5 minutos e processa até 5 mensagens por execução, respeitando o máximo de **25 em qualquer janela de uma hora** e **200 em 24 horas**.
5. A cota mensal é consultada diretamente no SMTP2GO. Ao atingir 1.000, o restante fica na fila local e o processamento retoma quando a API informar um novo ciclo com saldo.

A cota conta tentativas de modo conservador. Uma falha pode diminuir a capacidade disponível naquele período. Isso evita ultrapassar a franquia caso uma resposta se perca.

**Enviado** significa que o serviço confirmou o recebimento da mensagem. Não é confirmação de entrega ao destinatário. Consulte **Reports → Activity** para verificar Delivered.

## Instalação pelo painel — na ordem

### 1. Aguarde a fila antiga

Antes de ativar os novos disparos, aguarde os Processed antigos escoarem no SMTP2GO. Pare envios por versões antigas do BI e por outros sistemas que compartilhem essa conta. O controle horário/diário deste pacote é central para esta fila; ele não controla disparos de outras aplicações.

Os 61 pendentes do relatório de 06/10 foram incluídos em uma lista de conferência. O CSV do SMTP2GO não contém a identidade da UA de cada mensagem. Não é possível tratar os 61 como entregues, ou reenviá-los todos, apenas pelo endereço do destinatário. Esses registros ficam bloqueados até a conferência individual.

### 2. Instale as tabelas e funções SQL

No Supabase → SQL Editor, execute:

- **docs/04_CERTIFICADOS_HISTORICO_V25_44.sql**, se o histórico ainda não existir. Esse arquivo é idempotente.
- **docs/09_FILA_CERTIFICADOS_SMTP2GO.sql**.
- **docs/10_PROTEGER_61_PENDENTES.sql**.

A fila começa pausada. Nenhum desses arquivos dispara certificados.

### 3. Configure os Secrets

No Supabase → Edge Functions → Secrets:

- **SMTP2GO_API_KEY**: sua chave atual do SMTP2GO. Não coloque a chave no HTML/JavaScript nem envie pela conversa.
- **SMTP2GO_FROM**: `Qualidade Sintechtica <qualidadesintechtica@outlook.com>`.
- **CERTIFICADOS_WORKER_TOKEN**: um token aleatório de 32 bytes em hexadecimal, ou seja, 64 caracteres. Guarde o valor para o cron.

SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são variáveis do ambiente do Supabase. Nunca coloque a service_role no site.

Na chave SMTP2GO, habilite as permissões **email/send** e **stats/email_cycle**. Sem permissão para consultar a cota, o worker para sem enviar.

Para gerar o token no Windows, abra PowerShell e execute:

```powershell
$bytesFila = New-Object byte[] 32
$rngFila = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rngFila.GetBytes($bytesFila)
([BitConverter]::ToString($bytesFila)).Replace('-', '').ToLower()
$rngFila.Dispose()
```

### 4. Publique três Edge Functions

Os arquivos de **INSTALAR_PELO_PAINEL** são versões completas, prontas para colar no editor como `index.ts`; não dependem de arquivos locais auxiliares.

- Substitua o código de **enviar-certificado** por `INSTALAR_PELO_PAINEL/enviar-certificado.ts`.
- Crie **certificados-fila-status**, usando `INSTALAR_PELO_PAINEL/certificados-fila-status.ts`.
- Crie **processar-certificados**, usando `INSTALAR_PELO_PAINEL/processar-certificados.ts`.

Nas três funções, desative a verificação JWT do gateway (**Verify JWT / Enforce JWT verification**) e publique. O código faz a autenticação: as duas funções do BI validam a sessão no Supabase e o domínio institucional; o worker exige o token secreto exclusivo. As configurações de CLI correspondentes estão em `supabase/config.toml`.

Alternativa por CLI, a partir desta pasta:

```bash
supabase functions deploy enviar-certificado --project-ref nkjmgzyjjbepebzurowy --no-verify-jwt
supabase functions deploy certificados-fila-status --project-ref nkjmgzyjjbepebzurowy --no-verify-jwt
supabase functions deploy processar-certificados --project-ref nkjmgzyjjbepebzurowy --no-verify-jwt
```

### 5. Instale o agendamento

Abra **docs/11_AGENDAR_FILA_SMTP2GO.sql**. Substitua `SUBSTITUIR_PELO_TOKEN_DO_WORKER` pelo mesmo token do Secret CERTIFICADOS_WORKER_TOKEN e execute no SQL Editor.

O token é guardado no Vault. O job se chama **certificados-smtp2go-fila**; os crons de sincronização da Monday não são alterados.

### 6. Atualize o site

Publique os arquivos do site desta pasta na hospedagem atual, mantendo a estrutura. Para uma atualização mínima do site, os únicos arquivos de frontend alterados são **index.html** e **js/certificados.js**. As funções do Supabase e os SQLs devem ser instalados pelos passos anteriores; copiar a pasta para o GitHub não os instala.

Abra o BI e atualize a página com Ctrl+F5. Confira o botão **Adicionar à fila automática**. O estado operacional da fila pode ser consultado pelo SQL de diagnóstico; os textos destacados foram retirados da tela. O botão Atualizar fila consulta o progresso; a página também consulta automaticamente a cada 30 segundos quando não há seleção/edição em andamento.

### 7. Ative os novos lotes

Após a fila antiga escoar e a instalação estar concluída, execute **docs/12_ATIVAR_FILA_APOS_CONFERENCIA.sql**. A primeira ativação aguarda mais 24 horas antes de novos disparos para proteger a cota diária após a migração. Esse intervalo é da fila local; você pode adicionar novos certificados e fechar o BI enquanto aguarda.

Comece com um certificado novo, fora da lista de conferência, e acompanhe a passagem de **Na fila automática** para **Enviado**. Confirme o PDF e o destinatário no Activity. Depois inclua os demais.

## Conferência e problemas

Execute **docs/13_DIAGNOSTICO_FILA.sql** para verificar fila, cotas, erros e chamadas do agendamento.

- **Na fila automática**: aguardando capacidade de envio.
- **Processando**: uma tentativa foi reservada.
- **Enviado**: resposta positiva com EmailID; o histórico foi gravado na mesma transação da atualização da fila.
- **Erro — conferir**: resposta negativa explícita. Corrija a causa antes de liberar a repetição.
- **Conferir no SMTP2GO**: houve interrupção ou resposta inconclusiva. Não há nova tentativa automática.
- **Conferir envio anterior**: um dos 61 pendentes do relatório original, ainda sem identificação segura da mensagem correspondente.

Uma resposta HTTP 200 com `failed=1` não é tratada como sucesso. Se o resultado ficar desconhecido, a fila é pausada para conferência. Se o worker for interrompido, a entrada fica bloqueada e é marcada para conferência na próxima execução, sem repetir o disparo.

Para os 61, consulte a tabela `certificados_fila_conferencia`. Só depois de confirmar o certificado específico como não submetido ao SMTP2GO, desative **aquele** bloqueio (`ativo=false`) pelo Table Editor e inclua a linha no novo lote. Se o certificado já tiver sido aceito, registre a chave exata no histórico com seu EmailID antes de retirar o bloqueio. Não use apenas o e-mail como prova: um mesmo professor recebe certificados de várias UAs.

Para retomar após corrigir uma falha, use o Table Editor: em `certificados_fila_config`, altere `pausado=false` e o motivo. Registros com `erro` ou `conferir` permanecem bloqueados; só altere o status individual para `na_fila` após confirmar que o SMTP2GO **não aceitou** aquela tentativa. Não exclua o histórico de tentativas para liberar cota.

## Validação realizada

23 verificações locais, incluindo execução do SQL em PostgreSQL embarcado, limites 25/h e 200/24h, saldo mensal de uma mensagem, renovação de ciclo, consumo externo consultado, entrada duplicada, bloqueio de worker concorrente, proteção dos 61 pendentes, histórico transacional e respostas negativas/inconclusivas do SMTP2GO. A integração do botão, filtros, chave individual e anexo também foi verificada em DOM simulado. Testes do worker usaram respostas simuladas; não foram enviados e-mails reais.

Este pacote ainda precisa ser instalado no seu Supabase e na hospedagem. Nenhuma configuração da conta ou do site em produção foi alterada por esta entrega.

Referências: https://support.smtp2go.com/hc/en-gb/articles/223087947-Free-Plan ; https://developers.smtp2go.com/reference/send-standard-email ; https://developers.smtp2go.com/reference/email-cycle ; https://supabase.com/docs/guides/functions/schedule-functions
