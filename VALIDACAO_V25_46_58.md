# Validação V25.46.58

Testes locais com Chromium, rotinas SQL reais em PostgreSQL compatível (PGlite) e geração por html2canvas 1.4.1 / jsPDF 2.5.2. Autenticação e transporte da API foram simulados. O ambiente de produção não foi acessado ou alterado.

- Criadas duas instalações do editor: uma com ID UUID e outra com ID bigint, sem mudar os tipos dos IDs dos projetos ou das tarefas.
- Na instalação UUID, reproduzida a mensagem `invalid input syntax for type bigint` ao chamar a função antiga de aprovação com o ID da versão.
- Na instalação numérica, reproduzida também a rejeição pela constraint antiga de status. O SQL 19 trata as duas incompatibilidades.
- A ausência da nova função na API produz orientação explícita para executar o SQL 19 e atualizar as páginas.
- SQL 19 aplicado duas vezes em cada instalação. IDs, conteúdo e todos os campos dos registros históricos antigos preservados.
- Testada a aprovação de Política Editorial pela interface nas duas instalações. O ID retornado é exatamente o mesmo da versão Em revisão.
- Download real de PDF A4 com duas páginas em cada instalação. Após recarregar, o histórico mostra Finalizado, com campos protegidos e auditoria da aprovação.
- Conteúdo, evidências, fotografia da origem, número da versão, data e autoria de criação preservados na transição.
- Fluxo Rascunho → Em revisão → Finalizado validado com a função compatível. Aprovação direta de rascunho, escrita direta e acesso de domínio externo continuam recusados.
- Conferidos estados inválidos, IDs inexistentes e execução anônima. A nova rotina altera somente o estado e a auditoria da versão.
- Regressão de Planejamento: status por seletor, arraste e detalhe; persistência; histórico; conflitos; acompanhamento atômico; criação e filtro de atenção na aba correta.
- Os dois painéis de Projeto Qualidade continuam sem os atalhos globais de tarefas. Tabelas de Operação/Ajustes e botões de PDF dos Certificados preservados.
- Nenhum erro JavaScript nas páginas verificadas. Sintaxe de js/projetos.js validada.

A alteração desta versão cobre o envio para revisão e a aprovação. As rotinas de snapshots NQ e atualização opcional de tarefas não foram substituídas. A publicação exige o SQL 19 e os três arquivos indicados em COMECE_AQUI_V25_46_58.md.
