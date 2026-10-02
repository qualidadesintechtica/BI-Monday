V25.46.39 | PROJETO QUALIDADE - INDICADORES NQ NO RELATÓRIO

Próxima etapa do fluxo aprovado:
1. Inclui no editor do Projeto Qualidade o bloco “Indicadores do NQ”.
2. Permite capturar Todos, Ativos ou Inativos.
3. Na visão Todos, mantém a conferência Telas: 28 graduações únicas, 35 graduações totais e a distribuição CINE validada.
4. Ativos/Inativos são calculados diretamente das views atuais do NQ.
5. O relatório/PDF recebe uma seção estruturada com Professores, Graduações únicas, Total de graduações, Áreas CINE e Área CINE × professores.
6. Ao salvar a versão, o snapshot NQ é gravado em pq_projetos_edicoes.indicadores_nq.
7. O snapshot é write-once: uma versão histórica não pode ter os indicadores alterados depois.
8. “Usar como base” mantém a fotografia anterior visível, mas o botão Atualizar indicadores do NQ permite capturar os valores atuais antes de salvar a nova versão.

INSTALAÇÃO
Antes de usar o novo bloco, execute no Supabase SQL Editor:
docs/05_INDICADORES_NQ_RELATORIO_V25_46_39.sql

Arquivos funcionais alterados nesta versão:
- projetos.html
- css/projetos.css
- js/projetos.js
- docs/05_INDICADORES_NQ_RELATORIO_V25_46_39.sql

Demais módulos do BI foram preservados.
