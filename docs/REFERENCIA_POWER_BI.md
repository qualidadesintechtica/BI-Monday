# Referência do Power BI

O PBIX usado como referência está conectado a um modelo semântico remoto. As fórmulas DAX completas não ficam armazenadas em texto no arquivo do relatório.

Medidas identificadas no Dashboard Executivo:

- Total UAs
- Liberadas Geral
- UAs Não Liberadas
- NQ
- Em Ajuste
- Validadas
- % Analisado
- % a Chegar
- Status Liberadas
- Status Revalidadas
- Última Atualização

Filtros/campos identificados no relatório:

- Base[Esteira Producao]
- DimBloco[Bloco]
- Base[Status Dashboard]
- Base[Revisor Validador]
- Base[Gestor de Validação - NQ]

## Regra implementada na versão web

A view atual não expõe `id_ua` ou `id_titulo`. Para impedir que o dashboard conte linhas repetidas como UAs diferentes, a versão web consolida por:

`titulo + unidade_material`

Quando ambos estão vazios, usa `monday_item_id` como fallback.

A regra está centralizada em `js/kpis.js`, na função `chaveUA()`, para ser trocada facilmente quando o identificador definitivo da UA for disponibilizado na view.
