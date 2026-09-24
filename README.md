# BI-Monday V25.40

Base V25.38 preservada com upload protegido de evidências em Projetos da Qualidade.

## Principais componentes
- Operações com pesquisa e visão completa de UCs/UAs.
- Esteira de Produção como universo de materiais.
- Validação de Materiais como fonte complementar.
- Sincronização paginada dos boards do Monday.
- Agendamentos separados/paginados no Supabase.
- Deduplicação da Qualidade por UA, critério e matriz.
- Editor versionado de relatórios de projetos.
- Evidências em PDF, DOC, DOCX, JPG e JPEG, armazenadas em bucket privado.

## SQLs incluídos nesta atualização
1. `docs/03_CRIAR_EDITOR_RELATORIOS_PQ.sql`
2. `docs/V25_39_ARMAZENAMENTO_EVIDENCIAS.sql`

Execute os dois arquivos no SQL Editor do Supabase antes de testar os anexos.

## V25.36 — Qualidade completa
- Universo dos critérios: `entra_no_calculo = true`.
- Não conformidade: somente `apontamos_inconformidade = Sim`.
- Linhas do universo com `Não` ou vazio são contabilizadas como conformes.
- Detecção da coluna não depende de haver valor preenchido nas primeiras linhas.
- Mantida paginação integral da view `vw_nq_reuniao_criterios_detalhe`.

## V25.38 — Reconciliação da Qualidade
- Mantém somente o resultado vigente por UA, critério e matriz.
- Usa a data de classificação e o `subitem_id` como desempate.

## V25.40 — Evidências dos projetos
- Aceita PDF, DOC, DOCX, JPG e JPEG, com limite de 20 MB.
- Mantém o bucket privado e abre o arquivo por link temporário.
- Preserva os anexos no histórico de versões do relatório.
