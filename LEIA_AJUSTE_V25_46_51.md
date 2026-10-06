# V25.46.51 — Atualizar fila

Atualize somente index.html e js/certificados.js no GitHub Pages. Pressione Ctrl+F5 e clique em Atualizar fila.

O botão mostra Atualizando…, aguarda consultas já iniciadas e informa o resultado ou o erro completo. A consulta SQL autenticada do arquivo 14 é utilizada primeiro; a função de consulta continua como alternativa. Cada rota tem limite de espera de 10 segundos.

Nenhum SQL adicional é necessário para esta correção. Não é necessário repetir o SQL 10. Os bloqueios desativados no Supabase são preservados.

Consulta e processamento são independentes. A correção não ativa envios, não altera a pausa e não marca certificados como enviados. A fila só processa após instalar enviar-certificado, certificados-fila-status e processar-certificados, configurar secrets, instalar o agendamento do SQL 11 e ativar após a conferência. Processed antigo deve escoar antes da ativação.

Para verificar a configuração atual (consulta somente):

```sql
select pausado,motivo,iniciar_apos,ultima_execucao,ultimo_erro
from public.certificados_fila_config where id=true;
select jobname,schedule,active
from cron.job where jobname='certificados-smtp2go-fila';
```

Se a consulta do agendamento informar que cron.job não existe, o cron ainda não está instalado. Não altere as datas ou a pausa para contornar uma instalação incompleta.
