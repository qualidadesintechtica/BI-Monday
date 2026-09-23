# BI-Monday V25.28.2

Base estável consolidada em 18/09/2026.

## Principais componentes
- Operações com pesquisa e visão completa de UCs/UAs.
- Esteira de Produção como universo de materiais.
- Validação de Materiais como fonte complementar.
- Sincronização paginada dos boards do Monday.
- Agendamentos separados/paginados no Supabase.

## SQLs atuais
1. `docs/V25_28_2_01_INSTALAR_SYNC_E_VIEW_COMPATIVEL.sql`
2. `docs/V25_28_02_CRON_PAGINADO.sql`
3. `docs/V25_28_03_DIAGNOSTICO_CONTABILIDADE.sql`


## V25.36 — Qualidade completa
- Universo dos critérios: `entra_no_calculo = true`.
- Não conformidade: somente `apontamos_inconformidade = Sim`.
- Linhas do universo com `Não` ou vazio são contabilizadas como conformes.
- Detecção da coluna não depende de haver valor preenchido nas primeiras linhas.
- Mantida paginação integral da view `vw_nq_reuniao_criterios_detalhe`.
