# Atualização da aba Certificados

Substitua **index.html** e **js/certificados.js** pelos arquivos desta pasta. Depois atualize o BI com Ctrl+F5.

Esta atualização remove o aviso grande e o parágrafo explicativo destacados nos prints. Troca a opção **Aceitos pelo SMTP2GO** por **Enviados**, e o estado correspondente da linha por **Enviado**.

O histórico existente não é apagado nem reclassificado. Registros de sucesso no histórico (`status=enviado`) e confirmações positivas da fila (`status=aceito`) aparecem como **Enviado**. Os demais continuam pendentes, na fila ou para conferência. Isso representa disparo confirmado pelo serviço, não comprova leitura nem entrega na caixa de entrada.

| Opção do filtro Envio | Significado |
| --- | --- |
| Enviados e pendentes | Todos os registros que atendem aos demais filtros. |
| Pendentes | Sem registro de envio confirmado. Inclui itens na fila, sem e-mail ou aguardando conferência. |
| Enviados | Registro de sucesso no histórico ou confirmação positiva do SMTP2GO. |
| Na fila automática | Incluídos na fila local e aguardando o disparo. |
| Processando | Tentativa em execução pelo worker local. |
| Para conferir | Erro, resposta inconclusiva ou envio anterior que precisa ser conferido antes de repetir. |

Nos prints, a consulta da fila retorna **Failed to fetch**. Remover o texto não corrige a conexão nem instala o backend. A fila depende das três Edge Functions, SQLs e cron da V25.46.48; consulte o guia incluído caso ainda falte instalá-los. Erros continuam registrados no console e no diagnóstico. O botão Atualizar fila informa falha de consulta quando acionado.

Não é necessário executar novos SQLs nem publicar novas Edge Functions para esta alteração de apresentação, se a instalação anterior já tiver sido concluída.
