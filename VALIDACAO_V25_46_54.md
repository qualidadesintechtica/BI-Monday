# Validação V25.46.54

Validação local em navegador Chromium e PostgreSQL compatível (PGlite), com a planilha fornecida. A Edge Function existente foi executada com um cliente de banco simulado para as tabelas de importação. As rotinas SQL de acompanhamento foram executadas no PostgreSQL local. Nenhum teste gravou na base de produção.

- Leitura das quatro abas atuais: 372 linhas, 74 projetos e 298 tarefas.
- Exclusão das abas históricas do snapshot, reconciliação de nove tarefas de um projeto renomeado e preservação das sete linhas sem ID real.
- Projetos e tarefas convertidos pelo importador existente, sem descartar os diferentes registros NOVO.
- Paula Madalena nas opções, múltiplos sponsors e herança do sponsor para passos sem responsável.
- Projetos como cartões, tarefas como passos, dados originais consultáveis e campos de fonte protegidos contra alterações no Planejamento.
- Atenção, anotação, passo adicional e comentário salvos com identidade e histórico, sem duplicar cartões.
- Mudanças de título, status, sponsor, prazo e passos refletidas pelo intervalo de 60 segundos, mantendo o acompanhamento salvo.
- Snapshot em processamento preserva a leitura completa anterior. Saída da base ativa preserva as anotações em Arquivadas.
- Reimportação do mesmo arquivo mantém 74 projetos, 298 tarefas e o mesmo acompanhamento.
- Migração SQL reaplicada; tentativa de primeiro salvamento concorrente recusada. Acesso de domínio externo e atualização direta da tabela recusados.
- IDs reais repetidos, linha de tarefa sem ação e tipo desconhecido impedem envio; datas seriais do Excel convertidas.
- Regressão das tarefas manuais: criação, vínculos distintos para UAs iguais, conclusão, histórico, comentários, arquivamento e restauração, CSV, Operação, Ajustes, Certificados e navegação para Projeto Qualidade.
- Conferência visual no computador e no celular, sem erros JavaScript nas páginas testadas.

A aplicação real ainda depende da publicação dos arquivos, da instalação do SQL e da disponibilidade do importador existente no Supabase, conforme COMECE_AQUI_V25_46_54.md.
