# BI-Monday — V25.25

Pacote limpo da versão V25.25 do DataHub / Validação de Materiais.

## Estrutura

- `index.html` — dashboard principal.
- `login.html` — autenticação.
- `importar.html` — importação NQ/Projetos.
- `projetos.html` — interface de projetos.
- `css/` — estilos utilizados pelas páginas.
- `js/` — scripts utilizados pelas páginas.
- `supabase/functions/` — Edge Functions em uso pelo projeto.
- `docs/` — SQLs ainda necessários para o estado atual da solução.

## SQLs mantidos

- `V25_15_DIPLOMAS_FORMACOES_CINE.sql`
- `V25_20_RESPONSAVEIS_NQ.sql`
- `V25_22_DATAS_FILTROS_TITULACAO.sql`
- `V25_25_OPERACAO_PESQUISA_TITULOS.sql`

Arquivos de versões antigas, diagnósticos, conferências pontuais, inventários e instruções já substituídas foram removidos deste pacote.

## Limpeza realizada

- Arquivos `LEIA_` de versões anteriores removidos.
- SQLs históricos/diagnósticos e inventários removidos.
- `SPONSORS_IDENTIFICADOS.txt` e `README.txt` antigos removidos.
- `js/login.js` removido: não era referenciado por nenhuma página e continha conteúdo inválido para JavaScript.
- Mantidos apenas arquivos de front-end em uso, Edge Functions atuais e SQLs ainda relevantes.
