# V25.46.50 — Processando e consulta da fila

1. No Supabase → SQL Editor, execute **docs/14_CONSULTA_FILA_AUTENTICADA.sql**.
2. Atualize **index.html** e **js/certificados.js** no site.
3. Atualize o BI com Ctrl+F5 e clique em **Atualizar fila**.

**Processando** agora é uma opção própria: mostra uma tentativa em execução pelo worker local. **Na fila automática** mostra apenas os certificados aguardando disparo na fila local.

Se a Edge Function de consulta falhar, o BI tenta ler os metadados da fila por uma função SQL autenticada. A consulta exige sessão confirmada de um usuário do domínio animaeducacao.com.br e não retorna PDF, token ou chave de API.

Se a consulta falhar pelas duas rotas, a tabela informa que a situação está indisponível; não afirma que há zero certificados. As mensagens destacadas removidas anteriormente continuam ausentes.

A consulta alternativa depende das tabelas criadas no SQL **09_FILA_CERTIFICADOS_SMTP2GO.sql**. Se elas ainda não existirem, a consulta retorna uma orientação para instalar esse arquivo. Para carregar a lista dos 61 antigos a conferir, também é necessário ter executado **10_PROTEGER_61_PENDENTES.sql**. Esta atualização não instala o worker nem o cron: o processamento automático continua dependendo da instalação das funções e do agendamento, conforme o guia principal.

O estado Processando desta fila local não é o mesmo que Processed no Activity do SMTP2GO. O BI ainda não consulta a evolução de entrega das mensagens aceitas pelo provedor. Enviado representa a confirmação positiva do envio/aceitação e o histórico existente; não é prova de entrega ou leitura.

Nenhum certificado pendente é marcado automaticamente como enviado ou adicionado a um novo lote nesta atualização.
