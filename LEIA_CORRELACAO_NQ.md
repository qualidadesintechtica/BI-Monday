# Correlação NQ — Banco de Professores

A aba Banco de Professores agora consulta `public.vw_banco_professores_nq`, criada previamente no Supabase. A coluna `É do NQ` e o filtro Sim/Não usam diretamente a classificação calculada pela view, sem repetir uma comparação de nomes no navegador.

## Verificação no Supabase

```sql
select "É do NQ", count(*) as registros, count(distinct lower(trim(docente))) as professores
from public.vw_banco_professores_nq
group by 1;
```

Resultado anteriormente informado: Sim = 57 registros / 14 professores; Não = 76 registros / 55 professores. Os totais podem mudar conforme o banco.

## Acesso autenticado

A view precisa ser legível pela sessão institucional do BI. Verifique o acesso autenticado antes de publicar. Se receber erro de permissão, NÃO conceda acesso irrestrito a `nq_especialistas`; ajuste a política de leitura da view de forma restrita.

## Publicação

Publique os arquivos estáticos desta pasta como já faz no GitHub Pages. Não é necessário executar SQL adicional se a view já existe e está acessível. Os agendamentos Monday permanecem como estavam.
