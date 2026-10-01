# BI-Monday V25.46.32 — Universo completo + múltiplos revisores

Correções específicas da aba **Certificados**:

1. **Nenhuma UA validada é descartada apenas porque a matriz veio vazia no registro direto da Monday.**
2. O identificador de UA agora é procurado em todos os campos possíveis (`item_name`, `titulo_ua`, `unidade_material`, `id_ua`, `tipo_unidade` e `tipo_material`). Isso cobre casos como **UNIDADE 02** e **UA05** mesmo quando `item_name` contém o título da UC.
3. A identificação das matrizes aceita variações de **RADIAL**, **LATO SENSU**, **MANDALA EXPRESS** e **MANDALA REALIZE**, inclusive esteiras/descrições complementares.
4. O universo de Certificados passa a unir:
   - leitura ao vivo do board Monday;
   - `monday_validacao_materiais`;
   - `vw_materiais_bi_consolidada`.
5. O cruzamento de metadados usa primeiro `monday_item_id` e, se necessário, também `id_titulo + id_ua` ou `título + UA`.
6. A Edge Function `monday-revisores` agora devolve também, **por item**, todos os `person_id` da coluna People. Assim, quando uma UA possui 2 revisores, os dois são lidos diretamente da Monday e geram **2 certificados separados**.
7. O histórico continua separado por `UA + revisor`.

## Importante — Supabase

Para a correção dos **segundos revisores** funcionar pela leitura ao vivo, publique também a função:

`supabase/functions/monday-revisores/index.ts`

A função usa o secret já existente `MONDAY_API_TOKEN`.

Depois, publique os arquivos do site e faça `Ctrl + F5`.

## Casos informados para conferência

- RADIAL / esteira antecipada: IA e Sociedade, Neurociência, Marketing Digital e Ciência da Felicidade.
- Lato Sensu: UNIDADE 02.
- RADIAL: Direito do Consumidor UA05.
- Segundo revisor:
  - Antonio — Empreendedorismo em Hospitalidade — UA01 e UA02.
  - Patricia — Voz — UA04 e UA06.
  - Stefane — Reabilitação auditiva — UA02 e UA03.
