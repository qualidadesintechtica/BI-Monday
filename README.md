# BI-Monday V25.46.33 — Base monotônica + múltiplos revisores

Esta versão corrige a redução de UAs observada na V25.46.32.

## Regra de segurança
A lista sincronizada que já funcionava na V25.46.31 é processada primeiro. A leitura ao vivo da Monday não substitui registros existentes: ela somente acrescenta UAs ausentes e complementa os IDs da coluna People. Assim, a integração ao vivo não pode diminuir o universo anterior.

## Múltiplos revisores
Cada pessoa da coluna `multiple_person_mkx6ryhs` é tratada individualmente. Uma UA com dois revisores mantém uma única UA na tabela/KPI, mas produz dois certificados, dois registros no relatório e históricos separados por revisor.

## Conferência
Abra o console e consulte `window.__BI_CERT_DIAGNOSTICO`. Os campos `uasDaBaseSincronizada`, `uasAdicionadasAoVivo`, `uasValidadas` e `certificadosIndividuais` permitem auditar o crescimento da base.
