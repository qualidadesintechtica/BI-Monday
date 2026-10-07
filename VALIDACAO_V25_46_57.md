# Validação V25.46.57

Testes locais com Chromium e PostgreSQL compatível (PGlite), executando as rotinas SQL do pacote e as interfaces completas do BI. A autenticação e o transporte da API foram simulados; o banco de produção não foi acessado ou atualizado.

## Aprovação e PDF

- Reproduzido o erro SQL 23514 com a constraint `pq_projetos_edicoes_status_edicao_check` antiga, incompatível com `finalizada`.
- Confirmado que a aprovação rejeitada deixa a versão Em revisão, sem alterar seu conteúdo.
- Conferida a mensagem do site indicando o SQL 18, sem confundir a rejeição da constraint com ausência do fluxo de aprovação.
- SQL 18 aplicado duas vezes e testado com histórico legado: todos os campos da versão antiga permaneceram intactos.
- Testado também histórico com os três valores atuais: constraint validada integralmente e novos valores inválidos recusados.
- Pré-requisito de editor ausente sinalizado de forma explícita.
- Aprovação pela interface seguida de download real usando html2canvas 1.4.1 e jsPDF 2.5.2, as mesmas versões carregadas pelo site.
- PDF gerado com duas páginas A4; primeira página renderizada para inspeção visual.
- Conteúdo, evidências, fotografia da origem, número da versão e autoria da criação preservados na aprovação. Status e auditoria de finalização registrados.
- Histórico mostra Finalizado depois de recarregar. Campos e botão de aprovação continuam protegidos.
- Fluxo Rascunho → Em revisão → Finalizado validado; finalização direta de rascunho, escrita direta e usuário de outro domínio continuam recusados.

## Planejamento e demais controles

- Troca de status dos cartões importados pelo seletor, pelo arraste e pelo detalhe, com persistência na mesma tabela do Projeto Qualidade e após recarregar.
- Histórico com usuário e antes/depois; conflitos de versão e gravação atômica de status com acompanhamento conferidos.
- Alteração da tarefa da fonte preserva o projeto pai e os dados originais. Alteração do projeto preserva seus passos.
- Migração 17 reaplicável; vínculo incorreto, status inválido, importação em processamento, acesso anônimo e domínio externo recusados.
- Criação e filtro de atenção disponíveis no Planejamento; faixa e atalhos ausentes nos dois painéis do Projeto Qualidade e nas demais áreas.
- Tabelas de Operação e Ajustes alinhadas; controles de PDF dos Certificados e vínculos ao Planejamento preservados.
- Nenhum erro JavaScript nas páginas verificadas; sintaxe dos quatro scripts alterados validada.

A ativação em produção exige os SQLs 17 e 18 e os seis arquivos do site listados no guia COMECE_AQUI_V25_46_57.md.
