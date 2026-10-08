# Validação local — V25.46.59

## PDF e tabelas

- Relatório de Política Editorial com a estrutura do exemplo enviado: três páginas A4, com as linhas de Contexto e ResultadosEsperados completas.
- Caso com 180 linhas de texto em um campo, 29 tarefas e URL extensa: oito páginas A4, sem perda de conteúdo nem transbordamento horizontal.
- Conferência das coordenadas de cada linha de texto e de tabela contra as quebras de página. Linhas de tabela que cabem na página não são divididas; campos maiores que uma página são divididos entre linhas de texto.
- Cabeçalhos repetidos nas páginas de continuação das tabelas. Posições dos links das evidências recalculadas para a paginação.
- Captura e medição usam a mesma largura de janela, com o documento de exportação na largura A4. Isso evita divergências de layout durante a captura.
- PDFs renderizados e conferidos visualmente após a última correção: todas as três páginas do relatório e as oito páginas do caso longo, sem cortes de letras, sobreposição ou páginas em branco.

## Reimpressão e versões

- Aprovação de edição em revisão, download do PDF e reimpressão pelo botão principal e pelo histórico verificados em navegador local.
- Comparação de todos os campos da tabela de edições antes e depois das duas reimpressões: nenhuma alteração de conteúdo, status, auditoria ou quantidade de versões.
- Teste de reimpressão com gravações por RPC bloqueadas: os dois cenários de paginação concluíram sem chamar operações de gravação.
- Conteúdo da edição finalizada permanece protegido durante a reimpressão.

## Compatibilidade

- SQL 19 executado duas vezes em PostgreSQL local emulado por PGlite; fluxo com identificadores UUID aprovado.
- Regressão de Planejamento: mudança de status por seletor, arraste e detalhe; persistência; histórico; reversão em falha; conflitos e regras de acesso.
- Botões de tarefas mantidos exclusivamente em Planejamento; ações próprias do Projeto da Qualidade preservadas.
- Verificação de sintaxe de `js/projetos.js` e `js/projetos-pdf.js` concluída sem erros.

Os testes usaram dados de exemplo, navegador local e transporte de API simulado, com execução local das regras SQL. Esta entrega não altera o site publicado nem o banco de produção. Não há SQL novo sobre a V25.46.58; siga `COMECE_AQUI_V25_46_59.md` para publicar os cinco arquivos.
