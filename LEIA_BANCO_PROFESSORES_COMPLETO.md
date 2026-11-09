# Banco de Professores — instalação

1. Publique os arquivos do ZIP no site (preserve a estrutura).
2. No SQL Editor do Supabase, execute `docs/28_BANCO_PROFESSORES_COMPLETO.sql` inteiro. O SQL pressupõe que `docs/26_BANCO_VALIDADORES_EQUIPE.sql` já foi instalado e que a tabela `monday_esteira_producao` está disponível.
3. Abra Banco de Professores, atualize o banco e consulte a guia **UCs 2026.1 · Monday**. A lista reflete somente os itens já sincronizados.
4. Em Cadastro e vínculos, para professores de 2026.2 sem avaliação vinculada, digite nota (0–10) e clique Salvar. A nota é gravada no Supabase com auditoria.

**Limite importante:** A Monday fornece as UCs de 2026.1, mas a associação com o professor revisor não pode ser inferida do campo `docente_conteudista`. Por isso a guia de 2026.1 exibe o catálogo sem inventar vínculo com revisores. Para vinculá-las nominalmente será necessário um identificador de revisor confiável.

**Segurança:** a função de escrita usa a mesma checagem institucional existente do banco. Para restringir a edição a administradores, acrescente a verificação de papel institucional antes de publicar.

**Não houve avaliação em 2026.1:** exibimos Não se aplica, não zero.
